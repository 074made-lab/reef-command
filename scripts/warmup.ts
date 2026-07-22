/**
 * Warm the operational queries before evaluation. Runs every primary cockpit
 * read so the first query is hot and avoids a cold-start TLS reset:
 *
 *   npx tsx scripts/warmup.ts
 */
import { chClient } from "../src/lib/store/clickhouse";
import { pgPool } from "../src/lib/store/postgres";
import { attentionFeed, auctionBoard, mergeScan, revenuePulse, weeklyReport } from "../src/lib/tools";
import { buildManifest } from "../src/lib/label-day";

process.loadEnvFile(".env.local");

async function main() {
  const ch = chClient();
  const pg = pgPool();
  const steps: [string, () => Promise<unknown>][] = [
    ["revenuePulse", () => revenuePulse(ch)],
    ["attentionFeed", () => attentionFeed(ch, pg)],
    // Pinned demo days: warm the exact queries the cockpit story runs.
    ["auctionBoard", () => auctionBoard(ch, "thursday")],
    ["mergeScan", () => mergeScan(pg, "sunday")],
    ["weeklyReport", () => weeklyReport(ch, pg)],
    ["labelManifest", () => buildManifest(pg)],
  ];
  for (const [name, fn] of steps) {
    const t0 = Date.now();
    await fn();
    console.log(`  warm · ${name.padEnd(14)} ${Date.now() - t0}ms`);
  }
  console.log("\nAll cockpit queries warm.");
  await ch.close();
  await pg.end();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
