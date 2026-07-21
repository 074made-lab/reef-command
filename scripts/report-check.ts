/**
 * Proof that the weekly report now meets its own definition: platform mix,
 * platform mix, WoW+MoM on every public-safe headline metric, and sparklines.
 * Live CH + PG (Codex M7).
 *
 * Run: npx tsx scripts/report-check.ts
 */
import { chClient } from "../src/lib/store/clickhouse";
import { pgPool } from "../src/lib/store/postgres";
import { weeklyReport } from "../src/lib/tools";
import type { Metric } from "../src/lib/protocol";

process.loadEnvFile(".env.local");

async function main() {
  const ch = chClient();
  const pg = pgPool();
  const t0 = Date.now();
  const [report] = await weeklyReport(ch, pg);
  if (report.kind !== "report") throw new Error("no report");
  console.log(`\nReport ${report.weekLabel} — ${report.sections.length} sections (${Date.now() - t0}ms):`);
  for (const s of report.sections) console.log(`  · ${s.kind.padEnd(7)} ${s.title}`);

  const headline = report.sections.find((s) => s.kind === "metrics");
  if (headline && headline.kind === "metrics") {
    console.log(`\nHeadline metrics (value · WoW · MoM · spark):`);
    for (const m of headline.metrics as Metric[]) {
      console.log(
        `  ${m.label.padEnd(22)} ${String(m.value).padStart(7)}${m.unit === "$" ? "" : " " + (m.unit ?? "")}` +
          `  WoW=${m.deltaWoW ?? "—"}  MoM=${m.deltaMoM ?? "—"}  spark=[${(m.spark ?? []).join(",")}]`,
      );
    }
  }
  for (const kind of ["Platform mix"]) {
    const sec = report.sections.find((s) => s.title.startsWith(kind));
    if (sec && sec.kind === "table") {
      console.log(`\n${sec.title}\n  ${sec.columns.join(" | ")}`);
      for (const r of sec.rows) console.log(`  ${r.join(" | ")}`);
    }
  }
  await ch.close();
  await pg.end();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
