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
          <span className="text-[12px] tracking-[0.15em] text-mute">
            Synthetic demo week · choose today
          </span>
          <span className="flex items-center gap-1.5 text-[12px] tracking-[0.08em]">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-tealhi" />
            <span className="text-mute">TODAY IS</span>
            <span className="text-tealhi">{today.weekday}</span>
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
                  className={`rounded-sm border px-2 py-1.5 text-left transition-colors ${
                    active
                      ? "border-teal/70 bg-teal/10 shadow-[0_0_18px_rgba(79,227,207,0.07)]"
                      : "border-line/70 bg-abyss/35 hover:border-teal/40 hover:bg-raise"
                  }`}
                >
                  <span className={`block font-mono text-[12px] tracking-[0.16em] ${active ? "text-tealhi" : "text-mute"}`}>
                    {day.short}
                  </span>
                  <span className={`mt-0.5 block truncate text-[12px] ${active ? "text-ink" : "text-dim"}`}>
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
