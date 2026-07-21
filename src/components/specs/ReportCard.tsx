"use client";

/** Interactive reef-health report over synthetic history. It visualizes
 * category movement but intentionally publishes no buying or customer-profit
 * recommendations from the real business. */

import { useState } from "react";
import Image from "next/image";
import type { ReportSection } from "@/lib/protocol";
import { Chip, SpecCard } from "./bits";
import { FunnelBars } from "./FunnelChart";
import { MetricRow } from "./MetricRow";
import { Timeseries } from "./Timeseries";
import { PLATFORM_LABEL } from "./format";

type TableSection = Extract<ReportSection, { kind: "table" }>;
type ReportView = "overview" | "products" | "auction" | "funnel";

const VIEWS: { id: ReportView; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "products", label: "Products" },
  { id: "auction", label: "Auctions" },
  { id: "funnel", label: "Add-ons" },
];

const PRODUCT_ART: Record<string, { src: string; alt: string }> = {
  "Toxic Velvet Bounce Mushroom": {
    src: "/coral/toxic-velvet.jpg",
    alt: "Toxic Velvet Bounce Mushroom from TIA Coral",
  },
  "Sparkleball Glitter Goniopora": {
    src: "/coral/sparkleball-goniopora.jpg",
    alt: "Sparkleball Glitter Goniopora from TIA Coral",
  },
  "Opposite Day Chalice": {
    src: "/coral/opposite-day-chalice.jpg",
    alt: "Opposite Day Chalice from TIA Coral",
  },
};

