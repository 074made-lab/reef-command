/**
 * Synthetic event generator v2 — the weekly auction cycle. Pure logic, no I/O.
 *
 *   generateBackfill(fromIso, toIso)  — 8–12 weeks of history for seeding
 *   generateTick(nowIso)              — one minute of live events (Trigger.dev
 *                                       scheduled task calls this)
 *
 * The week (store-local ≈ UTC for simplicity; anchor = Thursday):
 *   THU 18:00        auction opens (12 lots)
 *   THU–SAT eve      bids, ramping hard Saturday night
 *   SAT ~22:45       close → winners → discount codes → winner campaign
 *   SUN–MON          add-on wave: winners order on web/marketplace with codes
 *                    (cross-platform orders = merge fodder for Task 3.1)
 *   MON 09–15        pre-ship requests (cancel / hold / address change / late add-on)
 *   MON 18:00        weather checks + label purchases (occasionally a void)
 *   TUE/WED 14:00    combined shipments go out; delivered next day
 *   THU–FRI          post-delivery messages (thanks / condition concern / DOA)
 *   TUE–SAT          campaign cadence (announce → preview → reminder → live → winners)
 *
 * Background all week: pageviews (weekend + auction-window surges), organic
 * web/marketplace orders, inbound messages, rare inventory drift.
 *
 * Deterministic: same seed ⇒ same history, so demo rehearsals reproduce.
 */

import { AUCTIONABLE, CATALOG, DESTINATIONS, type CatalogItem } from "./catalog";
import { CUSTOMERS, type SynthCustomer } from "./customers";
import { mulberry32, pick } from "./rand";
import type { ReefEvent } from "../datastore";

export { mulberry32 } from "./rand";

const MIN = 60_000;
const WEEK = 7 * 24 * 60 * MIN;
/** Thursday 2026-01-01 00:00 UTC — every weekIndex starts a THU. */
const ANCHOR = Date.UTC(2026, 0, 1);

const weekIndexOf = (ms: number) => Math.floor((ms - ANCHOR) / WEEK);
const destOf = (c: SynthCustomer) => DESTINATIONS[c.id % DESTINATIONS.length];

/** Customers who have joined by the given cycle week — the pool grows over
 *  time so the new-customer rate and both retention lenses stay realistic. */
type Pool = { all: SynthCustomer[]; auction: SynthCustomer[]; cumAll: number[]; cumAuction: number[] };
const activeCache = new Map<number, Pool>();

/** Cumulative spendFactor² weights — heavy-tail buying: whales order weekly,
 *  most customers order once or twice ever (keeps repeat-rate realistic). */
function cumWeights(cs: SynthCustomer[]): number[] {
  const cum: number[] = [];
  let acc = 0;
  for (const c of cs) { acc += c.spendFactor ** 2; cum.push(acc); }
  return cum;
}

function pickWeighted(rng: () => number, cs: SynthCustomer[], cum: number[]): SynthCustomer {
  const target = rng() * cum[cum.length - 1];
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < target) lo = mid + 1; else hi = mid; }
  return cs[lo];
}

function activePool(weekIndex: number): Pool {
  const hit = activeCache.get(weekIndex);
  if (hit) return hit;
  let all = CUSTOMERS.filter((c) => c.joinWeek <= weekIndex);
  if (!all.length) all = CUSTOMERS.slice(0, 40);
  let auction = all.filter((c) => c.auctionActive);
  if (!auction.length) auction = all;
  const pool: Pool = { all, auction, cumAll: cumWeights(all), cumAuction: cumWeights(auction) };
  activeCache.set(weekIndex, pool);
  return pool;
}

/** Shipment weight: unit weight × corals + box tare, floored (generic constants). */
export const weightLb = (items: number) => Math.max(4, items * 0.6 + 2);

// ---------------------------------------------------------------- week script

type Script = Map<number, ReefEvent[]>;          // minute-epoch → events

const scriptCache = new Map<string, Script>();

function at(script: Script, ms: number, ev: ReefEvent) {
  const key = Math.floor(ms / MIN);
  const arr = script.get(key) ?? [];
  arr.push(ev);
  script.set(key, arr);
}

