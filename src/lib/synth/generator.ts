/**
 * Synthetic event generator — pure logic, no I/O. Two entry points:
 *
 *   generateBackfill(fromIso, toIso)  — history for ClickHouse seeding
 *   generateTick(nowIso)              — one minute of live events, called by a
 *                                       Trigger.dev scheduled task
 *
 * Personality (so every demo question has something real to find):
 *  - pageviews dominate volume; weekend browse surges
 *  - web orders through the day; auction spikes 20:00–23:00 local
 *  - inbound messages, some left unanswered (feeds the aging queue)
 *  - occasional address typos, inventory drift injections, draft edits
 *
 * Seeded RNG keeps runs reproducible.
 */

import { CATALOG, CUSTOMER_NAMES, DESTINATIONS } from "./catalog";
import type { ReefEvent } from "../datastore";

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length)];

type Channel = ReefEvent["channel"];

/** Hourly intensity multipliers. */
function intensity(d: Date): { pageviews: number; orders: number; auction: number } {
  const h = d.getUTCHours();          // treat as store-local for simplicity
  const dow = d.getUTCDay();
  const weekend = dow === 0 || dow === 6 ? 1.6 : 1.0;
  const daytime = h >= 9 && h <= 23 ? 1 : 0.2;
  const auctionWindow = h >= 20 && h <= 23 ? 1 : h === 0 ? 0.4 : 0.05;
  return {
    pageviews: 22 * weekend * daytime,          // per minute
    orders: 0.15 * weekend * daytime,           // per minute
    auction: 2.2 * auctionWindow,               // bids per minute in window
  };
}

let orderSeq = 1000;

function makeOrder(rng: () => number, ts: string, channel: Channel): ReefEvent[] {
  const item = pick(rng, CATALOG);
  const qty = rng() < 0.8 ? 1 : 2;
  const price = item.basePriceUsd * (channel === "auction" ? 0.7 + rng() * 0.9 : 1);
  const orderId = `ORD-${orderSeq++}`;
  const destination = pick(rng, DESTINATIONS);
  const typo = rng() < 0.03;                    // feeds the address-fix action
  const events: ReefEvent[] = [
    {
      ts, type: "order_placed", channel, sku: item.sku, orderId,
      amountUsd: Math.round(price * qty * 100) / 100,
      meta: {
        customer: pick(rng, CUSTOMER_NAMES), qty, destination,
        addressSuspect: typo,
      },
    },
    { ts, type: "inventory_move", channel, sku: item.sku, meta: { delta: -qty, reason: "sale" } },
  ];
  return events;
}

function minuteEvents(rng: () => number, minuteStart: Date): ReefEvent[] {
  const ts = minuteStart.toISOString();
  const events: ReefEvent[] = [];
  const lvl = intensity(minuteStart);

  // pageviews (volume driver)
  const pv = Math.floor(lvl.pageviews * (0.5 + rng()));
  for (let i = 0; i < pv; i++) {
    events.push({ ts, type: "pageview", channel: rng() < 0.85 ? "web" : "marketplace", sku: pick(rng, CATALOG).sku });
  }

  // web / marketplace orders
  if (rng() < lvl.orders) events.push(...makeOrder(rng, ts, rng() < 0.7 ? "web" : "marketplace"));

  // auction bids + occasional auction end (the demo's anomaly source)
  const bids = Math.floor(lvl.auction * rng() * 3);
  for (let i = 0; i < bids; i++) {
    const item = pick(rng, CATALOG.filter((c) => c.auctionable));
    events.push({
      ts, type: "bid_placed", channel: "auction", sku: item.sku,
      amountUsd: Math.round(item.basePriceUsd * (0.4 + rng() * 1.4)),
      meta: { bidder: pick(rng, CUSTOMER_NAMES) },
    });
    if (rng() < 0.06) events.push(...makeOrder(rng, ts, "auction"));
  }

  // inbound customer messages; ~15% stay unanswered (aging queue fodder)
  if (rng() < 0.12) {
    const id = `MSG-${Math.floor(rng() * 1e6)}`;
    events.push({
      ts, type: "message_in", channel: pick(rng, ["web", "auction", "marketplace"] as Channel[]),
      meta: { id, preview: pick(rng, MESSAGE_PREVIEWS) },
    });
    if (rng() < 0.85) {
      const answeredAt = new Date(minuteStart.getTime() + (5 + rng() * 240) * 60_000).toISOString();
      events.push({ ts: answeredAt, type: "message_answered", channel: "web", meta: { id, editedDraft: rng() < 0.3 } });
    }
  }

  // rare inventory drift injection (feeds the drift heatmap)
  if (rng() < 0.004) {
    const item = pick(rng, CATALOG);
    events.push({ ts, type: "inventory_move", channel: pick(rng, ["auction", "marketplace"] as Channel[]), sku: item.sku, meta: { delta: pick(rng, [-1, 1, 2]), reason: "drift" } });
  }

  return events;
}

const MESSAGE_PREVIEWS = [
  "Hey, is the torch still available?",
  "My order arrived but one frag looks pale — what do I do?",
  "Can you combine shipping with my auction win?",
  "Do you ship to Canada?",
  "What lighting do you keep the zoas under?",
  "I put the wrong apartment number on my order!!",
  "Any chance of a discount if I buy 5 frags?",
  "When does this week's auction start?",
];

/** One minute of live events. */
export function generateTick(nowIso: string, seed = 1): ReefEvent[] {
  const minute = new Date(nowIso);
  minute.setUTCSeconds(0, 0);
  const rng = mulberry32(seed ^ Math.floor(minute.getTime() / 60_000));
  return minuteEvents(rng, minute);
}

/** History between two instants, yielded in day-sized chunks for bulk insert. */
export function* generateBackfill(fromIso: string, toIso: string, seed = 1): Generator<ReefEvent[]> {
  const from = new Date(fromIso); from.setUTCSeconds(0, 0);
  const to = new Date(toIso);
  let chunk: ReefEvent[] = [];
  let day = from.getUTCDate();
  for (let t = from.getTime(); t < to.getTime(); t += 60_000) {
    const minute = new Date(t);
    const rng = mulberry32(seed ^ Math.floor(t / 60_000));
    chunk.push(...minuteEvents(rng, minute));
    if (minute.getUTCDate() !== day) {
      yield chunk; chunk = []; day = minute.getUTCDate();
    }
  }
  if (chunk.length) yield chunk;
}
