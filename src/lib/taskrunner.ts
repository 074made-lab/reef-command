/**
 * Seam B — TaskRunner. Actions are named tasks with payloads; the UI's action
 * chips and the agent's tools both fire tasks through this interface. The
 * hackathon implementation is Trigger.dev; a port replaces the implementation,
 * not the callers.
 *
 * Risk contract: tasks marked `gated` in the catalog may only be fired from an
 * explicit human click (an ActionChip), never autonomously by the agent.
 * Money-moving tasks do not exist in the catalog at all — the agent can only
 * create cases for humans.
 */

export type TaskName =
  | "sync_inventory"        // gated — reconcile a SKU across channels
  | "hold_order"            // gated
  | "void_label"            // gated
  | "fix_address"           // auto when unambiguous, else gated
  | "file_case"             // gated — assembles evidence, creates CaseRecord
  | "decide_case"           // gated — human approve/reject from case_card
  | "apply_sop_discount"    // auto — within codified SOP limits only
  | "send_goodwill_gift";   // gated — budget-capped

export type TaskResult =
  | { ok: true; summary: string; data?: Record<string, unknown> }
  | { ok: false; error: string };

export interface TaskRunner {
  /** Fire a task and resolve when it completes (or stream via subscribe). */
  run(task: TaskName, payload: Record<string, unknown>): Promise<TaskResult>;
  /** Subscribe to progress events for a running task (Realtime in hackathon impl). */
  subscribe?(runId: string, onEvent: (e: { status: string; detail?: string }) => void): () => void;
}