function orderEvents(ms: number, orderId: string, platform: ReefEvent["platform"],
  cust: SynthCustomer, items: { item: CatalogItem; qty: number; priceCents: number }[],
  meta: Record<string, unknown> = {}): ReefEvent[] {
  const ts = new Date(ms).toISOString();
  const total = items.reduce((s, l) => s + l.priceCents * l.qty, 0);
  const dest = destOf(cust);
  const evs: ReefEvent[] = [{
    ts, type: "order_placed", platform, orderId, customerId: cust.id,
    amountCents: total,
    meta: {
      customer: cust.displayName, destination: dest.city,
      items: items.map((l) => ({ sku: l.item.sku, qty: l.qty, priceCents: l.priceCents })),
      ...meta,
    },
  }];
  for (const l of items) {
    evs.push({
      ts, type: "inventory_move", platform, sku: l.item.sku, category: l.item.category,
      customerId: cust.id, orderId, amountCents: l.priceCents * l.qty,
      meta: { delta: -l.qty, reason: "sale" },
    });
  }
  return evs;
}

function campaign(script: Script, ms: number, id: string, phase: string,
  recipients: SynthCustomer[], preview: string) {
  const ts = new Date(ms).toISOString();
  at(script, ms, {
    ts, type: "campaign_sent", platform: "system",
    meta: { campaignId: id, phase, recipients: recipients.length, preview },
  });
  recipients.forEach((c, i) => {
    const sendMs = ms + Math.floor(i / 40) * MIN;      // ~40 sends/minute
    at(script, sendMs, {
      ts: new Date(sendMs).toISOString(), type: "message_out", platform: "system",
      customerId: c.id,
      meta: { campaignId: id, channel: c.contact === "sms" ? "sms" : "email", simulated: true },
    });
  });
}

