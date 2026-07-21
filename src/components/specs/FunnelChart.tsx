/** Horizontal-bar funnel: bar length = count, conversion % between steps.
 *  Direct labels on every bar (single-hue magnitude, no legend needed). */

import type { FunnelStep } from "@/lib/protocol";
import { Chip, SpecCard } from "./bits";
import { num } from "./format";

export function FunnelBars({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(...steps.map((s) => s.count), 1);
  return (
    <div className="space-y-2.5">
      {steps.map((s, i) => {
        const w = Math.max((s.count / max) * 100, s.count > 0 ? 3 : 0.5);
        return (
          <div key={s.label} className="rounded-lg bg-abyss/35 px-3.5 py-3">
            <div className="mb-2 flex items-baseline justify-between gap-4">
              <span className="min-w-0 text-[14px] font-medium text-ink">
                {s.label}
              </span>
              <span className="shrink-0 font-mono text-[20px] text-coralhi tabular-nums">
                {num(s.count)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-raise/80">
              <div
                className="h-full rounded-full bg-teal"
                style={{ width: `${w}%`, opacity: 1 - i * 0.16 }}
              />
            </div>
            <div className="mt-2 flex min-h-4 items-center justify-between text-[12px] text-mute">
              <span>Step {i + 1}</span>
              {s.conversionFromPrev !== undefined ? (
                <span className="font-medium text-tealhi tabular-nums">
                  {s.rateLabel ?? "step conversion"}: {Math.round(s.conversionFromPrev * 100)}%
                </span>
              ) : <span>starting cohort</span>}
            </div>
          </div>
        );
      })}
      <p className="px-1 text-[12px] leading-relaxed text-mute">
        Coverage compares codes issued with winners. Code conversion counts add-on orders that used the discount code.
      </p>
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
