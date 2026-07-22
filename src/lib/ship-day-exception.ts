/**
 * Public-safe ship-day exception loop.
 *
 * This is a deliberately generic synthetic proof, not TIA Coral's operating
 * playbook. An inbound delivery-day change pauses one prepared shipment,
 * records a simulated packing-team SMS, voids the still-voidable label, and
 * emits an auditable ClickHouse trail. Every step is replay-safe for the
 * deterministic demo incident.
 */

import type { ClickHouseClient } from "@clickhouse/client";
import type { Pool } from "pg";
import { insertEvents, queryRows } from "./store/clickhouse";

export const DEMO_SHIP_EXCEPTION_ID = "DEMO-SHIP-CHANGE-001";

/** Isolated deterministic fixture identifiers. The Tuesday story must never
 * share a shipment with the DOA demo (its rows live in ship_week
 * 'DEMO-TOMORROW', excluded from every selection below) and must still work on
 * a fresh clone, where seeded shipments carry no linked orders. */
export const DEMO_SHIP_CUSTOMER_ID = 900_003;
export const DEMO_SHIP_SHIPMENT_CODE = "SHP-DEMO-TUE-001";
export const DEMO_SHIP_ORDER_ID = "WEB-DEMO-TUE-001";

export type ShipDayIncident = {
  incidentId: string;
  customerId: number;
  customerName: string;
  shipmentId: string;
  destination: string;
  protectedCostCents: number;
  receivedAt: string;
  requestSummary: string;
};

type IncidentRow = {
  customer_id: string;
  primary_name: string;
  shipment_code: string;
  destination_city: string | null;
  label_cost_cents: string | null;
  received_at: Date;
};

const REQUEST_SUMMARY =
  "Customer requested a different delivery day before carrier handoff.";

function toIncident(row: IncidentRow): ShipDayIncident {
  return {
    incidentId: DEMO_SHIP_EXCEPTION_ID,
    customerId: Number(row.customer_id),
    customerName: row.primary_name,
    shipmentId: row.shipment_code,
    destination: row.destination_city ?? "destination on file",
    protectedCostCents: Number(row.label_cost_cents ?? 0),
    receivedAt: row.received_at.toISOString(),
    requestSummary: REQUEST_SUMMARY,
  };
}

async function existingIncident(pg: Pool): Promise<ShipDayIncident | null> {
  const result = await pg.query<IncidentRow>(`
    SELECT r.customer_id, c.primary_name, s.shipment_code,
           s.destination_city, s.label_cost_cents, r.received_at
    FROM requests r
    JOIN customers c ON c.id = r.customer_id
    JOIN LATERAL (
      SELECT replace(action, 'shipment:', '') AS shipment_code
      FROM unnest(r.auto_actions) AS action
      WHERE action LIKE 'shipment:%'
      LIMIT 1
    ) linked ON true
    JOIN shipments s ON s.shipment_code = linked.shipment_code
    WHERE r.request_code = $1
      AND s.status = 'purchased'
      AND s.ship_week <> 'DEMO-TOMORROW'
      AND EXISTS (
        SELECT 1 FROM orders o
        WHERE o.shipment_id = s.id
          AND o.status IN ('pending','paid','labeled')
      )
    LIMIT 1`, [DEMO_SHIP_EXCEPTION_ID]);
  return result.rows[0] ? toIncident(result.rows[0]) : null;
}

/** Re-arm only the fixed public demo incident after its previous protection
 * run has aged out. This never broadens selection to arbitrary voided
 * shipments: the request id, linked shipment, and held order must all match
 * the synthetic incident's completed state. */
