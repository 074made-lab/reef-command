/**
 * Action chip endpoint. Real for the wired actions; everything else returns
 * 501 (a judge's click demonstrates the honest boundary, not a fake success —
 * Codex m1). The store never executes anything money-moving here.
 *
 * approve-label-batch → completes an already-paused label-day run's waitpoint.
 * purchase-shipping-labels → validates the exact Monday document snapshot,
 * starts the durable label-day task, and uses the owner's click to complete its
 * waitpoint. Both resume the same Postgres + ClickHouse purchase workflow. The
 * approval is validated (R2-M4): the run must be a label-day run that is actually
 * awaiting approval, and the token completion must succeed. It is also owner-only
 * and fail-closed (R3-P1): requireOwner() rejects any caller without a valid
 * owner session, and the verified operator — not a hardcoded string — is stamped
 * on the token and written to the action_log audit trail.
 *
 * merge-orders / merge-all-orders → reconcile ReefnBid anchor orders with the
 * winner-code Shopify/eBay add-ons, attach each validated group to one planned
 * eligible anchor shipment (or a new planned shipment) in Postgres, write the
 * audit row, and emit one deduped event per shipment. This is synthetic data
 * staging, not a label purchase or physical
 * packing action. A human click is still required.
 *
 * send-demo-auction-announcement → a human click records a simulated email/SMS
 * send to synthetic recipients in Postgres and ClickHouse. It never connects
 * to an external messaging provider.
 */
import { NextResponse } from "next/server";
import type { ClickHouseClient } from "@clickhouse/client";
import type { PoolClient } from "pg";
import { wait, runs } from "@trigger.dev/sdk";
import { requireOwner, OwnerAuthError } from "@/lib/owner-auth";
import {
  buildShippingDocumentManifest,
  selectShippingLabelPurchase,
  type ShippingLabelPurchaseSnapshot,
} from "@/lib/label-day";
import {
  anchorShipmentCode,
  isExactReadyMergeSet,
  mergeCode,
  mergeCodeForOrders,
  mergeOrderIds,
  restorePersistedMergeBatch,
  selectRequestedMergePlans,
  shipmentTargetDecision,
  unclaimedMergeEventState,
  type RequestedMergeGroup,
} from "@/lib/merge-actions";
import { pgPool } from "@/lib/store/postgres";
import { chClient, insertEvents, queryRows } from "@/lib/store/clickhouse";
import {
  type AddonMergePlan,
  announcementRecipients,
  currentAddonMergePlans,
  currentWeekIndex,
  nextAuctionAnnouncementMeta,
} from "@/lib/tools";
import { labelDay } from "@/trigger/label-day";
import { resetInProgressResponse, tryDemoOperation } from "@/lib/demo-operation-lock";

let chSingleton: ClickHouseClient | undefined;
const ch = () => (chSingleton ??= chClient());

type Body = { taskId?: string; payload?: Record<string, unknown> };

