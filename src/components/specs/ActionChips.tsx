"use client";

/** Executable action chips. `gated` = human-only click (coral); `auto` (teal).
 *  Clicking POSTs to /api/actions. The label-batch approval then POLLS the
 *  durable run and streams real progress — "awaiting → purchasing 1/N →
 *  purchased" with the OLTP+OLAP evidence — so the second loop closes on screen
 *  (R2-M3). Unwired actions surface the honest 501, never a fake success. */

import { useState } from "react";
import type { ActionChip } from "@/lib/protocol";
import { getLabelRunProgress } from "@/app/actions";

type Progress = { status: string; purchased: number; shipments: number; totalCostCents: number };

function usd(cents: number) {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function ChipButton({ chip }: { chip: ActionChip }) {
  const [state, setState] = useState<"idle" | "busy" | "running" | "done" | "error">("idle");
  const [note, setNote] = useState("");
  const [prog, setProg] = useState<Progress | null>(null);

  const isApproval = chip.taskId === "approve-label-batch";
  const runId = typeof chip.payload?.runId === "string" ? chip.payload.runId : null;

  async function pollRun(id: string) {
    // Watch the run to completion (fast — purchases stream in). Bounded.
    for (let i = 0; i < 60; i++) {
      let p: Progress;
      try {
        p = await getLabelRunProgress(id);
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      setProg(p);
      if (p.status === "purchased") {
        setState("done");
        setNote(`purchased ${p.purchased}/${p.shipments} labels · ${usd(p.totalCostCents)} — Postgres rows + ClickHouse events written`);
        return;
      }
      if (p.status === "declined" || p.status === "empty") {
        setState("error");
        setNote(p.status === "empty" ? "nothing to ship" : "declined");
        return;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    setState("done");
    setNote("approved — run still finishing; check the Trigger dashboard");
  }

  async function fire() {
    if (state === "busy" || state === "running") return;
    setState("busy");
    setNote("");
    try {
      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taskId: chip.taskId, payload: chip.payload }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setState("error");
        setNote(data.error ?? `action failed (${res.status})`);
        return;
      }
      if (isApproval && runId) {
        setState("running");
        setNote("approved — buying labels…");
        void pollRun(runId);
      } else {
        setState("done");
        setNote("done");
      }
    } catch {
      setState("error");
      setNote("network error — try again");
    }
  }

  const gated = chip.risk === "gated";
  const base =
    "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 font-mono text-[12px] tracking-wide transition-colors disabled:opacity-60";
  const tone = gated
    ? "border-coral/60 text-coralhi hover:bg-coral/10"
    : "border-teal/60 text-tealhi hover:bg-teal/10";

  const running = state === "running";
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={fire}
        disabled={state === "busy" || running || state === "done"}
        className={`${base} ${tone}`}
      >
        {gated ? (
          <span className="rounded-[2px] bg-coral/20 px-1 text-[11px] text-coralhi">GATED</span>
        ) : null}
        {chip.label}
        <span aria-hidden>▸</span>
      </button>
      {state === "busy" ? <span className="font-mono text-[12px] text-mute">sending…</span> : null}
      {running ? (
        <span className="anim-rise font-mono text-[12px] text-tealhi">
          {prog && prog.status === "purchasing"
            ? `▸ purchasing ${prog.purchased}/${prog.shipments}…`
            : note || "approved — buying labels…"}
        </span>
      ) : null}
      {state === "done" ? (
        <span className="anim-rise font-mono text-[12px] text-ok">✓ {note}</span>
      ) : null}
      {state === "error" ? (
        <span className="font-mono text-[12px] text-danger">✕ {note}</span>
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
