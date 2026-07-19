import { generateBackfill } from "../src/lib/synth/generator";

const counts: Record<string, number> = {};
const byDay: Record<string, Record<string, number>> = {};
let total = 0;
for (const chunk of generateBackfill("2026-06-25T00:00:00Z", "2026-07-02T00:00:00Z", 1)) {
  for (const e of chunk) {
    total++;
    counts[e.type] = (counts[e.type] ?? 0) + 1;
    if (e.type !== "pageview" && e.type !== "message_out") {
      const d = e.ts.slice(0, 10);
      byDay[d] = byDay[d] ?? {};
      byDay[d][e.type] = (byDay[d][e.type] ?? 0) + 1;
    }
  }
}
console.log("TOTAL:", total);
console.log("BY TYPE:", JSON.stringify(counts));
for (const [d, m] of Object.entries(byDay).sort()) {
  console.log(d, new Date(d + "T12:00Z").toUTCString().slice(0, 3), JSON.stringify(m));
}
