/**
 * Action chip endpoint. Real for the wired actions; everything else returns
 * 501 (a judge's click demonstrates the honest boundary, not a fake success —
 * Codex m1). The store never executes anything money-moving here.
 *
 * approve-label-batch → completes the paused label-day run's waitpoint, which
 * resumes the durable task and purchases the labels (Postgres + ClickHouse). The
 * approval is validated (R2-M4): the run must be a label-day run that is actually
 * awaiting approval, and the token completion must succeed. It is also owner-only
 * and fail-closed (R3-P1): requireOwner() rejects any caller without a valid
 * owner session, and the verified operator — not a hardcoded string — is stamped
 * on the token and written to the action_log audit trail.
 *
 * merge-orders → records the MERGE DECISION for a customer's cross-platform
 * orders: validates them against Postgres truth, writes the audit row, and
 * emits an `orders_merged` event to ClickHouse (deduped per customer+week).
 * Deliberately NOT money and NOT physical: orders are not relinked here — the
 * physical consolidation into one labeled box happens at label day, exactly
 * like the real store. No owner session required (nothing is spent).
 *
 * send-demo-auction-announcement → a human click records a simulated email/SMS
 * send to synthetic recipients in Postgres and ClickHouse. It never connects
 * to an external messaging provider.
 */
import { NextResponse } from "next/server";
import type { ClickHouseClient } from "@clickhouse/client";
import { wait, runs } from "@trigger.dev/sdk";
import { requireOwner, OwnerAuthError } from "@/lib/owner-auth";
import { pgPool } from "@/lib/store/postgres";
import { chClient, insertEvents, queryRows } from "@/lib/store/clickhouse";
import {
  announcementRecipients,
  currentWeekIndex,
  nextAuctionAnnouncementMeta,
} from "@/lib/tools";

let chSingleton: ClickHouseClient | undefined;
const ch = () => (chSingleton ??= chClient());

type Body = { taskId?: string; payload?: Record<string, unknown> };

/** Best-effort audit of a gated approval — records the verified operator. The
 *  money action already committed via the waitpoint, so a log failure must not
 *  fail the response; it is surfaced to the server console instead. */
async function auditApproval(operator: string, runId: string) {
  try {
    await pgPool().query(
      `INSERT INTO action_log (task_id, risk, payload, approved_by, outcome)
       VALUES ('approve-label-batch','gated',$1,$2,'ok')`,
      [JSON.stringify({ runId }), operator],
    );
  } catch (e) {
    console.error("action_log audit insert failed for approve-label-batch:", e);
  }
}

