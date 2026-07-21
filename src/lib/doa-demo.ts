/**
 * Public-safe DOA workflow fixture.
 *
 * The names, counts, identifiers, customer band, amounts, and resolution are
 * invented for the hackathon. Nothing here is TIA Coral policy, customer-value
 * logic, identity matching, profitability, or a production operations rule.
 */
import type { ClickHouseClient } from "@clickhouse/client";
import type { Pool, PoolClient } from "pg";
import type { DoaReviewPlan } from "./protocol";
import { insertEvents, queryRows } from "./store/clickhouse";

export const DEMO_DOA_CUSTOMER_ID = 900_001;
export const DEMO_DOA_CASE_ID = "DOA-DEMO-2401";
export const DEMO_DOA_ORDER_ID = "WEB-DEMO-4812";
export const DEMO_DOA_OLD_SHIPMENT_ID = "SHP-DEMO-4812";
export const DEMO_DOA_NEW_SHIPMENT_ID = "SHP-DEMO-4812-R1";

export const DEMO_DOA_REVIEW: DoaReviewPlan = {
  caseId: DEMO_DOA_CASE_ID,
  reviewWindow: "Review within 24 hours",
  customer: {
    displayName: "reef_keeper_17",
    band: 2,
    platforms: ["web", "auction"],
  },
  claimedItems: ["Demo coral A", "Demo coral B", "Demo coral C"],
  history: {
    orders: 8,
    coralItems: 14,
    priorDoa: 1,
    priorRefunds: 0,
    priorCredits: 1,
    priorReplacements: 0,
  },
  evidence: [
    { label: "Delivery", detail: "Synthetic order marked delivered today" },
    { label: "Claim", detail: "Three affected items listed in one intake" },
    { label: "Photos", detail: "Mock evidence batch attached and ready" },
  ],
  shipment: {
    orderId: DEMO_DOA_ORDER_ID,
    shipWhen: "Tomorrow",
    destination: "Raleigh, NC",
    existingItems: 2,
    currentLabelId: "LBL-DEMO-992",
    currentLabelCostCents: 2875,
    updatedLabelId: "LBL-DEMO-993",
    updatedLabelCostCents: 3140,
  },
  replyDraft:
    "We reviewed your demo claim and approved three replacement corals. They are being added to order WEB-DEMO-4812 scheduled for tomorrow. The shipping label and packing list have been updated. This is a synthetic demo message.",
};

const replacementRows = [
  ["DEMO-RPL-1", "Demo replacement A"],
  ["DEMO-RPL-2", "Demo replacement B"],
  ["DEMO-RPL-3", "Demo replacement C"],
] as const;

