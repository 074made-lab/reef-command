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
  AddonOrderRow, AttentionItem, ComponentSpec, CustomerRef, DemoDayId, FunnelStep,
  LotPrice, Metric, OrderLine, OrderSummary, ReportSection, ShippingBlockerGroup,
} from "./protocol";
import { CATALOG } from "./synth/catalog";
import { AUCTION_OPEN_OFFSET_MS, AUCTION_CLOSE_OFFSET_MS } from "./synth/schedule";
import { DEMO_AUCTION_WEEK_INDEX, demoAuctionMoment, demoPriorityTimestamp } from "./demo-clock";
import { DEMO_DOA_CASE_ID, DEMO_DOA_REVIEW } from "./doa-demo";

const WEEK_MS = 7 * 24 * 3600_000;
const DAY_MS = 24 * 3600_000;
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

export async function attentionFeed(ch: ClickHouseClient, pg: Pool, limit = 10): Promise<ComponentSpec[]> {
  const items: AttentionItem[] = [];
  const now = Date.now();

  // The one deliberately composed support demo: enough context to make a
  // human decision and a complete downstream plan, without exposing any real
  // store policy, customer-value logic, or identity-matching method.
  const demoDoaItem: AttentionItem = {
    id: DEMO_DOA_CASE_ID,
    kind: "case",
    headline: "3-item DOA review · tomorrow's shipment can take the replacements",
    ageMinutes: 12,
    customerName: DEMO_DOA_REVIEW.customer.displayName,
    customerEmail: "reef_keeper_17@example.test",
    detail: "Three synthetic coral items were reported as DOA. Evidence and customer history are assembled for a human decision.",
    photoHref: "/mock-doa-coral.svg",
    doaReview: DEMO_DOA_REVIEW,
  };

  // Recently auto-handled operational exceptions lead the feed as evidence,
  // but are marked handled so they do not inflate the owner's open count.
  const handledReqs = await pg.query(`SELECT request_code, kind, detail,
      received_at, auto_actions, c.primary_name
    FROM requests JOIN customers c ON c.id = requests.customer_id
    WHERE requests.status = 'auto_handled'
      AND received_at > now() - interval '1 day'
    ORDER BY received_at DESC LIMIT 3`);
  const handledItems: AttentionItem[] = handledReqs.rows.map((r) => {
    const actions = (r.auto_actions as string[]).filter((a) => !a.startsWith("shipment:"));
    return {
      id: r.request_code,
      kind: "system" as const,
      headline: `${r.primary_name}'s delivery change was protected automatically`,
      ageMinutes: Math.max(0, Math.round((now - r.received_at.getTime()) / 60_000)),
      customerName: r.primary_name,
      detail: `${r.detail} Packing was paused by synthetic SMS and the prepared label was voided before handoff.`,
      status: "handled" as const,
      autoActions: actions,
    };
  });

  const cases = await pg.query(`SELECT case_code, kind, cases.created_at, cases.summary,
      c.primary_name, c.primary_email,
      coalesce((SELECT m.preview FROM messages m
        WHERE m.customer_id = cases.customer_id AND m.direction = 'in'
          AND (m.intent = cases.kind OR cases.kind = 'other') AND m.at <= cases.created_at
        ORDER BY m.at DESC LIMIT 1), cases.summary) AS customer_text
    FROM cases JOIN customers c ON c.id = cases.customer_id
    WHERE cases.status = 'open' AND cases.kind <> 'doa_claim'
    ORDER BY cases.created_at DESC LIMIT 20`);
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
    ORDER BY received_at DESC LIMIT 20`);
  for (const r of reqs.rows) items.push({
    id: r.request_code, kind: "request",
    headline: `${r.primary_name} asks: ${String(r.kind).replace(/_/g, " ")}`,
    ageMinutes: Math.round((now - r.received_at.getTime()) / 60_000),
  });

  // Two complementary message reads: the AGING queue (oldest unanswered — the
  // missed-replies pain point) and FRESH arrivals (last 15 min — e.g. the live
  // concierge intake on /shop, which must surface the moment it lands). One
  // combined query can't serve both: either LIMIT starves the other end.
  type MsgRow = { id: string; preview: string; platform: string; age_min: string; customer_id: string };
  const msgSelect = `
    SELECT JSONExtractString(meta,'id') AS id, JSONExtractString(meta,'preview') AS preview,
           platform, toString(round((now() - ts)/60)) AS age_min, toString(customer_id) AS customer_id
    FROM events WHERE type = 'message_in' AND ts > now() - INTERVAL 2 DAY
      AND JSONExtractString(meta,'id') != ''
      AND JSONExtractString(meta,'id') NOT IN (
        SELECT JSONExtractString(meta,'id') FROM events
        WHERE type = 'message_answered' AND ts > now() - INTERVAL 3 DAY)`;
  const [aging, freshRows] = await Promise.all([
    queryRows<MsgRow>(ch, `${msgSelect} ORDER BY ts ASC LIMIT 20`),
    queryRows<MsgRow>(ch, `${msgSelect} AND ts > now() - INTERVAL 15 MINUTE ORDER BY ts DESC LIMIT 10`),
  ]);
  const unanswered = [...freshRows, ...aging.filter((a) => !freshRows.some((f) => f.id === a.id))];
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
  const msgItems: AttentionItem[] = unanswered.map((m) => ({
    id: m.id, kind: "message" as const, platform: m.platform as AttentionItem["platform"],
    headline: `unanswered: “${m.preview}”`, ageMinutes: Number(m.age_min),
    customerName: customerById.get(Number(m.customer_id))?.primary_name,
    customerEmail: customerById.get(Number(m.customer_id))?.primary_email,
    detail: m.preview,
    draft: replyDraft(m.preview),
  }));
  // Fresh arrivals (≤15 min — e.g. a live concierge question) lead the feed so
  // "it just landed" is visible without scrolling; the aged queue keeps its
  // oldest-first shape underneath. The final `limit` still bounds the returned
  // payload, while Monday can count a wider operational queue.
  const freshMsgs = msgItems.filter((m) => m.ageMinutes <= 15)
    .sort((a, b) => a.ageMinutes - b.ageMinutes).slice(0, 10);
  items.push(...msgItems.filter((m) => m.ageMinutes > 15).slice(0, 20));

  items.sort((a, b) => b.ageMinutes - a.ageMinutes);
  return [{ kind: "attention_feed", items: [demoDoaItem, ...handledItems, ...freshMsgs, ...items].slice(0, limit) }];
}

/** Monday's blocker command: a three-lane shipping summary followed by the
 * exact live queue used to resolve the underlying records. */
export function categorizeShippingBlockers(items: AttentionItem[]): {
  groups: ShippingBlockerGroup[];
  openCount: number;
} {
  const open = items.filter((item) => item.status !== "handled");
  const isHoldLane = (item: AttentionItem) =>
    /hold next week|address change|wrong (?:apartment|address)|delivery (?:change|timing)|cancel ship/i.test(`${item.headline} ${item.detail ?? ""}`);
  const holds = open.filter((item) =>
    (item.kind === "request" || item.kind === "message") && isHoldLane(item),
  );
  const replacementCases = open.filter((item) =>
    item.kind === "case" && (Boolean(item.doaReview) || /DOA|replacement/i.test(`${item.headline} ${item.detail ?? ""}`)),
  );
  const questions = open.filter((item) => item.kind === "message" && !isHoldLane(item));
  const replacementCorals = replacementCases.reduce(
    (sum, item) => sum + (item.doaReview?.claimedItems.length ?? 1),
    0,
  );

  return { groups: [
    {
      kind: "hold_requests",
      label: "Hold order requests",
      count: holds.length,
      unit: "requests",
      status: holds.length ? "needs-review" : "clear",
      detail: "Verify ship timing and address changes before any carrier label enters the purchase queue.",
      headlines: holds.map((item) => item.headline),
      items: holds.map((item) => ({
        id: item.id,
        headline: item.headline,
        detail: item.detail ?? "Verify the requested shipping change before document lock.",
        count: 1,
      })),
    },
    {
      kind: "replacement_items",
      label: "Replacement items",
      count: replacementCorals,
      unit: "corals",
      status: replacementCases.length ? "needs-review" : "clear",
      detail: "Approved replacement corals must be added to both the packing slip and one-per-bag product-label count.",
      headlines: replacementCases.map((item) => item.headline),
      items: replacementCases.map((item) => ({
        id: item.id,
        headline: item.headline,
        detail: item.detail ?? "Review the replacement evidence before adding coral labels.",
        count: item.doaReview?.claimedItems.length ?? 1,
      })),
    },
    {
      kind: "customer_questions",
      label: "Customer questions",
      count: questions.length,
      unit: "questions",
      status: questions.length ? "needs-review" : "clear",
      detail: "Review the original question and editable reply draft before the shipping document set is locked.",
      headlines: questions.map((item) => item.headline),
      items: questions.map((item) => ({
        id: item.id,
        headline: item.headline,
        detail: item.draft ?? item.detail ?? "Review the customer question and reply draft.",
        count: 1,
      })),
    },
  ], openCount: holds.length + replacementCases.length + questions.length };
}

export async function shippingBlockerBoard(ch: ClickHouseClient, pg: Pool): Promise<ComponentSpec[]> {
  // Source caps yield at most 74 records (demo + handled + cases + requests +
  // deduplicated fresh/aging messages), so 80 conserves the full bounded queue.
  const feed = await attentionFeed(ch, pg, 80);
  const items = feed[0]?.kind === "attention_feed" ? feed[0].items : [];
  const { groups, openCount } = categorizeShippingBlockers(items);

  return [{
    kind: "shipping_blocker_board",
    asOf: demoPriorityTimestamp("monday", 0),
    groups,
    openCount,
  }];
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

/** Public-safe Saturday handoff. This is a review artifact, not a send action. */
export async function winnerNextSteps(ch: ClickHouseClient): Promise<ComponentSpec[]> {
  const board = await auctionBoard(ch, "saturday");
  return [
    ...board,
    {
      kind: "verdict_card",
      verdict: "Winner handoff is ready for review. No customer message has been sent.",
      confidence: "high",
      evidence: [
        { label: "payment", detail: "Complete payment from the synthetic winner checkout." },
        { label: "add-on", detail: "Use the synthetic add-on code during the two-day add-on window." },
        { label: "shipping", detail: "Confirm the planned Tuesday or Wednesday ship date." },
      ],
    },
  ];
}

// ------------------------------------------------------ weekly operating plan

type AnnouncementRecipient = {
  id: string;
  tier: number;
  contact: "email" | "sms" | "both";
  primary_email: string | null;
  primary_phone: string | null;
};

type Queryable = Pick<Pool, "query">;

type AddonPairRow = {
  customer_id: string;
  customer: string;
  tier: 1 | 2 | 3 | 4;
  anchor_id: string;
  anchor_total_cents: string;
  anchor_destination: string | null;
  anchor_status: OrderSummary["status"];
  anchor_units: number;
  anchor_items: OrderLine[];
  anchor_shipment_id: string | null;
  addon_id: string;
  addon_platform: "web" | "marketplace";
  addon_total_cents: string;
  addon_destination: string | null;
  addon_status: OrderSummary["status"];
  addon_units: number;
  addon_items: OrderLine[];
  addon_ordered_at: Date;
  addon_shipment_id: string | null;
};

export type AddonMergePlan = {
  weekIndex: number;
  customer: CustomerRef;
  anchor: OrderSummary;
  addons: Array<OrderSummary & { orderedAt: string }>;
  totalCoralUnits: number;
  totalCents: number;
  mergeState: "ready" | "merged" | "review";
};

const normalizeItems = (items: OrderLine[] | null | undefined): OrderLine[] =>
  (items ?? []).map((item) => ({
    ...item,
    qty: Number(item.qty),
    priceCents: Number(item.priceCents),
  }));

/**
 * Current-cycle ReefnBid anchors and the Shopify/eBay orders that redeemed
 * their winner code. This is the single data contract used by both Sunday
 * views and both merge actions, so board and action totals cannot drift.
 */
export async function currentAddonMergePlans(db: Queryable): Promise<AddonMergePlan[]> {
  const weekIndex = currentWeekIndex();
  const window = weekWindow(weekIndex);
  const params = [
    window.start.replace(" ", "T") + "Z",
    window.end.replace(" ", "T") + "Z",
    weekIndex,
  ];
  const result = await db.query<AddonPairRow>(`
    WITH cycle_orders AS (
      SELECT o.*,
        coalesce((SELECT sum(oi.qty) FROM order_items oi WHERE oi.order_id = o.id), 0)::int AS coral_units,
        coalesce((SELECT json_agg(json_build_object(
          'sku', oi.sku, 'name', oi.name, 'category', oi.category,
          'qty', oi.qty, 'priceCents', oi.price_cents) ORDER BY oi.id)
          FROM order_items oi WHERE oi.order_id = o.id), '[]'::json) AS items
      FROM orders o
      WHERE o.ordered_at >= $1::timestamptz AND o.ordered_at < $2::timestamptz
        AND o.status IN ('pending','paid','labeled')
    ), anchors AS (
      SELECT DISTINCT ON (customer_id) * FROM cycle_orders
      WHERE platform = 'auction'
      ORDER BY customer_id, ordered_at DESC
    )
    SELECT c.id AS customer_id, c.primary_name AS customer, c.tier,
      anchor.external_id AS anchor_id, anchor.total_cents AS anchor_total_cents,
      anchor.destination_city AS anchor_destination, anchor.status AS anchor_status,
      anchor.coral_units AS anchor_units, anchor.items AS anchor_items,
      anchor.shipment_id AS anchor_shipment_id,
      addon.external_id AS addon_id, addon.platform AS addon_platform,
      addon.total_cents AS addon_total_cents, addon.destination_city AS addon_destination,
      addon.status AS addon_status, addon.coral_units AS addon_units,
      addon.items AS addon_items, addon.ordered_at AS addon_ordered_at,
      addon.shipment_id AS addon_shipment_id
    FROM cycle_orders addon
    JOIN anchors anchor ON anchor.customer_id = addon.customer_id
    JOIN customers c ON c.id = addon.customer_id
    WHERE addon.platform IN ('web','marketplace')
      AND addon.discount_code = concat('RC', $3::int, '-', addon.customer_id)
    ORDER BY addon.ordered_at DESC`, params);

  const grouped = new Map<number, AddonMergePlan>();
  for (const row of result.rows) {
    const customerId = Number(row.customer_id);
    const pairState = row.anchor_shipment_id && row.anchor_shipment_id === row.addon_shipment_id
      ? "merged" as const
      : !row.anchor_shipment_id && !row.addon_shipment_id
        ? "ready" as const
        : "review" as const;
    let plan = grouped.get(customerId);
    if (!plan) {
      const customer: CustomerRef = {
        customerId,
        displayName: row.customer,
        tier: Number(row.tier) as CustomerRef["tier"],
        platforms: ["auction"],
      };
      plan = {
        weekIndex,
        customer,
        anchor: {
          orderId: row.anchor_id,
          platform: "auction",
          customer,
          items: normalizeItems(row.anchor_items),
          totalCents: Number(row.anchor_total_cents),
          destination: row.anchor_destination ?? "",
          status: row.anchor_status,
          shipWeek: `W${weekIndex}`,
        },
        addons: [],
        totalCoralUnits: Number(row.anchor_units),
        totalCents: Number(row.anchor_total_cents),
        mergeState: pairState,
      };
      grouped.set(customerId, plan);
    } else if (plan.mergeState !== pairState) {
      plan.mergeState = "review";
    }
    const addon: OrderSummary & { orderedAt: string } = {
      orderId: row.addon_id,
      platform: row.addon_platform,
      customer: plan.customer,
      items: normalizeItems(row.addon_items),
      totalCents: Number(row.addon_total_cents),
      destination: row.addon_destination ?? row.anchor_destination ?? "",
      status: row.addon_status,
      shipWeek: `W${weekIndex}`,
      orderedAt: row.addon_ordered_at.toISOString(),
    };
    plan.addons.push(addon);
    plan.totalCoralUnits += Number(row.addon_units);
    plan.totalCents += Number(row.addon_total_cents);
    if (!plan.customer.platforms.includes(row.addon_platform)) {
      plan.customer.platforms.push(row.addon_platform);
    }
  }
  return [...grouped.values()].sort((a, b) =>
    b.addons[0].orderedAt.localeCompare(a.addons[0].orderedAt));
}

/** Arbitrary public-demo audience; never a production targeting rule. */
export async function announcementRecipients(db: Queryable): Promise<{
  emailIds: number[];
  smsIds: number[];
}> {
  const result = await db.query<AnnouncementRecipient>(`
    SELECT DISTINCT c.id, c.tier,
      coalesce(c.preferences->>'contact', 'email') AS contact,
      c.primary_email, c.primary_phone
    FROM customers c
    WHERE EXISTS (
      SELECT 1 FROM customer_identities i
      WHERE i.customer_id = c.id AND i.platform = 'auction'
    )
    ORDER BY c.id`);
  const emailIds = result.rows
    .filter((row) => row.primary_email && (row.contact === "email" || row.contact === "both"))
    .map((row) => Number(row.id));
  const smsIds = result.rows
    .filter((row) => row.primary_phone && (row.contact === "sms" || row.contact === "both"))
    .map((row) => Number(row.id));
  return { emailIds, smsIds };
}

export function nextAuctionAnnouncementMeta() {
  const sundayMs = demoAuctionMoment("sunday");
  const thursdayMs = sundayMs + 4 * DAY_MS;
  const saturdayMs = sundayMs + 6 * DAY_MS;
  const date = (ms: number) => new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(ms));
  return {
    campaignId: `CMP-W${DEMO_AUCTION_WEEK_INDEX + 1}-next-auction`,
    dateRange: `${date(thursdayMs)} – ${date(saturdayMs)}`,
    closeTime: "Saturday at 8:00 PM ET",
  };
}

/** Sunday order monitor backed by the synthetic Postgres order ledger. */
export async function addonOrderBoard(pg: Pool): Promise<ComponentSpec[]> {
  const plans = await currentAddonMergePlans(pg);
  const orders: AddonOrderRow[] = plans.flatMap((plan) => plan.addons.map((addon) => ({
    orderId: addon.orderId,
    platform: addon.platform as "web" | "marketplace",
    customer: plan.customer.displayName,
    coralUnits: addon.items.reduce((sum, item) => sum + item.qty, 0),
    totalCents: addon.totalCents,
    orderedAt: addon.orderedAt,
    status: addon.status,
    auctionOrderId: plan.anchor.orderId,
    auctionCoralUnits: plan.anchor.items.reduce((sum, item) => sum + item.qty, 0),
    combinedCoralUnits: plan.totalCoralUnits,
    mergeState: plan.mergeState,
  })));
  const platformCounts = orders.reduce<Partial<Record<"web" | "marketplace", number>>>((counts, order) => {
    counts[order.platform as "web" | "marketplace"] = (counts[order.platform as "web" | "marketplace"] ?? 0) + 1;
    return counts;
  }, {});
  return [{
    kind: "addon_order_board",
    windowLabel: `Synthetic W${currentWeekIndex()} · Sunday–Monday add-on window`,
    totalOrders: orders.length,
    coralUnits: orders.reduce((sum, order) => sum + order.coralUnits, 0),
    totalCents: orders.reduce((sum, order) => sum + order.totalCents, 0),
    combineReady: orders.filter((order) => order.mergeState === "ready").length,
    platformCounts,
    orders,
  }];
}

/** Full next-auction review package. The action records simulated sends only. */
export async function auctionAnnouncement(pg: Pool): Promise<ComponentSpec[]> {
  const audience = await announcementRecipients(pg);
  const meta = nextAuctionAnnouncementMeta();
  const emailPreview = {
    channel: "email" as const,
    subject: "Next ReefnBid auction opens Thursday",
    body: `The next ReefnBid auction runs ${meta.dateRange}. Bidding closes ${meta.closeTime}. Preview the new coral lineup and set your closing-night reminder.`,
  };
  const smsPreview = {
    channel: "sms" as const,
    body: `ReefnBid returns ${meta.dateRange}. Bidding closes ${meta.closeTime}. Open ReefnBid to preview the coral lineup.`,
  };
  return [{
    kind: "auction_announcement",
    ...meta,
    emailRecipients: audience.emailIds.length,
    smsRecipients: audience.smsIds.length,
    emailPreview,
    smsPreview,
    actions: [{
      taskId: "send-demo-auction-announcement",
      label: "Approve & send demo",
      payload: { campaignId: meta.campaignId },
      risk: "gated",
    }],
  }];
}

/** Public-safe listing review artifact. It never publishes to a sales channel. */
export function listingPlan(): ComponentSpec[] {
  return [{
    kind: "verdict_card",
    verdict: "Tuesday's listing plan is staged for review. Nothing has been published.",
    confidence: "high",
    evidence: [
      { label: "ReefnBid", detail: "Thursday is the target live day; the synthetic lot queue remains a draft." },
      { label: "Shopify", detail: "New coral arrivals are prepared as draft products for review." },
      { label: "eBay sync", detail: "Demo assumption: eBay mirrors the catalog after Shopify is updated." },
      { label: "human check", detail: "Human staff must verify physical inventory and update Shopify directly before publish." },
    ],
  }];
}

/** Public-safe campaign review artifact. It never sends email or SMS. */
export function promotionPlan(dayId: "wednesday" | "friday"): ComponentSpec[] {
  const plans: Record<"wednesday" | "friday", {
    verdict: string;
    evidence: { label: string; detail: string }[];
  }> = {
    wednesday: {
      verdict: "Wednesday's launch reminders are ready for review. Nothing has been sent.",
      evidence: [
        { label: "email", detail: "Draft announces that the ReefnBid auction opens Thursday." },
        { label: "SMS", detail: "Short Thursday-start reminder is prepared as a draft." },
        { label: "Shopify", detail: "New-coral-arrivals promotion is paired with the auction reminder." },
        { label: "approval", detail: "A human must review recipients and copy before any send." },
      ],
    },
    friday: {
      verdict: "Friday's momentum and last-call ads are ready for review. Nothing has been sent.",
      evidence: [
        { label: "momentum", detail: "Draft highlights active auction lots without inventing prices or bid counts." },
        { label: "email", detail: "Last-call draft points buyers to Saturday closing night." },
        { label: "SMS", detail: "Concise closing-night reminder is prepared as a draft." },
        { label: "approval", detail: "A human must review recipients and copy before any send." },
      ],
    },
  };
  return [{ kind: "verdict_card", confidence: "high", ...plans[dayId] }];
}

// ---------------------------------------------------------------- merge scan

/** ReefnBid anchor shipments with winner-code Shopify/eBay add-ons this cycle. */
export async function mergeScan(pg: Pool, dayId: "sunday" | "monday" = "sunday"): Promise<ComponentSpec[]> {
  const plans = (await currentAddonMergePlans(pg)).filter((plan) => plan.mergeState !== "review");
  if (!plans.length) return [];
  const readyPlans = plans.filter((plan) => plan.mergeState === "ready");
  const batch: ComponentSpec = {
    kind: "merge_batch",
    weekLabel: `Synthetic W${currentWeekIndex()}`,
    candidates: plans.length,
    readyCandidates: readyPlans.length,
    sourceOrders: plans.reduce((sum, plan) => sum + 1 + plan.addons.length, 0),
    addonOrders: plans.reduce((sum, plan) => sum + plan.addons.length, 0),
    coralUnits: plans.reduce((sum, plan) => sum + plan.totalCoralUnits, 0),
    totalCents: plans.reduce((sum, plan) => sum + plan.totalCents, 0),
    asOf: demoPriorityTimestamp(dayId, 1),
    actions: readyPlans.length ? [{
      taskId: "merge-all-orders",
      label: "Merge all",
      payload: {
        weekIndex: currentWeekIndex(),
        groups: readyPlans.map((plan) => ({
          customerId: plan.customer.customerId,
          orderIds: [plan.anchor.orderId, ...plan.addons.map((addon) => addon.orderId)],
        })),
      },
      risk: "gated",
    }] : [],
  };
  return [batch, ...plans.map((plan): ComponentSpec => {
    const orders = [plan.anchor, ...plan.addons];
    return {
      kind: "merge_card",
      customer: plan.customer,
      orders,
      combined: {
        ...plan.anchor,
        orderId: `CMB-${plan.customer.customerId}-${currentWeekIndex()}`,
        platform: "combined",
        items: orders.flatMap((order) => order.items),
        totalCents: plan.totalCents,
      },
      confidence: "high",
      mergeState: plan.mergeState === "merged" ? "merged" : "ready",
      anchorOrderId: plan.anchor.orderId,
      addonOrderCount: plan.addons.length,
      totalCoralUnits: plan.totalCoralUnits,
      actions: plan.mergeState === "ready" ? [{
        taskId: "merge-orders",
        label: "Merge this shipment",
        payload: {
          weekIndex: plan.weekIndex,
          groups: [{
            customerId: plan.customer.customerId,
            orderIds: orders.map((order) => order.orderId),
          }],
        },
        risk: "gated",
      }] : [],
    };
  })];
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
    kind: "metrics", title: "The week in numbers",
    metrics: [
      { label: "Revenue", value: usd(curRev), unit: "$", spark: revSpark,
        deltaWoW: pctDelta(curRev, Number(prev?.rev ?? 0)), deltaMoM: pctDelta(curRev, Number(prev4?.rev ?? 0)) },
      { label: "Orders", value: curOrders, unit: "orders", spark: ordSpark,
        deltaWoW: pctDelta(curOrders, Number(prev?.orders ?? 0)), deltaMoM: pctDelta(curOrders, Number(prev4?.orders ?? 0)) },
      { label: "Avg order", value: curOrders ? usd(curRev / curOrders) : 0, unit: "$",
        deltaWoW: pctDelta(curOrders ? curRev / curOrders : 0,
          Number(prev?.orders ?? 0) ? Number(prev?.rev ?? 0) / Number(prev?.orders ?? 0) : 0),
        deltaMoM: pctDelta(curOrders ? curRev / curOrders : 0,
          Number(prev4?.orders ?? 0) ? Number(prev4?.rev ?? 0) / Number(prev4?.orders ?? 0) : 0) },
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
    kind: "table", title: "Auction top 10 by hammer price",
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
      { label: "auction winners", count: at(1) },
      {
        label: "add-on discount codes issued",
        count: at(2),
        conversionFromPrev: at(1) ? at(2) / at(1) : 0,
        rateLabel: "winner coverage",
      },
      {
        label: "add-on orders using code",
        count: at(3),
        conversionFromPrev: at(2) ? at(3) / at(2) : 0,
        rateLabel: "code conversion",
      },
    ];
  };
  const [steps, fPrev, fPrev2] = await Promise.all([funnelFor(w), funnelFor(w1), funnelFor(weekWindow(wi - 2))]);
  const overall = (s: FunnelStep[]) => (s[0]?.count ? (s[2]?.count ?? 0) / s[0].count : 0);
  const funnel: ReportSection = {
    kind: "funnel", title: "Auction-to-add-on conversion (72h)", steps,
    prevWeeks: [
      { week: `W${wi - 1}`, overall: Math.round(overall(fPrev) * 100) / 100 },
      { week: `W${wi - 2}`, overall: Math.round(overall(fPrev2) * 100) / 100 },
    ],
  };

  return [{ kind: "report", weekLabel: `W${wi}`,
    sections: [headline, platformMix, products, top10, funnel] }];
}
