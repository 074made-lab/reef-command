import type { ClickHouseClient } from "@clickhouse/client";
import { insertEvents, queryRows } from "../store/clickhouse";
import { generateBackfill } from "./generator";
import { AUCTION_CLOSE_OFFSET_MS } from "./schedule";

const ANCHOR = Date.UTC(2026, 0, 1);
const WEEK_MS = 7 * 24 * 60 * 60_000;
const SEEDED_TYPES = new Set([
  "auction_opened",
  "bid_placed",
  "auction_closed",
  "auction_won",
]);

/**
 * Ensures the chronological Thursday-Saturday demo auction exists even when
 * judges select a future synthetic day. The operation is idempotent under the
 * reset lock: an existing auction_opened event owns the complete fixture.
 */
export async function ensureSyntheticAuctionWeek(
  client: ClickHouseClient,
  weekIndex: number,
): Promise<number> {
  const startMs = ANCHOR + weekIndex * WEEK_MS;
  const endMs = startMs + 3 * 24 * 60 * 60_000;
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();
  const close = new Date(startMs + AUCTION_CLOSE_OFFSET_MS).toISOString().slice(0, 19).replace("T", " ");
  const start = startIso.slice(0, 19).replace("T", " ");
  const end = endIso.slice(0, 19).replace("T", " ");
  const chunks = [...generateBackfill(startIso, endIso, 1)];
  const expectedBidCount = chunks.reduce(
    (total, chunk) => total + chunk.filter((event) => event.type === "bid_placed").length,
    0,
  );
  const existing = await queryRows<{ n: string }>(client, `
    SELECT count() AS n FROM events
    WHERE type = 'auction_opened' AND ts >= {start:DateTime} AND ts < {end:DateTime}`,
  { start, end });
  const hasAuction = Number(existing[0]?.n ?? 0) > 0;
  const invalid = hasAuction ? await queryRows<{ n: string }>(client, `
    SELECT count() AS n FROM events
    WHERE type = 'bid_placed' AND ts >= {close:DateTime} AND ts < {end:DateTime}`,
  { close, end }) : [];
  const storedBids = hasAuction ? await queryRows<{ n: string }>(client, `
    SELECT count() AS n FROM events
    WHERE type = 'bid_placed' AND ts >= {start:DateTime} AND ts < {end:DateTime}`,
  { start, end }) : [];
  const mustRepairBids = Number(invalid[0]?.n ?? 0) > 0
    || (hasAuction && Number(storedBids[0]?.n ?? 0) !== expectedBidCount);
  if (hasAuction && !mustRepairBids) return 0;

  if (mustRepairBids) {
    await client.command({
      query: `ALTER TABLE events DELETE
        WHERE type = 'bid_placed' AND ts >= {start:DateTime} AND ts < {end:DateTime}`,
      query_params: { start, end },
      clickhouse_settings: { mutations_sync: "2" },
    });
    for (let attempt = 0; attempt < 60; attempt++) {
      const pending = await queryRows<{ n: string }>(client, `
        SELECT count() AS n FROM system.mutations
        WHERE database = currentDatabase() AND table = 'events' AND is_done = 0`);
      if (Number(pending[0]?.n ?? 0) === 0) break;
      if (attempt === 59) throw new Error("synthetic auction bid repair did not finish before reseed");
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  let inserted = 0;
  for (const chunk of chunks) {
    const fixture = chunk
      .filter((event) =>
        event.platform === "auction"
        && (mustRepairBids ? event.type === "bid_placed" : SEEDED_TYPES.has(event.type)))
      .map((event) => mustRepairBids
        ? { ...event, meta: { ...event.meta, fixtureRevision: "auction-close-2000-v2" } }
        : event);
    await insertEvents(client, fixture, { deduplicate: false });
    inserted += fixture.length;
  }
  return inserted;
}