async function rearmHandledDemoShipDayIncident(
  pg: Pool,
  nowIso: string,
): Promise<ShipDayIncident | null> {
  const result = await pg.query<IncidentRow>(`
    WITH candidate AS (
      SELECT r.customer_id, c.primary_name, s.id AS shipment_id,
             s.shipment_code, s.destination_city, s.label_cost_cents
      FROM requests r
      JOIN customers c ON c.id = r.customer_id
      JOIN LATERAL (
        SELECT replace(action, 'shipment:', '') AS shipment_code
        FROM unnest(r.auto_actions) AS action
        WHERE action LIKE 'shipment:%'
        LIMIT 1
      ) linked ON true
      JOIN shipments s ON s.shipment_code = linked.shipment_code
      WHERE r.request_code = $1
        AND r.status = 'auto_handled'
        AND s.status = 'voided'
        AND s.ship_week <> 'DEMO-TOMORROW'
        AND EXISTS (
          SELECT 1 FROM orders o
          WHERE o.shipment_id = s.id AND o.status = 'held'
        )
      LIMIT 1
    ), rearmed_shipment AS (
      UPDATE shipments s
      SET status = 'purchased', voided_at = NULL, void_reason = NULL
      FROM candidate c
      WHERE s.id = c.shipment_id
      RETURNING s.id
    ), rearmed_orders AS (
      UPDATE orders o
      SET status = 'labeled', updated_at = $2
      FROM candidate c
      WHERE o.shipment_id = c.shipment_id AND o.status = 'held'
      RETURNING o.id
    ), rearmed_request AS (
      UPDATE requests r
      SET status = 'open', received_at = $2, resolved_at = NULL,
          auto_actions = ARRAY['shipment:' || c.shipment_code]::text[]
      FROM candidate c
      WHERE r.request_code = $1
      RETURNING r.request_code
    )
    SELECT c.customer_id, c.primary_name, c.shipment_code,
           c.destination_city, c.label_cost_cents, $2::timestamptz AS received_at
    FROM candidate c
    JOIN rearmed_shipment s ON true
    JOIN rearmed_request r ON true`, [DEMO_SHIP_EXCEPTION_ID, nowIso]);
  return result.rows[0] ? toIncident(result.rows[0]) : null;
}

/** A quick Tuesday reload should show the completed protection instead of
 * spawning another run. This read intentionally accepts the now-voided linked
 * shipment, but only for a recently completed synthetic incident. */
export async function freshHandledDemoShipDayIncident(pg: Pool): Promise<ShipDayIncident | null> {
  const result = await pg.query<IncidentRow>(`
    SELECT r.customer_id, c.primary_name, s.shipment_code,
           s.destination_city, s.label_cost_cents, r.received_at
    FROM requests r
    JOIN customers c ON c.id = r.customer_id
    JOIN LATERAL (
      SELECT replace(action, 'shipment:', '') AS shipment_code
      FROM unnest(r.auto_actions) AS action
      WHERE action LIKE 'shipment:%'
      LIMIT 1
    ) linked ON true
    JOIN shipments s ON s.shipment_code = linked.shipment_code
    WHERE r.request_code = $1
      AND r.status = 'auto_handled'
      AND r.resolved_at > now() - interval '15 minutes'
      AND s.ship_week <> 'DEMO-TOMORROW'
    LIMIT 1`, [DEMO_SHIP_EXCEPTION_ID]);
  return result.rows[0] ? toIncident(result.rows[0]) : null;
}

/** Create (or repair) the isolated deterministic Tuesday fixture: its own
 * synthetic customer, one purchased shipment, and one linked labeled order —
 * never a seeded row, never the DOA demo's world. Runs only when no eligible
 * shipment exists and the completed incident cannot be re-armed, so a fresh
 * clone gets a working autonomous story with zero setup. */
async function stageSelfContainedShipDayFixture(pg: Pool, nowIso: string): Promise<IncidentRow> {
  await pg.query(
    `INSERT INTO customers (id, primary_email, primary_name, tier)
     VALUES ($1, 'tide_runner_88@example.test', 'tide_runner_88', 3)
     ON CONFLICT (id) DO UPDATE SET primary_name = EXCLUDED.primary_name`,
    [DEMO_SHIP_CUSTOMER_ID],
  );
  await pg.query(
    `INSERT INTO shipments
       (shipment_code, customer_id, ship_week, status, items, weight_lb,
        destination_city, pack, label_cost_cents, purchased_at)
     VALUES ($1, $2, 'DEMO-TUESDAY', 'purchased', 3, 3.4, 'Columbus, OH', 'none', 3260, $3)
     ON CONFLICT (shipment_code) DO UPDATE SET
       status = 'purchased', purchased_at = EXCLUDED.purchased_at,
       label_cost_cents = EXCLUDED.label_cost_cents,
       voided_at = NULL, void_reason = NULL`,
    [DEMO_SHIP_SHIPMENT_CODE, DEMO_SHIP_CUSTOMER_ID, nowIso],
  );
  await pg.query(
    `INSERT INTO orders
       (platform, external_id, customer_id, status, total_cents,
        destination_city, shipment_id, ordered_at, updated_at)
     VALUES ('web', $1, $2, 'labeled', 14200, 'Columbus, OH',
       (SELECT id FROM shipments WHERE shipment_code = $3),
       $4::timestamptz - interval '1 day', $4)
     ON CONFLICT (platform, external_id) DO UPDATE SET
       status = 'labeled',
       shipment_id = EXCLUDED.shipment_id,
       updated_at = EXCLUDED.updated_at`,
    [DEMO_SHIP_ORDER_ID, DEMO_SHIP_CUSTOMER_ID, DEMO_SHIP_SHIPMENT_CODE, nowIso],
  );
  return {
    customer_id: String(DEMO_SHIP_CUSTOMER_ID),
    primary_name: "tide_runner_88",
    shipment_code: DEMO_SHIP_SHIPMENT_CODE,
    destination_city: "Columbus, OH",
    label_cost_cents: "3260",
    received_at: new Date(nowIso),
  };
}

