"use client";

import type { ComponentSpec, DayPriority } from "@/lib/protocol";
import { DEMO_CHAT_PROMPT_EVENT, DEMO_DAYS } from "@/lib/demo-clock";
import { Chip, SpecCard } from "./bits";

type DayBriefSpec = Extract<ComponentSpec, { kind: "day_brief" }>;

const CUE: Record<DayPriority["cue"], { label: string; tone: string }> = {
  "do-now": { label: "DO NOW", tone: "border-teal/45 text-tealhi" },
  watch: { label: "WATCH", tone: "border-warn/40 text-warn" },
  "human-gate": { label: "HUMAN GATE", tone: "border-coral/45 text-coralhi" },
};

function askTeddy(prompt: string) {
  window.dispatchEvent(new CustomEvent(DEMO_CHAT_PROMPT_EVENT, { detail: prompt }));
}

export function DayBriefCard({ spec }: { spec: DayBriefSpec }) {
  return (
    <SpecCard
      tag="TODAY'S COMMAND"
      tone="coral"
      right={<Chip className="border-coral/45 text-coralhi">{spec.weekday.toUpperCase()} · {spec.label.toUpperCase()}</Chip>}
    >
      <div className="mb-4 grid grid-cols-7 gap-1" aria-label="Weekly position">
        {DEMO_DAYS.map((day) => (
          <span key={day.id} className="text-center">
            <span className={`mx-auto block h-1 rounded-full ${day.id === spec.dayId ? "bg-coralhi shadow-[0_0_10px_rgba(255,122,77,.45)]" : "bg-line"}`} />
            <span className={`mt-1 block font-mono text-[12px] tracking-wider ${day.id === spec.dayId ? "text-coralhi" : "text-mute"}`}>{day.short}</span>
          </span>
        ))}
      </div>

      <div className="rounded-md border border-coral/25 bg-[linear-gradient(135deg,rgba(232,86,43,.065),rgba(79,227,207,.035))] p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold text-ink">Today is {spec.weekday} — {spec.label}</h3>
          <span className="font-mono text-[12px] text-mute">SYNTHETIC · {spec.time}</span>
        </div>
        <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-dim">{spec.goal}</p>
      </div>

      <ol className="mt-3 grid gap-2 md:grid-cols-3">
        {spec.priorities.map((priority, index) => {
          const cue = CUE[priority.cue];
          return (
            <li key={priority.label} className="flex min-h-32 flex-col rounded-md border border-line bg-abyss/40 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[12px] text-mute">0{index + 1}</span>
                <Chip className={cue.tone}>{cue.label}</Chip>
              </div>
              <h4 className="mt-2 text-[13px] font-semibold text-ink">{priority.label}</h4>
              <p className="mt-1 flex-1 text-[12px] leading-snug text-dim">{priority.detail}</p>
              {priority.prompt ? (
                <button
                  type="button"
                  onClick={() => askTeddy(priority.prompt!)}
                  className="mt-2 self-start rounded-full border border-teal/40 px-2.5 py-1 font-mono text-[12px] tracking-wide text-tealhi hover:bg-teal/10"
                >
                  ASK TEDDY ▸
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="mt-3 flex items-start gap-2.5 rounded-sm border border-teal/30 bg-teal/[0.045] px-3 py-2">
        <img
          src="/teddy-avatar.jpg"
          alt=""
          width={24}
          height={24}
          className="mt-0.5 shrink-0 rounded-full ring-1 ring-teal/50"
        />
        <div>
          <span className="font-mono text-[12px] tracking-[0.14em] text-teal uppercase">TEDDY REMINDER</span>
          <p className="text-[12px] leading-relaxed text-ink">{spec.reminder}</p>
        </div>
      </div>
    </SpecCard>
  );
}
