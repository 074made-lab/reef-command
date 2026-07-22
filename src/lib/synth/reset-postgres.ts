import type { PoolClient } from "pg";
import type { ReefEvent } from "../datastore";
import { CATALOG } from "./catalog";
import { CUSTOMERS } from "./customers";
import { generateBackfill } from "./generator";
import { demoAuctionMoment } from "../demo-clock";

const WEEK_MS = 7 * 24 * 3600_000;
const ANCHOR = Date.UTC(2026, 0, 1);
const RESET_LOCK_ID = 7_281_946;
const weekOf = (ts: string) => `W${Math.floor((Date.parse(ts) - ANCHOR) / WEEK_MS)}`;
const bySku = new Map(CATALOG.map((coral) => [coral.sku, coral]));

export type DemoSeedSummary = {
  customers: number;
  identities: number;
  orders: number;
  items: number;
  shipments: number;
  messages: number;
  requests: number;
  cases: number;
  campaigns: number;
  sends: number;
};

async function batchInsert(
  db: PoolClient,
  table: string,
  cols: string[],
  rows: unknown[][],
  conflict = "ON CONFLICT DO NOTHING",
) {
  const batchSize = 400;
  for (let i = 0; i < rows.length; i += batchSize) {
    const slice = rows.slice(i, i + batchSize);
    const values: unknown[] = [];
    const tuples = slice.map((row, rowIndex) =>
      `(${row.map((_, colIndex) => `$${rowIndex * cols.length + colIndex + 1}`).join(",")})`,
    );
    slice.forEach((row) => values.push(...row));
    await db.query(
      `INSERT INTO ${table} (${cols.join(",")}) VALUES ${tuples.join(",")} ${conflict}`,
      values,
    );
  }
}

/**
 * Restore the complete synthetic operational world used by Reef Command.
 * The reset is transactional and serialised so a failed or double-clicked reset
 * can never leave the demo half seeded.
 */
