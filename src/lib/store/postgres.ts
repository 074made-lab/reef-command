/**
 * Postgres side of Seam A — OLTP truth: customers (the 360), orders,
 * shipments, requests, cases, campaigns, audit log.
 *
 * Every consequential write here should be followed by an event emit to
 * ClickHouse (the caller's job via the composed DataStore) so analytics
 * stays live — that pairing is the OLTP→OLAP loop the demo shows.
 *
 * Env: POSTGRES_URL (.env.local).
 */

import { Pool, type PoolClient } from "pg";
import type { CoralCategory, CustomerRef, OrderSummary, Platform } from "../protocol";
import type { Customer360, MatchResult } from "../datastore";

let pool: Pool | null = null;

export function pgPool(): Pool {
  if (pool) return pool;
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error("POSTGRES_URL is not set (.env.local)");
  pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 5 });
  return pool;
}

// ---------------------------------------------------------------- matching

/** Match priority (strongest first): exact email → phone → name.
 *  Checks BOTH customers.primary_* and customer_identities.external_*. */
export async function matchCustomer(
  db: Pool | PoolClient,
  contact: { email?: string; phone?: string; name?: string },
): Promise<MatchResult | null> {
  const email = contact.email?.trim().toLowerCase() || null;
  const phone = contact.phone?.replace(/[^+\d]/g, "") || null;
  const name = contact.name?.trim().toLowerCase() || null;

  const unique = async (sql: string, arg: string) => {
    const r = await db.query(sql, [arg]);
    return r.rows.length === 1 ? Number(r.rows[0].id) : null;   // 0 = no match; >1 = ambiguous → human
  };
  if (email) {
    const id = await unique(
      `SELECT DISTINCT c.id FROM customers c
       LEFT JOIN customer_identities i ON i.customer_id = c.id
       WHERE lower(c.primary_email) = $1 OR lower(i.external_email) = $1
       LIMIT 2`, email);
    if (id) return { customerId: id, confidence: 1.0, matchedOn: "email" };
  }
  if (phone) {
    const id = await unique(
      `SELECT DISTINCT c.id FROM customers c
       LEFT JOIN customer_identities i ON i.customer_id = c.id
       WHERE c.primary_phone = $1 OR i.external_phone = $1
       LIMIT 2`, phone);
    if (id) return { customerId: id, confidence: 0.9, matchedOn: "phone" };
  }
  if (name && name.length >= 4) {
    const id = await unique(
      `SELECT DISTINCT c.id FROM customers c
       LEFT JOIN customer_identities i ON i.customer_id = c.id
       WHERE lower(c.primary_name) = $1 OR lower(i.external_name) = $1
       LIMIT 2`, name);
    if (id) return { customerId: id, confidence: 0.6, matchedOn: "name" };
  }
  return null;
}

// ---------------------------------------------------------------- customer 360

const refRow = (r: Record<string, unknown>): CustomerRef => ({
  customerId: Number(r.id),
  displayName: String(r.primary_name ?? "unknown"),
  tier: Number(r.tier) as 1 | 2 | 3 | 4,
  platforms: (r.platforms as Platform[] | null) ?? [],
});

