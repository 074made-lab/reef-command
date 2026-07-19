/**
 * Backfill N weeks of synthetic history into ClickHouse (day-sized batches).
 * Deterministic (seed 1) — rerunning re-inserts the same world; TRUNCATE first
 * for a clean slate:  npx tsx scripts/backfill.ts --truncate [--weeks 10]
 */
import { chClient, insertEvents } from "../src/lib/store/clickhouse";
import { generateBackfill } from "../src/lib/synth/generator";

process.loadEnvFile(".env.local");

async function main() {
  const args = process.argv.slice(2);
  const weeks = Number(args[args.indexOf("--weeks") + 1]) || 10;
  const client = chClient();

  if (args.includes("--truncate")) {
    // NB: truncating the source table does NOT clear materialized-view targets —
    // each MV accumulates independently, so clear all of them for a clean slate.
    for (const t of ["events", "mv_revenue_hourly", "mv_category_daily", "mv_customer_daily"]) {
      await client.command({ query: `TRUNCATE TABLE ${t}` });
    }
    console.log("truncated events + 3 materialized views");
  }

  const to = new Date();
  const from = new Date(to.getTime() - weeks * 7 * 24 * 3600_000);
  console.log(`backfilling ${weeks} weeks: ${from.toISOString()} → ${to.toISOString()}`);

  let total = 0, days = 0;
  const t0 = Date.now();
  for (const chunk of generateBackfill(from.toISOString(), to.toISOString(), 1)) {
    await insertEvents(client, chunk);
    total += chunk.length;
    days++;
    if (days % 7 === 0) console.log(`  ${days} days, ${total.toLocaleString()} events, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  console.log(`DONE: ${total.toLocaleString()} events over ${days} day-chunks in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  const count = await client.query({ query: "SELECT count() AS n FROM events", format: "JSONEachRow" });
  console.log("events in ClickHouse:", (await count.json<{ n: string }>())[0].n);
  await client.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
