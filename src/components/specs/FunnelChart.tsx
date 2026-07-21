/** Horizontal-bar funnel: bar length = count, conversion % between steps.
 *  Direct labels on every bar (single-hue magnitude, no legend needed). */

import type { FunnelStep } from "@/lib/protocol";
import { Chip, SpecCard } from "./bits";
import { num } from "./format";

export function FunnelBars({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(...steps.map((s) => s.count), 1);
  return (
    <div className="space-y-2">
      {steps.map((s, i) => {
        const w = Math.max((s.count / max) * 100, s.count > 0 ? 3 : 0.5);
        return (
          <div key={s.label} className="flex items-center gap-3">
            <span className="w-44 shrink-0 truncate text-right font-mono text-[13px] text-dim">
              {s.label}
            </span>
            <div className="relative h-6 flex-1 overflow-hidden rounded-sm bg-raise/60">
              <div
                className="absolute inset-y-[2px] left-0 rounded-r-[4px] bg-teal"
                style={{ width: `${w}%`, opacity: 1 - i * 0.18 }}
              />
              <span className="absolute inset-y-0 left-2 flex items-center font-mono text-[13px] font-semibold text-ink tabular-nums mix-blend-plus-lighter">
                {num(s.count)}
              </span>
            </div>
            <span className="w-16 shrink-0 font-mono text-[13px] text-mute tabular-nums">
              {s.conversionFromPrev !== undefined
                ? `→ ${Math.round(s.conversionFromPrev * 100)}%`
                : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function FunnelChart({
  title,
  steps,
  prevWeeks,
}: {
  title: string;
  steps: FunnelStep[];
  prevWeeks?: { week: string; overall: number }[];
}) {
  const overall =
    steps.length && steps[0].count > 0
      ? Math.round(((steps[steps.length - 1]?.count ?? 0) / steps[0].count) * 100)
      : 0;
  return (
    <SpecCard
      tag="FUNNEL"
      right={
        <Chip className="border-teal/50 text-tealhi">overall {overall}%</Chip>
      }
    >
      <p className="mb-3 text-sm text-dim">{title}</p>
      <FunnelBars steps={steps} />
      {prevWeeks?.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/60 pt-2">
          <span className="font-mono text-[12px] tracking-widest text-mute">
            VS HISTORY
          </span>
          {prevWeeks.map((p) => (
            <Chip key={p.week}>
              {p.week} · {Math.round(p.overall * 100)}%
            </Chip>
          ))}
        </div>
      ) : null}
    </SpecCard>
  );
}