/** Everything scripted for one auction week (deterministic per weekIndex). */
function weekScript(weekIndex: number, seed: number): Script {
  const cacheKey = `${weekIndex}:${seed}`;
  const hit = scriptCache.get(cacheKey);
  if (hit) return hit;
  if (scriptCache.size > 64) scriptCache.clear();

  const rng = mulberry32((seed * 2654435761) ^ weekIndex);
  const script: Script = new Map();
  const pool = activePool(weekIndex);
  const w0 = ANCHOR + weekIndex * WEEK;              // THU 00:00
  const day = (d: number, h: number, m = 0) => w0 + ((d * 24 + h) * 60 + m) * MIN;
  // d: 0=THU 1=FRI 2=SAT 3=SUN 4=MON 5=TUE 6=WED

  // --- lots + auction open (THU 18:00)
  const lots = Array.from({ length: 12 }, (_, i) => {
    const item = pick(rng, AUCTIONABLE);
    return { lotId: `W${weekIndex}-L${i + 1}`, item };
  });
  at(script, day(0, 18), {
    ts: new Date(day(0, 18)).toISOString(), type: "auction_opened", platform: "auction",
    meta: { lots: lots.map((l) => ({ lotId: l.lotId, sku: l.item.sku })), closesAt: new Date(day(2, 22, 45)).toISOString() },
  });

  // --- bids over three evenings; last bidder wins
  const winners: { lot: typeof lots[number]; cust: SynthCustomer; hammerCents: number }[] = [];
  for (const lot of lots) {
    const nBids = 8 + Math.floor(rng() * 18);
    let price = Math.round(lot.item.basePriceCents * 0.35);
    let bidder: SynthCustomer = pickWeighted(rng, pool.auction, pool.cumAuction);
    for (let b = 0; b < nBids; b++) {
      const r = rng();
      const [d, h0, h1] = r < 0.2 ? [0, 19, 23] : r < 0.45 ? [1, 19, 23] : [2, 17, 22];
      const ms = day(d, h0) + Math.floor(rng() * (h1 - h0) * 60) * MIN;
      price += Math.round(lot.item.basePriceCents * (0.06 + rng() * 0.09));
      bidder = pickWeighted(rng, pool.auction, pool.cumAuction);
      at(script, ms, {
        ts: new Date(ms).toISOString(), type: "bid_placed", platform: "auction",
        sku: lot.item.sku, category: lot.item.category, customerId: bidder.id,
        amountCents: price, meta: { lotId: lot.lotId, bidder: bidder.displayName },
      });
    }
    winners.push({ lot, cust: bidder, hammerCents: price });
  }

  // --- close (SAT 22:45): won + auction orders + discount codes
  const closeMs = day(2, 22, 45);
  at(script, closeMs, {
    ts: new Date(closeMs).toISOString(), type: "auction_closed", platform: "auction",
    meta: { lots: lots.length, grossCents: winners.reduce((s, w) => s + w.hammerCents, 0) },
  });
  for (const w of winners) {
    at(script, closeMs, {
      ts: new Date(closeMs).toISOString(), type: "auction_won", platform: "auction",
      sku: w.lot.item.sku, category: w.lot.item.category, customerId: w.cust.id,
      amountCents: w.hammerCents, meta: { lotId: w.lot.lotId, winner: w.cust.displayName },
    });
  }
  // one auction order per distinct winner (a winner may take several lots)
  const byWinner = new Map<number, typeof winners>();
  winners.forEach((w) => byWinner.set(w.cust.id, [...(byWinner.get(w.cust.id) ?? []), w]));
  let seq = 0;
  const winnerCustomers: SynthCustomer[] = [];
  for (const [, ws] of byWinner) {
    const cust = ws[0].cust;
    winnerCustomers.push(cust);
    const orderId = `AUC-${weekIndex}-${++seq}`;
    orderEvents(closeMs + MIN, orderId, "auction", cust,
      ws.map((w) => ({ item: w.lot.item, qty: 1, priceCents: w.hammerCents })),
      { auctionWeek: weekIndex }).forEach((e) => at(script, closeMs + MIN, e));
    const code = `RC${weekIndex}-${cust.id}`;
    at(script, closeMs + 2 * MIN, {
      ts: new Date(closeMs + 2 * MIN).toISOString(), type: "discount_code_issued",
      platform: "system", customerId: cust.id, meta: { code, addonWindowEnds: new Date(day(4, 22)).toISOString() },
    });
  }

  // --- add-on wave (SUN 10:00 – MON 20:00): cross-platform orders with codes
  const addonCustomers: SynthCustomer[] = [];
  for (const cust of winnerCustomers) {
    if (rng() >= 0.55) continue;
    addonCustomers.push(cust);
    const ms = day(3, 10) + Math.floor(rng() * 34 * 60) * MIN;
    const platform = rng() < 0.7 ? "web" : "marketplace";
    const n = 1 + Math.floor(rng() * 3);
    const items = Array.from({ length: n }, () => {
      const prefer = CATALOG.filter((c) => cust.prefCategories.includes(c.category));
      const item = prefer.length && rng() < 0.7 ? pick(rng, prefer) : pick(rng, CATALOG);
      return { item, qty: 1, priceCents: item.basePriceCents };
    });
    const code = `RC${weekIndex}-${cust.id}`;
    const orderId = `${platform === "web" ? "WEB" : "MKT"}-${weekIndex}-${++seq}`;
    orderEvents(ms, orderId, platform, cust, items, { discountCode: code, addon: true })
      .forEach((e) => at(script, ms, e));
    at(script, ms, {
      ts: new Date(ms).toISOString(), type: "discount_code_redeemed", platform,
      customerId: cust.id, orderId, meta: { code },
    });
  }

  // --- pre-ship requests (MON 09:00–15:00)
  const requestKinds = ["cancel_ship", "hold_next_week", "address_change", "late_addon"] as const;
  const nReq = 1 + Math.floor(rng() * 2);
  const requested: { kind: typeof requestKinds[number]; cust: SynthCustomer }[] = [];
  for (let i = 0; i < nReq && winnerCustomers.length; i++) {
    const cust = pick(rng, winnerCustomers);
    const kind = pick(rng, requestKinds);
    requested.push({ kind, cust });
    const ms = day(4, 9) + Math.floor(rng() * 6 * 60) * MIN;
    at(script, ms, {
      ts: new Date(ms).toISOString(), type: "request_received", platform: pick(rng, ["web", "auction", "marketplace"] as const),
      customerId: cust.id, meta: { kind, requestId: `REQ-${weekIndex}-${i + 1}` },
    });
  }

  // --- label day (MON 18:00): weather per destination, then purchases
  const shippers = [...byWinner.entries()];
  const destinations = new Set(shippers.map(([id]) => destOf(CUSTOMERS[id - 1]).city));
  let flagged = 0;
  for (const city of destinations) {
    const d = DESTINATIONS.find((x) => x.city === city)!;
    const cold = d.coldProne && rng() < 0.3;
    const hot = !cold && d.hotProne && rng() < 0.3;
    if (cold || hot) flagged++;
    at(script, day(4, 18), {
      ts: new Date(day(4, 18)).toISOString(), type: "weather_checked", platform: "system",
      meta: { destination: city, lowF: cold ? 32 + Math.floor(rng() * 12) : 55 + Math.floor(rng() * 15),
        highF: hot ? 86 + Math.floor(rng() * 18) : 70 + Math.floor(rng() * 12),
        pack: cold ? "heat" : hot ? "cold" : "none" },
    });
  }
  let ship = 0;
  for (const [custId, ws] of shippers) {
    const cust = CUSTOMERS[custId - 1];
    const addon = addonCustomers.find((c) => c.id === custId);
    const items = ws.length + (addon ? 2 : 0);
    const wLb = weightLb(items);
    const ms = day(4, 18, 10) + ship * MIN;
    const shipmentId = `SHP-${weekIndex}-${++ship}`;
    at(script, ms, {
      ts: new Date(ms).toISOString(), type: "label_purchased", platform: "system",
      customerId: custId, amountCents: 3900 + Math.round(wLb * 160),
      meta: { shipmentId, items, weightLb: wLb, destination: destOf(cust).city, combined: !!addon },
    });
  }
  // a cancel/address change after purchase sometimes voids a label
  const voider = requested.find((r) => r.kind === "cancel_ship" || r.kind === "address_change");
  if (voider && rng() < 0.6) {
    const ms = day(4, 19, 30);
    at(script, ms, {
      ts: new Date(ms).toISOString(), type: "label_voided", platform: "system",
      customerId: voider.cust.id, amountCents: -(3900 + Math.round(weightLb(2) * 160)),
      meta: { reason: voider.kind, auto: true },
    });
  }

  // --- ship TUE/WED 14:00, delivered next day 13:00, post-delivery messages
  let k = 0;
  for (const [custId] of shippers) {
    if (voider && custId === voider.cust.id && voider.kind === "cancel_ship") continue;
    const d = k++ % 2 === 0 ? 5 : 6;                 // TUE or WED
    const shipMs = day(d, 14);
    at(script, shipMs, {
      ts: new Date(shipMs).toISOString(), type: "order_shipped", platform: "system",
      customerId: custId, meta: { week: weekIndex },
    });
    const delMs = day(d + 1, 13);
    at(script, delMs, {
      ts: new Date(delMs).toISOString(), type: "order_delivered", platform: "system",
      customerId: custId, meta: { week: weekIndex },
    });
    const r = rng();
    if (r < 0.06) {                                  // DOA claim (~1 per 1–2 weeks)
      const ms = delMs + Math.floor((2 + rng() * 20) * 60) * MIN;
      at(script, ms, {
        ts: new Date(ms).toISOString(), type: "message_in", platform: "web", customerId: custId,
        meta: { intent: "doa_claim", preview: "One frag didn't make it — completely white this morning. What now?" },
      });
      at(script, ms + MIN, {
        ts: new Date(ms + MIN).toISOString(), type: "case_opened", platform: "system", customerId: custId,
        meta: { kind: "doa_claim", autoFirstResponse: "template:doa_ticket_link" },
      });
    } else if (r < 0.2) {                            // condition concern
      const ms = delMs + Math.floor((1 + rng() * 8) * 60) * MIN;
      at(script, ms, {
        ts: new Date(ms).toISOString(), type: "message_in", platform: pick(rng, ["web", "marketplace"] as const), customerId: custId,
        meta: { intent: "condition_concern", preview: "The torch looks really deflated after shipping — is it dying?" },
      });
      at(script, ms + MIN, {
        ts: new Date(ms + MIN).toISOString(), type: "message_answered", platform: "system", customerId: custId,
        meta: { autoFirstResponse: "template:shipping_stress_reassure" },
      });
    } else if (r < 0.4) {                            // thanks
      const ms = delMs + Math.floor((1 + rng() * 30) * 60) * MIN;
      at(script, ms, {
        ts: new Date(ms).toISOString(), type: "message_in", platform: pick(rng, ["web", "auction", "marketplace"] as const), customerId: custId,
        meta: { intent: "thanks", preview: "Everything arrived perfectly, colors are insane. Thank you!" },
      });
      at(script, ms + 2 * MIN, {
        ts: new Date(ms + 2 * MIN).toISOString(), type: "message_answered", platform: "system", customerId: custId,
        meta: { autoFirstResponse: "template:thanks_ack" },
      });
    }
  }

  // --- campaign cadence
  const marketable = pool.all.filter((c) => c.tier <= 3);
  campaign(script, day(5 - 7, 10), `CMP-${weekIndex}-announce`, "announce", marketable,
    "This week's auction: 12 lots go live Thursday 6pm — preview inside.");
  // NOTE: TUE of the SAME cycle week is day index -2 relative to the THU anchor;
  // we schedule announce/preview into the two days BEFORE the auction opens.
  campaign(script, day(6 - 7, 10), `CMP-${weekIndex}-preview`, "preview", marketable,
    "Lot preview: torches, bounce shrooms, and a rainbow goni. Doors open tomorrow.");
  campaign(script, day(0, 9), `CMP-${weekIndex}-reminder`, "reminder", marketable,
    "Auction opens tonight 6pm. Set your alarms.");
  campaign(script, day(2, 20, 30), `CMP-${weekIndex}-live`, "live",
    pool.auction.filter((c) => c.tier <= 3),
    "90 minutes left — current leaders inside, don't lose your torch.");
  campaign(script, closeMs + 30 * MIN, `CMP-${weekIndex}-winners`, "winners", winnerCustomers,
    "You won! Payment link inside + a code for add-ons — ship together Tue/Wed, one shipping fee.");

  scriptCache.set(cacheKey, script);
  return script;
}

