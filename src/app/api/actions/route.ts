/**
 * Action chip endpoint. Real for the wired actions; everything else returns
 * 501 (a judge's click demonstrates the honest boundary, not a fake success —
 * Codex m1). The store never executes anything money-moving here.
 *
 * approve-label-batch → completes the paused label-day run's waitpoint, which
 * resumes the durable task and purchases the labels (Postgres + ClickHouse). The
 * approval is validated (R2-M4): the run must be a label-day run that is actually
 * awaiting approval, the token completion must succeed, and if REEF_ADMIN_TOKEN
 * is set the caller must present it. The approver is recorded on the token.
 */
import { NextResponse } from "next/server";
import { wait, runs } from "@trigger.dev/sdk";

type Body = { taskId?: string; payload?: Record<string, unknown> };

export async function POST(req: Request) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const taskId = typeof body.taskId === "string" ? body.taskId : null;

  if (taskId === "approve-label-batch") {
    // Optional owner/demo gate — enforced only if configured.
    const admin = process.env.REEF_ADMIN_TOKEN;
    if (admin && req.headers.get("x-reef-admin") !== admin) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
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
      approvedBy: "merchant",
      approvedAt: new Date().toISOString(),
    });
    if (!result?.success) {
      return NextResponse.json(
        { ok: false, error: "approval token could not be completed (already decided or expired)" },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, status: "approved", runId });
  }

  // Not yet wired — do not fake a success (Codex m1).
  return NextResponse.json(
    { ok: false, error: `action '${taskId ?? "unknown"}' is not implemented` },
    { status: 501 },
  );
}
