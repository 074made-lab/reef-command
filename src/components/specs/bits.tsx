/** Small shared chrome pieces used across all spec components. */

import type { CustomerRef } from "@/lib/protocol";
import { PLATFORM_SHORT, PLATFORM_TONE } from "./format";

/** Quiet commercial frame for structured answers. */
export function SpecCard({
  tag,
  right,
  tone = "teal",
  children,
}: {
  tag: string;
  right?: React.ReactNode;
  tone?: "teal" | "coral";
  children: React.ReactNode;
}) {
  const edge =
    tone === "coral" ? "border-coral/35" : "border-line";
  return (
    <section className={`overflow-hidden rounded-xl border ${edge} bg-panel/90 shadow-[inset_0_1px_0_rgba(255,255,255,.025)]`}>
      <header className="flex items-center justify-between gap-3 border-b border-line/65 px-4 py-2.5">
        <span
          className={`text-[12px] font-semibold tracking-[0.08em] uppercase ${
            tone === "coral" ? "text-coralhi" : "text-teal"
          }`}
        >
          {tag}
        </span>
        {right ? <span className="flex items-center gap-2">{right}</span> : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Chip({
  children,
  className = "text-dim border-line",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[12px] tracking-wide ${className}`}
    >
      {children}
    </span>
  );
}

export function PlatformChip({ p }: { p: string }) {
  return (
    <Chip className={PLATFORM_TONE[p] ?? "text-dim border-line"}>
      {PLATFORM_SHORT[p] ?? p.toUpperCase()}
    </Chip>
  );
}

/** Arbitrary synthetic band. It is not a customer-value or first-time score. */
export function TierBadge({ tier }: { tier: CustomerRef["tier"] }) {
  const tone =
    tier === 1 ? "text-tealhi border-tealhi/50" : tier === 2 ? "text-teal border-teal/50" : "text-dim border-line";
  return <Chip className={tone}>BAND {tier}</Chip>;
}

const STATUS_TONE: Record<string, string> = {
  pending: "text-warn border-warn/40",
  paid: "text-ok border-ok/40",
  labeled: "text-tealhi border-tealhi/40",
  shipped: "text-teal border-teal/50",
  planned: "text-dim border-line",
  purchased: "text-ok border-ok/40",
  voided: "text-danger border-danger/40",
  cancelled: "text-danger border-danger/40",
  held: "text-warn border-warn/40",
};

export function StatusChip({ s }: { s: string }) {
  return (
    <Chip className={STATUS_TONE[s] ?? "text-dim border-line"}>
      {s.toUpperCase()}
    </Chip>
  );
}

/** WoW / MoM delta as a colored ▲▼ badge. */
export function Delta({ v, label }: { v?: number; label: string }) {
  if (v === undefined) return null;
  const tone = v > 0 ? "text-ok" : v < 0 ? "text-danger" : "text-mute";
  const mark = v > 0 ? "▲" : v < 0 ? "▼" : "▬";
  return (
    <span className={`font-mono text-[12px] tabular-nums ${tone}`}>
      {mark} {Math.abs(v)}% <span className="text-mute">{label}</span>
    </span>
  );
}

/** Tiny inline trend, oldest → newest. Single phosphor stroke + end dot. */
export function Spark({ data }: { data: number[] }) {
  if (!data.length) return null;
  const w = 88;
  const h = 26;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = data.length === 1 ? w / 2 : (i / (data.length - 1)) * (w - 4) + 2;
    const y = h - 3 - ((v - min) / span) * (h - 6);
    return [x, y] as const;
  });
  const last = pts[pts.length - 1];
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0"
      aria-hidden
    >
      <polyline
        points={pts.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke="var(--color-teal)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r="2" fill="var(--color-tealhi)" />
    </svg>
  );
}

/** high ●●● · medium ●●○ · low ●○○ */
export function ConfidenceMeter({
  level,
}: {
  level: "high" | "medium" | "low";
}) {
  const filled = level === "high" ? 3 : level === "medium" ? 2 : 1;
  const tone =
    level === "high" ? "text-ok" : level === "medium" ? "text-warn" : "text-danger";
  return (
    <span className={`font-mono text-[12px] tracking-wider ${tone}`}>
      {"●".repeat(filled)}
      <span className="opacity-30">{"●".repeat(3 - filled)}</span>{" "}
      {level.toUpperCase()}
    </span>
  );
}
