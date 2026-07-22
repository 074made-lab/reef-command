/**
 * Label day (MON) — the second OLTP→OLAP loop, and the HITL waitpoint's payload.
 *
 * `buildManifest` reads unshipped orders (Postgres truth) and computes, per
 * customer, one combined shipment: weight from coral count, a per-destination
 * weather pack verdict, and label cost — rendered as a `label_manifest`
 * ComponentSpec. `purchaseLabels` is the write half: shipment rows + spend into
 * Postgres, `label_purchased` events into ClickHouse, orders linked to their
 * shipment (so they leave the merge scan). Both are orchestration-agnostic and
 * provable headlessly; the Trigger.dev `label-day` task pauses between them on a
 * human waitpoint (`trigger/label-day.ts`).
 *
 * Constants are generic (not TIA's real carrier math) — synthetic by design.
 */
import type { ClickHouseClient } from "@clickhouse/client";
import type { Pool } from "pg";
import { insertEvents, queryRows } from "./store/clickhouse";
import { currentWeekIndex } from "./tools";
import type { ReefEvent } from "./datastore";
import type {
  ComponentSpec, ShipmentLine, WeatherFlag, CustomerRef, Platform,
  ShippingDocumentShipment,
} from "./protocol";
import { demoPriorityTimestamp } from "./demo-clock";

// weight (lb) and cost (cents) — generic, deterministic
const CORAL_LB = 0.6, TARE_LB = 1.0, PACK_LB = 0.8, FLOOR_LB = 4.0;
const BASE_CENTS = 1200, PER_LB_CENTS = 350, PACK_CENTS = 600;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Deterministic pseudo-weather from the destination string — stable per city,
 *  no randomness (never rely on Math.random in a demo). */
function destWeather(city: string): { lowF: number; highF: number } {
  let h = 0;
  for (const c of city || "unknown") h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const lowF = 20 + (h % 60); // 20–79°F
  const highF = lowF + 15 + (h % 20); // low+15 … low+34
  return { lowF, highF };
}
function packFor(w: { lowF: number; highF: number }): "none" | "heat" | "cold" {
  return w.lowF <= 45 ? "heat" : w.highF >= 80 ? "cold" : "none";
}
function packReason(w: { lowF: number; highF: number }, pack: "heat" | "cold"): string {
  return pack === "heat"
    ? `arrival window drops to ${w.lowF}°F — heat pack`
    : `arrival window hits ${w.highF}°F — cold pack`;
}

function boxFor(coralUnits: number): Pick<ShippingDocumentShipment, "boxSize" | "boxDimensions"> {
  if (coralUnits <= 4) return { boxSize: "S", boxDimensions: "9.5 × 9 × 8 in" };
  if (coralUnits <= 8) return { boxSize: "M", boxDimensions: "11 × 9 × 10 in" };
  if (coralUnits <= 16) return { boxSize: "L", boxDimensions: "12 × 12 × 9.5 in" };
  if (coralUnits <= 24) return { boxSize: "XL", boxDimensions: "14 × 12 × 13 in" };
  if (coralUnits <= 30) return { boxSize: "XXL", boxDimensions: "15.5 × 13.5 × 12.5 in" };
  return { boxSize: "MANUAL", boxDimensions: "manual oversize review" };
}

export type Manifest = {
  weekLabel: string;
  shipments: ShipmentLine[];
  weatherFlags: WeatherFlag[];
  productLabels: number;
  totalCostCents: number;
  documentShipments: ShippingDocumentShipment[];
  /** external order ids per shipment, for linking on purchase. */
  orderIdsByShipment: Record<string, string[]>;
};

type Row = {
  id: string; primary_name: string; tier: number; items: string;
  destination: string; platforms: string[]; order_ids: string[];
  products: { sku: string; name: string; qty: number }[];
  shipment_code: string | null;
  shipment_status: "planned" | "purchased" | "held" | "voided" | null;
  has_held_order: boolean;
  document_key: string;
};

export function expandProductLabels(
  products: Row["products"],
  coralUnits: number,
): ShippingDocumentShipment["productLabels"] {
  const expanded = products.flatMap((product) =>
    Array.from({ length: Math.max(0, Number(product.qty)) }, () => ({
      sku: product.sku,
      name: product.name,
      bag: "",
    })),
  );
  return expanded.slice(0, coralUnits).map((product, index) => ({
    ...product,
    bag: `${index + 1} OF ${coralUnits}`,
  }));
}

