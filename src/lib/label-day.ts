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
} from "./protocol";

// weight (lb) and cost (cents) — generic, deterministic
const CORAL_LB = 0.6, TARE_LB = 1.0, PACK_LB = 0.8, FLOOR_LB = 2.0;
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

export type Manifest = {
  weekLabel: string;
  shipments: ShipmentLine[];
  weatherFlags: WeatherFlag[];
  productLabels: number;
  totalCostCents: number;
  /** external order ids per shipment, for linking on purchase. */
  orderIdsByShipment: Record<string, string[]>;
};

type Row = {
  id: string; primary_name: string; tier: number; items: string;
  destination: string; platforms: string[]; order_ids: string[];
};

/** Read-only: build the MON label batch from unshipped Postgres orders. */
export async function buildManifest(pg: Pool): Promise<Manifest> {
  const wi = currentWeekIndex();
  const weekLabel = `W${wi}`;
  const res = await pg.query<Row>(`
    SELECT c.id, c.primary_name, c.tier,
           coalesce(sum(oi.qty), count(o.id))::text AS items,
           max(o.destination_city) AS destination,
           array_agg(DISTINCT o.platform) AS platforms,
           array_agg(DISTINCT o.external_id) AS order_ids
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.status IN ('pending','paid') AND o.shipment_id IS NULL
    GROUP BY c.id
    ORDER BY max(o.ordered_at) DESC
    LIMIT 12`);

  const shipments: ShipmentLine[] = [];
  const weatherFlags: WeatherFlag[] = [];
  const orderIdsByShipment: Record<string, string[]> = {};
  let productLabels = 0;
  let totalCostCents = 0;

  for (const r of res.rows) {
    const items = Math.max(1, Number(r.items));
    const destination = r.destination ?? "";
    const w = destWeather(destination);
    const pack = packFor(w);
    const weightLb = Math.max(FLOOR_LB, round2(items * CORAL_LB + TARE_LB + (pack !== "none" ? PACK_LB : 0)));
    const costCents = BASE_CENTS + Math.round(weightLb * PER_LB_CENTS) + (pack !== "none" ? PACK_CENTS : 0);
    const shipmentId = `SHP-${r.id}-${wi}`;
    const customer: CustomerRef = {
      customerId: Number(r.id), displayName: r.primary_name,
      tier: (r.tier as 1 | 2 | 3 | 4) ?? 4,
      platforms: (r.platforms as Platform[]) ?? [],
    };
    shipments.push({
      shipmentId, customer, orderIds: r.order_ids, items, weightLb,
      destination, pack, costCents, status: "planned",
    });
    orderIdsByShipment[shipmentId] = r.order_ids;
    if (pack !== "none") {
      weatherFlags.push({ shipmentId, destination, lowF: w.lowF, highF: w.highF, pack, reason: packReason(w, pack) });
    }
    productLabels += items;
    totalCostCents += costCents;
  }

  return { weekLabel, shipments, weatherFlags, productLabels, totalCostCents, orderIdsByShipment };
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
 *  and within-run partial failure.) */
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
