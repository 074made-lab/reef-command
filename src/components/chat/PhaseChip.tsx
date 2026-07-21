"use client";

/** The recording controller for the synthetic operating week. The selected
 * day is the single source of truth; rendering a component never rewrites it. */

import { useState } from "react";
import type { DemoDayId } from "@/lib/protocol";
import {
  DEFAULT_DEMO_DAY,
  DEMO_DAYS,
  DEMO_DAY_EVENT,
  demoDay,
} from "@/lib/demo-clock";

export function PhaseChip() {
  const [dayId, setDayId] = useState<DemoDayId>(DEFAULT_DEMO_DAY);

  const today = demoDay(dayId);

  function selectDay(next: DemoDayId) {
    const accepted = window.dispatchEvent(
      new CustomEvent(DEMO_DAY_EVENT, { detail: next, cancelable: true }),
    );
    if (accepted) setDayId(next);
  }

  return (
    <div className="border-t border-line/70 bg-panel/55">
      <div className="mx-auto max-w-4xl px-4 py-2">
        <div className="mb-1.5 flex items-center justify-between gap-3 font-mono uppercase">
          <span className="text-[13px] tracking-[0.15em] text-mute">
            Demo week
          </span>
          <span className="flex items-center gap-1.5 text-[13px] tracking-[0.08em]">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-tealhi" />
            <span className="text-mute">TODAY</span>
            <span className="text-coral">{today.weekday}</span>
            <span className="text-ink">· {today.label}</span>
            <span className="text-mute">· {today.time}</span>
          </span>
        </div>

        <div className="overflow-x-auto pb-0.5">
          <div className="grid min-w-[700px] grid-cols-7 gap-1" role="group" aria-label="Choose synthetic demo day">
            {DEMO_DAYS.map((day) => {
              const active = day.id === dayId;
              return (
                <button
                  type="button"
                  key={day.id}
                  aria-pressed={active}
                  onClick={() => selectDay(day.id)}
                  className={`rounded-sm border px-2 py-1.5 text-left transition-[color,background-color,border-color,transform] active:scale-[0.98] ${
                    active
                      ? "border-coral/70 bg-coral/[0.09] shadow-[0_0_22px_rgba(255,133,89,0.10)]"
                      : "border-line/70 bg-abyss/35 hover:border-coral/40 hover:bg-raise"
                  }`}
                >
                  <span className={`block font-mono text-[13px] tracking-[0.16em] ${active ? "text-coral" : "text-mute"}`}>
                    {day.short}
                  </span>
                  <span className={`mt-0.5 block truncate text-[13px] ${active ? "text-ink" : "text-dim"}`}>
                    {day.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
