"use client";

import { useState } from "react";
import type { ComponentSpec } from "@/lib/protocol";
import { ActionRow } from "./ActionChips";
import { Chip, SpecCard } from "./bits";

type StaffAgentSpec = Extract<ComponentSpec, { kind: "staff_agent_board" }>;

export function StaffAgentBoard({ spec }: { spec: StaffAgentSpec }) {
  const [started, setStarted] = useState<Set<string>>(() => new Set());
  return (
    <SpecCard tag="STAFF + LOCAL AGENTS" right={<Chip className="border-teal/45 text-tealhi">{spec.asOf}</Chip>}>
      <div className="max-w-2xl">
        <h3 className="text-[19px] font-semibold tracking-[-0.02em] text-ink">{spec.title}</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-dim">{spec.note}</p>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {spec.tasks.map((task) => {
          const active = started.has(task.id);
          return (
            <article key={task.id} className="flex min-h-full flex-col rounded-xl bg-raise/45 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[9px] tracking-[0.08em] text-coral">{task.owner.toUpperCase()}</p>
                  <h4 className="mt-1 text-[16px] font-semibold text-ink">{task.title}</h4>
                </div>
                <Chip className={active ? "border-ok/45 text-ok" : "border-line text-mute"}>{active ? "ACTIVATED" : "WAITING"}</Chip>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-dim">{task.detail}</p>

              <dl className="mt-3 grid gap-2 rounded-lg bg-abyss/35 p-3 text-[11px] sm:grid-cols-2">
                <div>
                  <dt className="font-mono text-[9px] tracking-[0.07em] text-mute">LOCAL AGENT</dt>
                  <dd className="mt-1 text-tealhi">{task.agent}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[9px] tracking-[0.07em] text-mute">SOURCE</dt>
                  <dd className="mt-1 text-ink">{task.source}</dd>
                </div>
              </dl>

              <ol className="mt-3 space-y-1.5 text-[12px] text-dim">
                {task.checklist.map((item, index) => (
                  <li key={item} className="flex gap-2">
                    <span className={`mt-0.5 font-mono text-[10px] ${active ? "text-ok" : "text-mute"}`}>{active ? "✓" : String(index + 1).padStart(2, "0")}</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>

              <div className="mt-auto pt-1">
                {!active ? (
                  <ActionRow actions={[task.action]} onComplete={() => setStarted((current) => new Set(current).add(task.id))} />
                ) : (
                  <p className="mt-3 border-t border-line/60 pt-2.5 font-mono text-[10px] text-ok">
                    ✓ SIMULATED SMS LOGGED · local agent activation recorded
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <p className="mt-3 font-mono text-[9px] tracking-[0.05em] text-mute">PUBLIC DEMO · no external SMS, listing publish, or inventory write</p>
    </SpecCard>
  );
}