/** Stage the synthetic inbound customer event. The owner never clicks an
 * operational action; selecting ship day merely makes this external event
 * arrive during the compressed demo clock. */
export async function stageDemoShipDayRequest(pg: Pool, nowIso = new Date().toISOString()): Promise<ShipDayIncident> {
  const prior = await existingIncident(pg);
  if (prior) {
    await pg.query(
      `UPDATE requests SET status = 'open', received_at = $2, resolved_at = NULL
       WHERE request_code = $1`,
      [DEMO_SHIP_EXCEPTION_ID, nowIso],
    );
    return { ...prior, receivedAt: nowIso };
  }

  const candidate = await pg.query<IncidentRow>(`
    SELECT s.customer_id, c.primary_name, s.shipment_code,
           s.destination_city, s.label_cost_cents, $1::timestamptz AS received_at
    FROM shipments s
    JOIN customers c ON c.id = s.customer_id
    WHERE s.status = 'purchased'
      -- the DOA demo's fixture rows live in ship_week 'DEMO-TOMORROW'; the two
      -- public stories must never share (or void) the same shipment
      AND s.ship_week <> 'DEMO-TOMORROW'
      AND EXISTS (
        SELECT 1 FROM orders o
        WHERE o.shipment_id = s.id
          AND o.status IN ('pending','paid','labeled')
      )
    ORDER BY s.purchased_at DESC NULLS LAST,
             s.ship_week DESC,
             s.label_cost_cents DESC NULLS LAST,
             s.shipment_code
    LIMIT 1`, [nowIso]);
  let row = candidate.rows[0];
  if (!row) {
    const replay = await rearmHandledDemoShipDayIncident(pg, nowIso);
    if (replay) return replay;
    row = await stageSelfContainedShipDayFixture(pg, nowIso);
  }

  await pg.query(
    `INSERT INTO requests
       (request_code, customer_id, kind, detail, status, auto_actions, received_at)
     VALUES ($1, $2, 'hold_next_week', $3, 'open', $4, $5)
     ON CONFLICT (request_code) DO UPDATE SET
       customer_id = EXCLUDED.customer_id,
       kind = EXCLUDED.kind,
       detail = EXCLUDED.detail,
       status = 'open',
       auto_actions = EXCLUDED.auto_actions,
       received_at = EXCLUDED.received_at,
       resolved_at = NULL`,
    [DEMO_SHIP_EXCEPTION_ID, row.customer_id, REQUEST_SUMMARY,
      [`shipment:${row.shipment_code}`], nowIso],
  );
  return toIncident(row);
}

async function ensureEvent(ch: ClickHouseClient, type: string, eventId: string,
  incident: ShipDayIncident, meta: Record<string, unknown>): Promise<void> {
  const prior = await queryRows<{ n: string }>(ch,
    `SELECT count() AS n FROM events WHERE type = {type:String} AND order_id = {eventId:String}`,
    { type, eventId });
  if (Number(prior[0]?.n ?? 0) > 0) return;
  await insertEvents(ch, [{
    ts: new Date().toISOString(),
    type: type as "request_received" | "packing_sms_sent" | "label_voided",
    platform: "system",
    customerId: incident.customerId,
    orderId: eventId,
    amountCents: type === "label_voided" ? incident.protectedCostCents : 0,
    meta,
  }]);
}

