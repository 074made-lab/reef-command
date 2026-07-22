/** Exercise every tool against the live stores — the agent's hands, verified. */
import { chClient } from "../src/lib/store/clickhouse";
import { pgPool } from "../src/lib/store/postgres";
import { attentionFeed, auctionBoard, mergeScan, revenuePulse, weeklyReport } from "../src/lib/tools";

process.loadEnvFile(".env.local");

async function main() {
  const ch = chClient();
  const pg = pgPool();

  for (const [name, fn] of [
    ["revenuePulse", () => revenuePulse(ch)],
    ["attentionFeed", () => attentionFeed(ch, pg)],
    // Pin the demo days explicitly — the wall-clock default drifts off the
    // synthetic story once the real date passes the demo week.
    ["auctionBoard", () => auctionBoard(ch, "thursday")],
    ["mergeScan", () => mergeScan(pg, "sunday")],
    ["weeklyReport", () => weeklyReport(ch, pg)],
  ] as const) {
    const t0 = Date.now();
    const specs = await fn();
    console.log(`\n=== ${name} (${Date.now() - t0}ms, ${specs.length} component(s))`);
    console.log(JSON.stringify(specs, null, 1).slice(0, 1800));
  }

  await ch.close();
  await pg.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
