/**
 * Seed Postgres OLTP truth by replaying the SAME deterministic generator
 * output that fills ClickHouse — customers/identities from the pool, then
 * orders, shipments, requests, cases, campaigns, messages from events.
 *
 *   npx tsx scripts/pg-seed.ts [--weeks 10] [--wipe]
 */
import { Pool } from "pg";
import { CATALOG } from "../src/lib/synth/catalog";
import { CUSTOMERS } from "../src/lib/synth/customers";
import { generateBackfill } from "../src/lib/synth/generator";
import { pgPool, getCustomer, mergeCandidates } from "../src/lib/store/postgres";
import type { ReefEvent } from "../src/lib/datastore";

process.loadEnvFile(".env.local");

const WEEK_MS = 7 * 24 * 3600_000;
const ANCHOR = Date.UTC(2026, 0, 1);
const weekOf = (ts: string) => `W${Math.floor((Date.parse(ts) - ANCHOR) / WEEK_MS)}`;
const bySku = new Map(CATALOG.map((c) => [c.sku, c]));

/** Multi-row INSERT in batches (network round-trips, not row loops). */
async function batchInsert(db: Pool, table: string, cols: string[], rows: unknown[][],
  conflict = "ON CONFLICT DO NOTHING") {
  const B = 400;
  for (let i = 0; i < rows.length; i += B) {
    const slice = rows.slice(i, i + B);
    const values: unknown[] = [];
    const tuples = slice.map((r, ri) =>
      `(${r.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(",")})`);
    slice.forEach((r) => values.push(...r));
    await db.query(
      `INSERT INTO ${table} (${cols.join(",")}) VALUES ${tuples.join(",")} ${conflict}`, values);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const weeks = Number(args[args.indexOf("--weeks") + 1]) || 10;
  const db = pgPool();

  if (args.includes("--wipe")) {
    await db.query(`TRUNCATE campaign_sends, campaigns, cases, requests, messages,
      order_items, orders, shipments, customer_identities, customers, action_log,
      report_snapshots RESTART IDENTITY CASCADE`);
    console.log("wiped");
  }

  const to = new Date();
  const from = new Date(to.getTime() - weeks * WEEK_MS);
  const nowWeek = Math.floor((to.getTime() - ANCHOR) / WEEK_MS);

  // ---- customers + identities (pool members who have joined by now)
  const joined = CUSTOMERS.filter((c) => c.joinWeek <= nowWeek);
  await batchInsert(db, "customers",
    ["id", "primary_email", "primary_phone", "primary_name", "tier", "preferences"],
    joined.map((c) => [c.id, c.email, c.phone ?? null, c.displayName, c.tier,
      JSON.stringify({ categories: c.prefCategories, contact: c.contact })]));
  await batchInsert(db, "customer_identities",
    ["customer_id", "platform", "external_handle", "external_email", "external_phone", "external_name"],
    joined.flatMap((c) => c.platforms.map((p) =>
      [c.id, p.platform, p.handle, p.email, p.phone ?? null, c.displayName])));
  await db.query(`SELECT setval('customers_id_seq', (SELECT max(id) FROM customers))`);
  console.log(`customers: ${joined.length}, identities: ${joined.reduce((s, c) => s + c.platforms.length, 0)}`);

  // ---- replay events
  const orders: unknown[][] = [], items: unknown[][] = [], msgs: unknown[][] = [];
  const reqs: unknown[][] = [], cases: unknown[][] = [], campaigns: unknown[][] = [];
  const sends: unknown[][] = [], ships: unknown[][] = [];
  const shipUpdates: { kind: "void" | "shipped" | "delivered"; customerId: number; week: string; ts: string; reason?: string }[] = [];
  let caseSeq = 0;

  for (const chunk of generateBackfill(from.toISOString(), to.toISOString(), 1)) {
    for (const e of chunk as ReefEvent[]) {
      const m = (e.meta ?? {}) as Record<string, any>;
      switch (e.type) {
        case "order_placed": {
          orders.push([e.platform, e.orderId, e.customerId, "paid", e.amountCents,
            m.discountCode ?? null, m.destination ?? null, !!m.addressSuspect, e.ts]);
          for (const it of (m.items ?? []) as { sku: string; qty: number; priceCents: number }[]) {
            const cat = bySku.get(it.sku);
            items.push([e.orderId, it.sku, cat?.name ?? it.sku, cat?.category ?? "other", it.qty, it.priceCents]);
          }
          break;
        }
        case "message_in":
          msgs.push([e.customerId ?? null, "in", e.platform, m.intent ?? null, null, null, m.preview ?? "", e.ts]);
          break;
        case "message_answered":
          if (m.autoFirstResponse) msgs.push([e.customerId ?? null, "out", "system", null,
            String(m.autoFirstResponse).replace("template:", ""), null, "(codified template reply)", e.ts]);
          break;
        case "request_received":
          reqs.push([m.requestId, e.customerId, m.kind, `customer asked: ${m.kind}`, "open", e.ts]);
          break;
        case "case_opened":
          cases.push([`CASE-${weekOf(e.ts)}-${++caseSeq}`, m.kind ?? "other", e.customerId, "open",
            "DOA claim — evidence assembled, awaiting decision",
            JSON.stringify([{ label: "auto first response", detail: String(m.autoFirstResponse ?? "") }]), e.ts]);
          break;
        case "campaign_sent":
          campaigns.push([m.campaignId, m.phase, "tier ≤ 3, active customers", m.recipients ?? 0,
            JSON.stringify({ body: m.preview ?? "" }), e.ts, e.ts]);
          break;
        case "message_out":
          if (m.campaignId) sends.push([m.campaignId, e.customerId, m.channel === "sms" ? "sms" : "email", e.ts]);
          break;
        case "label_purchased":
          ships.push([m.shipmentId, e.customerId, weekOf(e.ts), "purchased", m.items ?? 0,
            m.weightLb ?? null, m.destination ?? null, m.pack ?? "none", e.amountCents, e.ts]);
          break;
        case "label_voided":
          shipUpdates.push({ kind: "void", customerId: e.customerId!, week: weekOf(e.ts), ts: e.ts, reason: String(m.reason ?? "") });
          break;
        case "order_shipped":
          shipUpdates.push({ kind: "shipped", customerId: e.customerId!, week: weekOf(e.ts), ts: e.ts });
          break;
        case "order_delivered":
          shipUpdates.push({ kind: "delivered", customerId: e.customerId!, week: weekOf(e.ts), ts: e.ts });
          break;
      }
    }
  }

  await batchInsert(db, "orders",
    ["platform", "external_id", "customer_id", "status", "total_cents", "discount_code",
      "destination_city", "address_suspect", "ordered_at"], orders,
    "ON CONFLICT (platform, external_id) DO NOTHING");
  // items reference orders by external id — resolve in one join pass
  await db.query(`CREATE TEMP TABLE tmp_items
    (external_id TEXT, sku TEXT, name TEXT, category TEXT, qty INT, price_cents BIGINT)`);
  await batchInsert(db, "tmp_items", ["external_id", "sku", "name", "category", "qty", "price_cents"], items, "");
  await db.query(`INSERT INTO order_items (order_id, sku, name, category, qty, price_cents)
    SELECT o.id, t.sku, t.name, t.category, t.qty, t.price_cents
    FROM tmp_items t JOIN orders o ON o.external_id = t.external_id`);

  await batchInsert(db, "shipments",
    ["shipment_code", "customer_id", "ship_week", "status", "items", "weight_lb",
      "destination_city", "pack", "label_cost_cents", "purchased_at"], ships,
    "ON CONFLICT (shipment_code) DO NOTHING");
  for (const u of shipUpdates) {
    if (u.kind === "void") await db.query(
      `UPDATE shipments SET status='voided', voided_at=$3, void_reason=$4
       WHERE customer_id=$1 AND ship_week=$2 AND status='purchased'`,
      [u.customerId, u.week, u.ts, u.reason]);
    else if (u.kind === "shipped") await db.query(
      `UPDATE shipments SET status='shipped', shipped_at=$3
       WHERE customer_id=$1 AND ship_week=$2 AND status='purchased'`,
      [u.customerId, u.week, u.ts]);
    else await db.query(
      `UPDATE shipments SET status='delivered', delivered_at=$3
       WHERE customer_id=$1 AND ship_week=$2 AND status='shipped'`,
      [u.customerId, u.week, u.ts]);
  }

  await batchInsert(db, "messages",
    ["customer_id", "direction", "platform", "intent", "template_id", "campaign_id", "preview", "at"], msgs, "");
  await batchInsert(db, "requests",
    ["request_code", "customer_id", "kind", "detail", "status", "received_at"], reqs,
    "ON CONFLICT (request_code) DO NOTHING");
  await batchInsert(db, "cases",
    ["case_code", "kind", "customer_id", "status", "summary", "evidence", "created_at"], cases,
    "ON CONFLICT (case_code) DO NOTHING");
  await batchInsert(db, "campaigns",
    ["campaign_code", "phase", "audience_criteria", "audience_count", "preview", "scheduled_at", "sent_at"],
    campaigns, "ON CONFLICT (campaign_code) DO NOTHING");
  await db.query(`CREATE TEMP TABLE tmp_sends (campaign_code TEXT, customer_id BIGINT, channel TEXT, sent_at TIMESTAMPTZ)`);
  await batchInsert(db, "tmp_sends", ["campaign_code", "customer_id", "channel", "sent_at"], sends, "");
  await db.query(`INSERT INTO campaign_sends (campaign_id, customer_id, channel, sent_at)
    SELECT c.id, t.customer_id, t.channel, t.sent_at FROM tmp_sends t
    JOIN campaigns c ON c.campaign_code = t.campaign_code
    JOIN customers cu ON cu.id = t.customer_id`);

  // orders older than the current cycle are long shipped; refresh customer totals
  await db.query(`UPDATE orders SET status='shipped' WHERE ordered_at < now() - interval '7 days'`);
  await db.query(`UPDATE customers c SET
      total_orders = a.n, total_spent_cents = a.cents,
      first_order_at = a.first, last_order_at = a.last, updated_at = now()
    FROM (SELECT customer_id, count(*) n, sum(total_cents) cents,
                 min(ordered_at) first, max(ordered_at) last
          FROM orders GROUP BY customer_id) a
    WHERE a.customer_id = c.id`);

  // ---- verify
  const counts = await db.query(`SELECT
    (SELECT count(*) FROM customers) customers, (SELECT count(*) FROM customer_identities) identities,
    (SELECT count(*) FROM orders) orders, (SELECT count(*) FROM order_items) items,
    (SELECT count(*) FROM shipments) shipments, (SELECT count(*) FROM messages) messages,
    (SELECT count(*) FROM requests) requests, (SELECT count(*) FROM cases) cases,
    (SELECT count(*) FROM campaigns) campaigns, (SELECT count(*) FROM campaign_sends) sends`);
  console.table(counts.rows);

  // customer-360 spot check: a two-platform customer with orders
  const sample = await db.query(`SELECT c.id FROM customers c
    JOIN customer_identities i ON i.customer_id = c.id
    JOIN orders o ON o.customer_id = c.id
    GROUP BY c.id HAVING count(DISTINCT i.platform) >= 2 AND count(DISTINCT o.id) >= 3
    ORDER BY c.id LIMIT 1`);
  if (sample.rows[0]) {
    const c360 = await getCustomer(db, sample.rows[0].id);
    console.log("customer-360 sample:", JSON.stringify({
      ref: c360!.ref, emails: c360!.identity.emails, accounts: c360!.identity.accounts,
      totals: c360!.totals, orders: c360!.orders.length, products: c360!.products.length,
      messages: c360!.messages.length,
    }, null, 2));
    const merge = await mergeCandidates(db, sample.rows[0].id, "web");
    console.log("merge candidates for sample (non-web unshipped):", merge);
  }

  await db.end();
  console.log("SEED DONE");
}

main().catch((e) => { console.error(e); process.exit(1); });
