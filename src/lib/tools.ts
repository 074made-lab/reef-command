/**
 * Tool layer — the agent's hands. Every chat answer is one or more of these
 * functions: typed reads over the live stores (ClickHouse OLAP + Postgres
 * OLTP) returning ready-to-render ComponentSpecs. The chat.agent() runtime
 * exposes these as tools; the same functions also serve the deterministic
 * router used before the LLM wiring lands.
 */

import type { ClickHouseClient } from "@clickhouse/client";
import type { Pool } from "pg";
import { queryRows } from "./store/clickhouse";
import type {
  AttentionItem, ComponentSpec, DemoDayId, FunnelStep, LotPrice, Metric, ReportSection,
} from "./protocol";
import { CATALOG } from "./synth/catalog";
import { AUCTION_OPEN_OFFSET_MS, AUCTION_CLOSE_OFFSET_MS } from "./synth/schedule";
import { DEMO_AUCTION_WEEK_INDEX, demoAuctionMoment } from "./demo-clock";

const WEEK_MS = 7 * 24 * 3600_000;
const ANCHOR = Date.UTC(2026, 0, 1);                 // a Thursday — cycle anchor
const bySku = new Map(CATALOG.map((c) => [c.sku, c]));

export const currentWeekIndex = (now = Date.now()) => Math.floor((now - ANCHOR) / WEEK_MS);
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
/** [start, end) of a cycle week in CH DateTime format. */
export function weekWindow(weekIndex: number): { start: string; end: string } {
  return { start: fmt(ANCHOR + weekIndex * WEEK_MS), end: fmt(ANCHOR + (weekIndex + 1) * WEEK_MS) };
}

const usd = (cents: number) => Math.round(cents / 100);
const pctDelta = (cur: number, prev: number) =>
  prev > 0 ? Math.round(((cur - prev) / prev) * 100) : undefined;

// ---------------------------------------------------------------- revenue

export async function revenuePulse(ch: ClickHouseClient): Promise<ComponentSpec[]> {
  const wi = currentWeekIndex();
  const cur = weekWindow(wi);
  // compare against the SAME elapsed portion of the prior cycle, not its full week
  const elapsed = Date.now() - (ANCHOR + wi * WEEK_MS);
  const prev = { start: weekWindow(wi - 1).start, end: fmt(ANCHOR + (wi - 1) * WEEK_MS + elapsed) };
  const [now, before] = await Promise.all([
    queryRows<{ rev: string; orders: string }>(ch, `
      SELECT sum(revenue_cents) AS rev, sum(orders) AS orders FROM mv_revenue_hourly
      WHERE hour >= {start:DateTime} AND hour < {end:DateTime}`, cur),
    queryRows<{ rev: string; orders: string }>(ch, `
      SELECT sum(revenue_cents) AS rev, sum(orders) AS orders FROM mv_revenue_hourly
      WHERE hour >= {start:DateTime} AND hour < {end:DateTime}`, prev),
  ]);
  const hourly = await queryRows<{ t: string; v: string }>(ch, `
    SELECT toString(hour) AS t, toUInt64(sum(revenue_cents)/100) AS v FROM mv_revenue_hourly
    WHERE hour >= {start:DateTime} AND hour < {end:DateTime} GROUP BY hour ORDER BY hour`, cur);
  const rev = Number(now[0]?.rev ?? 0), orders = Number(now[0]?.orders ?? 0);
  const prevRev = Number(before[0]?.rev ?? 0);
  const metrics: Metric[] = [
    { label: "Week to date (vs same point last cycle)", value: usd(rev), unit: "$", deltaWoW: pctDelta(rev, prevRev) },
    { label: "Orders", value: orders, unit: "orders", deltaWoW: pctDelta(orders, Number(before[0]?.orders ?? 0)) },
    { label: "Avg order", value: orders ? usd(rev / orders) : 0, unit: "$" },
  ];
  return [
    { kind: "metric_row", metrics },
    { kind: "timeseries", title: "Revenue this cycle (hourly)",
      series: [{ name: "revenue $", points: hourly.map((h) => ({ t: h.t, v: Number(h.v) })) }] },
  ];
}

