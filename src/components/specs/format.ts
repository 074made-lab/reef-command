/** Shared display formatting for spec components. Money is integer cents. */

export function usd(cents: number): string {
  const d = cents / 100;
  if (Number.isInteger(d)) return `$${d.toLocaleString("en-US")}`;
  return `$${d.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export const num = (n: number): string => n.toLocaleString("en-US");

/** 42m · 3h · 2d */
export function age(minutes: number): string {
  if (minutes < 60) return `${Math.max(minutes, 0)}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

/** green < 1h · amber < 24h · red beyond */
export function ageTone(minutes: number): string {
  if (minutes < 60) return "text-ok";
  if (minutes < 1440) return "text-warn";
  return "text-danger";
}

export const PLATFORM_SHORT: Record<string, string> = {
  auction: "AUC",
  web: "WEB",
  marketplace: "MKT",
  combined: "CMB",
};

export const PLATFORM_TONE: Record<string, string> = {
  auction: "text-tealhi border-tealhi/40",
  web: "text-dim border-line",
  marketplace: "text-warn border-warn/40",
  combined: "text-coralhi border-coralhi/50",
};

/** "2026-07-16 14:00:00" | ISO → "Jul 16 14:00" (UTC, stable across SSR) */
export function shortTime(t: string): string {
  const d = new Date(t.includes("T") ? t : t.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return t;
  const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
  const p = (x: number) => String(x).padStart(2, "0");
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export const titleize = (s: string): string => s.replace(/_/g, " ");