// ------------------------------------------------------------- background

const MESSAGE_PREVIEWS = [
  "Hey, is the torch still available?",
  "Can you combine shipping with my auction win?",
  "Do you ship to Canada?",
  "What lighting do you keep the zoas under?",
  "I put the wrong apartment number on my order!!",
  "Any chance of a discount if I buy 5 frags?",
  "When does this week's auction start?",
  "How do I use the winner code from Saturday?",
];

/** Hourly intensity by cycle position (0=THU … 6=WED). */
function intensity(d: Date) {
  const h = d.getUTCHours();
  const cycleDay = ((weekIndexOf(d.getTime()) >= 0 ? d.getTime() - ANCHOR : 0) % WEEK) / (24 * 60 * MIN) | 0;
  const dow = d.getUTCDay();
  const weekend = dow === 0 || dow === 6 ? 1.5 : 1.0;
  const daytime = h >= 9 && h <= 23 ? 1 : 0.15;
  const auctionSurge = (cycleDay <= 2 && h >= 18 && h <= 23) ? 1.8 : 1;
  const addonSurge = (cycleDay === 3 || cycleDay === 4) ? 1.4 : 1;
  return {
    pageviews: 22 * weekend * daytime * auctionSurge,
    orders: 0.055 * weekend * daytime * addonSurge,          // organic web/marketplace
    messages: 0.10 * daytime * (cycleDay === 3 || cycleDay === 4 ? 1.6 : 1),
  };
}