export async function recordShipDayDetection(ch: ClickHouseClient, incident: ShipDayIncident): Promise<void> {
  await ensureEvent(ch, "request_received", `${incident.incidentId}:${incident.shipmentId}:request`, incident, {
    requestId: incident.incidentId,
    kind: "delivery_day_change",
    shipmentId: incident.shipmentId,
    synthetic: true,
  });
}

export async function notifyPackingTeam(pg: Pool, ch: ClickHouseClient,
  incident: ShipDayIncident, nowIso = new Date().toISOString()): Promise<void> {
  await pg.query(
    `INSERT INTO messages
       (customer_id, direction, platform, intent, template_id, preview, at)
     SELECT $1, 'out', 'sms', 'packing_hold', 'public-demo-ship-hold-v1', $2, $3
     WHERE NOT EXISTS (
       SELECT 1 FROM messages WHERE template_id = 'public-demo-ship-hold-v1'
         AND preview LIKE '%' || $4 || '%'
     )`,
    [incident.customerId,
      `Packing hold: stop ${incident.shipmentId}; delivery-day change under review.`,
      nowIso, incident.shipmentId],
  );
  await pg.query(
    `UPDATE requests SET auto_actions = CASE
       WHEN NOT ('packing_sms_sent' = ANY(auto_actions))
       THEN array_append(auto_actions, 'packing_sms_sent') ELSE auto_actions END
     WHERE request_code = $1`, [incident.incidentId]);
  await pg.query(
    `INSERT INTO action_log (task_id, risk, payload, outcome)
     SELECT 'notify-packing-team', 'auto', $1::jsonb, 'simulated-sms-sent'
     WHERE NOT EXISTS (
       SELECT 1 FROM action_log
       WHERE task_id = 'notify-packing-team'
         AND payload->>'incidentId' = $2
         AND payload->>'shipmentId' = $3
     )`, [JSON.stringify({ incidentId: incident.incidentId, shipmentId: incident.shipmentId }),
      incident.incidentId, incident.shipmentId]);
  await ensureEvent(ch, "packing_sms_sent", `${incident.incidentId}:${incident.shipmentId}:sms`, incident, {
    requestId: incident.incidentId,
    shipmentId: incident.shipmentId,
    channel: "sms",
    simulated: true,
  });
}

export async function voidShipDayLabel(pg: Pool, ch: ClickHouseClient,
  incident: ShipDayIncident, nowIso = new Date().toISOString()): Promise<void> {
  await pg.query(
    `UPDATE shipments SET status = 'voided', voided_at = $2,
       void_reason = 'synthetic delivery-day change before carrier handoff'
     WHERE shipment_code = $1 AND status = 'purchased'`,
    [incident.shipmentId, nowIso],
  );
  await pg.query(
    `UPDATE orders SET status = 'held', updated_at = $2
     WHERE shipment_id = (SELECT id FROM shipments WHERE shipment_code = $1)
       AND status IN ('pending','paid','labeled')`,
    [incident.shipmentId, nowIso],
  );
  await pg.query(
    `UPDATE requests SET status = 'auto_handled', resolved_at = $2,
       auto_actions = CASE
         WHEN NOT ($3 = ANY(auto_actions)) THEN array_append(auto_actions, $3)
         ELSE auto_actions END
     WHERE request_code = $1`,
    [incident.incidentId, nowIso, `label_voided:${incident.shipmentId}`],
  );
  await pg.query(
    `INSERT INTO action_log (task_id, risk, payload, outcome)
     SELECT 'void-shipping-label', 'auto', $1::jsonb, 'label-voided-shipment-held'
     WHERE NOT EXISTS (
       SELECT 1 FROM action_log
       WHERE task_id = 'void-shipping-label'
         AND payload->>'incidentId' = $2
         AND payload->>'shipmentId' = $3
     )`, [JSON.stringify({
      incidentId: incident.incidentId,
      shipmentId: incident.shipmentId,
      protectedCostCents: incident.protectedCostCents,
    }), incident.incidentId, incident.shipmentId]);
  await ensureEvent(ch, "label_voided", `${incident.incidentId}:${incident.shipmentId}:void`, incident, {
    requestId: incident.incidentId,
    shipmentId: incident.shipmentId,
    protectedCostCents: incident.protectedCostCents,
    reason: "synthetic delivery-day change",
  });
}
