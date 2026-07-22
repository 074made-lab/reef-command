/**
 * ASSERTING proof of the label-day manifest against the LIVE Postgres store.
 * Builds the MON batch (weights, weather packs, cost) exactly as the paused
 * label-day run does — WITHOUT purchasing, so the demo world keeps its
 * unshipped orders for the on-camera approval.
 *
 * This is a chronology gate, not a printout: the W28 Monday manifest the owner
 * approves for (synthetic) money must never contain an order from a later
 * auction cycle or from beyond the demo-cycle boundary. Any violation exits
 * non-zero. (The print-only version of this script let a reset-seeded future
 * AUC-29-* order sail through a W28 manifest.)
 *
 * Run: npx tsx scripts/labelday-check.ts
 */
import { pgPool } from "../src/lib/store/postgres";
import { buildManifest, buildShippingDocumentManifest, type Manifest } from "../src/lib/label-day";
import { demoCycleIsoWindow } from "../src/lib/tools";
import { DEMO_AUCTION_WEEK_INDEX } from "../src/lib/demo-clock";
import type { Pool } from "pg";

process.loadEnvFile(".env.local");

const CYCLE_END_ISO = demoCycleIsoWindow(DEMO_AUCTION_WEEK_INDEX).end;
const CYCLE_ID = /^(?:AUC|WEB|MKT)-(\d+)-/;

const failures: string[] = [];
const fail = (message: string) => { failures.push(message); console.error(`  ✗ ${message}`); };

async function assertManifestChronology(pg: Pool, label: string, m: Manifest) {
  console.log(`\n[${label}] ${m.weekLabel} — ${m.shipments.length} shipment(s), ${m.productLabels} product labels, $${Math.round(m.totalCostCents / 100)} total`);

  if (m.weekLabel !== `W${DEMO_AUCTION_WEEK_INDEX}`) {
    fail(`${label}: weekLabel ${m.weekLabel} is not the demo cycle W${DEMO_AUCTION_WEEK_INDEX}`);
  }
  const orderIds = [...new Set(Object.values(m.orderIdsByShipment).flat())];
  if (!m.shipments.length || !orderIds.length) {
    fail(`${label}: manifest is empty — the demo world is not seeded (run the demo reset / pg-seed first)`);
    return;
  }

  // 1. No order id may belong to a later auction cycle (AUC-29-* in W28 etc.).
  for (const id of orderIds) {
    const cycle = id.match(CYCLE_ID);
    if (cycle && Number(cycle[1]) > DEMO_AUCTION_WEEK_INDEX) {
      fail(`${label}: order ${id} belongs to future cycle W${cycle[1]}`);
    }
  }

  // 2. Every order's Postgres ordered_at must precede the demo-cycle boundary.
  const rows = await pg.query<{ external_id: string; ordered_at: Date }>(
    `SELECT external_id, ordered_at FROM orders WHERE external_id = ANY($1::text[])`,
    [orderIds]);
  const byId = new Map(rows.rows.map((row) => [row.external_id, row.ordered_at]));
  const boundary = Date.parse(CYCLE_END_ISO);
  for (const id of orderIds) {
    const orderedAt = byId.get(id);
    if (!orderedAt) { fail(`${label}: order ${id} not found in Postgres`); continue; }
    if (orderedAt.getTime() >= boundary) {
      fail(`${label}: order ${id} (${orderedAt.toISOString()}) is at/after the cycle boundary ${CYCLE_END_ISO}`);
    }
  }

  for (const s of m.shipments.slice(0, 8)) {
    console.log(
      `  ${s.shipmentId}  ${s.customer.displayName.padEnd(16)} ${String(s.items).padStart(2)} coral · ${s.weightLb}lb · ${s.pack.padEnd(4)} · $${Math.round(s.costCents / 100)} → ${s.destination} [${s.orderIds.length} order(s): ${s.orderIds.join(",")}]`,
    );
  }
  if (m.weatherFlags.length) {
    console.log(`  weather flags:`);
    for (const w of m.weatherFlags) console.log(`    ${w.shipmentId} ${w.pack}: ${w.reason}`);
  }
}

async function main() {
  const pg = pgPool();
  const t0 = Date.now();
  await assertManifestChronology(pg, "purchase manifest", await buildManifest(pg));
  await assertManifestChronology(pg, "document manifest", await buildShippingDocumentManifest(pg));
  await pg.end();
  console.log(`\n${failures.length === 0 ? "ALL PASS" : `${failures.length} FAILURE(S)`} — chronology bound ${CYCLE_END_ISO} (${Date.now() - t0}ms)`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
