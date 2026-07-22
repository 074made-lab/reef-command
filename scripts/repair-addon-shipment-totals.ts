/**
 * Fail-closed repair for the current synthetic shipment fixture. This
 * script derives every count from the canonical ReefnBid/add-on plans instead
 * of freezing totals that drift when the deterministic seed gains an order.
 * It changes only matching shipment item/weight metadata; it never links
 * orders or executes a merge.
 *
 * Dry run: node --import tsx scripts/repair-addon-shipment-totals.ts
 * Apply:   node --import tsx scripts/repair-addon-shipment-totals.ts --apply
 */
import { Client } from "pg";
import { anchorShipmentCode } from "../src/lib/merge-actions";
import { currentAddonMergePlans } from "../src/lib/tools";
import { weightLb } from "../src/lib/synth/generator";

process.loadEnvFile(".env.local");

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error("POSTGRES_URL is not set (.env.local)");
  const apply = process.argv.includes("--apply");
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN");
    const plans = await currentAddonMergePlans(client);
    const sourceOrders = plans.reduce((sum, plan) => sum + 1 + plan.addons.length, 0);
    const coralUnits = plans.reduce((sum, plan) => sum + plan.totalCoralUnits, 0);
    if (!plans.length || plans.some((plan) => !plan.addons.length || plan.totalCoralUnits < 2)) {
      throw new Error(`refusing repair: invalid canonical plan set (${plans.length} shipments / ${sourceOrders} source orders / ${coralUnits} corals)`);
    }
    let matchedShipments = 0;
    for (const plan of plans) {
      const shipmentCode = anchorShipmentCode(plan);
      const shipWeek = `W${plan.weekIndex}`;
      const row = await client.query<{
        id: string;
        status: string;
        items: number;
        weight_lb: string;
      }>(`
        SELECT id, status, items, weight_lb FROM shipments
        WHERE shipment_code = $1 AND customer_id = $2 AND ship_week = $3
          AND status IN ('planned','purchased','held','voided')
        FOR UPDATE`, [shipmentCode, plan.customer.customerId, shipWeek]);
      if (row.rows.length > 1) {
        throw new Error(`refusing repair: ${shipmentCode} resolved to multiple ${shipWeek} shipments`);
      }
      if (!row.rows.length) {
        console.log(`${shipmentCode}: no existing shipment row; merge execution will create it`);
        continue;
      }
      matchedShipments += 1;
      const before = row.rows[0];
      console.log(`${shipmentCode}: ${before.items} -> ${plan.totalCoralUnits} corals`);
      if (apply) {
        await client.query(`
          UPDATE shipments SET items = $2, weight_lb = $3
          WHERE id = $1`, [before.id, plan.totalCoralUnits, weightLb(plan.totalCoralUnits)]);
      }
    }
    if (!matchedShipments) throw new Error("refusing repair: no canonical shipment rows matched");
    if (apply) await client.query("COMMIT");
    else await client.query("ROLLBACK");
    console.log(apply
      ? `applied: repaired ${matchedShipments} existing shipment rows from ${plans.length} canonical plans`
      : `dry run only: ${plans.length} shipments / ${sourceOrders} source orders / ${coralUnits} corals; ${matchedShipments} existing rows would be repaired`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
