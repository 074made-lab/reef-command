"use client";

import type { ComponentSpec, DayPriority } from "@/lib/protocol";
import { DEMO_CHAT_PROMPT_EVENT, DEMO_DAYS, type DemoChatPromptDetail } from "@/lib/demo-clock";
import {
  RoutineProgressRing,
  RoutineTaskMark,
  useDayRoutineProgress,
  useRoutineBusy,
} from "@/components/chat/RoutineProgress";
import { Chip, SpecCard } from "./bits";

type DayBriefSpec = Extract<ComponentSpec, { kind: "day_brief" }>;

const CUE: Record<DayPriority["cue"], { label: string; tone: string }> = {
  "do-now": { label: "ACTION", tone: "border-teal/45 text-tealhi" },
  watch: { label: "MONITOR", tone: "border-warn/40 text-warn" },
  "human-gate": { label: "APPROVAL", tone: "border-coral/45 text-coralhi" },
};

function askTeddy(detail: DemoChatPromptDetail) {
  window.dispatchEvent(new CustomEvent(DEMO_CHAT_PROMPT_EVENT, { detail }));
}

export function DayBriefCard({ spec }: { spec: DayBriefSpec }) {
  const tasks = useDayRoutineProgress(spec.dayId);
  const busy = useRoutineBusy();

  return (
    <SpecCard
      tag="TODAY'S WORK"
      tone="coral"
      right={(
        <>
          <Chip className="hidden border-coral/45 text-coralhi sm:inline-flex">{spec.weekday.toUpperCase()} · {spec.label.toUpperCase()}</Chip>
          <RoutineProgressRing tasks={tasks} compact />
        </>
      )}
    >
      <div className="mb-4 grid grid-cols-7 gap-1" aria-label="Weekly position">
        {DEMO_DAYS.map((day) => (
          <span key={day.id} className="text-center">
            <span className={`mx-auto block h-1 rounded-full ${day.id === spec.dayId ? "bg-coral shadow-[0_0_10px_rgba(255,133,89,.45)]" : "bg-line"}`} />
            <span className={`mt-1 block font-mono text-[13px] tracking-wider ${day.id === spec.dayId ? "text-coralhi" : "text-mute"}`}>{day.short}</span>
          </span>
        ))}
      </div>

      <div className="rounded-md border border-coral/25 bg-[linear-gradient(135deg,rgba(255,133,89,.07),rgba(79,227,207,.035))] px-3 py-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold text-ink">{spec.weekday}: {spec.label}</h3>
          <span className="font-mono text-[13px] text-mute">SAMPLE DATA · {spec.time}</span>
        </div>
      </div>

      <ol className="mt-3 divide-y divide-line/60 overflow-hidden rounded-md border border-line/80 bg-abyss/35">
        {spec.priorities.map((priority, index) => {
          const cue = CUE[priority.cue];
          const task = tasks[index];
          return (
            <li key={priority.label} className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:grid-cols-[auto_1fr_auto]">
              <RoutineTaskMark task={task} index={index} />
              <h4 className="text-[14px] font-semibold text-ink">{priority.label}</h4>
              <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-auto">
                <Chip className="border-line text-mute">{priority.time} ET</Chip>
                <Chip className={cue.tone}>{cue.label}</Chip>
                {priority.prompt ? (
                  <button
                    type="button"
                    onClick={() => askTeddy({
                      prompt: priority.prompt!,
                      dayId: spec.dayId,
                      priorityIndex: index,
                    })}
                    disabled={busy}
                    aria-label={`Ask Teddy: ${priority.label}`}
                    className={`rounded-md border px-2.5 py-1 text-[12px] font-semibold tracking-[0.03em] transition-[background-color,transform] focus-visible:outline-none focus-visible:ring-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 ${task.status === "complete" ? "border-ok/45 text-ok hover:bg-ok/10 focus-visible:ring-ok/45" : task.status === "failed" ? "border-danger/45 text-danger hover:bg-danger/10 focus-visible:ring-danger/45" : "border-teal/40 text-tealhi hover:bg-teal/10 focus-visible:ring-teal/45"}`}
                  >
                    {task.status === "complete" ? "RUN AGAIN" : task.status === "running" ? "RUNNING" : task.status === "failed" ? "RETRY" : "START"}
                  </button>
                ) : null}
              </div>
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
          <span className="font-mono text-[13px] tracking-[0.14em] text-teal uppercase">TODAY&apos;S NOTE</span>
          <p className="text-[13px] leading-relaxed text-ink">{spec.reminder}</p>
        </div>
      </div>

      <details className="group mt-2 rounded-sm border border-line/60 bg-abyss/25">
        <summary className="cursor-pointer list-none px-3 py-2 font-mono text-[13px] text-dim transition-colors hover:text-tealhi">
          <span className="inline-block transition-transform group-open:rotate-90">▸</span>{" "}
          Why these jobs matter
        </summary>
        <div className="space-y-2 border-t border-line/60 px-3 py-2.5 text-[13px] leading-relaxed text-dim">
          <p className="text-ink">{spec.goal}</p>
          <ul className="space-y-1.5">
            {spec.priorities.map((priority) => (
              <li key={priority.label} className="flex gap-2">
                <span className="text-coral">•</span>
                <span><strong className="font-medium text-ink">{priority.label}:</strong> {priority.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </SpecCard>
  );
}