function numberish(value: string | number | undefined): number {
  if (typeof value === "number") return value;
  const n = Number(String(value ?? "").replace(/[$,%]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function DataTable({ section }: { section: TableSection }) {
  const platformColumn = section.columns[0]?.toLowerCase() === "platform";
  return (
    <div className="overflow-x-auto rounded-sm border border-line/60">
      <table className="w-full min-w-[520px] border-collapse text-[14px]">
        <thead>
          <tr className="bg-raise/70">
            {section.columns.map((c) => (
              <th key={c} className="border-b border-line px-3 py-2.5 text-left text-[12px] font-semibold tracking-[0.06em] whitespace-nowrap text-mute uppercase">
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
                  <td key={j} className={`px-3 py-2.5 whitespace-nowrap ${numeric ? "text-right font-mono text-coralhi tabular-nums" : j === 0 ? "text-ink" : "text-dim"}`}>
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
    <div className="rounded-lg bg-abyss/35 p-3.5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[13px] font-semibold tracking-[0.05em] text-ink uppercase">Channel mix</span>
        <span className="text-[12px] text-mute">Weekly revenue share</span>
      </div>
      <div className="space-y-2">
          {section.rows.map((row) => {
            const platform = String(row[0]);
            const share = shareAt >= 0 ? numberish(row[shareAt]) : 0;
            return (
              <div key={platform} className="relative overflow-hidden rounded-md bg-raise/55 px-3 py-2.5">
                <div className="relative z-10 flex items-center justify-between gap-3">
                  <span className="text-[13px] font-medium text-ink">{PLATFORM_LABEL[platform] ?? platform}</span>
                  <span className="font-mono text-[13px] text-coralhi">{share}% / {revenueAt >= 0 ? `$${numberish(row[revenueAt]).toLocaleString("en-US")}` : ""}</span>
                </div>
                <span className="absolute inset-y-0 left-0 bg-coral/[0.075]" style={{ width: `${Math.max(share, 3)}%` }} />
              </div>
            );
          })}
      </div>
    </div>
  );
}

function ProductSpotlight({ section }: { section: TableSection }) {
  const hammerAt = section.columns.findIndex((c) => c.toLowerCase().includes("hammer"));
  const seen = new Set<string>();
  const featured = section.rows
    .filter((row) => {
      const name = String(row[0]);
      if (!PRODUCT_ART[name] || seen.has(name)) return false;
      seen.add(name);
      return true;
    })
    .slice(0, 3);
  if (!featured.length) return <DataTable section={section} />;

  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h3 className="text-[18px] font-semibold tracking-[-0.02em] text-ink">Top products this cycle</h3>
          <p className="mt-0.5 text-[13px] text-mute">Public product photos, synthetic auction results.</p>
        </div>
        <span className="hidden text-[12px] text-mute sm:block">Highest hammer prices</span>
      </div>
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 sm:mx-0 sm:grid sm:grid-cols-[1.35fr_.85fr_.85fr] sm:overflow-visible sm:px-0 sm:pb-0">
        {featured.map((row, index) => {
          const name = String(row[0]);
          const art = PRODUCT_ART[name];
          const hammer = hammerAt >= 0 ? numberish(row[hammerAt]) : 0;
          return (
            <figure key={name} className="group min-w-[78%] snap-start sm:min-w-0">
              <div className={`relative overflow-hidden rounded-xl bg-raise ring-1 ring-white/10 ${index === 0 ? "aspect-[4/3] sm:aspect-auto sm:h-[250px]" : "aspect-square sm:h-[250px]"}`}>
                <Image
                  src={art.src}
                  alt={art.alt}
                  fill
                  sizes="(max-width: 640px) 100vw, 33vw"
                  className="object-cover transition-transform duration-700 ease-[cubic-bezier(.16,1,.3,1)] group-hover:scale-[1.035]"
                />
              </div>
              <figcaption className="pt-2.5">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 text-[14px] font-medium leading-snug text-ink">{name}</span>
                  <span className="shrink-0 font-mono text-[15px] text-coralhi">${hammer.toLocaleString("en-US")}</span>
                </div>
                <p className="mt-1 text-[12px] text-mute">{String(row[1])}</p>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}

function Section({ section }: { section: ReportSection }) {
  return (
    <div>
      <h3 className="mb-2 text-[13px] font-semibold tracking-[0.05em] text-dim uppercase">{section.title}</h3>
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

export function ReportCard({ weekLabel, sections }: { weekLabel: string; sections: ReportSection[] }) {
  const [view, setView] = useState<ReportView>("overview");
  const [showTop10, setShowTop10] = useState(false);
  const metrics = sections.find((s) => s.kind === "metrics");
  const platform = sections.find((s): s is TableSection => s.kind === "table" && s.title.startsWith("Platform"));
  const products = sections.find((s): s is TableSection => s.kind === "table" && s.title.startsWith("Product"));
  const auction = sections.find((s): s is TableSection => s.kind === "table" && s.title.startsWith("Auction"));
  const funnel = sections.find((s) => s.kind === "funnel");

  return (
    <SpecCard tag="WEEKLY REPORT" right={<Chip className="border-coral/45 text-coralhi">{weekLabel}</Chip>}>
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line/70 pb-2">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" onClick={() => setView(v.id)} className={`shrink-0 rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors ${view === v.id ? "border-coral/60 bg-coral/10 text-coralhi" : "border-transparent text-mute hover:border-line hover:text-ink"}`}>
            {v.label}
          </button>
        ))}
      </div>

      <div className="space-y-5">
        {view === "overview" ? (
          <>
            {metrics ? <Section section={metrics} /> : null}
            {platform ? <PlatformCurrents section={platform} /> : null}
          </>
        ) : null}
        {view === "products" ? (
          <>
            {products ? <Section section={products} /> : null}
          </>
        ) : null}
        {view === "auction" && auction ? (
          <>
            <ProductSpotlight section={auction} />
            <button
              type="button"
              onClick={() => setShowTop10((current) => !current)}
              className="text-[13px] font-medium text-coralhi transition-colors hover:text-coral"
            >
              {showTop10 ? "Hide full table" : "Show full top 10"}
            </button>
            {showTop10 ? <DataTable section={auction} /> : null}
          </>
        ) : null}
        {view === "funnel" && funnel ? <Section section={funnel} /> : null}
      </div>
    </SpecCard>
  );
}
