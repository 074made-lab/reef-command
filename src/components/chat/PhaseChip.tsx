"use client";

/** Current cycle phase, computed client-side from the day of week:
 *  THU–SAT auction live · SUN–MON add-on window · MON eve label day ·
 *  TUE–WED ship days · WED eve report day. Renders after mount to stay
 *  hydration-safe. */

import { useEffect, useState } from "react";

function phaseNow(): string {
  const d = new Date();
  const day = d.getDay(); // 0 Sun … 6 Sat
  const h = d.getHours();
  switch (day) {
    case 0:
      return "Add-on window";
    case 1:
      return h >= 17 ? "Label day" : "Add-on window";
    case 2:
      return "Ship days";
    case 3:
      return h >= 17 ? "Report day" : "Ship days";
    default:
      return "Auction live";
  }
}

export function PhaseChip() {
  const [phase, setPhase] = useState<string | null>(null);
  useEffect(() => {
    setPhase(phaseNow());
    const t = setInterval(() => setPhase(phaseNow()), 60_000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-teal/50 px-2 py-0.5 font-mono text-[10px] tracking-[0.15em] text-tealhi uppercase">
      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-tealhi" />
      {phase ?? "· · ·"}
    </span>
  );
}