function compileManifest(rows: Row[], wi: number, weekLabel: string): Manifest {
  const shipments: ShipmentLine[] = [];
  const weatherFlags: WeatherFlag[] = [];
  const documentShipments: ShippingDocumentShipment[] = [];
  const orderIdsByShipment: Record<string, string[]> = {};
  let productLabels = 0;
  let totalCostCents = 0;

  for (const r of rows) {
    const items = Math.max(1, Number(r.items));
    const destination = r.destination ?? "";
    const w = destWeather(destination);
    const pack = packFor(w);
    const weightLb = Math.max(FLOOR_LB, round2(items * CORAL_LB + TARE_LB + (pack !== "none" ? PACK_LB : 0)));
    const costCents = BASE_CENTS + Math.round(weightLb * PER_LB_CENTS) + (pack !== "none" ? PACK_CENTS : 0);
    const documentToken = r.document_key.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toUpperCase();
    const shipmentId = r.shipment_code ?? `SHP-${r.id}-${wi}-${documentToken}`;
    const customer: CustomerRef = {
      customerId: Number(r.id), displayName: r.primary_name,
      tier: (r.tier as 1 | 2 | 3 | 4) ?? 4,
      platforms: (r.platforms as Platform[]) ?? [],
    };
    shipments.push({
      shipmentId, customer, orderIds: r.order_ids, items, weightLb,
      destination, pack, costCents, status: "planned",
    });
    const expandedLabels = expandProductLabels(r.products ?? [], items);
    documentShipments.push({
      shipmentId,
      customer,
      orderIds: r.order_ids,
      coralUnits: items,
      destination,
      ...boxFor(items),
      weightLb,
      lowF: w.lowF,
      highF: w.highF,
      pack: pack === "cold" ? "ice" : pack,
      carrierLabel: r.has_held_order || r.shipment_status === "held" || r.shipment_status === "voided"
        ? "withheld"
        : r.shipment_status === "purchased" ? "purchased" : "preview",
      productLabels: expandedLabels,
    });
    orderIdsByShipment[shipmentId] = r.order_ids;
    if (pack !== "none") {
      weatherFlags.push({ shipmentId, destination, lowF: w.lowF, highF: w.highF, pack, reason: packReason(w, pack) });
    }
    productLabels += items;
    totalCostCents += costCents;
  }

  return { weekLabel, shipments, weatherFlags, productLabels, totalCostCents, documentShipments, orderIdsByShipment };
}

/** Read-only document view: reuse active current-week shipments, then fold
 * remaining unlinked orders into the customer's mutable planned shipment. */
export async function buildShippingDocumentManifest(pg: Pool): Promise<Manifest> {
  const wi = currentWeekIndex();
  const weekLabel = `W${wi}`;
  const res = await pg.query<Row>(`
    WITH planned_target AS (
      SELECT DISTINCT ON (customer_id) id, customer_id
      FROM shipments
      WHERE status = 'planned' AND ship_week = $1
      ORDER BY customer_id, id DESC
    ), document_orders AS (
      SELECT o.*,
             CASE WHEN o.status = 'held' AND o.shipment_id IS NULL
               THEN NULL ELSE coalesce(o.shipment_id, planned_target.id) END AS document_shipment_id,
             CASE
               WHEN o.status = 'held' AND o.shipment_id IS NULL THEN 'held-order:' || o.id::text
               WHEN coalesce(o.shipment_id, planned_target.id) IS NOT NULL
                 THEN 'shipment:' || coalesce(o.shipment_id, planned_target.id)::text
               ELSE 'customer:' || o.customer_id::text
             END AS document_group_key
      FROM orders o
      LEFT JOIN planned_target ON planned_target.customer_id = o.customer_id
      LEFT JOIN shipments active_shipment ON active_shipment.id = o.shipment_id
        AND active_shipment.ship_week = $1
        AND active_shipment.status IN ('planned','purchased','held','voided')
      WHERE o.status IN ('pending','paid','labeled','held')
        AND (o.shipment_id IS NULL OR active_shipment.id IS NOT NULL)
    )
    SELECT c.id, c.primary_name, c.tier,
           sum(CASE WHEN oi.id IS NULL THEN 1 ELSE oi.qty END)::text AS items,
           max(document_orders.destination_city) AS destination,
           array_agg(DISTINCT document_orders.platform) AS platforms,
           array_agg(DISTINCT document_orders.external_id) AS order_ids,
           coalesce(jsonb_agg(jsonb_build_object(
             'sku', coalesce(oi.sku, document_orders.external_id),
             'name', coalesce(oi.name, 'Coral item'),
             'qty', coalesce(oi.qty, 1)
           ) ORDER BY document_orders.ordered_at, oi.id), '[]'::jsonb) AS products,
           max(shipments.shipment_code) AS shipment_code,
           max(shipments.status) AS shipment_status,
           bool_or(document_orders.status = 'held') AS has_held_order,
           document_orders.document_group_key AS document_key
    FROM document_orders
    JOIN customers c ON c.id = document_orders.customer_id
    LEFT JOIN order_items oi ON oi.order_id = document_orders.id
    LEFT JOIN shipments ON shipments.id = document_orders.document_shipment_id
    GROUP BY c.id, document_orders.document_group_key
    ORDER BY max(document_orders.ordered_at) DESC
    LIMIT 12`, [weekLabel]);

  return compileManifest(res.rows, wi, weekLabel);
}