// ---------------------------------------------------------------- attention

export async function attentionFeed(ch: ClickHouseClient, pg: Pool): Promise<ComponentSpec[]> {
  const items: AttentionItem[] = [];
  const now = Date.now();

  const cases = await pg.query(`SELECT case_code, kind, cases.created_at, cases.summary,
      c.primary_name, c.primary_email,
      coalesce((SELECT m.preview FROM messages m
        WHERE m.customer_id = cases.customer_id AND m.direction = 'in'
          AND (m.intent = cases.kind OR cases.kind = 'other') AND m.at <= cases.created_at
        ORDER BY m.at DESC LIMIT 1), cases.summary) AS customer_text
    FROM cases JOIN customers c ON c.id = cases.customer_id
    WHERE cases.status = 'open' ORDER BY cases.created_at DESC LIMIT 5`);
  for (const r of cases.rows) items.push({
    id: r.case_code, kind: "case",
    headline: `${r.kind === "doa_claim" ? "DOA claim" : r.kind} from ${r.primary_name} — evidence ready, needs your decision`,
    ageMinutes: Math.round((now - r.created_at.getTime()) / 60_000),
    customerName: r.primary_name,
    customerEmail: r.primary_email,
    detail: r.customer_text,
    photoHref: r.kind === "doa_claim" ? "/mock-doa-coral.svg" : undefined,
  });

  const reqs = await pg.query(`SELECT request_code, kind, received_at, c.primary_name
    FROM requests JOIN customers c ON c.id = requests.customer_id
    WHERE requests.status = 'open' AND received_at > now() - interval '7 days'
    ORDER BY received_at DESC LIMIT 5`);
  for (const r of reqs.rows) items.push({
    id: r.request_code, kind: "request",
    headline: `${r.primary_name} asks: ${String(r.kind).replace(/_/g, " ")}`,
    ageMinutes: Math.round((now - r.received_at.getTime()) / 60_000),
  });

  const unanswered = await queryRows<{ id: string; preview: string; platform: string; age_min: string; customer_id: string }>(ch, `
    SELECT JSONExtractString(meta,'id') AS id, JSONExtractString(meta,'preview') AS preview,
           platform, toString(round((now() - ts)/60)) AS age_min, toString(customer_id) AS customer_id
    FROM events WHERE type = 'message_in' AND ts > now() - INTERVAL 2 DAY
      AND JSONExtractString(meta,'id') != ''
      AND JSONExtractString(meta,'id') NOT IN (
        SELECT JSONExtractString(meta,'id') FROM events
        WHERE type = 'message_answered' AND ts > now() - INTERVAL 3 DAY)
    ORDER BY ts ASC LIMIT 6`);
  const messageCustomerIds = [...new Set(unanswered.map((m) => Number(m.customer_id)).filter(Boolean))];
  const messageCustomers = messageCustomerIds.length
    ? await pg.query<{ id: string; primary_name: string; primary_email: string }>(
      `SELECT id, primary_name, primary_email FROM customers WHERE id = ANY($1::bigint[])`,
      [messageCustomerIds],
    )
    : { rows: [] as { id: string; primary_name: string; primary_email: string }[] };
  const customerById = new Map(messageCustomers.rows.map((c) => [Number(c.id), c]));
  const replyDraft = (preview: string) => {
    const p = preview.toLowerCase();
    if (p.includes("apartment") || p.includes("address"))
      return "Thanks for the heads-up — I’ve paused the shipping workflow while we verify the corrected address. Please reply with the full address, including apartment number.";
    if (p.includes("canada"))
      return "Thanks for asking. This demo store currently ships live coral within the continental United States only, so we can’t offer Canadian delivery.";
    if (p.includes("combine") || p.includes("auction win"))
      return "Yes — we can combine eligible add-on orders with your ReefnBid win so the corals travel in one box with one shipping fee. I’m checking the order match now.";
    return "Thanks for reaching out. I’ve reviewed your message and will confirm the next step shortly.";
  };
  for (const m of unanswered) items.push({
    id: m.id, kind: "message", platform: m.platform as AttentionItem["platform"],
    headline: `unanswered: “${m.preview}”`, ageMinutes: Number(m.age_min),
    customerName: customerById.get(Number(m.customer_id))?.primary_name,
    customerEmail: customerById.get(Number(m.customer_id))?.primary_email,
    detail: m.preview,
    draft: replyDraft(m.preview),
  });

  items.sort((a, b) => b.ageMinutes - a.ageMinutes);
  return [{ kind: "attention_feed", items: items.slice(0, 10) }];
}

