"use client";

import { createContext, useContext, useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { DEMO_DAYS } from "@/lib/demo-clock";
import type { DayPriority, DemoDayId } from "@/lib/protocol";

gsap.registerPlugin(useGSAP);

export type RoutineTaskStatus = "idle" | "running" | "complete" | "failed";

export type RoutineTaskProgress = {
  status: RoutineTaskStatus;
  progress: number;
};

export type RoutineProgressState = Record<DemoDayId, RoutineTaskProgress[]>;

const EMPTY_TASK: RoutineTaskProgress = { status: "idle", progress: 0 };

export function createEmptyRoutineProgress(): RoutineProgressState {
  return Object.fromEntries(
    DEMO_DAYS.map((day) => [
      day.id,
      day.priorities.map(() => ({ ...EMPTY_TASK })),
    ]),
  ) as RoutineProgressState;
}

export function restoreRoutineProgress(raw: string | null): RoutineProgressState {
  const empty = createEmptyRoutineProgress();
  if (!raw) return empty;

  try {
    const saved = JSON.parse(raw) as Partial<Record<DemoDayId, RoutineTaskProgress[]>>;
    for (const day of DEMO_DAYS) {
      const tasks = saved[day.id];
      if (!Array.isArray(tasks)) continue;
      empty[day.id] = day.priorities.map((_, index) => {
        const task = tasks[index];
        if (!task || typeof task !== "object") return { ...EMPTY_TASK };
        if (task.status === "complete") return { status: "complete", progress: 100 };
        if (task.status === "failed") return { status: "failed", progress: 0 };
        // A browser refresh loses the active chat turn. Do not show a stale run.
        return { ...EMPTY_TASK };
      });
    }
    return empty;
  } catch {
    return empty;
  }
}

export function routinePercent(tasks: RoutineTaskProgress[]): number {
  if (!tasks.length) return 0;
  return Math.round(tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length);
}

const RoutineProgressContext = createContext<{
  progress: RoutineProgressState;
  busy: boolean;
} | null>(null);

export function RoutineProgressProvider({
  value,
  busy,
  children,
}: {
  value: RoutineProgressState;
  busy: boolean;
  children: ReactNode;
}) {
  return (
    <RoutineProgressContext.Provider value={{ progress: value, busy }}>
      {children}
    </RoutineProgressContext.Provider>
  );
}

export function useDayRoutineProgress(dayId: DemoDayId): RoutineTaskProgress[] {
  const context = useContext(RoutineProgressContext);
  return context?.progress[dayId] ?? createEmptyRoutineProgress()[dayId];
}

export function useRoutineBusy(): boolean {
  return useContext(RoutineProgressContext)?.busy ?? false;
}

export function RoutineProgressRing({
  tasks,
  compact = false,
}: {
  tasks: RoutineTaskProgress[];
  compact?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const percent = routinePercent(tasks);
  const complete = tasks.filter((task) => task.status === "complete").length;
  const running = tasks.some((task) => task.status === "running");

  useGSAP(() => {
    const ring = ringRef.current;
    if (!ring) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      gsap.set(ring, { strokeDashoffset: 100 - percent });
      return;
    }

    gsap.to(ring, {
      strokeDashoffset: 100 - percent,
      duration: 0.42,
      ease: "power2.out",
      overwrite: "auto",
    });
    if (percent === 100) {
      gsap.fromTo(
        rootRef.current,
        { scale: 0.94 },
        { scale: 1, duration: 0.32, ease: "back.out(2)", clearProps: "transform" },
      );
    }
  }, { dependencies: [percent], scope: rootRef });

  const size = compact ? "h-11 w-11" : "h-14 w-14";
  return (
    <div
      ref={rootRef}
      role="progressbar"
      aria-label={`${percent}% complete. ${complete} of ${tasks.length} tasks complete.`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="flex items-center gap-2.5"
    >
      <div className={`relative shrink-0 ${size}`}>
        <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="22" cy="22" r="18" pathLength="100" fill="none" stroke="var(--color-line)" strokeWidth="3" />
          <circle
            ref={ringRef}
            cx="22"
            cy="22"
            r="18"
            pathLength="100"
            fill="none"
            stroke="var(--color-coral)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="100"
            strokeDashoffset="100"
          />
        </svg>
      </div>
      {!compact ? (
        <div className="min-w-0 text-left">
          <p className="text-[13px] font-semibold text-ink">
            {complete}/{tasks.length} complete
          </p>
          <p className={`text-[12px] ${running ? "text-coralhi" : "text-mute"}`}>
            {running ? "Updating live" : percent === 100 ? "Routine complete" : "Today's routine"}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function RoutineTaskMark({
  task,
  index,
}: {
  task: RoutineTaskProgress;
  index: number;
}) {
  const tone = task.status === "complete"
    ? "border-ok/55 bg-ok/10 text-ok"
    : task.status === "running"
      ? "border-coral/65 bg-coral/10 text-coralhi"
      : task.status === "failed"
        ? "border-danger/55 bg-danger/10 text-danger"
        : "border-line text-mute";

  return (
    <span
      aria-label={task.status === "complete" ? "Complete" : task.status === "running" ? `${task.progress}% running` : task.status === "failed" ? "Needs retry" : "Ready"}
      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border font-mono text-[12px] font-semibold tabular-nums transition-colors ${tone}`}
    >
      {task.status === "complete" ? "✓" : task.status === "running" ? task.progress : task.status === "failed" ? "!" : index + 1}
    </span>
  );
}

export function RoutineProgressDock({
  weekday,
  priorities,
  tasks,
  busy,
  onStart,
}: {
  weekday: string;
  priorities: DayPriority[];
  tasks: RoutineTaskProgress[];
  busy: boolean;
  onStart: (index: number) => void;
}) {
  const activeIndex = tasks.findIndex((task) => task.status === "running");
  const complete = tasks.filter((task) => task.status === "complete").length;
  const percent = routinePercent(tasks);
  const activeTask = activeIndex >= 0 ? priorities[activeIndex] : null;

  return (
    <aside
      aria-live="polite"
      className="sticky top-3 z-10 mb-4 rounded-xl border border-coral/35 bg-panel/95 px-3 py-3 shadow-[0_16px_44px_rgba(2,10,14,.3)] backdrop-blur-md sm:px-4"
    >
      <div className="flex items-center gap-3">
        <RoutineProgressRing tasks={tasks} compact />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-semibold text-ink">{weekday} routine</p>
            <span className="font-mono text-[12px] tabular-nums text-mute">{complete}/{tasks.length}</span>
          </div>
          <p className={`truncate text-[13px] ${activeTask ? "text-coralhi" : percent === 100 ? "text-ok" : "text-dim"}`}>
            {activeTask ? `${activeTask.label} is running` : percent === 100 ? "All tasks complete" : "Ready for the next task"}
          </p>
        </div>
      </div>

      <ol className="mt-3 grid grid-cols-3 gap-2 border-t border-line/65 pt-3">
        {priorities.map((priority, index) => (
          <li key={priority.label} className="min-w-0">
            <button
              type="button"
              onClick={() => onStart(index)}
              disabled={busy}
              aria-label={`Start routine: ${priority.label}`}
              className="group flex min-h-10 w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-[background-color,transform] hover:bg-coral/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral/40 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
            >
              <RoutineTaskMark task={tasks[index]} index={index} />
              <span className="min-w-0">
                <span className={`block truncate text-[12px] ${tasks[index].status === "complete" ? "text-ok" : tasks[index].status === "running" ? "text-coralhi" : tasks[index].status === "failed" ? "text-danger" : "text-mute group-hover:text-ink"}`}>
                  {priority.label}
                </span>
                <span className="block font-mono text-[9px] tabular-nums text-mute">{priority.time} ET</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}
