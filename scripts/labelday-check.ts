/**
 * Read-only proof of the label-day manifest against the LIVE Postgres store.
 * Builds the MON batch (weights, weather packs, cost) exactly as the paused
 * label-day run does — WITHOUT purchasing, so the demo world keeps its
 * unshipped orders for the on-camera approval.
 *
 * Run: npx tsx scripts/labelday-check.ts
 */
import { pgPool } from "../src/lib/store/postgres";
import { buildManifest } from "../src/lib/label-day";

process.loadEnvFile(".env.local");

async function main() {
  const pg = pgPool();
  const t0 = Date.now();
  const m = await buildManifest(pg);
  console.log(`\nManifest ${m.weekLabel} — ${m.shipments.length} shipment(s), ${m.productLabels} product labels, $${Math.round(m.totalCostCents / 100)} total (${Date.now() - t0}ms)\n`);
  for (const s of m.shipments.slice(0, 8)) {
    console.log(
      `  ${s.shipmentId}  ${s.customer.displayName.padEnd(16)} ${String(s.items).padStart(2)} coral · ${s.weightLb}lb · ${s.pack.padEnd(4)} · $${Math.round(s.costCents / 100)} → ${s.destination} [${s.orderIds.length} order(s): ${s.orderIds.join(",")}]`,
    );
  }
  if (m.weatherFlags.length) {
    console.log(`\n  weather flags:`);
    for (const w of m.weatherFlags) console.log(`    ${w.shipmentId} ${w.pack}: ${w.reason}`);
  }
  await pg.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