function backgroundEvents(rng: () => number, minuteStart: Date): ReefEvent[] {
  const ts = minuteStart.toISOString();
  const events: ReefEvent[] = [];
  const lvl = intensity(minuteStart);
  const pool = activePool(weekIndexOf(minuteStart.getTime()));

  const pv = Math.floor(lvl.pageviews * (0.5 + rng()));
  for (let i = 0; i < pv; i++) {
    const item = pick(rng, CATALOG);
    events.push({ ts, type: "pageview", platform: rng() < 0.8 ? "web" : "marketplace", sku: item.sku, category: item.category });
  }

  if (rng() < lvl.orders) {
    const cust = pickWeighted(rng, pool.all, pool.cumAll);
    const platform = rng() < 0.65 ? "web" : "marketplace";
    const item = pick(rng, CATALOG);
    const qty = rng() < 0.8 ? 1 : 2;
    const ms = minuteStart.getTime();
    const orderId = `${platform === "web" ? "WEB" : "MKT"}-BG-${Math.floor(ms / MIN) % 1000000}`;
    events.push(...orderEvents(ms, orderId, platform, cust,
      [{ item, qty, priceCents: item.basePriceCents }],
      rng() < 0.03 ? { addressSuspect: true } : {}));
  }

  if (rng() < lvl.messages) {
    const cust = pick(rng, pool.all);
    const id = `MSG-${Math.floor(rng() * 1e6)}`;
    events.push({
      ts, type: "message_in", platform: pick(rng, ["web", "auction", "marketplace"] as const),
      customerId: cust.id, meta: { id, preview: pick(rng, MESSAGE_PREVIEWS) },
    });
    if (rng() < 0.85) {
      // answered at the same emission instant — the stream must never contain
      // a timestamp later than the minute being generated (Codex M3)
      events.push({ ts, type: "message_answered", platform: "system", meta: { id } });
    }
  }

  if (rng() < 0.003) {                               // rare cross-platform drift
    const item = pick(rng, CATALOG);
    events.push({
      ts, type: "inventory_move", platform: pick(rng, ["auction", "marketplace"] as const),
      sku: item.sku, category: item.category, meta: { delta: pick(rng, [-1, 1, 2]), reason: "drift" },
    });
  }

  return events;
}

