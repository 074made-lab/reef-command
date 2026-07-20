"use client";

/** Executable action chips. Clicking POSTs to /api/actions (stub today;
 *  Trigger.dev task wiring replaces the stub). `gated` = human-only click,
 *  rendered in coral; `auto` in teal. */

import { useState } from "react";
import type { ActionChip } from "@/lib/protocol";

function ChipButton({ chip }: { chip: ActionChip }) {
  const [state, setState] = useState<"idle" | "busy" | "queued" | "error">(
    "idle",
  );

  async function fire() {
    if (state === "busy" || state === "queued") return;
    setState("busy");
    try {
      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taskId: chip.taskId, payload: chip.payload }),
      });
      setState(res.ok ? "queued" : "error");
    } catch {
      setState("error");
    }
  }

  const gated = chip.risk === "gated";
  const base =
    "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 font-mono text-[11px] tracking-wide transition-colors disabled:opacity-60";
  const tone = gated
    ? "border-coral/60 text-coralhi hover:bg-coral/10"
    : "border-teal/60 text-tealhi hover:bg-teal/10";

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={fire}
        disabled={state === "busy" || state === "queued"}
        className={`${base} ${tone}`}
      >
        {gated ? (
          <span className="rounded-[2px] bg-coral/20 px-1 text-[9px] text-coralhi">
            GATED
          </span>
        ) : null}
        {chip.label}
        <span aria-hidden>▸</span>
      </button>
      {state === "busy" ? (
        <span className="font-mono text-[10px] text-mute">sending…</span>
      ) : null}
      {state === "queued" ? (
        <span className="anim-rise font-mono text-[10px] text-ok">
          ✓ queued — Trigger.dev task wiring lands next
        </span>
      ) : null}
      {state === "error" ? (
        <span className="font-mono text-[10px] text-danger">
          send failed — try again
        </span>
      ) : null}
    </span>
  );
}

export function ActionRow({ actions }: { actions?: ActionChip[] }) {
  if (!actions?.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/60 pt-2.5">
      {actions.map((a) => (
        <ChipButton key={a.taskId + a.label} chip={a} />
      ))}
    </div>
  );
}