const SAFE_DEMO_ACTIONS: Record<string, {
  risk: "auto" | "gated";
  payloadKey: "caseId" | "taskId" | "issueId" | "campaignId";
  allowed: string[];
  note: Record<string, string>;
}> = {
  "update-demo-address": {
    risk: "gated",
    payloadKey: "caseId",
    allowed: ["ADDR-TUE-01"],
    note: { "ADDR-TUE-01": "synthetic address updated; label preview regenerated and blocker cleared" },
  },
  "review-demo-doa-shipment": {
    risk: "gated",
    payloadKey: "caseId",
    allowed: ["DOA-TUE-02"],
    note: { "DOA-TUE-02": "replacement SKU and refreshed packing slip confirmed in the synthetic shipment" },
  },
  "record-demo-customer-response": {
    risk: "gated",
    payloadKey: "caseId",
    allowed: ["QUESTION-TUE-03"],
    note: { "QUESTION-TUE-03": "simulated customer reply recorded; no external message sent" },
  },
  "confirm-demo-pack-check": {
    risk: "auto",
    payloadKey: "caseId",
    allowed: ["WEATHER-TUE-04"],
    note: { "WEATHER-TUE-04": "physical pack check recorded for the synthetic shipment" },
  },
  "resolve-demo-weekday-shipping": {
    risk: "gated",
    payloadKey: "issueId",
    allowed: [
      "ADDR-WED-01", "DOA-WED-02", "QUESTION-WED-03", "PACK-WED-04",
      "EXC-WED-11", "DELAY-WED-12", "CARE-WED-13", "STALL-WED-14", "DOA-WED-15",
      "DELAY-THU-21", "DOA-THU-22", "ADDR-THU-23", "EXC-THU-24", "CARE-THU-25",
    ],
    note: {
      "ADDR-WED-01": "synthetic Wednesday address confirmed and label preview refreshed",
      "DOA-WED-02": "replacement bag and packing slip confirmed for the final ship-day box",
      "QUESTION-WED-03": "simulated delivery-window response recorded; no external message sent",
      "PACK-WED-04": "fifth coral bag and ice-pack check recorded",
      "EXC-WED-11": "carrier address correction and delivery-exception follow-up recorded",
      "DELAY-WED-12": "owner reminder to contact FedEx recorded for Mominito's delayed overnight box",
      "CARE-WED-13": "simulated coral recovery guidance recorded; no external message sent",
      "STALL-WED-14": "owner reminder and no-movement carrier escalation recorded",
      "DOA-WED-15": "immediate care guidance and DOA claim path recorded; no external message sent",
      "DELAY-THU-21": "owner reminder to contact FedEx recorded for the delayed Wednesday shipment",
      "DOA-THU-22": "immediate guidance and DOA claim path recorded; no external message sent",
      "ADDR-THU-23": "customer-confirmed address correction recorded for carrier follow-up",
      "EXC-THU-24": "delivery exception and indoor-box confirmation recorded",
      "CARE-THU-25": "simulated coral recovery guidance recorded; no external message sent",
    },
  },
  "send-demo-thursday-draft": {
    risk: "gated",
    payloadKey: "campaignId",
    allowed: [
      "CMP-W29-THU-AUCTION-SMS", "CMP-W29-THU-ARRIVALS-SMS",
      "CMP-W29-THU-AUCTION-EMAIL", "CMP-W29-THU-ARRIVALS-EMAIL",
    ],
    note: {
      "CMP-W29-THU-AUCTION-SMS": "auction SMS approval recorded; simulated send only",
      "CMP-W29-THU-ARRIVALS-SMS": "Shopify arrivals SMS approval recorded; simulated send only",
      "CMP-W29-THU-AUCTION-EMAIL": "auction email approval recorded; simulated send only",
      "CMP-W29-THU-ARRIVALS-EMAIL": "Shopify arrivals email approval recorded; simulated send only",
    },
  },
  "activate-demo-listing-agent": {
    risk: "auto",
    payloadKey: "taskId",
    allowed: ["reefbid-listings", "shopify-arrivals"],
    note: {
      "reefbid-listings": "simulated SMS logged for Sam; ReefnBid listing agent activated",
      "shopify-arrivals": "simulated SMS logged for Maya; Shopify catalog agent activated",
    },
  },
  "request-demo-inventory-check": {
    risk: "auto",
    payloadKey: "taskId",
    allowed: ["inventory-check"],
    note: { "inventory-check": "simulated inventory SMS logged for Morgan; physical verification remains human-owned" },
  },
  "send-demo-social-reminder": {
    risk: "auto",
    payloadKey: "taskId",
    allowed: ["friday-social-reminder"],
    note: { "friday-social-reminder": "simulated team SMS logged; filming and Instagram/TikTok posting remain human-owned" },
  },
  "resolve-demo-customer-issue": {
    risk: "gated",
    payloadKey: "issueId",
    allowed: ["FRI-MSG-31", "FRI-SHIP-32", "FRI-DOA-33", "FRI-CREDIT-34", "FRI-ADDR-35", "FRI-ORDER-36"],
    note: {
      "FRI-MSG-31": "prepared acclimation reply recorded; no external message sent",
      "FRI-SHIP-32": "delivered scan and customer check-in recorded",
      "FRI-DOA-33": "prepared evidence reminder recorded; claim remains open for human review",
      "FRI-CREDIT-34": "complete case routed to the owner; no replacement or credit was auto-decided",
      "FRI-ADDR-35": "confirmed address and delivered scan attached to the synthetic audit trail",
      "FRI-ORDER-36": "prepared order answer recorded; no external message sent",
    },
  },
};

