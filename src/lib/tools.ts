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
  AttentionItem, ComponentSpec, FunnelStep, LotPrice, Metric, ReportSection,
} from "./protocol";
import { CATALOG } from "./synth/catalog";

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
  const cur = weekWindow(wi), prev = weekWindow(wi - 1);
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
    { label: "Week to date", value: usd(rev), unit: "$", deltaWoW: pctDelta(rev, prevRev) },
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

  const cases = await pg.query(`SELECT case_code, kind, cases.created_at, c.primary_name
    FROM cases JOIN customers c ON c.id = cases.customer_id
    WHERE cases.status = 'open' ORDER BY cases.created_at DESC LIMIT 5`);
  for (const r of cases.rows) items.push({
    id: r.case_code, kind: "case",
    headline: `${r.kind === "doa_claim" ? "DOA claim" : r.kind} from ${r.primary_name} — evidence ready, needs your decision`,
    ageMinutes: Math.round((now - r.created_at.getTime()) / 60_000),
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

  const unanswered = await queryRows<{ id: string; preview: string; platform: string; age_min: string }>(ch, `
    SELECT JSONExtractString(meta,'id') AS id, JSONExtractString(meta,'preview') AS preview,
           platform, toString(round((now() - ts)/60)) AS age_min
    FROM events WHERE type = 'message_in' AND ts > now() - INTERVAL 2 DAY
      AND JSONExtractString(meta,'id') != ''
      AND JSONExtractString(meta,'id') NOT IN (
        SELECT JSONExtractString(meta,'id') FROM events
        WHERE type = 'message_answered' AND ts > now() - INTERVAL 3 DAY)
    ORDER BY ts ASC LIMIT 6`);
  for (const m of unanswered) items.push({
    id: m.id, kind: "message", platform: m.platform as AttentionItem["platform"],
    headline: `unanswered: “${m.preview}”`, ageMinutes: Number(m.age_min),
  });

  items.sort((a, b) => b.ageMinutes - a.ageMinutes);
  return [{ kind: "attention_feed", items: items.slice(0, 10) }];
}

// ---------------------------------------------------------------- auction

export async function auctionBoard(ch: ClickHouseClient): Promise<ComponentSpec[]> {
  const wi = currentWeekIndex();
  const w = weekWindow(wi);
  const lots = await queryRows<{ lot: string; sku: string; bid: string; n: string; leader: string }>(ch, `
    SELECT JSONExtractString(meta,'lotId') AS lot, sku,
           max(amount_cents) AS bid, count() AS n,
           argMax(JSONExtractString(meta,'bidder'), ts) AS leader
    FROM events WHERE type = 'bid_placed' AND ts >= {start:DateTime} AND ts < {end:DateTime}
    GROUP BY lot, sku ORDER BY bid DESC`, w);
  const closesAt = new Date(ANCHOR + wi * WEEK_MS + ((2 * 24 + 22) * 60 + 45) * 60_000).toISOString();
  const board: LotPrice[] = lots.map((l) => {
    const item = bySku.get(l.sku);
    return {
      lotId: l.lot, sku: l.sku, name: item?.name ?? l.sku, category: item?.category ?? "other",
      currentBidCents: Number(l.bid), bidCount: Number(l.n), leader: l.leader, closesAt,
    };
  });
  return [{ kind: "auction_board", lots: board, closesAt }];
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
        customer: { customerId: r.id, displayName: r.primary_name, tier: r.tier, platforms: [] },
        items: [], totalCents: Number(o.totalCents), destination: o.destination ?? "",
        status: "paid" as const, shipWeek: `W${currentWeekIndex()}`,
      }));
    return {
      kind: "merge_card",
      customer: { customerId: r.id, displayName: r.primary_name, tier: r.tier, platforms: orders.map((o) => o.platform as never) },
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

export async function weeklyReport(ch: ClickHouseClient, weekIndex?: number): Promise<ComponentSpec[]> {
  const wi = weekIndex ?? currentWeekIndex() - 1;        // default: last complete cycle
  const w = weekWindow(wi), w1 = weekWindow(wi - 1), w4 = weekWindow(wi - 4);

  const rev = async (win: { start: string; end: string }) =>
    (await queryRows<{ rev: string; orders: string }>(ch, `
      SELECT sum(revenue_cents) AS rev, sum(orders) AS orders FROM mv_revenue_hourly
      WHERE hour >= {start:DateTime} AND hour < {end:DateTime}`, win))[0];
  const [cur, prev, prev4] = await Promise.all([rev(w), rev(w1), rev(w4)]);

  // retention lenses
  const snap = (await queryRows<{ rate: number }>(ch, `
    SELECT round(countIf(lifetime >= 2) / count(), 3) AS rate FROM (
      SELECT customer_id, sum(orders) AS lifetime FROM mv_customer_daily
      WHERE day < toDate({end:DateTime}) GROUP BY customer_id)`, w))[0];
  const flow = (await queryRows<{ ret: string; neu: string }>(ch, `
    WITH firsts AS (SELECT customer_id, min(day) AS first_day FROM mv_customer_daily GROUP BY customer_id)
    SELECT sumIf(d.spend_cents, f.first_day <  toDate({start:DateTime})) AS ret,
           sumIf(d.spend_cents, f.first_day >= toDate({start:DateTime})) AS neu
    FROM mv_customer_daily d JOIN firsts f USING (customer_id)
    WHERE d.day >= toDate({start:DateTime}) AND d.day < toDate({end:DateTime})`, w))[0];

  const curRev = Number(cur?.rev ?? 0);
  const newShare = Number(flow.neu) + Number(flow.ret) > 0
    ? Math.round((Number(flow.neu) / (Number(flow.neu) + Number(flow.ret))) * 100) : 0;
  const headline: ReportSection = {
    kind: "metrics", title: "The week in numbers",
    metrics: [
      { label: "Revenue", value: usd(curRev), unit: "$",
        deltaWoW: pctDelta(curRev, Number(prev?.rev ?? 0)), deltaMoM: pctDelta(curRev, Number(prev4?.rev ?? 0)) },
      { label: "Orders", value: Number(cur?.orders ?? 0), unit: "orders",
        deltaWoW: pctDelta(Number(cur?.orders ?? 0), Number(prev?.orders ?? 0)) },
      { label: "Return customer rate", value: Math.round((snap?.rate ?? 0) * 100), unit: "%" },
      { label: "New-customer revenue", value: newShare, unit: "%" },
    ],
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

  return [{ kind: "report", weekLabel: `W${wi}`, sections: [headline, products, top10, funnel] }];
}