/** Money-gated label batch: only unlinked, unheld pending/paid orders may enter
 * the purchase workflow. Document review intentionally uses the broader read
 * model above, never this purchase payload. */
export async function buildManifest(pg: Pool): Promise<Manifest> {
  const wi = currentWeekIndex();
  const weekLabel = `W${wi}`;
  const res = await pg.query<Row>(`
    SELECT c.id, c.primary_name, c.tier,
           sum(CASE WHEN oi.id IS NULL THEN 1 ELSE oi.qty END)::text AS items,
           max(o.destination_city) AS destination,
           array_agg(DISTINCT o.platform) AS platforms,
           array_agg(DISTINCT o.external_id) AS order_ids,
           coalesce(jsonb_agg(jsonb_build_object(
             'sku', coalesce(oi.sku, o.external_id),
             'name', coalesce(oi.name, 'Coral item'),
             'qty', coalesce(oi.qty, 1)
           ) ORDER BY o.ordered_at, oi.id), '[]'::jsonb) AS products,
           NULL::text AS shipment_code,
           NULL::text AS shipment_status,
           false AS has_held_order,
           'purchase:' || c.id::text AS document_key
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.status IN ('pending','paid') AND o.shipment_id IS NULL
    GROUP BY c.id
    ORDER BY max(o.ordered_at) DESC
    LIMIT 12`);
  return compileManifest(res.rows, wi, weekLabel);
}

/** Read-only Monday document package. It prepares printable artifacts and
 * carrier previews without starting the money-moving label purchase run. */
export async function buildShippingDocumentBoard(pg: Pool): Promise<ComponentSpec[]> {
  const manifest = await buildShippingDocumentManifest(pg);
  return [{
    kind: "shipping_document_board",
    weekLabel: manifest.weekLabel,
    asOf: demoPriorityTimestamp("monday", 2),
    shipments: manifest.documentShipments,
    packingSlips: manifest.shipments.length,
    fedexLabels: manifest.documentShipments.filter((shipment) => shipment.carrierLabel !== "withheld").length,
    productLabels: manifest.productLabels,
    printNote: "Packing slips contain no prices. Product labels print one per physical coral bag, including held orders. FedEx previews stay gated and are withheld for holds.",
  }];
}

/** The label_manifest card, with the gated batch-approve chip. `runId` (the
 *  paused label-day run) rides on the chip payload so approving completes its
 *  waitpoint. */
export function manifestSpec(m: Manifest, runId?: string): ComponentSpec {
  return {
    kind: "label_manifest",
    weekLabel: m.weekLabel,
    shipments: m.shipments,
    productLabels: m.productLabels,
    weatherFlags: m.weatherFlags,
    totalCostCents: m.totalCostCents,
    actions: [
      {
        taskId: "approve-label-batch",
        label: `Approve & buy ${m.shipments.length} labels · $${Math.round(m.totalCostCents / 100)}`,
        payload: { runId: runId ?? null },
        risk: "gated",
      },
    ],
  };
}

/** Has this shipment's label_purchased event already landed in ClickHouse?
 *  order_id carries the shipment code (SHP-<cust>-<week>), unique per week, so
 *  this is an exact dedup key. Lets a replay tell "event never emitted" (must
 *  emit) from "emitted, but the ack was lost" (must NOT re-emit → no double
 *  count). Bundled into the same retry as the insert so a fully-down ClickHouse
 *  throws before we mark the shipment done. */
async function eventLanded(ch: ClickHouseClient, shipmentId: string): Promise<boolean> {
  const r = await queryRows<{ n: string }>(
    ch,
    `SELECT count() AS n FROM events WHERE type = 'label_purchased' AND order_id = {sid:String}`,
    { sid: shipmentId },
  );
  return Number(r[0]?.n ?? 0) > 0;
}