/** Best-effort audit of a gated approval — records the verified operator. The
 *  money action already committed via the waitpoint, so a log failure must not
 *  fail the response; it is surfaced to the server console instead. */
async function auditApproval(operator: string, runId: string, taskId = "approve-label-batch") {
  try {
    await pgPool().query(
      `INSERT INTO action_log (task_id, risk, payload, approved_by, outcome)
       VALUES ($1,'gated',$2,$3,'ok')`,
      [taskId, JSON.stringify({ runId }), operator],
    );
  } catch (e) {
    console.error(`action_log audit insert failed for ${taskId}:`, e);
  }
}

async function completeLabelRunApproval(runId: string, operator: string) {
  let tokenId: string | undefined;
  let status: string | undefined;
  let taskIdentifier: string | undefined;
  for (let i = 0; i < 20 && !tokenId; i++) {
    const run = await runs.retrieve(runId);
    taskIdentifier = run.taskIdentifier;
    status = run.metadata?.status as string | undefined;
    tokenId = (run.metadata?.approvalTokenId as string | undefined) ?? undefined;
    if (!tokenId) await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (taskIdentifier !== "label-day") throw new Error("not a label-day run");
  if (!tokenId) throw new Error("approval token not ready — run has not reached the waitpoint");
  if (status !== "awaiting-approval") {
    throw new Error(`run is '${status ?? "unknown"}', not awaiting approval`);
  }
  const result = await wait.completeToken(tokenId, {
    status: "approved",
    approvedBy: operator,
    approvedAt: new Date().toISOString(),
  });
  if (!result?.success) {
    throw new Error("approval token could not be completed (already decided or expired)");
  }
}

async function stageMergePlans(
  client: PoolClient,
  taskId: "merge-orders" | "merge-all-orders",
  plans: AddonMergePlan[],
) {
  let sourceOrders = 0;
  let coralUnits = 0;
  let newRuns = 0;
  const mergeCodes: string[] = [];
  for (const plan of plans) {
    const orderIds = mergeOrderIds(plan);
    const code = mergeCode(plan);
    mergeCodes.push(code);
    sourceOrders += orderIds.length;
    coralUnits += plan.totalCoralUnits;
    const shipWeek = `W${plan.weekIndex}`;
    const expectedShipmentCode = anchorShipmentCode(plan);
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [code]);
    const lockedOrders = await client.query<{ external_id: string; shipment_id: string | null }>(`
      SELECT external_id, shipment_id FROM orders
      WHERE customer_id = $1 AND external_id = ANY($2::text[])
        AND status IN ('pending','paid','labeled')
      ORDER BY external_id FOR UPDATE`, [plan.customer.customerId, orderIds]);
    if (lockedOrders.rows.length !== orderIds.length) {
      throw new Error(`merge source changed for customer ${plan.customer.customerId}`);
    }
    const priorRun = await client.query<{
      shipment_id: string;
      source_order_ids: string[];
      coral_units: number;
    }>(`
      SELECT shipment_id, source_order_ids, coral_units
      FROM merge_runs WHERE merge_code = $1 FOR UPDATE`, [code]);
    if (priorRun.rows[0]) {
      const storedIds = [...priorRun.rows[0].source_order_ids].sort().join("|");
      if (storedIds !== [...orderIds].sort().join("|")) {
        throw new Error(`durable merge identity mismatch for customer ${plan.customer.customerId}`);
      }
      coralUnits += Number(priorRun.rows[0].coral_units) - plan.totalCoralUnits;
      continue;
    }
    let shipmentId = 0;
    if (!shipmentId) {
      const linkedShipmentIds = [...new Set(lockedOrders.rows
        .map((row) => Number(row.shipment_id))
        .filter((id) => Number.isFinite(id) && id > 0))];
      if (linkedShipmentIds.length > 1) {
        throw new Error(`merge source orders are split across shipment records for customer ${plan.customer.customerId}`);
      }
      shipmentId = linkedShipmentIds[0] ?? 0;
    }

    type ShipmentRow = {
      id: string;
      shipment_code: string;
      status: "planned" | "purchased" | "held";
      items: number;
      destination_city: string | null;
    };
    let target: (ShipmentRow & { linked_order_ids: string[] }) | undefined;
    if (shipmentId) {
      const shipment = (await client.query<ShipmentRow>(`
        SELECT id, shipment_code, status, items, destination_city
        FROM shipments
        WHERE id = $1 AND customer_id = $2 AND ship_week = $3
          AND status IN ('planned','purchased','held')
        FOR UPDATE`, [shipmentId, plan.customer.customerId, shipWeek])).rows[0];
      if (!shipment) throw new Error(`recorded shipment ${shipmentId} is no longer reusable`);
      const linked = await client.query<{ external_id: string }>(
        `SELECT external_id FROM orders WHERE shipment_id = $1 ORDER BY external_id`, [shipmentId]);
      target = { ...shipment, linked_order_ids: linked.rows.map((row) => row.external_id) };
    } else {
      const shipment = (await client.query<ShipmentRow>(`
        SELECT id, shipment_code, status, items, destination_city
        FROM shipments
        WHERE shipment_code = $1 AND customer_id = $2 AND ship_week = $3
          AND status IN ('planned','purchased','held')
        FOR UPDATE`, [expectedShipmentCode, plan.customer.customerId, shipWeek])).rows[0];
      if (shipment) {
        shipmentId = Number(shipment.id);
        const linked = await client.query<{ external_id: string }>(
          `SELECT external_id FROM orders WHERE shipment_id = $1 ORDER BY external_id`, [shipmentId]);
        target = { ...shipment, linked_order_ids: linked.rows.map((row) => row.external_id) };
      }
    }

    if (target) {
      const decision = shipmentTargetDecision({
        status: target.status,
        shipmentCode: target.shipment_code,
        items: Number(target.items),
        destination: target.destination_city ?? "",
        linkedOrderIds: target.linked_order_ids,
      }, orderIds, plan.totalCoralUnits, plan.anchor.destination, expectedShipmentCode);
      if (decision === "update-planned") {
        await client.query(`
          UPDATE shipments SET items = $2, weight_lb = $3, destination_city = $4
          WHERE id = $1 AND status = 'planned'`, [
          shipmentId,
          plan.totalCoralUnits,
          Math.max(4, plan.totalCoralUnits * 0.6 + 2),
          plan.anchor.destination,
        ]);
      }
    } else {
      const inserted = await client.query<{ id: string }>(`
        INSERT INTO shipments (
          shipment_code, customer_id, ship_week, status, items, weight_lb, destination_city
        ) VALUES ($1,$2,$3,'planned',$4,$5,$6)
        RETURNING id`, [
        `SHP-${code}`,
        plan.customer.customerId,
        shipWeek,
        plan.totalCoralUnits,
        Math.max(4, plan.totalCoralUnits * 0.6 + 2),
        plan.anchor.destination,
      ]);
      shipmentId = Number(inserted.rows[0]?.id);
    }
    const linked = await client.query<{ external_id: string }>(`
      UPDATE orders SET shipment_id = $1, updated_at = now()
      WHERE customer_id = $2 AND external_id = ANY($3::text[])
        AND (shipment_id IS NULL OR shipment_id = $1)
      RETURNING external_id`, [shipmentId, plan.customer.customerId, orderIds]);
    if (linked.rows.length !== orderIds.length) {
      throw new Error(`merge race for customer ${plan.customer.customerId}: expected ${orderIds.length} orders, linked ${linked.rows.length}`);
    }
    await client.query(`
      INSERT INTO merge_runs (
        merge_code, week_index, customer_id, anchor_order_id, addon_order_ids,
        source_order_ids, coral_units, total_cents, shipment_id, status, approved_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending_event','merchant-click')`, [
      code,
      plan.weekIndex,
      plan.customer.customerId,
      plan.anchor.orderId,
      plan.addons.map((addon) => addon.orderId),
      orderIds,
      plan.totalCoralUnits,
      plan.totalCents,
      shipmentId,
    ]);
    newRuns++;
  }
  if (newRuns) {
    await client.query(`
      INSERT INTO action_log (task_id, risk, payload, approved_by, outcome)
      VALUES ($1,'gated',$2,'merchant-click','pending_event')`, [
      taskId,
      JSON.stringify({ weekIndex: plans[0].weekIndex, mergeCodes }),
    ]);
  }
  return { sourceOrders, coralUnits, mergeCodes };
}