// ---------------------------------------------------------------- auction

export async function auctionBoard(ch: ClickHouseClient, dayId?: DemoDayId): Promise<ComponentSpec[]> {
  const now = dayId ? demoAuctionMoment(dayId) : Date.now();
  const wi = dayId ? DEMO_AUCTION_WEEK_INDEX : currentWeekIndex(now);
  const w = weekWindow(wi);
  const weekStart = ANCHOR + wi * WEEK_MS;
  const opensAt = weekStart + AUCTION_OPEN_OFFSET_MS;   // THU 18:00 (shared with the generator)
  const closesMs = weekStart + AUCTION_CLOSE_OFFSET_MS; // SAT 22:45 (shared with the generator)
  const queryEnd = fmt(Math.min(now, closesMs, ANCHOR + (wi + 1) * WEEK_MS));
  const lots = await queryRows<{ lot: string; sku: string; bid: string; n: string; leader: string }>(ch, `
    SELECT JSONExtractString(meta,'lotId') AS lot, sku,
           max(amount_cents) AS bid, count() AS n,
           argMax(JSONExtractString(meta,'bidder'), ts) AS leader
    FROM events WHERE type = 'bid_placed' AND ts >= {start:DateTime} AND ts < {end:DateTime}
    GROUP BY lot, sku ORDER BY bid DESC`, { start: w.start, end: queryEnd });
  const closesAt = new Date(closesMs).toISOString();
  const state: "upcoming" | "live" | "closed" =
    now < opensAt ? "upcoming" : now >= closesMs ? "closed" : "live";
  const board: LotPrice[] = lots.map((l) => {
    const item = bySku.get(l.sku);
    return {
      lotId: l.lot, sku: l.sku, name: item?.name ?? l.sku, category: item?.category ?? "other",
      currentBidCents: Number(l.bid), bidCount: Number(l.n), leader: l.leader, closesAt,
    };
  });
  return [{ kind: "auction_board", lots: board, closesAt, state }];
}

// ---------------------------------------------------------------- merge scan

/** Customers with unshipped orders on ≥2 platforms this cycle — combine them. */
export async function mergeScan(pg: Pool): Promise<ComponentSpec[]> {
  const rows = await pg.query(`
    SELECT c.id, c.primary_name, c.tier,
           json_agg(json_build_object('orderId', o.external_id, 'platform', o.platform,
             'totalCents', o.total_cents, 'destination', o.destination_city,
             'orderedAt', o.ordered_at) ORDER BY o.ordered_at) AS orders
    FROM orders o JOIN customers c ON c.id = o.customer_id
    WHERE o.status IN ('pending','paid') AND o.shipment_id IS NULL
    GROUP BY c.id HAVING count(DISTINCT o.platform) >= 2
    ORDER BY max(o.ordered_at) DESC LIMIT 5`);
  return rows.rows.map((r): ComponentSpec => {
    const orders = (r.orders as { orderId: string; platform: string; totalCents: number; destination: string }[])
      .map((o) => ({
        orderId: o.orderId, platform: o.platform as "auction" | "web" | "marketplace",
        customer: { customerId: Number(r.id), displayName: r.primary_name, tier: r.tier, platforms: [] },
        items: [], totalCents: Number(o.totalCents), destination: o.destination ?? "",
        status: "paid" as const, shipWeek: `W${currentWeekIndex()}`,
      }));
    return {
      kind: "merge_card",
      customer: { customerId: Number(r.id), displayName: r.primary_name, tier: r.tier, platforms: orders.map((o) => o.platform as never) },
      orders,
      combined: {
        ...orders[0], orderId: `CMB-${r.id}-${currentWeekIndex()}`, platform: "combined",
        totalCents: orders.reduce((s, o) => s + o.totalCents, 0),
      },
      confidence: "high",
      actions: [{ taskId: "merge-orders", label: "Merge into one shipment",
        payload: { customerId: r.id, orderIds: orders.map((o) => o.orderId) }, risk: "gated" }],
    };
  });
}

