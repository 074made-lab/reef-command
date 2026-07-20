/** Action chip stub. The real implementation enqueues the named Trigger.dev
 *  task (taskId + payload); until that wiring lands, acknowledge only —
 *  the store never executes from here. */

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  let taskId: string | null = null;
  try {
    const body = (await req.json()) as { taskId?: unknown };
    taskId = typeof body.taskId === "string" ? body.taskId : null;
  } catch {
    // fine — acknowledge anyway
  }
  return NextResponse.json({
    ok: true,
    note: "task runner wiring lands next",
    taskId,
  });
}