type MergeRunRow = {
  merge_code: string;
  customer_id: string;
  anchor_order_id: string;
  addon_order_ids: string[];
  source_order_ids: string[];
  coral_units: number;
  total_cents: string;
};

async function flushMergeEvent(code: string): Promise<"completed" | "in-progress"> {
  const db = pgPool();
  const claimed = await db.query<MergeRunRow>(`
    UPDATE merge_runs SET status = 'emitting', updated_at = now(), last_error = NULL
    WHERE merge_code = $1 AND (
      status = 'pending_event' OR (status = 'emitting' AND updated_at < now() - interval '2 minutes')
    )
    RETURNING merge_code, customer_id, anchor_order_id, addon_order_ids,
      source_order_ids, coral_units, total_cents`, [code]);
  if (!claimed.rows[0]) {
    const state = await db.query<{ status: string }>(
      `SELECT status FROM merge_runs WHERE merge_code = $1`, [code]);
    return unclaimedMergeEventState(state.rows[0]?.status);
  }
  const run = claimed.rows[0];
  try {
    const duplicate = await queryRows<{ n: string }>(
      ch(),
      `SELECT count() AS n FROM events WHERE type = 'orders_merged' AND order_id = {id:String}`,
      { id: code },
    );
    if (Number(duplicate[0]?.n ?? 0) === 0) {
      await insertEvents(ch(), [{
        ts: new Date().toISOString(),
        type: "orders_merged",
        platform: "system",
        customerId: Number(run.customer_id),
        orderId: code,
        amountCents: Number(run.total_cents),
        meta: {
          anchorOrderId: run.anchor_order_id,
          addonOrderIds: run.addon_order_ids,
          orderIds: run.source_order_ids,
          coralUnits: Number(run.coral_units),
          simulated: true,
        },
      }]);
    }
    await db.query(`
      UPDATE merge_runs SET status = 'completed', completed_at = now(), updated_at = now(), last_error = NULL
      WHERE merge_code = $1 AND status = 'emitting'`, [code]);
    return "completed";
  } catch (error) {
    await db.query(`
      UPDATE merge_runs SET status = 'pending_event', updated_at = now(), last_error = $2
      WHERE merge_code = $1`, [code, error instanceof Error ? error.message : String(error)]);
    throw error;
  }
}