// ---------------------------------------------------------------- weekly report

export async function weeklyReport(ch: ClickHouseClient, pg: Pool, weekIndex?: number): Promise<ComponentSpec[]> {
  const wi = weekIndex ?? currentWeekIndex() - 1;        // default: last complete cycle
  const w = weekWindow(wi), w1 = weekWindow(wi - 1), w4 = weekWindow(wi - 4);

  const rev = async (win: { start: string; end: string }) =>
    (await queryRows<{ rev: string; orders: string }>(ch, `
      SELECT sum(revenue_cents) AS rev, sum(orders) AS orders FROM mv_revenue_hourly
      WHERE hour >= {start:DateTime} AND hour < {end:DateTime}`, win))[0];
  const [cur, prev, prev4] = await Promise.all([rev(w), rev(w1), rev(w4)]);

  // retention lenses — computed for this cycle AND its WoW / MoM comparators
  const snapRate = async (win: { end: string }) =>
    Number((await queryRows<{ rate: number }>(ch, `
      SELECT round(countIf(lifetime >= 2) / count(), 3) AS rate FROM (
        SELECT customer_id, sum(orders) AS lifetime FROM mv_customer_daily
        WHERE day < toDate({end:DateTime}) GROUP BY customer_id)`, win))[0]?.rate ?? 0);
  const newShare = async (win: { start: string; end: string }) => {
    const f = (await queryRows<{ ret: string; neu: string }>(ch, `
      WITH firsts AS (SELECT customer_id, min(day) AS first_day FROM mv_customer_daily GROUP BY customer_id)
      SELECT sumIf(d.spend_cents, f.first_day <  toDate({start:DateTime})) AS ret,
             sumIf(d.spend_cents, f.first_day >= toDate({start:DateTime})) AS neu
      FROM mv_customer_daily d JOIN firsts f USING (customer_id)
      WHERE d.day >= toDate({start:DateTime}) AND d.day < toDate({end:DateTime})`, win))[0];
    const n = Number(f?.neu ?? 0), r = Number(f?.ret ?? 0);
    return n + r > 0 ? Math.round((n / (n + r)) * 100) : 0;
  };
  const [snapW, snap1, snap4, flowW, flow1, flow4] = await Promise.all([
    snapRate(w), snapRate({ end: w1.end }), snapRate({ end: w4.end }),
    newShare(w), newShare(w1), newShare(w4),
  ]);

  // sparklines: weekly revenue + orders across the trailing 6 cycles (one query,
  // bucketed in JS by cycle-week — cycles are Thursday-anchored, not calendar).
  const sparkStart = fmt(ANCHOR + (wi - 5) * WEEK_MS);
  const hourly = await queryRows<{ t: string; rev: string; ord: string }>(ch, `
    SELECT toString(hour) AS t, sum(revenue_cents) AS rev, sum(orders) AS ord FROM mv_revenue_hourly
    WHERE hour >= {start:DateTime} AND hour < {end:DateTime} GROUP BY hour ORDER BY hour`,
    { start: sparkStart, end: w.end });
  const revByWeek = new Array(6).fill(0), ordByWeek = new Array(6).fill(0);
  for (const h of hourly) {
    const idx = Math.floor((Date.parse(h.t.replace(" ", "T") + "Z") - ANCHOR) / WEEK_MS) - (wi - 5);
    if (idx >= 0 && idx < 6) { revByWeek[idx] += Number(h.rev); ordByWeek[idx] += Number(h.ord); }
  }
  const revSpark = revByWeek.map((c) => Math.round(c / 100)), ordSpark = ordByWeek;

  const curRev = Number(cur?.rev ?? 0), curOrders = Number(cur?.orders ?? 0);
  const headline: ReportSection = {
    kind: "metrics", title: "The week in numbers — every headline against history",
    metrics: [
      { label: "Revenue", value: usd(curRev), unit: "$", spark: revSpark,
        deltaWoW: pctDelta(curRev, Number(prev?.rev ?? 0)), deltaMoM: pctDelta(curRev, Number(prev4?.rev ?? 0)) },
      { label: "Orders", value: curOrders, unit: "orders", spark: ordSpark,
        deltaWoW: pctDelta(curOrders, Number(prev?.orders ?? 0)), deltaMoM: pctDelta(curOrders, Number(prev4?.orders ?? 0)) },
      { label: "Return customer rate", value: Math.round(snapW * 100), unit: "%",
        deltaWoW: pctDelta(snapW, snap1), deltaMoM: pctDelta(snapW, snap4) },
      { label: "New-customer revenue", value: flowW, unit: "%",
        deltaWoW: pctDelta(flowW, flow1), deltaMoM: pctDelta(flowW, flow4) },
    ],
  };

  // platform mix — mv_revenue_hourly is keyed by (hour, platform); WoW vs w1
  const platRows = await queryRows<{ platform: string; rev: string; ord: string }>(ch, `
    SELECT platform, sum(revenue_cents) AS rev, sum(orders) AS ord FROM mv_revenue_hourly
    WHERE hour >= {start:DateTime} AND hour < {end:DateTime} GROUP BY platform ORDER BY rev DESC`, w);
  const platPrev = await queryRows<{ platform: string; rev: string }>(ch, `
    SELECT platform, sum(revenue_cents) AS rev FROM mv_revenue_hourly
    WHERE hour >= {start:DateTime} AND hour < {end:DateTime} GROUP BY platform`, w1);
  const prevByPlat = new Map(platPrev.map((p) => [p.platform, Number(p.rev)]));
  const platTotal = platRows.reduce((s, p) => s + Number(p.rev), 0) || 1;
  const platformMix: ReportSection = {
    kind: "table", title: "Platform mix (orders · revenue · share · WoW)",
    columns: ["platform", "orders", "revenue $", "share %", "WoW %"],
    rows: platRows.map((p) => [p.platform, Number(p.ord), usd(Number(p.rev)),
      Math.round((Number(p.rev) / platTotal) * 100),
      pctDelta(Number(p.rev), prevByPlat.get(p.platform) ?? 0) ?? "—"]),
  };

  // tier mix — tier lives in Postgres; share of sales per tier, tier 4 = new
  const tierRes = await pg.query<{ tier: number; customers: string; rev: string }>(`
    SELECT c.tier, count(DISTINCT o.customer_id) AS customers, coalesce(sum(o.total_cents),0) AS rev
    FROM orders o JOIN customers c ON c.id = o.customer_id
    WHERE o.ordered_at >= $1 AND o.ordered_at < $2
      AND o.status IN ('paid','labeled','shipped','delivered')
    GROUP BY c.tier ORDER BY c.tier`,
    [w.start.replace(" ", "T") + "Z", w.end.replace(" ", "T") + "Z"]);
  const tierTotal = tierRes.rows.reduce((s, r) => s + Number(r.rev), 0) || 1;
  // Group by the customer's current dossier tier. Note: this is NOT the
  // new-customer rate — that's the first-order-based "New-customer revenue"
  // headline metric above. Labeling tier 4 "first-time" would contradict it,
  // so the table is plainly the tier mix.
  const tierMix: ReportSection = {
    kind: "table", title: "Customer tier mix — share of sales",
    columns: ["dossier tier", "customers", "revenue $", "share %"],
    rows: tierRes.rows.map((r) => [`tier ${r.tier}`,
      Number(r.customers), usd(Number(r.rev)), Math.round((Number(r.rev) / tierTotal) * 100)]),
  };

  // six-category product analysis with WoW movement
  const cats = await queryRows<{ category: string; rev: string; units: string; prev_rev: string }>(ch, `
    SELECT category, sumIf(revenue_cents, day >= toDate({start:DateTime})) AS rev,
           sumIf(units, day >= toDate({start:DateTime})) AS units,
           sumIf(revenue_cents, day < toDate({start:DateTime})) AS prev_rev
    FROM mv_category_daily
    WHERE day >= toDate({pstart:DateTime}) AND day < toDate({end:DateTime}) AND category != ''
    GROUP BY category ORDER BY rev DESC`,
    { start: w.start, end: w.end, pstart: w1.start });
  const catTotal = cats.reduce((s, c) => s + Number(c.rev), 0) || 1;
  const products: ReportSection = {
    kind: "table", title: "Product categories (unit price · share · WoW)",
    columns: ["category", "units", "unit price $", "share %", "WoW %"],
    rows: cats.map((c) => [c.category, Number(c.units),
      Number(c.units) ? usd(Number(c.rev) / Number(c.units)) : 0,
      Math.round((Number(c.rev) / catTotal) * 100),
      pctDelta(Number(c.rev), Number(c.prev_rev)) ?? "—"]),
  };

  // auction top 10 hammer prices
  const top = await queryRows<{ winner: string; sku: string; hammer: string }>(ch, `
    SELECT JSONExtractString(meta,'winner') AS winner, sku, amount_cents AS hammer
    FROM events WHERE type = 'auction_won' AND ts >= {start:DateTime} AND ts < {end:DateTime}
    ORDER BY amount_cents DESC LIMIT 10`, w);
  const top10: ReportSection = {
    kind: "table", title: "Auction top 10 — highest hammer prices",
    columns: ["coral", "category", "winner", "hammer $", "vs base"],
    rows: top.map((t) => {
      const item = bySku.get(t.sku);
      const base = item?.basePriceCents ?? 0;
      return [item?.name ?? t.sku, item?.category ?? "?", t.winner, usd(Number(t.hammer)),
        base ? `${Math.round((Number(t.hammer) / base) * 100)}%` : "—"];
    }),
  };

  // cycle funnel vs previous weeks
  const funnelFor = async (win: { start: string; end: string }): Promise<FunnelStep[]> => {
    const lv = await queryRows<{ level: number; n: string }>(ch, `
      SELECT level, count() AS n FROM (
        SELECT customer_id, windowFunnel(259200)(toDateTime(ts),
          type='auction_won', type='discount_code_issued', type='discount_code_redeemed') AS level
        FROM events WHERE ts >= {start:DateTime} AND ts < {end:DateTime} AND customer_id > 0
        GROUP BY customer_id) WHERE level > 0 GROUP BY level`, win);
    const at = (k: number) => lv.filter((r) => Number(r.level) >= k).reduce((s, r) => s + Number(r.n), 0);
    return [
      { label: "auction win", count: at(1) },
      { label: "code issued", count: at(2), conversionFromPrev: at(1) ? at(2) / at(1) : 0 },
      { label: "cross-platform add-on", count: at(3), conversionFromPrev: at(2) ? at(3) / at(2) : 0 },
    ];
  };
  const [steps, fPrev, fPrev2] = await Promise.all([funnelFor(w), funnelFor(w1), funnelFor(weekWindow(wi - 2))]);
  const overall = (s: FunnelStep[]) => (s[0]?.count ? (s[2]?.count ?? 0) / s[0].count : 0);
  const funnel: ReportSection = {
    kind: "funnel", title: "Auction → add-on funnel (72h window)", steps,
    prevWeeks: [
      { week: `W${wi - 1}`, overall: Math.round(overall(fPrev) * 100) / 100 },
      { week: `W${wi - 2}`, overall: Math.round(overall(fPrev2) * 100) / 100 },
    ],
  };

  return [{ kind: "report", weekLabel: `W${wi}`,
    sections: [headline, platformMix, tierMix, products, top10, funnel] }];
}
