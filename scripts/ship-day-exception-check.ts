/**
 * Rollback-safe integration gate for the Tuesday autonomous exception.
 *
 * It proves a stale/voided shipment is ignored, the newest purchased shipment
 * with a holdable order is selected, every dedup key is shipment-scoped, and a
 * sequential replay produces one SMS, one action per step, and one CH event per
 * event type. ClickHouse is captured in memory; all Postgres writes roll back.
 */
import assert from "node:assert/strict";
import type { ClickHouseClient } from "@clickhouse/client";
import type { Pool } from "pg";
import {
  DEMO_SHIP_EXCEPTION_ID,
  freshHandledDemoShipDayIncident,
  notifyPackingTeam,
  recordShipDayDetection,
  stageDemoShipDayRequest,
  voidShipDayLabel,
} from "../src/lib/ship-day-exception";
import { pgPool } from "../src/lib/store/postgres";

process.loadEnvFile(".env.local");

const CUSTOMER_ID = 900_002;
const STALE_SHIPMENT = "SHP-DEMO-STALE-CHECK";
const HOLDABLE_SHIPMENT = "SHP-DEMO-HOLDABLE-CHECK";
const STALE_ORDER = "WEB-DEMO-STALE-CHECK";
const HOLDABLE_ORDER = "WEB-DEMO-HOLDABLE-CHECK";

type EventRow = { type: string; order_id: string; meta: string };

