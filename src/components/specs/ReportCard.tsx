/** The weekly report — every section is a component, always shown against
 *  history (WoW/MoM deltas, funnel vs previous weeks). */

import type { ReportSection } from "@/lib/protocol";
import { Chip, SpecCard } from "./bits";
import { FunnelBars } from "./FunnelChart";
import { MetricRow } from "./MetricRow";
import { Timeseries } from "./Timeseries";

function DataTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="overflow-x-auto rounded-sm border border-line/60">
      <table className="w-full min-w-[520px] border-collapse text-[12px]">
        <thead>
          <tr className="bg-raise/70">
            {columns.map((c) => (
              <th
                key={c}
                className="border-b border-line px-2.5 py-1.5 text-left font-mono text-[10px] font-medium tracking-wider whitespace-nowrap text-mute uppercase"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line/40 last:border-0">
              {r.map((cell, j) => {
                const numeric = typeof cell === "number";
                return (
                  <td
                    key={j}
                    className={`px-2.5 py-1.5 whitespace-nowrap ${
                      numeric
                        ? "text-right font-mono text-tealhi tabular-nums"
                        : j === 0
                          ? "text-ink"
                          : "text-dim"
                    }`}
                  >
                    {numeric ? cell.toLocaleString("en-US") : cell}
                  </td>
                );
              })}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-2.5 py-3 text-center font-mono text-[11px] text-mute"
              >
                no rows this week
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function Section({ s }: { s: ReportSection }) {
  return (
    <div>
      <h3 className="mb-2 font-mono text-[11px] tracking-[0.18em] text-dim uppercase">
        ▪ {s.title}
      </h3>
      {s.kind === "metrics" ? <MetricRow metrics={s.metrics} bare /> : null}
      {s.kind === "table" ? <DataTable columns={s.columns} rows={s.rows} /> : null}
      {s.kind === "series" ? <Timeseries title={s.title} series={s.series} /> : null}
      {s.kind === "funnel" ? (
        <>
          <FunnelBars steps={s.steps} />
          {s.prevWeeks?.length ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] tracking-widest text-mute">
                VS HISTORY
              </span>
              {s.prevWeeks.map((p) => (
                <Chip key={p.week}>
                  {p.week} · {Math.round(p.overall * 100)}%
                </Chip>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function ReportCard({
  weekLabel,
  sections,
}: {
  weekLabel: string;
  sections: ReportSection[];
}) {
  return (
    <SpecCard
      tag="WEEKLY REPORT"
      right={<Chip className="border-tealhi/50 text-tealhi">{weekLabel}</Chip>}
    >
      <div className="space-y-5">
        {sections.map((s) => (
          <Section key={s.title} s={s} />
        ))}
      </div>
    </SpecCard>
  );
}
