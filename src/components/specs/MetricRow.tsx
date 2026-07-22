/** Stat tiles: big mono numeral, unit, ▲▼ WoW/MoM badges, optional sparkline. */

import type { Metric } from "@/lib/protocol";
import { Delta, Spark, SpecCard } from "./bits";
import { num } from "./format";

function Tile({ m }: { m: Metric }) {
  const prefix = m.unit === "$" ? "$" : "";
  const suffix = m.unit && m.unit !== "$" ? m.unit : "";
  return (
    <div className="min-w-[150px] flex-1 rounded-lg bg-raise/55 px-4 py-3">
      <p className="text-[12px] font-medium tracking-[0.07em] text-mute uppercase">
        {m.label}
      </p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="font-mono text-[28px] leading-none font-medium text-ink tabular-nums">
          {prefix}
          {num(m.value)}
          {suffix ? (
            <span className="ml-1 text-xs font-normal text-mute">{suffix}</span>
          ) : null}
        </p>
        {m.spark?.length ? <Spark data={m.spark} /> : null}
      </div>
      {(m.deltaWoW !== undefined || m.deltaMoM !== undefined) && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
          <Delta v={m.deltaWoW} label="WoW" />
          <Delta v={m.deltaMoM} label="MoM" />
        </div>
      )}
    </div>
  );
}

export function MetricRow({
  metrics,
  bare = false,
}: {
  metrics: Metric[];
  bare?: boolean;
}) {
  const row = (
    <div className="flex flex-wrap gap-2">
      {metrics.map((m) => (
        <Tile key={m.label} m={m} />
      ))}
    </div>
  );
  if (bare) return row;
  return <SpecCard tag="PULSE">{row}</SpecCard>;
}
