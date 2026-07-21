/**
 * One-time fail-closed repair for the current synthetic W28 shipment fixture.
 * The original generator counted every add-on as two corals. This script uses
 * the canonical ReefnBid/add-on plans and changes only the matching shipment's
 * item/weight metadata; it never links orders or executes a merge.
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
    if (plans.length !== 4 || sourceOrders !== 8 || coralUnits !== 11) {
      throw new Error(`refusing repair: expected 4 shipments / 8 source orders / 11 corals; got ${plans.length} / ${sourceOrders} / ${coralUnits}`);
    }
    for (const plan of plans) {
      const shipmentCode = anchorShipmentCode(plan);
      const row = await client.query<{
        id: string;
        status: string;
        items: number;
        weight_lb: string;
      }>(`
        SELECT id, status, items, weight_lb FROM shipments
        WHERE shipment_code = $1 AND customer_id = $2 AND ship_week = 'W28'
          AND status IN ('planned','purchased','held','voided')
        FOR UPDATE`, [shipmentCode, plan.customer.customerId]);
      if (row.rows.length !== 1) {
        throw new Error(`refusing repair: ${shipmentCode} did not resolve to exactly one W28 shipment`);
      }
      const before = row.rows[0];
      console.log(`${shipmentCode}: ${before.items} -> ${plan.totalCoralUnits} corals`);
      if (apply) {
        await client.query(`
          UPDATE shipments SET items = $2, weight_lb = $3
          WHERE id = $1`, [before.id, plan.totalCoralUnits, weightLb(plan.totalCoralUnits)]);
      }
    }
    if (apply) await client.query("COMMIT");
    else await client.query("ROLLBACK");
    console.log(apply ? "applied: 4 synthetic shipment totals now sum to 11" : "dry run only; pass --apply to repair");
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
