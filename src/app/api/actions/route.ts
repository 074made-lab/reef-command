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
 */
import { NextResponse } from "next/server";
import { wait, runs } from "@trigger.dev/sdk";
import { requireOwner, OwnerAuthError } from "@/lib/owner-auth";
import { pgPool } from "@/lib/store/postgres";

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

  // Not yet wired — do not fake a success (Codex m1).
  return NextResponse.json(
    { ok: false, error: `action '${taskId ?? "unknown"}' is not implemented` },
    { status: 501 },
  );
}
