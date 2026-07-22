/**
 * Live tick — one minute of synthetic reality, written to BOTH stores:
 * events → ClickHouse (charts tick), orders/messages → Postgres (truth
 * advances, merge candidates appear). Shared by the Trigger.dev scheduled
 * task and the local one-shot script.
 */

import type { ClickHouseClient } from "@clickhouse/client";
import type { Pool } from "pg";
import { insertEvents } from "./store/clickhouse";
import { generateTick } from "./synth/generator";
import { CATALOG } from "./synth/catalog";
import { SEEDED_AUCTION_TYPES } from "./synth/ensure-auction-week";
import { DEMO_AUCTION_WEEK_INDEX } from "./demo-clock";
import type { ReefEvent } from "./datastore";

const bySku = new Map(CATALOG.map((c) => [c.sku, c]));

const ANCHOR = Date.UTC(2026, 0, 1);
const WEEK_MS = 7 * 24 * 60 * 60_000;
const FIXTURE_WEEK = DEMO_AUCTION_WEEK_INDEX + 1;

/** The W29 Thursday–Saturday auction events are pre-materialized as a canonical
 * ClickHouse fixture (ensure-auction-week) so every selectable demo day works
 * before those instants pass in reality. When the wall clock catches up, the
 * tick's deterministic script would emit the SAME events again — skip them, or
 * the demo auction double-counts live during evaluation. */
const isPrematerializedAuctionEvent = (e: ReefEvent) =>
  e.platform === "auction"
  && SEEDED_AUCTION_TYPES.has(e.type)
  && Math.floor((Date.parse(e.ts) - ANCHOR) / WEEK_MS) === FIXTURE_WEEK;

export async function runTick(ch: ClickHouseClient, pg: Pool, nowIso: string, seed = 1): Promise<{
  events: number; orders: number; messages: number; chOk: boolean;
}> {
  const events = generateTick(nowIso, seed).filter((e) => !isPrematerializedAuctionEvent(e));

  let orders = 0, messages = 0;
  for (const e of events as ReefEvent[]) {
    const m = (e.meta ?? {}) as Record<string, any>;
    if (e.type === "order_placed") {
      orders++;
      const r = await pg.query(
        `INSERT INTO orders (platform, external_id, customer_id, status, total_cents,
           discount_code, destination_city, address_suspect, ordered_at)
         VALUES ($1,$2,$3,'paid',$4,$5,$6,$7,$8)
         ON CONFLICT (platform, external_id) DO NOTHING RETURNING id`,
        [e.platform, e.orderId, e.customerId, e.amountCents,
          m.discountCode ?? null, m.destination ?? null, !!m.addressSuspect, e.ts]);
      const orderId = r.rows[0]?.id;
      if (orderId) {
        for (const it of (m.items ?? []) as { sku: string; qty: number; priceCents: number }[]) {
          const cat = bySku.get(it.sku);
          await pg.query(
            `INSERT INTO order_items (order_id, sku, name, category, qty, price_cents)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [orderId, it.sku, cat?.name ?? it.sku, cat?.category ?? "other", it.qty, it.priceCents]);
        }
        await pg.query(
          `UPDATE customers SET total_orders = total_orders + 1,
             total_spent_cents = total_spent_cents + $2,
             first_order_at = coalesce(first_order_at, $3), last_order_at = $3
           WHERE id = $1`, [e.customerId, e.amountCents, e.ts]);
      }
    } else if (e.type === "message_in") {
      messages++;
      await pg.query(
        `INSERT INTO messages (customer_id, direction, platform, intent, preview, at)
         VALUES ($1,'in',$2,$3,$4,$5)`,
        [e.customerId ?? null, e.platform, m.intent ?? null, m.preview ?? "", e.ts]);
    } else if (e.type === "request_received") {
      await pg.query(
        `INSERT INTO requests (request_code, customer_id, kind, detail, status, received_at)
         VALUES ($1,$2,$3,$4,'open',$5) ON CONFLICT (request_code) DO NOTHING`,
        [m.requestId, e.customerId, m.kind, `customer asked: ${m.kind}`, e.ts]);
    }
  }
  // narrative last: Postgres truth is committed before ClickHouse hears about it.
  // Retry only the CH insert in-run (cannot double PG). If it still fails, the
  // minute is deterministic — generateTick(nowIso, seed) regenerates the exact
  // same events for reconciliation.
  let chOk = false;
  for (let attempt = 1; attempt <= 3 && !chOk; attempt++) {
    try { await insertEvents(ch, events); chOk = true; }
    catch (e) {
      if (attempt === 3) console.error(`CH narrative failed for ${nowIso}; reconcile by regenerating this minute`, e);
      else await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  return { events: events.length, orders, messages, chOk };
}
