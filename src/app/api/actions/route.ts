/**
 * Action chip endpoint. Real for the wired actions; everything else returns
 * 501 (a judge's click demonstrates the honest boundary, not a fake success —
 * Codex m1). The store never executes anything money-moving here.
 *
 * approve-label-batch → completes the paused label-day run's waitpoint, which
 * resumes the durable task and purchases the labels (Postgres + ClickHouse).
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
    const runId = typeof body.payload?.runId === "string" ? body.payload.runId : null;
    if (!runId) {
      return NextResponse.json({ ok: false, error: "runId required" }, { status: 400 });
    }
    // Resolve the approval token the paused run published to its metadata.
    // Poll briefly in case the run hasn't reached the waitpoint yet.
    let tokenId: string | undefined;
    for (let i = 0; i < 10 && !tokenId; i++) {
      const run = await runs.retrieve(runId);
      tokenId = (run.metadata?.approvalTokenId as string | undefined) ?? undefined;
      if (!tokenId) await new Promise((r) => setTimeout(r, 300));
    }
    if (!tokenId) {
      return NextResponse.json(
        { ok: false, error: "approval token not ready — run has not reached the waitpoint" },
        { status: 409 },
      );
    }
    await wait.completeToken(tokenId, { status: "approved" });
    return NextResponse.json({ ok: true, status: "approved", runId });
  }

  // Not yet wired — do not fake a success (Codex m1).
  return NextResponse.json(
    { ok: false, error: `action '${taskId ?? "unknown"}' is not implemented` },
    { status: 501 },
  );
}