async function tx<T>(pg: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pg.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Reset only the named synthetic demo rows so the same judge flow can replay. */
export async function stageDemoDoaReview(pg: Pool, nowIso: string): Promise<void> {
  await tx(pg, async (db) => {
    await db.query(
      `INSERT INTO customers
         (id, primary_email, primary_name, tier, total_orders, total_spent_cents,
          first_order_at, last_order_at, preferences)
       VALUES ($1, 'reef_keeper_17@example.test', $2, $3, $4, 126400,
          $5::timestamptz - interval '11 months', $5, '{"contact":"email"}'::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         primary_email = EXCLUDED.primary_email,
         primary_name = EXCLUDED.primary_name,
         tier = EXCLUDED.tier,
         total_orders = EXCLUDED.total_orders,
         total_spent_cents = EXCLUDED.total_spent_cents,
         last_order_at = EXCLUDED.last_order_at,
         updated_at = $5`,
      [DEMO_DOA_CUSTOMER_ID, DEMO_DOA_REVIEW.customer.displayName,
        DEMO_DOA_REVIEW.customer.band, DEMO_DOA_REVIEW.history.orders, nowIso],
    );
    await db.query(
      `INSERT INTO customer_identities
         (customer_id, platform, external_handle, external_email, external_name)
       VALUES ($1, 'web', 'demo-reef-keeper-17', 'reef_keeper_17@example.test', $2)
       ON CONFLICT (platform, external_handle) DO UPDATE SET
         customer_id = EXCLUDED.customer_id, last_seen_at = $3`,
      [DEMO_DOA_CUSTOMER_ID, DEMO_DOA_REVIEW.customer.displayName, nowIso],
    );
    await db.query(
      `INSERT INTO shipments
         (shipment_code, customer_id, ship_week, status, items, weight_lb,
          destination_city, pack, label_cost_cents, purchased_at)
       VALUES ($1, $2, 'DEMO-TOMORROW', 'purchased', $3, 2.4, $4, 'none', $5, $6)
       ON CONFLICT (shipment_code) DO UPDATE SET
         status = 'purchased', items = EXCLUDED.items,
         destination_city = EXCLUDED.destination_city,
         label_cost_cents = EXCLUDED.label_cost_cents,
         purchased_at = EXCLUDED.purchased_at,
         voided_at = NULL, void_reason = NULL`,
      [DEMO_DOA_OLD_SHIPMENT_ID, DEMO_DOA_CUSTOMER_ID,
        DEMO_DOA_REVIEW.shipment.existingItems, DEMO_DOA_REVIEW.shipment.destination,
        DEMO_DOA_REVIEW.shipment.currentLabelCostCents, nowIso],
    );
    await db.query(
      `INSERT INTO shipments
         (shipment_code, customer_id, ship_week, status, items, weight_lb,
          destination_city, pack, label_cost_cents)
       VALUES ($1, $2, 'DEMO-TOMORROW', 'planned', $3, 4.2, $4, 'none', $5)
       ON CONFLICT (shipment_code) DO UPDATE SET
         status = 'planned', items = EXCLUDED.items,
         destination_city = EXCLUDED.destination_city,
         label_cost_cents = EXCLUDED.label_cost_cents,
         purchased_at = NULL, voided_at = NULL, void_reason = NULL`,
      [DEMO_DOA_NEW_SHIPMENT_ID, DEMO_DOA_CUSTOMER_ID,
        DEMO_DOA_REVIEW.shipment.existingItems + DEMO_DOA_REVIEW.claimedItems.length,
        DEMO_DOA_REVIEW.shipment.destination, DEMO_DOA_REVIEW.shipment.updatedLabelCostCents],
    );
    await db.query(
      `INSERT INTO orders
         (platform, external_id, customer_id, status, total_cents,
          destination_city, shipment_id, ordered_at, updated_at)
       VALUES ('web', $1, $2, 'labeled', 18400, $3,
          (SELECT id FROM shipments WHERE shipment_code = $4),
          $5::timestamptz - interval '2 days', $5)
       ON CONFLICT (platform, external_id) DO UPDATE SET
         customer_id = EXCLUDED.customer_id,
         status = 'labeled',
         destination_city = EXCLUDED.destination_city,
         shipment_id = EXCLUDED.shipment_id,
         updated_at = EXCLUDED.updated_at`,
      [DEMO_DOA_ORDER_ID, DEMO_DOA_CUSTOMER_ID, DEMO_DOA_REVIEW.shipment.destination,
        DEMO_DOA_OLD_SHIPMENT_ID, nowIso],
    );
    await db.query(
      `DELETE FROM order_items
       WHERE order_id = (SELECT id FROM orders WHERE platform = 'web' AND external_id = $1)
         AND sku LIKE 'DEMO-RPL-%'`,
      [DEMO_DOA_ORDER_ID],
    );
    for (const [sku, name] of [["DEMO-OPEN-1", "Tomorrow box item A"], ["DEMO-OPEN-2", "Tomorrow box item B"]]) {
      await db.query(
        `INSERT INTO order_items (order_id, sku, name, category, qty, price_cents)
         SELECT id, $2, $3, 'other', 1, 9200 FROM orders
         WHERE platform = 'web' AND external_id = $1
           AND NOT EXISTS (
             SELECT 1 FROM order_items oi
             WHERE oi.order_id = orders.id AND oi.sku = $2
           )`,
        [DEMO_DOA_ORDER_ID, sku, name],
      );
    }
    await db.query(
      `INSERT INTO cases
         (case_code, kind, customer_id, order_id, status, summary, evidence, created_at)
       VALUES ($1, 'doa_claim', $2,
         (SELECT id FROM orders WHERE platform = 'web' AND external_id = $3),
         'open', 'Synthetic three-item DOA review for tomorrow shipment', $4, $5)
       ON CONFLICT (case_code) DO UPDATE SET
         status = 'open', summary = EXCLUDED.summary, evidence = EXCLUDED.evidence,
         decided_at = NULL, decided_by = NULL`,
      [DEMO_DOA_CASE_ID, DEMO_DOA_CUSTOMER_ID, DEMO_DOA_ORDER_ID,
        JSON.stringify(DEMO_DOA_REVIEW.evidence), nowIso],
    );
  });
}

async function ensureEvent(
  ch: ClickHouseClient,
  type: "case_decided" | "label_voided" | "label_purchased" | "action_executed",
  eventId: string,
  amountCents: number,
  meta: Record<string, unknown>,
): Promise<void> {
  const found = await queryRows<{ n: string }>(ch,
    `SELECT count() AS n FROM events WHERE type = {type:String} AND order_id = {id:String}`,
    { type, id: eventId });
  if (Number(found[0]?.n ?? 0) > 0) return;
  await insertEvents(ch, [{
    ts: new Date().toISOString(),
    type,
    platform: "system",
    customerId: DEMO_DOA_CUSTOMER_ID,
    orderId: eventId,
    amountCents,
    meta: { ...meta, synthetic: true },
  }]);
}

async function auditOnce(pg: Pool, approvalId: string, taskId: string,
  approvedBy: string, outcome: string, extra: Record<string, unknown> = {}): Promise<void> {
  await pg.query(
    `INSERT INTO action_log (task_id, risk, payload, approved_by, outcome)
     SELECT $1, 'gated', $2::jsonb, $3, $4
     WHERE NOT EXISTS (
       SELECT 1 FROM action_log
       WHERE task_id = $1 AND payload->>'approvalId' = $5
     )`,
    [taskId, JSON.stringify({ approvalId, caseId: DEMO_DOA_CASE_ID, ...extra }),
      approvedBy, outcome, approvalId],
  );
}

export async function decideDemoDoaClaim(pg: Pool, ch: ClickHouseClient,
  approvalId: string, approvedBy: string, nowIso: string): Promise<void> {
  await pg.query(
    `UPDATE cases SET status = 'approved', decided_at = $2, decided_by = $3
     WHERE case_code = $1`,
    [DEMO_DOA_CASE_ID, nowIso, approvedBy],
  );
  await auditOnce(pg, approvalId, "approve-doa-resolution", approvedBy,
    "three-replacements-and-updated-label-approved", {
      replacementCount: DEMO_DOA_REVIEW.claimedItems.length,
      updatedLabelCostCents: DEMO_DOA_REVIEW.shipment.updatedLabelCostCents,
    });
  await ensureEvent(ch, "case_decided", `${approvalId}:case`, 0, {
    caseId: DEMO_DOA_CASE_ID, decision: "approved", approvedBy,
  });
}

export async function recordDemoReplacements(pg: Pool, ch: ClickHouseClient,
  approvalId: string, approvedBy: string): Promise<void> {
  for (const [sku, name] of replacementRows) {
    await pg.query(
      `INSERT INTO order_items (order_id, sku, name, category, qty, price_cents)
       SELECT id, $2, $3, 'other', 1, 0 FROM orders
       WHERE platform = 'web' AND external_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM order_items oi
           WHERE oi.order_id = orders.id AND oi.sku = $2
         )`,
      [DEMO_DOA_ORDER_ID, sku, name],
    );
  }
  await auditOnce(pg, approvalId, "record-doa-replacements", approvedBy,
    "three-replacements-recorded", { orderId: DEMO_DOA_ORDER_ID });
  await ensureEvent(ch, "action_executed", `${approvalId}:replacements`, 0, {
    action: "replacements_recorded", count: replacementRows.length,
    orderId: DEMO_DOA_ORDER_ID,
  });
}

export async function voidDemoDoaLabel(pg: Pool, ch: ClickHouseClient,
  approvalId: string, approvedBy: string, nowIso: string): Promise<void> {
  await pg.query(
    `UPDATE shipments SET status = 'voided', voided_at = $2,
       void_reason = 'synthetic approved DOA shipment rebuild'
     WHERE shipment_code = $1`,
    [DEMO_DOA_OLD_SHIPMENT_ID, nowIso],
  );
  await auditOnce(pg, approvalId, "void-doa-label", approvedBy,
    "old-label-voided", { shipmentId: DEMO_DOA_OLD_SHIPMENT_ID });
  await ensureEvent(ch, "label_voided", `${approvalId}:old-label`,
    DEMO_DOA_REVIEW.shipment.currentLabelCostCents, {
      caseId: DEMO_DOA_CASE_ID,
      shipmentId: DEMO_DOA_OLD_SHIPMENT_ID,
      labelId: DEMO_DOA_REVIEW.shipment.currentLabelId,
    });
}

export async function rebuildDemoPackingList(pg: Pool, ch: ClickHouseClient,
  approvalId: string, approvedBy: string): Promise<number> {
  const count = await pg.query<{ n: string }>(
    `SELECT coalesce(sum(oi.qty), 0)::text AS n
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.platform = 'web' AND o.external_id = $1`,
    [DEMO_DOA_ORDER_ID],
  );
  const items = Number(count.rows[0]?.n ?? 0);
  await pg.query(
    `UPDATE shipments SET items = $2, status = 'planned'
     WHERE shipment_code = $1`,
    [DEMO_DOA_NEW_SHIPMENT_ID, items],
  );
  await pg.query(
    `UPDATE orders SET shipment_id = (
       SELECT id FROM shipments WHERE shipment_code = $2
     ), status = 'labeled', updated_at = now()
     WHERE platform = 'web' AND external_id = $1`,
    [DEMO_DOA_ORDER_ID, DEMO_DOA_NEW_SHIPMENT_ID],
  );
  await auditOnce(pg, approvalId, "rebuild-doa-packing-list", approvedBy,
    "packing-list-regenerated", { orderId: DEMO_DOA_ORDER_ID, items });
  await ensureEvent(ch, "action_executed", `${approvalId}:packing-list`, 0, {
    action: "packing_list_regenerated", orderId: DEMO_DOA_ORDER_ID, items,
  });
  return items;
}

export async function purchaseDemoUpdatedLabel(pg: Pool, ch: ClickHouseClient,
  approvalId: string, approvedBy: string, nowIso: string): Promise<void> {
  await pg.query(
    `UPDATE shipments SET status = 'purchased', purchased_at = $2,
       label_cost_cents = $3
     WHERE shipment_code = $1`,
    [DEMO_DOA_NEW_SHIPMENT_ID, nowIso, DEMO_DOA_REVIEW.shipment.updatedLabelCostCents],
  );
  await auditOnce(pg, approvalId, "purchase-doa-updated-label", approvedBy,
    "updated-label-purchased", {
      shipmentId: DEMO_DOA_NEW_SHIPMENT_ID,
      labelId: DEMO_DOA_REVIEW.shipment.updatedLabelId,
      costCents: DEMO_DOA_REVIEW.shipment.updatedLabelCostCents,
    });
  await ensureEvent(ch, "label_purchased", `${approvalId}:updated-label`,
    DEMO_DOA_REVIEW.shipment.updatedLabelCostCents, {
      caseId: DEMO_DOA_CASE_ID,
      shipmentId: DEMO_DOA_NEW_SHIPMENT_ID,
      labelId: DEMO_DOA_REVIEW.shipment.updatedLabelId,
      orderId: DEMO_DOA_ORDER_ID,
    });
}

export async function prepareDemoDoaReply(pg: Pool, ch: ClickHouseClient,
  approvalId: string, approvedBy: string): Promise<void> {
  await auditOnce(pg, approvalId, "prepare-doa-reply-draft", approvedBy,
    "reply-draft-ready-not-sent", { sent: false });
  await ensureEvent(ch, "action_executed", `${approvalId}:reply-draft`, 0, {
    action: "reply_draft_prepared", sent: false, caseId: DEMO_DOA_CASE_ID,
  });
}
