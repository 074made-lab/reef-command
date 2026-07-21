"use client";

/** Interactive reef-health report: the owner can move between customer,
 * product, auction, and funnel views; platform revenue flows like currents;
 * stock guidance is deterministically derived from the rendered rows. */

import { useMemo, useState } from "react";
import type { ReportSection } from "@/lib/protocol";
import { Chip, SpecCard } from "./bits";
import { FunnelBars } from "./FunnelChart";
import { MetricRow } from "./MetricRow";
import { Timeseries } from "./Timeseries";
import { PLATFORM_LABEL } from "./format";

type TableSection = Extract<ReportSection, { kind: "table" }>;
type ReportView = "overview" | "customers" | "products" | "auction" | "funnel";

const VIEWS: { id: ReportView; label: string }[] = [
  { id: "overview", label: "Reef pulse" },
  { id: "customers", label: "Customers" },
  { id: "products", label: "Stock next week" },
  { id: "auction", label: "ReefnBid demand" },
  { id: "funnel", label: "Add-on funnel" },
];

function numberish(value: string | number | undefined): number {
  if (typeof value === "number") return value;
  const n = Number(String(value ?? "").replace(/[$,%]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function DataTable({ section }: { section: TableSection }) {
  const platformColumn = section.columns[0]?.toLowerCase() === "platform";
  return (
    <div className="overflow-x-auto rounded-sm border border-line/60">
      <table className="w-full min-w-[520px] border-collapse text-[13px]">
        <thead>
          <tr className="bg-raise/70">
            {section.columns.map((c) => (
              <th key={c} className="border-b border-line px-2.5 py-2 text-left font-mono text-[12px] font-medium tracking-wider whitespace-nowrap text-mute uppercase">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section.rows.map((r, i) => (
            <tr key={i} className="border-b border-line/40 transition-colors last:border-0 hover:bg-teal/[0.035]">
              {r.map((cell, j) => {
                const numeric = typeof cell === "number";
                const display = platformColumn && j === 0
                  ? (PLATFORM_LABEL[String(cell)] ?? String(cell))
                  : numeric ? cell.toLocaleString("en-US") : cell;
                return (
                  <td key={j} className={`px-2.5 py-2 whitespace-nowrap ${numeric ? "text-right font-mono text-tealhi tabular-nums" : j === 0 ? "text-ink" : "text-dim"}`}>
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
          {section.rows.length === 0 ? (
            <tr><td colSpan={section.columns.length} className="px-2.5 py-4 text-center font-mono text-[13px] text-mute">no rows this week</td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function PlatformCurrents({ section }: { section: TableSection }) {
  const shareAt = section.columns.findIndex((c) => c.toLowerCase().startsWith("share"));
  const revenueAt = section.columns.findIndex((c) => c.toLowerCase().startsWith("revenue"));
  return (
    <div className="rounded-md border border-line/70 bg-abyss/45 p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[13px] tracking-[0.14em] text-teal uppercase">three currents · one reef</span>
        <span className="font-mono text-[12px] text-mute">share of weekly revenue</span>
      </div>
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_120px] md:items-stretch">
        <div className="space-y-2">
          {section.rows.map((row, i) => {
            const platform = String(row[0]);
            const share = shareAt >= 0 ? numberish(row[shareAt]) : 0;
            return (
              <div key={platform} className="relative overflow-hidden rounded-sm border border-line bg-raise/45 px-3 py-2">
                <div className="relative z-10 flex items-center justify-between gap-3">
                  <span className="text-[13px] font-medium text-ink">{PLATFORM_LABEL[platform] ?? platform}</span>
                  <span className="font-mono text-[13px] text-tealhi">{share}% · {revenueAt >= 0 ? `$${numberish(row[revenueAt]).toLocaleString("en-US")}` : ""}</span>
                </div>
                <span className="absolute inset-y-0 left-0 bg-teal/[0.09]" style={{ width: `${Math.max(share, 3)}%` }} />
                <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-60" viewBox="0 0 420 34" preserveAspectRatio="none" aria-hidden>
                  <path d={`M-12 ${8 + i * 7} C 100 ${30 - i * 7}, 270 ${4 + i * 5}, 438 17`} className="report-current" />
                </svg>
              </div>
            );
          })}
        </div>
        <div className="relative flex min-h-24 items-center justify-center overflow-hidden rounded-md border border-coral/35 bg-coral/[0.055]">
          <span className="sonar-ring absolute h-24 w-24 rounded-full border border-coral/30" />
          <span className="relative text-center">
            <span className="block font-mono text-[12px] tracking-[0.16em] text-coralhi">ONE REEF</span>
            <span className="mt-1 block text-[13px] text-ink">weekly demand</span>
            <span className="block text-[12px] text-mute">all platforms</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function TierNote() {
  return (
    <div className="mt-2 rounded-sm border border-line/70 bg-raise/35 px-3 py-2 text-[13px] leading-relaxed text-dim">
      <span className="font-mono text-tealhi">How dossier tiers work · </span>
      Synthetic customers are ranked by spend propensity: <b className="text-ink">T1 top 10%</b>, T2 next 20%, T3 next 30%, T4 remaining 40%.
      New-customer revenue is calculated separately from actual first-order timing, not inferred from tier.
    </div>
  );
}

function Section({ section }: { section: ReportSection }) {
  return (
    <div>
      <h3 className="mb-2 font-mono text-[13px] tracking-[0.16em] text-dim uppercase">▪ {section.title}</h3>
      {section.kind === "metrics" ? <MetricRow metrics={section.metrics} bare /> : null}
      {section.kind === "table" ? <DataTable section={section} /> : null}
      {section.kind === "series" ? <Timeseries title={section.title} series={section.series} /> : null}
      {section.kind === "funnel" ? (
        <>
          <FunnelBars steps={section.steps} />
          {section.prevWeeks?.length ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[12px] tracking-widest text-mute">VS HISTORY</span>
              {section.prevWeeks.map((p) => <Chip key={p.week}>{p.week} · {Math.round(p.overall * 100)}%</Chip>)}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function StockInsights({ products, auction }: { products?: TableSection; auction?: TableSection }) {
  const insights = useMemo(() => {
    if (!products?.rows.length) return [] as { title: string; detail: string; tone: string }[];
    const wowAt = products.columns.findIndex((c) => c.toLowerCase().startsWith("wow"));
    const shareAt = products.columns.findIndex((c) => c.toLowerCase().startsWith("share"));
    // “other” is useful accounting but not a buyable category; recommendations
    // must name a coral family the owner can actually stock.
    const actionable = products.rows.filter((row) => String(row[0]).toLowerCase() !== "other");
    const rankedGrowth = [...actionable].sort((a, b) => numberish(b[wowAt]) - numberish(a[wowAt]));
    const rankedShare = [...actionable].sort((a, b) => numberish(b[shareAt]) - numberish(a[shareAt]));
    const growth = rankedGrowth[0];
    const weak = rankedGrowth[rankedGrowth.length - 1];
    const core = rankedShare[0];
    const auctionCounts = new Map<string, number>();
    for (const row of auction?.rows ?? []) {
      const category = String(row[1]);
      if (category.toLowerCase() !== "other") auctionCounts.set(category, (auctionCounts.get(category) ?? 0) + 1);
    }
    const auctionLead = [...auctionCounts].sort((a, b) => b[1] - a[1])[0];
    return [
      {
        title: `Lean into ${String(growth?.[0] ?? "the leader")}`,
        detail: `${numberish(growth?.[wowAt]) >= 0 ? "+" : ""}${numberish(growth?.[wowAt])}% WoW — increase next week's depth before adding more variety.`,
        tone: "text-ok border-ok/30 bg-ok/[0.045]",
      },
      {
        title: `Protect the ${String(core?.[0] ?? "core")} core`,
        detail: `${numberish(core?.[shareAt])}% of product revenue — keep proven price points and avoid stocking out.`,
        tone: "text-tealhi border-teal/35 bg-teal/[0.045]",
      },
      {
        title: auctionLead ? `ReefnBid signal: ${auctionLead[0]}` : `Trim ${String(weak?.[0] ?? "the laggard")}`,
        detail: auctionLead
          ? `${auctionLead[1]} of the top ${auction?.rows.length ?? 0} hammer-price lots were ${auctionLead[0]}; reserve standout pieces for auction.`
          : `${numberish(weak?.[wowAt])}% WoW — buy shallower until demand recovers.`,
        tone: "text-coralhi border-coral/30 bg-coral/[0.045]",
      },
      {
        title: `Buy ${String(weak?.[0] ?? "the laggard")} shallower`,
        detail: `${numberish(weak?.[wowAt])}% WoW — reduce depth, keep only proven colorways, and recheck after next cycle.`,
        tone: "text-warn border-warn/30 bg-warn/[0.04]",
      },
    ];
  }, [products, auction]);
  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
      {insights.map((insight) => (
        <div key={insight.title} className={`rounded-md border p-3 ${insight.tone}`}>
          <span className="font-mono text-[12px] tracking-[0.14em] uppercase">NEXT WEEK</span>
          <h4 className="mt-1 text-[14px] font-semibold text-ink">{insight.title}</h4>
          <p className="mt-1 text-[13px] leading-relaxed text-dim">{insight.detail}</p>
        </div>
      ))}
    </div>
  );
}

export function ReportCard({ weekLabel, sections }: { weekLabel: string; sections: ReportSection[] }) {
  const [view, setView] = useState<ReportView>("overview");
  const metrics = sections.find((s) => s.kind === "metrics");
  const platform = sections.find((s): s is TableSection => s.kind === "table" && s.title.startsWith("Platform"));
  const tier = sections.find((s): s is TableSection => s.kind === "table" && s.title.startsWith("Customer tier"));
  const products = sections.find((s): s is TableSection => s.kind === "table" && s.title.startsWith("Product"));
  const auction = sections.find((s): s is TableSection => s.kind === "table" && s.title.startsWith("Auction"));
  const funnel = sections.find((s) => s.kind === "funnel");

  return (
    <SpecCard tag="REEF HEALTH REPORT" right={<Chip className="border-tealhi/50 text-tealhi">{weekLabel}</Chip>}>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line/70 pb-2">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" onClick={() => setView(v.id)} className={`shrink-0 rounded-sm border px-2.5 py-1.5 font-mono text-[13px] tracking-wide transition-colors ${view === v.id ? "border-teal/60 bg-teal/10 text-tealhi" : "border-transparent text-mute hover:border-line hover:text-dim"}`}>
            {v.label}
          </button>
        ))}
      </div>

      <div className="space-y-5">
        {view === "overview" ? (
          <>
            {metrics ? <Section section={metrics} /> : null}
            <StockInsights products={products} auction={auction} />
            {platform ? <PlatformCurrents section={platform} /> : null}
          </>
        ) : null}
        {view === "customers" ? (
          <>
            {platform ? <PlatformCurrents section={platform} /> : null}
            {tier ? <><Section section={tier} /><TierNote /></> : null}
          </>
        ) : null}
        {view === "products" ? (
          <>
            <StockInsights products={products} auction={auction} />
            {products ? <Section section={products} /> : null}
          </>
        ) : null}
        {view === "auction" && auction ? <Section section={auction} /> : null}
        {view === "funnel" && funnel ? <Section section={funnel} /> : null}
      </div>
    </SpecCard>
  );
}
