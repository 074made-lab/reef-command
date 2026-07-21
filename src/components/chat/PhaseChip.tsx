"use client";

/** The controller for the synthetic operating week. The selected
 * day is the single source of truth; rendering a component never rewrites it. */

import { useEffect, useState } from "react";
import type { DemoDayId } from "@/lib/protocol";
import {
  DEFAULT_DEMO_DAY,
  DEMO_DAYS,
  DEMO_DAY_EVENT,
  DEMO_DAY_STORAGE_KEY,
  demoDay,
  isDemoDayId,
} from "@/lib/demo-clock";

export function PhaseChip() {
  const [dayId, setDayId] = useState<DemoDayId>(DEFAULT_DEMO_DAY);

  useEffect(() => {
    const stored = window.sessionStorage.getItem(DEMO_DAY_STORAGE_KEY);
    if (isDemoDayId(stored)) setDayId(stored);
  }, []);

  const today = demoDay(dayId);

  function selectDay(next: DemoDayId) {
    const accepted = window.dispatchEvent(
      new CustomEvent(DEMO_DAY_EVENT, { detail: next, cancelable: true }),
    );
    if (accepted) {
      setDayId(next);
      window.sessionStorage.setItem(DEMO_DAY_STORAGE_KEY, next);
    }
  }

  return (
    <div className="border-t border-line/60 bg-panel/70">
      <div className="mx-auto max-w-6xl px-4 py-2 sm:px-6">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <span className="text-[12px] font-medium tracking-[0.08em] text-mute uppercase">
            Demo week
          </span>
          <span className="truncate text-[13px] text-dim">
            <span className="font-semibold text-coral">{today.weekday}</span>
            <span className="text-ink"> / {today.label}</span>
            <span className="text-mute"> / {today.time}</span>
          </span>
        </div>

        <div className="overflow-x-auto pb-0.5">
          <div className="grid min-w-[700px] grid-cols-7 gap-1.5" role="group" aria-label="Choose synthetic demo day">
            {DEMO_DAYS.map((day) => {
              const active = day.id === dayId;
              return (
                <button
                  type="button"
                  key={day.id}
                  aria-pressed={active}
                  onClick={() => selectDay(day.id)}
                  className={`rounded-md border px-2.5 py-1.5 text-left transition-[color,background-color,border-color,transform] active:scale-[0.98] ${
                    active
                      ? "border-coral bg-coral text-abyss"
                      : "border-transparent bg-abyss/28 hover:border-line hover:bg-raise/70"
                  }`}
                >
                  <span className={`block text-[12px] font-semibold tracking-[0.08em] ${active ? "text-abyss" : "text-mute"}`}>
                    {day.short}
                  </span>
                  <span className={`mt-0.5 block truncate text-[13px] ${active ? "text-abyss" : "text-dim"}`}>
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