export async function resetSyntheticPostgres(
  db: PoolClient,
  // Default horizon = two minutes past the demo Saturday close — NOT the wall
  // clock — so pg-seed builds the identical world on any run date (a wall-clock
  // horizon gave judges a different, sometimes settlement-empty world).
  { weeks = 10, now = new Date(demoAuctionMoment("saturday") + 2 * 60_000) }:
    { weeks?: number; now?: Date } = {},
): Promise<DemoSeedSummary> {
  await db.query("BEGIN");
  try {
    await db.query("SELECT pg_advisory_xact_lock($1)", [RESET_LOCK_ID]);
    await db.query(`TRUNCATE campaign_sends, campaigns, cases, requests, messages,
      order_items, orders, shipments, customer_identities, customers, merge_runs,
      action_log, report_snapshots RESTART IDENTITY CASCADE`);

    const from = new Date(now.getTime() - weeks * WEEK_MS);
    const nowWeek = Math.floor((now.getTime() - ANCHOR) / WEEK_MS);
    const joined = CUSTOMERS.filter((customer) => customer.joinWeek <= nowWeek);

    await batchInsert(db, "customers",
      ["id", "primary_email", "primary_phone", "primary_name", "tier", "preferences"],
      joined.map((customer) => [
        customer.id,
        customer.email,
        customer.phone ?? null,
        customer.displayName,
        customer.tier,
        JSON.stringify({ categories: customer.prefCategories, contact: customer.contact }),
      ]));
    await batchInsert(db, "customer_identities",
      ["customer_id", "platform", "external_handle", "external_email", "external_phone", "external_name"],
      joined.flatMap((customer) => customer.platforms.map((platform) => [
        customer.id,
        platform.platform,
        platform.handle,
        platform.email,
        platform.phone ?? null,
        customer.displayName,
      ])));
    await db.query("SELECT setval('customers_id_seq', (SELECT max(id) FROM customers))");

    const orders: unknown[][] = [];
    const items: unknown[][] = [];
    const messages: unknown[][] = [];
    const requests: unknown[][] = [];
    const cases: unknown[][] = [];
    const campaigns: unknown[][] = [];
    const sends: unknown[][] = [];
    const shipments: unknown[][] = [];
    const shipmentUpdates: {
      kind: "void" | "shipped" | "delivered";
      customerId: number;
      week: string;
      ts: string;
      reason?: string;
    }[] = [];
    let caseSequence = 0;

    for (const chunk of generateBackfill(from.toISOString(), now.toISOString(), 1)) {
      for (const event of chunk as ReefEvent[]) {
        const meta = (event.meta ?? {}) as Record<string, any>;
        switch (event.type) {
          case "order_placed":
            orders.push([
              event.platform, event.orderId, event.customerId, "paid", event.amountCents,
              meta.discountCode ?? null, meta.destination ?? null, !!meta.addressSuspect, event.ts,
            ]);
            for (const item of (meta.items ?? []) as { sku: string; qty: number; priceCents: number }[]) {
              const coral = bySku.get(item.sku);
              items.push([
                event.orderId, item.sku, coral?.name ?? item.sku, coral?.category ?? "other",
                item.qty, item.priceCents,
              ]);
            }
            break;
          case "message_in":
            messages.push([event.customerId ?? null, "in", event.platform, meta.intent ?? null, null, null, meta.preview ?? "", event.ts]);
            break;
          case "message_answered":
            if (meta.autoFirstResponse) {
              messages.push([
                event.customerId ?? null, "out", "system", null,
                String(meta.autoFirstResponse).replace("template:", ""), null,
                "(codified template reply)", event.ts,
              ]);
            }
            break;
          case "request_received":
            requests.push([meta.requestId, event.customerId, meta.kind, `customer asked: ${meta.kind}`, "open", event.ts]);
            break;
          case "case_opened":
            cases.push([
              `CASE-${weekOf(event.ts)}-${++caseSequence}`, meta.kind ?? "other", event.customerId, "open",
              "DOA claim — evidence assembled, awaiting decision",
              JSON.stringify([{ label: "auto first response", detail: String(meta.autoFirstResponse ?? "") }]),
              event.ts,
            ]);
            break;
          case "campaign_sent":
            campaigns.push([
              meta.campaignId, meta.phase, "arbitrary synthetic recipients", meta.recipients ?? 0,
              JSON.stringify({ body: meta.preview ?? "" }), event.ts, event.ts,
            ]);
            break;
          case "message_out":
            if (meta.campaignId) {
              sends.push([meta.campaignId, event.customerId, meta.channel === "sms" ? "sms" : "email", event.ts]);
            }
            break;
          case "label_purchased":
            shipments.push([
              meta.shipmentId, event.customerId, weekOf(event.ts), "purchased", meta.items ?? 0,
              meta.weightLb ?? null, meta.destination ?? null, meta.pack ?? "none", event.amountCents, event.ts,
            ]);
            break;
          case "label_voided":
            shipmentUpdates.push({
              kind: "void", customerId: event.customerId!, week: weekOf(event.ts),
              ts: event.ts, reason: String(meta.reason ?? ""),
            });
            break;
          case "order_shipped":
            shipmentUpdates.push({ kind: "shipped", customerId: event.customerId!, week: weekOf(event.ts), ts: event.ts });
            break;
          case "order_delivered":
            shipmentUpdates.push({ kind: "delivered", customerId: event.customerId!, week: weekOf(event.ts), ts: event.ts });
            break;
        }
      }
    }

    await batchInsert(db, "orders",
      ["platform", "external_id", "customer_id", "status", "total_cents", "discount_code", "destination_city", "address_suspect", "ordered_at"],
      orders, "ON CONFLICT (platform, external_id) DO NOTHING");
    await db.query(`CREATE TEMP TABLE tmp_reset_items
      (external_id TEXT, sku TEXT, name TEXT, category TEXT, qty INT, price_cents BIGINT) ON COMMIT DROP`);
    await batchInsert(db, "tmp_reset_items", ["external_id", "sku", "name", "category", "qty", "price_cents"], items, "");
    await db.query(`INSERT INTO order_items (order_id, sku, name, category, qty, price_cents)
      SELECT orders.id, items.sku, items.name, items.category, items.qty, items.price_cents
      FROM tmp_reset_items items JOIN orders ON orders.external_id = items.external_id`);

    await batchInsert(db, "shipments",
      ["shipment_code", "customer_id", "ship_week", "status", "items", "weight_lb", "destination_city", "pack", "label_cost_cents", "purchased_at"],
      shipments, "ON CONFLICT (shipment_code) DO NOTHING");
    for (const update of shipmentUpdates) {
      if (update.kind === "void") {
        await db.query(`UPDATE shipments SET status='voided', voided_at=$3, void_reason=$4
          WHERE customer_id=$1 AND ship_week=$2 AND status='purchased'`,
        [update.customerId, update.week, update.ts, update.reason]);
      } else if (update.kind === "shipped") {
        await db.query(`UPDATE shipments SET status='shipped', shipped_at=$3
          WHERE customer_id=$1 AND ship_week=$2 AND status='purchased'`,
        [update.customerId, update.week, update.ts]);
      } else {
        await db.query(`UPDATE shipments SET status='delivered', delivered_at=$3
          WHERE customer_id=$1 AND ship_week=$2 AND status='shipped'`,
        [update.customerId, update.week, update.ts]);
      }
    }

    await batchInsert(db, "messages",
      ["customer_id", "direction", "platform", "intent", "template_id", "campaign_id", "preview", "at"], messages, "");
    await batchInsert(db, "requests",
      ["request_code", "customer_id", "kind", "detail", "status", "received_at"], requests,
      "ON CONFLICT (request_code) DO NOTHING");
    await batchInsert(db, "cases",
      ["case_code", "kind", "customer_id", "status", "summary", "evidence", "created_at"], cases,
      "ON CONFLICT (case_code) DO NOTHING");
    await batchInsert(db, "campaigns",
      ["campaign_code", "phase", "audience_criteria", "audience_count", "preview", "scheduled_at", "sent_at"],
      campaigns, "ON CONFLICT (campaign_code) DO NOTHING");
    await db.query(`CREATE TEMP TABLE tmp_reset_sends
      (campaign_code TEXT, customer_id BIGINT, channel TEXT, sent_at TIMESTAMPTZ) ON COMMIT DROP`);
    await batchInsert(db, "tmp_reset_sends", ["campaign_code", "customer_id", "channel", "sent_at"], sends, "");
    await db.query(`INSERT INTO campaign_sends (campaign_id, customer_id, channel, sent_at)
      SELECT campaigns.id, sends.customer_id, sends.channel, sends.sent_at
      FROM tmp_reset_sends sends
      JOIN campaigns ON campaigns.campaign_code = sends.campaign_code
      JOIN customers ON customers.id = sends.customer_id`);

    // Age history relative to the SYNTHETIC horizon, never the wall clock:
    // everything before the horizon's previous cycle is settled history, while
    // the demo cycle's orders stay actionable. (The old `now() - 7 days` rule
    // silently marked the W28 merge anchors shipped for anyone reseeding after
    // Jul 25, emptying the flagship merge demo.)
    const historyCutoff = new Date(ANCHOR + (nowWeek - 1) * WEEK_MS);
    await db.query("UPDATE orders SET status='shipped' WHERE ordered_at < $1::timestamptz", [historyCutoff]);
    await db.query(`UPDATE customers SET
        total_orders = aggregate.order_count,
        total_spent_cents = aggregate.spent_cents,
        first_order_at = aggregate.first_order,
        last_order_at = aggregate.last_order,
        updated_at = now()
      FROM (
        SELECT customer_id, count(*) order_count, sum(total_cents) spent_cents,
          min(ordered_at) first_order, max(ordered_at) last_order
        FROM orders GROUP BY customer_id
      ) aggregate
      WHERE aggregate.customer_id = customers.id`);

    const result = await db.query(`SELECT
      (SELECT count(*)::int FROM customers) customers,
      (SELECT count(*)::int FROM customer_identities) identities,
      (SELECT count(*)::int FROM orders) orders,
      (SELECT count(*)::int FROM order_items) items,
      (SELECT count(*)::int FROM shipments) shipments,
      (SELECT count(*)::int FROM messages) messages,
      (SELECT count(*)::int FROM requests) requests,
      (SELECT count(*)::int FROM cases) cases,
      (SELECT count(*)::int FROM campaigns) campaigns,
      (SELECT count(*)::int FROM campaign_sends) sends`);
    const summary = Object.fromEntries(
      Object.entries(result.rows[0] as Record<string, number | string>).map(([key, value]) => [key, Number(value)]),
    ) as DemoSeedSummary;

    await db.query("COMMIT");
    return summary;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