/** Write half: shipment rows + spend → Postgres, label_purchased → ClickHouse,
 *  orders linked to their shipment.
 *
 *  Recoverable idempotency, not just dedup (Codex R3-P1). Each shipment is a
 *  little state machine — a row is inserted as 'planned' and only flipped to
 *  'purchased' AFTER all three effects land, in a fixed order:
 *
 *    1. INSERT ... status='planned'  ON CONFLICT DO NOTHING   (claim the row)
 *    2. link its orders (guarded by shipment_id IS NULL → safe to repeat)
 *    3. emit label_purchased to ClickHouse, skipping it if already present
 *    4. UPDATE status='purchased', purchased_at=now                (commit)
 *
 *  The commit (4) is last and depends on (3) succeeding, so every partial
 *  failure — orders not linked, ClickHouse never reached, crash mid-batch —
 *  leaves the row 'planned' and a re-run of the SAME manifest resumes exactly
 *  the unfinished steps. An already-'purchased' shipment short-circuits with no
 *  re-link and no re-emit. (Full replay of a HITL-approved run is disabled
 *  anyway — trigger/label-day.ts maxAttempts:1 — this covers a manual re-fire
 *  and within-run partial failure.)
 *
 *  NOT strict exactly-once: the ClickHouse guard is check-then-insert, so two
 *  identical manifests approved at the very same instant could race it and
 *  double-emit. It's unlikely in the intended single-operator demo flow (you
 *  approve one run at a time), but it IS reachable — two chats can spawn two
 *  label-day runs for the same shipment — so a true exactly-once guard (a unique
 *  key or a ReplacingMergeTree on the event) is future work. */
export async function purchaseLabels(
  pg: Pool, ch: ClickHouseClient, m: Manifest, nowIso = new Date().toISOString(),
): Promise<{ purchased: number; totalCostCents: number }> {
  let purchased = 0, spend = 0;

  for (const s of m.shipments) {
    // 1. Claim the shipment row (idempotent). status='planned' means "not yet
    //    fully committed"; a prior partial attempt leaves it here to resume.
    await pg.query(`
      INSERT INTO shipments (shipment_code, customer_id, ship_week, status, items,
        weight_lb, destination_city, pack, label_cost_cents)
      VALUES ($1,$2,$3,'planned',$4,$5,$6,$7,$8)
      ON CONFLICT (shipment_code) DO NOTHING`,
      [s.shipmentId, s.customer.customerId, m.weekLabel, s.items,
        s.weightLb, s.destination, s.pack, s.costCents]);
    const cur = await pg.query<{ id: string; status: string }>(
      `SELECT id, status FROM shipments WHERE shipment_code = $1`, [s.shipmentId]);
    const row = cur.rows[0];
    if (!row) throw new Error(`shipment ${s.shipmentId} vanished after insert`);
    if (row.status === "purchased") { purchased++; spend += s.costCents; continue; }
    const shipmentPk = row.id;

    // 2. Link the orders. Repeating this is a no-op once linked (IS NULL guard).
    const orderIds = m.orderIdsByShipment[s.shipmentId] ?? [];
    if (orderIds.length) {
      await pg.query(
        `UPDATE orders SET shipment_id = $1, status = 'labeled'
         WHERE customer_id = $2 AND external_id = ANY($3) AND shipment_id IS NULL`,
        [shipmentPk, s.customer.customerId, orderIds]);
    }

    // 3. Emit the ClickHouse event unless it already landed. The dedup read and
    //    the insert share one retry loop: a fully-down ClickHouse THROWS here,
    //    BEFORE step 4, so the row stays 'planned' and is retried — never a
    //    silent Postgres-committed / ClickHouse-missing split.
    const ev: ReefEvent = {
      ts: nowIso, type: "label_purchased", platform: "system",
      customerId: s.customer.customerId, orderId: s.shipmentId, amountCents: s.costCents,
      meta: { pack: s.pack, weightLb: s.weightLb, orderIds, destination: s.destination },
    };
    let chOk = false;
    for (let attempt = 1; attempt <= 3 && !chOk; attempt++) {
      try {
        if (!(await eventLanded(ch, s.shipmentId))) await insertEvents(ch, [ev]);
        chOk = true;
      } catch (e) {
        if (attempt === 3) {
          throw new Error(
            `label_purchased for ${s.shipmentId}: ClickHouse unreachable — shipment left 'planned' for retry: ${e instanceof Error ? e.message : String(e)}`);
        }
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }

    // 4. Commit: all effects landed, so mark the shipment purchased.
    await pg.query(
      `UPDATE shipments SET status = 'purchased', purchased_at = $2
       WHERE id = $1 AND status <> 'purchased'`, [shipmentPk, nowIso]);
    purchased++;
    spend += s.costCents;
  }

  return { purchased, totalCostCents: spend };
}
