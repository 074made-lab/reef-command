import { randomUUID } from "node:crypto";
import { runs } from "@trigger.dev/sdk";
import { OwnerAuthError, requireOwner } from "@/lib/owner-auth";
import { stageDemoDoaReview } from "@/lib/doa-demo";
import { pgPool } from "@/lib/store/postgres";
import { doaResolution } from "@/trigger/doa-resolution";
import { resetInProgressResponse, tryDemoOperation } from "@/lib/demo-operation-lock";

const TERMINAL_FAILURE = new Set([
  "FAILED", "CRASHED", "CANCELED", "SYSTEM_FAILURE", "TIMED_OUT",
  "INTERRUPTED", "EXPIRED",
]);

function authError(error: unknown): Response | null {
  if (!(error instanceof OwnerAuthError)) return null;
  return Response.json(
    { ok: false, error: error.message },
    { status: error.reason === "unconfigured" ? 503 : 401 },
  );
}

export async function POST() {
  const operation = await tryDemoOperation(pgPool());
  if (!operation) return resetInProgressResponse();
  try {
    const { operator } = await requireOwner();
    const approvedAt = new Date().toISOString();
    const approvalId = `DOA-APPROVAL-${randomUUID()}`;
    await stageDemoDoaReview(pgPool(), approvedAt);
    const handle = await doaResolution.trigger({ approvalId, approvedBy: operator, approvedAt });
    return Response.json({ ok: true, runId: handle.id, approvalId });
  } catch (error) {
    const response = authError(error);
    if (response) return response;
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : "could not start DOA resolution",
    }, { status: 500 });
  } finally {
    await operation.release();
  }
}

export async function GET(request: Request) {
  try {
    await requireOwner();
    const runId = new URL(request.url).searchParams.get("runId");
    if (!runId) return Response.json({ ok: false, error: "runId required" }, { status: 400 });
    const run = await runs.retrieve(runId);
    if (run.taskIdentifier !== "doa-resolution") {
      return Response.json({ ok: false, error: "not a DOA resolution run" }, { status: 400 });
    }
    const status = String(run.metadata?.status ?? "approval-recorded");
    const failed = status === "failed" || TERMINAL_FAILURE.has(String(run.status));
    return Response.json({
      ok: true,
      runId,
      status,
      failed,
      replacementCount: Number(run.metadata?.replacementCount ?? 0),
      packingItems: Number(run.metadata?.packingItems ?? 0),
      replySent: run.metadata?.replySent === true,
    });
  } catch (error) {
    const response = authError(error);
    if (response) return response;
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : "could not read DOA resolution",
    }, { status: 500 });
  }
}