/** Task 1's single read: everything the business knows about a customer. */
export async function getCustomer(db: Pool | PoolClient, customerId: number): Promise<Customer360 | null> {
  const c = (await db.query(
    `SELECT c.*, coalesce(array_agg(DISTINCT i.platform) FILTER (WHERE i.platform IS NOT NULL), '{}') AS platforms,
            coalesce(array_agg(DISTINCT i.external_email) FILTER (WHERE i.external_email IS NOT NULL), '{}') AS alt_emails,
            coalesce(array_agg(DISTINCT i.external_phone) FILTER (WHERE i.external_phone IS NOT NULL), '{}') AS alt_phones,
            coalesce(json_agg(DISTINCT jsonb_build_object('platform', i.platform, 'handle', i.external_handle))
                     FILTER (WHERE i.id IS NOT NULL), '[]') AS accounts
     FROM customers c LEFT JOIN customer_identities i ON i.customer_id = c.id
     WHERE c.id = $1 GROUP BY c.id`, [customerId])).rows[0];
  if (!c) return null;

  const orders = (await db.query(
    `SELECT o.*, coalesce(json_agg(json_build_object(
        'sku', oi.sku, 'name', oi.name, 'category', oi.category,
        'qty', oi.qty, 'priceCents', oi.price_cents) ORDER BY oi.id)
        FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
     FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.customer_id = $1 GROUP BY o.id ORDER BY o.ordered_at DESC LIMIT 50`, [customerId])).rows;

  const products = (await db.query(
    `SELECT oi.sku, max(oi.name) AS name, max(oi.category) AS category,
            sum(oi.qty)::int AS qty, max(o.ordered_at) AS last_at
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.customer_id = $1 GROUP BY oi.sku ORDER BY last_at DESC`, [customerId])).rows;

  const messages = (await db.query(
    `SELECT at, direction, preview, campaign_id FROM messages
     WHERE customer_id = $1 ORDER BY at DESC LIMIT 30`, [customerId])).rows;

  const requests = (await db.query(
    `SELECT request_code, kind, detail, received_at FROM requests
     WHERE customer_id = $1 ORDER BY received_at DESC LIMIT 20`, [customerId])).rows;

  const prefs = (c.preferences ?? {}) as { categories?: CoralCategory[]; contact?: "email" | "sms" | "both" };
  return {
    ref: refRow(c),
    identity: {
      name: String(c.primary_name ?? ""),
      emails: [c.primary_email, ...(c.alt_emails as string[])].filter(Boolean) as string[],
      phones: [c.primary_phone, ...(c.alt_phones as string[])].filter(Boolean) as string[],
      accounts: c.accounts as { platform: Platform; handle: string }[],
    },
    preferences: { categories: prefs.categories ?? [], contact: prefs.contact ?? "email" },
    totals: {
      orders: Number(c.total_orders), spentCents: Number(c.total_spent_cents),
      firstOrderAt: c.first_order_at?.toISOString?.(), lastOrderAt: c.last_order_at?.toISOString?.(),
    },
    orders: orders.map(orderRow),
    products: products.map((p) => ({
      sku: p.sku, name: p.name, category: p.category as CoralCategory,
      qty: p.qty, lastAt: p.last_at.toISOString(),
    })),
    messages: messages.map((m) => ({
      at: m.at.toISOString(), direction: m.direction, preview: m.preview,
      campaignId: m.campaign_id ?? undefined,
    })),
    requests: requests.map((r) => ({
      requestId: r.request_code, kind: r.kind, customer: refRow(c),
      orderIds: [], detail: r.detail, receivedAt: r.received_at.toISOString(),
    })),
  };
}

function orderRow(o: Record<string, unknown>): OrderSummary {
  return {
    orderId: String(o.external_id),
    platform: o.platform as OrderSummary["platform"],
    customer: { customerId: Number(o.customer_id), displayName: "", tier: 4, platforms: [] },
    items: (o.items as OrderSummary["items"]) ?? [],
    totalCents: Number(o.total_cents),
    destination: String(o.destination_city ?? ""),
    status: o.status as OrderSummary["status"],
    shipWeek: String(o.ship_week ?? ""),
  };
}

// ---------------------------------------------------------------- merge

/** Unshipped orders on OTHER platforms for the same customer — the merge signal. */
export async function mergeCandidates(db: Pool | PoolClient, customerId: number, platform: Platform) {
  const r = await db.query(
    `SELECT external_id, platform, total_cents, ordered_at FROM orders
     WHERE customer_id = $1 AND platform <> $2
       AND status IN ('pending','paid') AND shipment_id IS NULL
     ORDER BY ordered_at DESC`, [customerId, platform]);
  return r.rows;
}
