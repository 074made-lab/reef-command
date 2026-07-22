import type { ClickHouseClient } from "@clickhouse/client";
import { insertEvents, queryRows } from "../store/clickhouse";
import { generateBackfill } from "./generator";

const ANCHOR = Date.UTC(2026, 0, 1);
const WEEK_MS = 7 * 24 * 60 * 60_000;
export const SEEDED_AUCTION_TYPES = new Set([
  "auction_opened",
  "bid_placed",
  "auction_closed",
  "auction_won",
]);
const FIXTURE_REVISION = "auction-close-2000-v3";

/**
 * Ensures the chronological Thursday–Saturday demo auction exists — complete
 * and exactly once — even when judges select a future synthetic day or ran a
 * partial mid-cycle backfill. The stored window is converged to the
 * deterministic generator output (seed 1): if any of the four auction event
 * types has a count mismatch (missing close/winners after a partial backfill,
 * post-close bids, duplicates from a replay), the whole windowed fixture is
 * deleted and the canonical set reinserted. Idempotent under the reset lock;
 * a matching store is a no-op.
 */
export async function ensureSyntheticAuctionWeek(
  client: ClickHouseClient,
  weekIndex: number,
): Promise<number> {
  const startMs = ANCHOR + weekIndex * WEEK_MS;
  const endMs = startMs + 3 * 24 * 60 * 60_000;
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();
  const start = startIso.slice(0, 19).replace("T", " ");
  const end = endIso.slice(0, 19).replace("T", " ");

  const canonical = [...generateBackfill(startIso, endIso, 1)].flatMap((chunk) =>
    chunk.filter((event) => event.platform === "auction" && SEEDED_AUCTION_TYPES.has(event.type)));
  const expected = new Map<string, number>();
  for (const event of canonical) expected.set(event.type, (expected.get(event.type) ?? 0) + 1);

  const storedRows = await queryRows<{ type: string; n: string }>(client, `
    SELECT type, count() AS n FROM events
    WHERE platform = 'auction'
      AND type IN ('auction_opened','bid_placed','auction_closed','auction_won')
      AND ts >= {start:DateTime} AND ts < {end:DateTime}
    GROUP BY type`, { start, end });
  const stored = new Map(storedRows.map((row) => [row.type, Number(row.n)]));
  const types = [...SEEDED_AUCTION_TYPES];
  if (types.every((type) => (stored.get(type) ?? 0) === (expected.get(type) ?? 0))) return 0;

  if (types.some((type) => (stored.get(type) ?? 0) > 0)) {
    await client.command({
      query: `ALTER TABLE events DELETE
        WHERE platform = 'auction'
          AND type IN ('auction_opened','bid_placed','auction_closed','auction_won')
          AND ts >= {start:DateTime} AND ts < {end:DateTime}`,
      query_params: { start, end },
      clickhouse_settings: { mutations_sync: "2" },
    });
    for (let attempt = 0; attempt < 60; attempt++) {
      const pending = await queryRows<{ n: string }>(client, `
        SELECT count() AS n FROM system.mutations
        WHERE database = currentDatabase() AND table = 'events' AND is_done = 0`);
      if (Number(pending[0]?.n ?? 0) === 0) break;
      if (attempt === 59) throw new Error("synthetic auction fixture repair did not finish before reseed");
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  const fixture = canonical.map((event) => ({
    ...event,
    meta: { ...event.meta, fixtureRevision: FIXTURE_REVISION },
  }));
  const batch = 5000;
  for (let i = 0; i < fixture.length; i += batch) {
    await insertEvents(client, fixture.slice(i, i + batch), { deduplicate: false });
  }
  return fixture.length;
}
