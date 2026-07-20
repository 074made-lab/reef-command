/**
 * Warm the exact demo queries before recording (Codex m4). Runs every read the
 * cockpit will make on camera so the first real query is hot — no cold-start
 * TLS reset, no first-take stall. Run once right before you hit record:
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
    ["auctionBoard", () => auctionBoard(ch)],
    ["mergeScan", () => mergeScan(pg)],
    ["weeklyReport", () => weeklyReport(ch, pg)],
    ["labelManifest", () => buildManifest(pg)],
  ];
  for (const [name, fn] of steps) {
    const t0 = Date.now();
    await fn();
    console.log(`  warm · ${name.padEnd(14)} ${Date.now() - t0}ms`);
  }
  console.log("\nAll demo queries warm.");
  await ch.close();
  await pg.end();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
