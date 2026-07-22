/**
 * Rollback-safe integration check for the DOA write path.
 *
 * It stages the named public fixture AND runs every post-approval Postgres
 * write inside one transaction, records ClickHouse inserts in memory, asserts
 * the final closed loop, then rolls the transaction back — staging included,
 * so the check leaves zero durable rows. No analytics event is sent and no
 * customer message is created.
 */
import assert from "node:assert/strict";
import type { ClickHouseClient } from "@clickhouse/client";
import type { Pool } from "pg";
import {
  DEMO_DOA_CASE_ID,
  DEMO_DOA_NEW_SHIPMENT_ID,
  DEMO_DOA_OLD_SHIPMENT_ID,
  DEMO_DOA_ORDER_ID,
  DEMO_DOA_REVIEW,
  decideDemoDoaClaim,
  prepareDemoDoaReply,
  purchaseDemoUpdatedLabel,
  rebuildDemoPackingList,
  recordDemoReplacements,
  stageDemoDoaReviewOn,
  voidDemoDoaLabel,
} from "../src/lib/doa-demo";
import { pgPool } from "../src/lib/store/postgres";

process.loadEnvFile(".env.local");

type Inserted = { type: string; order_id: string; amount_cents: number; meta: string };

async function main() {
  const pg = pgPool();
  const now = new Date().toISOString();

  const db = await pg.connect();
  const inserted: Inserted[] = [];
  const fakeCh = {
    query: async () => ({ json: async () => [{ n: "0" }] }),
    insert: async (input: { values: Inserted[] }) => { inserted.push(...input.values); },
  } as unknown as ClickHouseClient;
  const approvalId = "DOA-ROLLBACK-CHECK";
  try {
    await db.query("BEGIN");
    // Stage INSIDE the transaction: the check must leave no durable fixture
    // rows behind (a committed staging would hand the Tuesday candidate query
    // a live shipment and mutate the demo world from a "read-only" gate).
    await stageDemoDoaReviewOn(db, now);
    const scopedPg = db as unknown as Pool;
    await decideDemoDoaClaim(scopedPg, fakeCh, approvalId, "simulator-check", now);
    await recordDemoReplacements(scopedPg, fakeCh, approvalId, "simulator-check");
    await voidDemoDoaLabel(scopedPg, fakeCh, approvalId, "simulator-check", now);
    const packingItems = await rebuildDemoPackingList(scopedPg, fakeCh, approvalId, "simulator-check");
    await purchaseDemoUpdatedLabel(scopedPg, fakeCh, approvalId, "simulator-check", now);
    await prepareDemoDoaReply(scopedPg, fakeCh, approvalId, "simulator-check");

    const state = await db.query<{
      case_status: string;
      old_status: string;
      new_status: string;
      new_items: string;
      linked_shipment: string;
      replacements: string;
      reply_messages: string;
    }>(`
      SELECT
        (SELECT status FROM cases WHERE case_code = $1) AS case_status,
        (SELECT status FROM shipments WHERE shipment_code = $2) AS old_status,
        (SELECT status FROM shipments WHERE shipment_code = $3) AS new_status,
        (SELECT items::text FROM shipments WHERE shipment_code = $3) AS new_items,
        (SELECT s.shipment_code FROM orders o JOIN shipments s ON s.id = o.shipment_id
          WHERE o.platform = 'web' AND o.external_id = $4) AS linked_shipment,
        (SELECT count(*)::text FROM order_items oi JOIN orders o ON o.id = oi.order_id
          WHERE o.platform = 'web' AND o.external_id = $4 AND oi.sku LIKE 'DEMO-RPL-%') AS replacements,
        (SELECT count(*)::text FROM messages
          WHERE customer_id = 900001 AND template_id = 'demo-doa-resolution') AS reply_messages`,
      [DEMO_DOA_CASE_ID, DEMO_DOA_OLD_SHIPMENT_ID, DEMO_DOA_NEW_SHIPMENT_ID, DEMO_DOA_ORDER_ID],
    );
    const row = state.rows[0];
    assert.equal(row.case_status, "approved");
    assert.equal(row.old_status, "voided");
    assert.equal(row.new_status, "purchased");
    assert.equal(Number(row.new_items), 5);
    assert.equal(row.linked_shipment, DEMO_DOA_NEW_SHIPMENT_ID);
    assert.equal(Number(row.replacements), 3);
    assert.equal(Number(row.reply_messages), 0, "reply must remain a draft");
    assert.equal(packingItems, 5);

    const eventTypes = inserted.map((event) => event.type);
    assert.ok(eventTypes.includes("case_decided"));
    assert.ok(eventTypes.includes("label_voided"));
    assert.ok(eventTypes.includes("label_purchased"));
    assert.ok(eventTypes.includes("action_executed"));
    const labelEvent = inserted.find((event) => event.type === "label_purchased");
    assert.equal(labelEvent?.amount_cents, DEMO_DOA_REVIEW.shipment.updatedLabelCostCents);

    console.log("✓ human decision recorded with exact approval scope");
    console.log("✓ 3 replacements added to tomorrow's order (2 → 5 items)");
    console.log("✓ old label voided; updated label purchased and order relinked");
    console.log("✓ ClickHouse event shapes captured in memory; analytics untouched");
    console.log("✓ reply draft prepared; zero customer messages sent");
    console.log("\nALL PASS — DOA resolution integration (rolled back)");
  } finally {
    await db.query("ROLLBACK").catch(() => {});
    db.release();
    await pg.end();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