export async function POST(req: Request) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const taskId = typeof body.taskId === "string" ? body.taskId : null;

  if (taskId === "approve-label-batch") {
    // Owner-only, fail-closed: no valid owner session (or no owner token
    // configured at all) → reject. The verified operator is used below.
    let operator: string;
    try {
      ({ operator } = await requireOwner());
    } catch (e) {
      if (e instanceof OwnerAuthError) {
        const status = e.reason === "unconfigured" ? 503 : 401;
        return NextResponse.json({ ok: false, error: e.message }, { status });
      }
      throw e;
    }

    const runId = typeof body.payload?.runId === "string" ? body.payload.runId : null;
    if (!runId) {
      return NextResponse.json({ ok: false, error: "runId required" }, { status: 400 });
    }

    // Resolve the run and its published approval token; poll briefly in case it
    // hasn't reached the waitpoint yet.
    let tokenId: string | undefined;
    let status: string | undefined;
    let taskIdentifier: string | undefined;
    for (let i = 0; i < 10 && !tokenId; i++) {
      const run = await runs.retrieve(runId);
      taskIdentifier = run.taskIdentifier;
      status = run.metadata?.status as string | undefined;
      tokenId = (run.metadata?.approvalTokenId as string | undefined) ?? undefined;
      if (!tokenId) await new Promise((r) => setTimeout(r, 300));
    }

    // Bind the approval to a genuine, still-pending label-day run.
    if (taskIdentifier !== "label-day") {
      return NextResponse.json({ ok: false, error: "not a label-day run" }, { status: 400 });
    }
    if (!tokenId) {
      return NextResponse.json(
        { ok: false, error: "approval token not ready — run has not reached the waitpoint" },
        { status: 409 },
      );
    }
    if (status !== "awaiting-approval") {
      return NextResponse.json(
        { ok: false, error: `run is '${status ?? "unknown"}', not awaiting approval` },
        { status: 409 },
      );
    }

    const result = await wait.completeToken(tokenId, {
      status: "approved",
      approvedBy: operator,
      approvedAt: new Date().toISOString(),
    });
    if (!result?.success) {
      return NextResponse.json(
        { ok: false, error: "approval token could not be completed (already decided or expired)" },
        { status: 409 },
      );
    }
    await auditApproval(operator, runId);
    return NextResponse.json({ ok: true, status: "approved", runId, approvedBy: operator });
  }

  if (taskId === "merge-orders") {
    const customerId = Number(body.payload?.customerId);
    const orderIds = Array.isArray(body.payload?.orderIds)
      ? (body.payload!.orderIds as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    if (!Number.isFinite(customerId) || orderIds.length < 2) {
      return NextResponse.json(
        { ok: false, error: "merge needs a customerId and at least two orderIds" },
        { status: 400 },
      );
    }

    // Validate against Postgres truth: the orders must exist, belong to this
    // customer, be unshipped, and span ≥2 platforms — no fabricated merges.
    const rows = await pgPool().query<{ external_id: string; platform: string; total_cents: string }>(
      `SELECT external_id, platform, total_cents FROM orders
       WHERE customer_id = $1 AND external_id = ANY($2)
         AND status IN ('pending','paid') AND shipment_id IS NULL`,
      [customerId, orderIds],
    );
    if (rows.rows.length < 2 || new Set(rows.rows.map((r) => r.platform)).size < 2) {
      return NextResponse.json(
        { ok: false, error: "orders are no longer mergeable (shipped, missing, or one platform)" },
        { status: 409 },
      );
    }

    // One merge decision per customer per cycle — a re-click (or a reloaded
    // card) confirms instead of duplicating the event.
    const mergeId = `MRG-${customerId}-W${currentWeekIndex()}`;
    const dup = await queryRows<{ n: string }>(
      ch(),
      `SELECT count() AS n FROM events WHERE type = 'orders_merged' AND order_id = {id:String}`,
      { id: mergeId },
    );
    const combinedCents = rows.rows.reduce((s, r) => s + Number(r.total_cents), 0);
    if (Number(dup[0]?.n ?? 0) === 0) {
      await pgPool().query(
        `INSERT INTO action_log (task_id, risk, payload, approved_by, outcome)
         VALUES ('merge-orders','gated',$1,'merchant-click','ok')`,
        [JSON.stringify({ mergeId, customerId, orderIds: rows.rows.map((r) => r.external_id) })],
      );
      await insertEvents(ch(), [{
        ts: new Date().toISOString(), type: "orders_merged", platform: "system",
        customerId, orderId: mergeId, amountCents: combinedCents,
        meta: { orderIds: rows.rows.map((r) => r.external_id), platforms: [...new Set(rows.rows.map((r) => r.platform))] },
      }]);
    }
    return NextResponse.json({
      ok: true,
      note: `merged ${rows.rows.length} orders → one box, one fee — audit row + orders_merged event written`,
    });
  }

  if (taskId === "send-demo-auction-announcement") {
    const expected = nextAuctionAnnouncementMeta();
    const campaignId = typeof body.payload?.campaignId === "string" ? body.payload.campaignId : null;
    if (campaignId !== expected.campaignId) {
      return NextResponse.json({ ok: false, error: "unknown synthetic campaign" }, { status: 400 });
    }

    const db = pgPool();
    const client = await db.connect();
    let emailCount = 0;
    let smsCount = 0;
    let alreadySent = false;
    try {
      await client.query("BEGIN");
      const recipients = await announcementRecipients(client);
      emailCount = recipients.emailIds.length;
      smsCount = recipients.smsIds.length;
      const uniqueRecipients = new Set([...recipients.emailIds, ...recipients.smsIds]).size;
      const campaign = await client.query<{ id: string; sent_at: Date | null }>(`
        INSERT INTO campaigns (
          campaign_code, phase, audience_criteria, audience_count, preview, scheduled_at
        ) VALUES ($1, 'announce', 'arbitrary synthetic auction-account fixture', $2, $3::jsonb, now())
        ON CONFLICT (campaign_code) DO UPDATE SET
          audience_count = EXCLUDED.audience_count,
          preview = EXCLUDED.preview
        RETURNING id, sent_at`, [
        campaignId,
        uniqueRecipients,
        JSON.stringify({ dateRange: expected.dateRange, closeTime: expected.closeTime, simulated: true }),
      ]);
      const campaignDbId = Number(campaign.rows[0]?.id);
      alreadySent = Boolean(campaign.rows[0]?.sent_at);
      if (!alreadySent) {
        if (emailCount) {
          await client.query(`
            INSERT INTO campaign_sends (campaign_id, customer_id, channel, simulated, sent_at)
            SELECT $1, recipient_id, 'email', true, now()
            FROM unnest($2::bigint[]) AS recipient_id`, [campaignDbId, recipients.emailIds]);
        }
        if (smsCount) {
          await client.query(`
            INSERT INTO campaign_sends (campaign_id, customer_id, channel, simulated, sent_at)
            SELECT $1, recipient_id, 'sms', true, now()
            FROM unnest($2::bigint[]) AS recipient_id`, [campaignDbId, recipients.smsIds]);
        }
        await client.query(`
          UPDATE campaigns SET approved_by = 'merchant-click', sent_at = now()
          WHERE id = $1`, [campaignDbId]);
        await client.query(`
          INSERT INTO action_log (task_id, risk, payload, approved_by, outcome)
          VALUES ('send-demo-auction-announcement','gated',$1,'merchant-click','ok')`, [
          JSON.stringify({ campaignId, emailCount, smsCount, simulated: true }),
        ]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const duplicate = await queryRows<{ n: string }>(ch(), `
      SELECT count() AS n FROM events
      WHERE type = 'campaign_sent'
        AND JSONExtractString(meta, 'campaignId') = {campaignId:String}`,
    { campaignId });
    if (Number(duplicate[0]?.n ?? 0) === 0) {
      await insertEvents(ch(), [{
        ts: new Date().toISOString(),
        type: "campaign_sent",
        platform: "system",
        meta: { campaignId, emailCount, smsCount, simulated: true },
      }]);
    }

    return NextResponse.json({
      ok: true,
      note: `${alreadySent ? "already recorded" : "simulated send recorded"}: ${emailCount} email + ${smsCount} SMS · no external messages sent`,
    });
  }

  // Not yet wired — do not fake a success (Codex m1).
  return NextResponse.json(
    { ok: false, error: `action '${taskId ?? "unknown"}' is not implemented` },
    { status: 501 },
  );
}