export async function POST(req: Request) {
  const operation = await tryDemoOperation(pgPool());
  if (!operation) return resetInProgressResponse();
  try {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const taskId = typeof body.taskId === "string" ? body.taskId : null;

  if (taskId === "approve-label-batch" || taskId === "purchase-shipping-labels") {
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

    let runId = typeof body.payload?.runId === "string" ? body.payload.runId : null;
    if (taskId === "purchase-shipping-labels") {
      const requestedWeek = typeof body.payload?.weekLabel === "string" ? body.payload.weekLabel : null;
      const rawShipments = Array.isArray(body.payload?.shipments) ? body.payload.shipments : [];
      const snapshots: ShippingLabelPurchaseSnapshot[] = rawShipments.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const row = value as Record<string, unknown>;
        const shipmentId = typeof row.shipmentId === "string" ? row.shipmentId : "";
        const orderIds = Array.isArray(row.orderIds)
          ? row.orderIds.filter((item): item is string => typeof item === "string" && item.length > 0)
          : [];
        return shipmentId && orderIds.length ? [{ shipmentId, orderIds }] : [];
      });
      if (!requestedWeek || snapshots.length !== rawShipments.length || !snapshots.length) {
        return NextResponse.json({ ok: false, error: "invalid shipping-label snapshot" }, { status: 400 });
      }
      try {
        const current = await buildShippingDocumentManifest(pgPool());
        if (current.weekLabel !== requestedWeek) {
          return NextResponse.json({ ok: false, error: "document set is stale; reopen Monday shipping documents" }, { status: 409 });
        }
        const purchaseManifest = selectShippingLabelPurchase(current, snapshots);
        const handle = await labelDay.trigger({ manifest: purchaseManifest });
        runId = handle.id;
      } catch (error) {
        return NextResponse.json({
          ok: false,
          error: error instanceof Error ? error.message : "shipping-label batch is no longer eligible",
        }, { status: 409 });
      }
    }
    if (!runId) return NextResponse.json({ ok: false, error: "runId required" }, { status: 400 });

    try {
      await completeLabelRunApproval(runId, operator);
    } catch (error) {
      return NextResponse.json({
        ok: false,
        error: error instanceof Error ? error.message : "label approval failed",
      }, { status: 409 });
    }
    await auditApproval(operator, runId, taskId);
    return NextResponse.json({ ok: true, status: "approved", runId, approvedBy: operator });
  }

  if (taskId === "merge-orders" || taskId === "merge-all-orders") {
    const requestedWeek = Number(body.payload?.weekIndex);
    if (requestedWeek !== currentWeekIndex()) {
      return NextResponse.json({ ok: false, error: "merge run is stale; refresh the current cycle" }, { status: 409 });
    }
    const rawGroups = Array.isArray(body.payload?.groups) ? body.payload.groups : [];
    const groups: RequestedMergeGroup[] = rawGroups.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const candidate = value as Record<string, unknown>;
      const customerId = Number(candidate.customerId);
      const orderIds = Array.isArray(candidate.orderIds)
        ? candidate.orderIds.filter((item): item is string => typeof item === "string")
        : [];
      return Number.isInteger(customerId) && orderIds.length ? [{ customerId, orderIds }] : [];
    });
    if (groups.length !== rawGroups.length
      || new Set(groups.map((group) => group.customerId)).size !== groups.length) {
      return NextResponse.json({ ok: false, error: "invalid or duplicate merge groups" }, { status: 400 });
    }
    if (!groups.length || (taskId === "merge-orders" && groups.length !== 1)) {
      return NextResponse.json({ ok: false, error: "merge action has an invalid group count" }, { status: 400 });
    }
    const requestedCodes = groups.map((group) =>
      mergeCodeForOrders(requestedWeek, group.customerId, group.orderIds));
    const db = pgPool();
    const client = await db.connect();
    let selected: AddonMergePlan[] = [];
    let totals = { sourceOrders: 0, coralUnits: 0, mergeCodes: [] as string[] };
    let shipmentCount = groups.length;
    try {
      await client.query("BEGIN");
      const persisted = groups.length ? await client.query<{
        merge_code: string;
        source_order_ids: string[];
        coral_units: number;
      }>(`
        SELECT merge_code, source_order_ids, coral_units FROM merge_runs
        WHERE merge_code = ANY($1::text[])
        FOR UPDATE`, [requestedCodes]) : { rows: [] };
      const recovered = restorePersistedMergeBatch(requestedWeek, groups, persisted.rows.map((run) => ({
        mergeCode: run.merge_code,
        sourceOrderIds: run.source_order_ids,
        coralUnits: Number(run.coral_units),
      })));
      if (recovered) {
        totals = recovered;
      } else {
        const plans = await currentAddonMergePlans(client);
        try {
          selected = selectRequestedMergePlans(plans, groups);
        } catch {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { ok: false, error: "this ReefnBid/add-on merge set is stale; refresh the board" },
            { status: 409 },
          );
        }
        if ((taskId === "merge-orders"
            && (selected.length !== 1 || selected[0].mergeState !== "ready"))
          || (taskId === "merge-all-orders" && !isExactReadyMergeSet(plans, selected))) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { ok: false, error: "the requested merge scope no longer matches the board; refresh it" },
            { status: 409 },
          );
        }
        shipmentCount = selected.length;
        totals = await stageMergePlans(client, taskId, selected);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    let deliveryInProgress = false;
    for (const code of totals.mergeCodes) {
      if (await flushMergeEvent(code) === "in-progress") {
        deliveryInProgress = true;
        break;
      }
    }
    if (deliveryInProgress) {
      return NextResponse.json({
        ok: true,
        status: "in-progress",
        note: "merge is already staged; its audit event is still being finalized",
      }, { status: 202 });
    }
    await db.query(`
      UPDATE action_log SET outcome = 'ok'
      WHERE outcome = 'pending_event'
        AND payload->'mergeCodes' = $1::jsonb`, [JSON.stringify(totals.mergeCodes)]);
    return NextResponse.json({
      ok: true,
      note: `merged ${shipmentCount} ReefnBid ${shipmentCount === 1 ? "shipment" : "shipments"}: ${totals.sourceOrders} source orders, ${totals.coralUnits} corals → ${shipmentCount} combined ${shipmentCount === 1 ? "box" : "boxes"}`,
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

  const safeDemoAction = taskId ? SAFE_DEMO_ACTIONS[taskId] : undefined;
  if (taskId && safeDemoAction) {
    const scope = body.payload?.[safeDemoAction.payloadKey];
    if (typeof scope !== "string" || !safeDemoAction.allowed.includes(scope)) {
      return NextResponse.json({ ok: false, error: "unknown synthetic action scope" }, { status: 400 });
    }
    const payload = {
      [safeDemoAction.payloadKey]: scope,
      simulated: true,
      externalWrite: false,
    };
    const audit = await pgPool().query<{ id: string }>(`
      INSERT INTO action_log (task_id, risk, payload, approved_by, outcome)
      VALUES ($1,$2,$3::jsonb,$4,'pending_event')
      RETURNING id`, [
      taskId,
      safeDemoAction.risk,
      JSON.stringify(payload),
      safeDemoAction.risk === "gated" ? "merchant-click" : null,
    ]);
    const auditId = audit.rows[0]?.id;
    try {
      await insertEvents(ch(), [{
        ts: new Date().toISOString(),
        type: "action_executed",
        platform: "system",
        orderId: `demo-action:${auditId}`,
        meta: { taskId, scope, simulated: true, externalWrite: false },
      }]);
      await pgPool().query(
        `UPDATE action_log SET outcome = 'ok' WHERE id = $1 AND outcome = 'pending_event'`,
        [auditId],
      );
    } catch (error) {
      await pgPool().query(
        `UPDATE action_log SET outcome = 'error', error = $2 WHERE id = $1`,
        [auditId, error instanceof Error ? error.message : String(error)],
      );
      throw error;
    }
    return NextResponse.json({ ok: true, note: safeDemoAction.note[scope] });
  }

  // Not yet wired — do not fake a success (Codex m1).
  return NextResponse.json(
    { ok: false, error: `action '${taskId ?? "unknown"}' is not implemented` },
    { status: 501 },
  );
  } finally {
    await operation.release();
  }
}
