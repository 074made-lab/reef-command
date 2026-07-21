"use client";

/** Synthetic demo clock — stable across judge machines and synced to the
 * component currently on screen. It can also be set manually for the video. */

import { useEffect, useState } from "react";
import type { WeekPhase } from "@/lib/protocol";
import {
  DEFAULT_DEMO_PHASE,
  DEMO_MOMENTS,
  DEMO_PHASE_EVENT,
  demoMoment,
} from "@/lib/demo-clock";

export function PhaseChip() {
  const [phase, setPhase] = useState<WeekPhase>(DEFAULT_DEMO_PHASE);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onPhase = (e: Event) => {
      const next = (e as CustomEvent<WeekPhase>).detail;
      if (DEMO_MOMENTS.some((m) => m.phase === next)) setPhase(next);
    };
    window.addEventListener(DEMO_PHASE_EVENT, onPhase);
    return () => window.removeEventListener(DEMO_PHASE_EVENT, onPhase);
  }, []);
  const moment = demoMoment(phase);
  return (
    <span className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label="Synthetic demo clock"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-sm border border-teal/50 bg-teal/[0.05] px-2.5 py-1 font-mono text-[11px] tracking-[0.08em] text-tealhi uppercase hover:bg-teal/10"
      >
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-tealhi" />
        <span className="text-mute">DEMO</span>
        <span>{moment.day} {moment.time}</span>
        <span className="text-ink">· {moment.label}</span>
        <span aria-hidden className="text-mute">⌄</span>
      </button>
      {open ? (
        <span className="absolute right-0 z-30 mt-2 block w-72 rounded-md border border-line bg-panel p-1.5 shadow-2xl">
          <span className="block px-2 py-1 font-mono text-[10px] tracking-[0.18em] text-mute uppercase">
            Synthetic week · choose a scene
          </span>
          {DEMO_MOMENTS.map((m) => (
            <button
              type="button"
              key={m.phase}
              onClick={() => { setPhase(m.phase); setOpen(false); }}
              className={`flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-raise ${m.phase === phase ? "bg-teal/[0.08]" : ""}`}
            >
              <span className="w-20 shrink-0 font-mono text-[11px] text-tealhi">{m.day} {m.time}</span>
              <span>
                <span className="block text-[12px] text-ink">{m.label}</span>
                <span className="block text-[11px] text-mute">{m.note}</span>
              </span>
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}
