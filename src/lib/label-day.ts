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
import { insertEvents } from "./store/clickhouse";
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

/** Write half: shipment rows + spend → Postgres, label_purchased → ClickHouse,
 *  orders linked to their shipment. Idempotent on shipment_code. Returns the
 *  count and spend actually purchased. */
export async function purchaseLabels(
  pg: Pool, ch: ClickHouseClient, m: Manifest, nowIso = new Date().toISOString(),
): Promise<{ purchased: number; totalCostCents: number }> {
  const events: ReefEvent[] = [];
  let purchased = 0, spend = 0;

  for (const s of m.shipments) {
    const r = await pg.query<{ id: string }>(`
      INSERT INTO shipments (shipment_code, customer_id, ship_week, status, items,
        weight_lb, destination_city, pack, label_cost_cents, purchased_at)
      VALUES ($1,$2,$3,'purchased',$4,$5,$6,$7,$8,$9)
      ON CONFLICT (shipment_code) DO UPDATE SET
        status = 'purchased', label_cost_cents = EXCLUDED.label_cost_cents,
        purchased_at = EXCLUDED.purchased_at
      RETURNING id`,
      [s.shipmentId, s.customer.customerId, m.weekLabel, s.items,
        s.weightLb, s.destination, s.pack, s.costCents, nowIso]);
    const shipmentPk = r.rows[0]?.id;
    const orderIds = m.orderIdsByShipment[s.shipmentId] ?? [];
    if (shipmentPk && orderIds.length) {
      await pg.query(
        `UPDATE orders SET shipment_id = $1, status = 'labeled'
         WHERE customer_id = $2 AND external_id = ANY($3) AND shipment_id IS NULL`,
        [shipmentPk, s.customer.customerId, orderIds]);
    }
    events.push({
      ts: nowIso, type: "label_purchased", platform: "system",
      customerId: s.customer.customerId, orderId: s.shipmentId, amountCents: s.costCents,
      meta: { pack: s.pack, weightLb: s.weightLb, orderIds, destination: s.destination },
    });
    purchased++;
    spend += s.costCents;
  }

  if (events.length) await insertEvents(ch, events);
  return { purchased, totalCostCents: spend };
}