// ------------------------------------------------------------- entry points

function minuteEvents(seed: number, minuteStart: Date): ReefEvent[] {
  const ms = minuteStart.getTime();
  const key = Math.floor(ms / MIN);
  const rng = mulberry32(seed ^ key);
  const wi = weekIndexOf(ms);
  const scripted = [
    ...(weekScript(wi - 1, seed).get(key) ?? []),    // last week's post-delivery messages spill into THU/FRI
    ...(weekScript(wi, seed).get(key) ?? []),
    ...(weekScript(wi + 1, seed).get(key) ?? []),    // next week's TUE/WED announce runs in this week's tail
  ];
  return [...scripted, ...backgroundEvents(rng, minuteStart)];
}

/** One minute of live events. */
export function generateTick(nowIso: string, seed = 1): ReefEvent[] {
  const minute = new Date(nowIso);
  minute.setUTCSeconds(0, 0);
  return minuteEvents(seed, minute);
}

/** History between two instants, yielded in day-sized chunks for bulk insert. */
export function* generateBackfill(fromIso: string, toIso: string, seed = 1): Generator<ReefEvent[]> {
  const from = new Date(fromIso); from.setUTCSeconds(0, 0);
  const to = new Date(toIso);
  let chunk: ReefEvent[] = [];
  let day = from.getUTCDate();
  for (let t = from.getTime(); t < to.getTime(); t += MIN) {
    const minute = new Date(t);
    chunk.push(...minuteEvents(seed, minute).filter(
      (e) => { const ms = Date.parse(e.ts); return ms >= from.getTime() && ms < to.getTime(); }));
    if (minute.getUTCDate() !== day) {
      yield chunk; chunk = []; day = minute.getUTCDate();
    }
  }
  if (chunk.length) yield chunk;
}