async function main() {
  const pg = pgPool();
  const db = await pg.connect();
  const inserted: EventRow[] = [];
  const eventIds = new Set<string>();
  const fakeCh = {
    query: async (input: { query_params?: Record<string, unknown> }) => ({
      json: async () => [{ n: eventIds.has(String(input.query_params?.eventId ?? "")) ? "1" : "0" }],
    }),
    insert: async (input: { values: EventRow[] }) => {
      for (const row of input.values) {
        inserted.push(row);
        eventIds.add(row.order_id);
      }
    },
  } as unknown as ClickHouseClient;

  try {
    await db.query("BEGIN");
    await db.query(
      `INSERT INTO customers (id, primary_email, primary_name, tier)
       VALUES ($1, 'ship-check@example.test', 'ship_check_customer', 4)
       ON CONFLICT (id) DO UPDATE SET primary_name = EXCLUDED.primary_name`,
      [CUSTOMER_ID],
    );
    await db.query(
      `INSERT INTO shipments
         (shipment_code, customer_id, ship_week, status, items, destination_city,
          pack, label_cost_cents, purchased_at, voided_at, void_reason)
       VALUES
         ($1, $3, 'DEMO-OLD', 'voided', 1, 'Test City, ST', 'none', 9900,
          now() - interval '30 days', now() - interval '29 days', 'stale fixture'),
         ($2, $3, 'DEMO-LATEST', 'purchased', 2, 'Test City, ST', 'none', 2100,
          now() + interval '1 day', NULL, NULL)
       ON CONFLICT (shipment_code) DO UPDATE SET
         customer_id = EXCLUDED.customer_id,
         ship_week = EXCLUDED.ship_week,
         status = EXCLUDED.status,
         items = EXCLUDED.items,
         destination_city = EXCLUDED.destination_city,
         label_cost_cents = EXCLUDED.label_cost_cents,
         purchased_at = EXCLUDED.purchased_at,
         voided_at = EXCLUDED.voided_at,
         void_reason = EXCLUDED.void_reason`,
      [STALE_SHIPMENT, HOLDABLE_SHIPMENT, CUSTOMER_ID],
    );
    await db.query(
      `INSERT INTO orders
         (platform, external_id, customer_id, status, total_cents,
          destination_city, shipment_id, ordered_at, updated_at)
       VALUES
         ('web', $1, $3, 'shipped', 9900, 'Test City, ST',
          (SELECT id FROM shipments WHERE shipment_code = $4), now() - interval '30 days', now()),
         ('web', $2, $3, 'labeled', 2100, 'Test City, ST',
          (SELECT id FROM shipments WHERE shipment_code = $5), now(), now())
       ON CONFLICT (platform, external_id) DO UPDATE SET
         customer_id = EXCLUDED.customer_id,
         status = EXCLUDED.status,
         shipment_id = EXCLUDED.shipment_id,
         updated_at = EXCLUDED.updated_at`,
      [STALE_ORDER, HOLDABLE_ORDER, CUSTOMER_ID, STALE_SHIPMENT, HOLDABLE_SHIPMENT],
    );
    await db.query(
      `INSERT INTO requests
         (request_code, customer_id, kind, detail, status, auto_actions, received_at, resolved_at)
       VALUES ($1, $2, 'hold_next_week', 'stale fixture', 'auto_handled', $3,
         now() - interval '1 hour', now() - interval '1 hour')
       ON CONFLICT (request_code) DO UPDATE SET
         customer_id = EXCLUDED.customer_id,
         status = EXCLUDED.status,
         auto_actions = EXCLUDED.auto_actions,
         received_at = EXCLUDED.received_at,
         resolved_at = EXCLUDED.resolved_at`,
      [DEMO_SHIP_EXCEPTION_ID, CUSTOMER_ID, [`shipment:${STALE_SHIPMENT}`]],
    );

    const scopedPg = db as unknown as Pool;
    assert.equal(await freshHandledDemoShipDayIncident(scopedPg), null,
      "an hour-old handled incident must not suppress a new Tuesday event");

    const incident = await stageDemoShipDayRequest(scopedPg, new Date().toISOString());
    assert.equal(incident.shipmentId, HOLDABLE_SHIPMENT,
      "must ignore the stale shipment and choose the latest holdable shipment");

    await recordShipDayDetection(fakeCh, incident);
    await notifyPackingTeam(scopedPg, fakeCh, incident);
    await voidShipDayLabel(scopedPg, fakeCh, incident);
    await recordShipDayDetection(fakeCh, incident);
    await notifyPackingTeam(scopedPg, fakeCh, incident);
    await voidShipDayLabel(scopedPg, fakeCh, incident);

    const state = await db.query<{
      shipment_status: string;
      order_status: string;
      request_status: string;
      shipment_action: string;
      sms_count: string;
      notify_logs: string;
      void_logs: string;
    }>(`
      SELECT
        (SELECT status FROM shipments WHERE shipment_code = $1) AS shipment_status,
        (SELECT status FROM orders WHERE platform = 'web' AND external_id = $2) AS order_status,
        (SELECT status FROM requests WHERE request_code = $3) AS request_status,
        (SELECT action FROM requests r, unnest(r.auto_actions) action
          WHERE r.request_code = $3 AND action LIKE 'shipment:%' LIMIT 1) AS shipment_action,
        (SELECT count(*)::text FROM messages
          WHERE template_id = 'public-demo-ship-hold-v1' AND preview LIKE '%' || $1 || '%') AS sms_count,
        (SELECT count(*)::text FROM action_log
          WHERE task_id = 'notify-packing-team' AND payload->>'shipmentId' = $1) AS notify_logs,
        (SELECT count(*)::text FROM action_log
          WHERE task_id = 'void-shipping-label' AND payload->>'shipmentId' = $1) AS void_logs`,
      [HOLDABLE_SHIPMENT, HOLDABLE_ORDER, DEMO_SHIP_EXCEPTION_ID],
    );
    const row = state.rows[0];
    assert.equal(row.shipment_status, "voided");
    assert.equal(row.order_status, "held", "the linked holdable order must actually be held");
    assert.equal(row.request_status, "auto_handled");
    assert.equal(row.shipment_action, `shipment:${HOLDABLE_SHIPMENT}`,
      "the deterministic request must be rebound to the selected shipment");
    assert.equal(Number(row.sms_count), 1);
    assert.equal(Number(row.notify_logs), 1);
    assert.equal(Number(row.void_logs), 1);
    assert.equal(inserted.length, 3, "sequential replay must not duplicate CH events");
    assert.ok(inserted.every((event) => event.order_id.includes(HOLDABLE_SHIPMENT)),
      "every event id must be scoped to the selected shipment");
    const fresh = await freshHandledDemoShipDayIncident(scopedPg);
    assert.equal(fresh?.shipmentId, HOLDABLE_SHIPMENT,
      "a fresh completed incident should be reusable without another run");

    console.log("✓ stale shipment rejected; latest purchased + holdable shipment selected");
    console.log("✓ request rebound; linked order actually held; label voided");
    console.log("✓ sequential replay: 1 SMS, 1 notify log, 1 void log, 3 CH events");
    console.log("✓ event ids are shipment-scoped; fresh completion is reusable");
    console.log("\nALL PASS — ship-day exception integration (rolled back)");
  } finally {
    await db.query("ROLLBACK").catch(() => {});
    db.release();
    await pg.end();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
