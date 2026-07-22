/**
 * Verify the analytics layer against live ClickHouse: weekly revenue rollup,
 * the auction top-10 and the cycle funnel (windowFunnel). Prints timings —
 * the speed IS part of the demo.
 */
import { chClient, queryRows } from "../src/lib/store/clickhouse";

process.loadEnvFile(".env.local");

/** Last COMPLETE cycle week (THU 00:00 → THU 00:00), UTC. */
function lastCompleteWeek(now = new Date()): { start: string; end: string } {
  const ANCHOR = Date.UTC(2026, 0, 1);                       // a Thursday
  const WEEK = 7 * 24 * 3600_000;
  const idx = Math.floor((now.getTime() - ANCHOR) / WEEK);
  const start = new Date(ANCHOR + (idx - 1) * WEEK);
  const end = new Date(ANCHOR + idx * WEEK);
  const f = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
  return { start: f(start), end: f(end) };
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  const out = await fn();
  console.log(`\n== ${label} (${Date.now() - t0}ms)`);
  return out;
}

async function main() {
  const client = chClient();
  const { start, end } = lastCompleteWeek();
  console.log(`last complete cycle week: ${start} → ${end}`);

  const weekly = await timed("weekly revenue by platform (mv_revenue_hourly)", () =>
    queryRows<{ week: string; platform: string; rev: string; orders: string }>(client, `
      SELECT toStartOfWeek(hour, 5) AS week, platform,
             round(sum(revenue_cents)/100) AS rev, sum(orders) AS orders
      FROM mv_revenue_hourly GROUP BY week, platform
      ORDER BY week DESC, platform LIMIT 9`));
  console.table(weekly);

  const top10 = await timed("AUCTION TOP 10 — highest hammer prices last week", () =>
    queryRows<Record<string, unknown>>(client, `
      SELECT any(JSONExtractString(meta,'winner')) AS winner, sku, any(category) AS category,
             round(max(amount_cents)/100) AS hammer_usd, count() AS lots
      FROM events
      WHERE type = 'auction_won' AND ts >= {start:DateTime} AND ts < {end:DateTime}
      GROUP BY sku ORDER BY hammer_usd DESC LIMIT 10`, { start, end }));
  console.table(top10);

  const funnel = await timed("cycle funnel: won → code → add-on (windowFunnel 72h)", () =>
    queryRows<{ level: number; customers: string }>(client, `
      SELECT level, count() AS customers FROM (
        SELECT customer_id,
               windowFunnel(259200)(toDateTime(ts),
                 type = 'auction_won',
                 type = 'discount_code_issued',
                 type = 'discount_code_redeemed') AS level
        FROM events
        WHERE ts >= {start:DateTime} AND ts < {end:DateTime} AND customer_id > 0
        GROUP BY customer_id
      ) WHERE level > 0 GROUP BY level ORDER BY level`, { start, end }));
  console.table(funnel);

  await client.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
