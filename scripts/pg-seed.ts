/**
 * Restore the deterministic Postgres world used by CoralSeller.
 *
 *   npx tsx scripts/pg-seed.ts --weeks 10 --wipe
 */
import { getCustomer, mergeCandidates, pgPool } from "../src/lib/store/postgres";
import { resetSyntheticPostgres } from "../src/lib/synth/reset-postgres";

process.loadEnvFile(".env.local");

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes("--wipe")) {
    throw new Error("pg-seed is reset-based, not incremental: rerun WITH --wipe.");
  }

  const weeks = Number(args[args.indexOf("--weeks") + 1]) || 10;
  const pool = pgPool();
  const client = await pool.connect();
  try {
    const summary = await resetSyntheticPostgres(client, { weeks });
    console.table([summary]);

    const sample = await client.query(`SELECT customers.id FROM customers
      JOIN customer_identities ON customer_identities.customer_id = customers.id
      JOIN orders ON orders.customer_id = customers.id
      GROUP BY customers.id
      HAVING count(DISTINCT customer_identities.platform) >= 2 AND count(DISTINCT orders.id) >= 3
      ORDER BY customers.id LIMIT 1`);
    if (sample.rows[0]) {
      const customer = await getCustomer(client, sample.rows[0].id);
      const merge = await mergeCandidates(client, sample.rows[0].id, "web");
      console.log("customer-360 sample:", JSON.stringify({
        ref: customer?.ref,
        emails: customer?.identity.emails,
        accounts: customer?.identity.accounts,
        totals: customer?.totals,
        orders: customer?.orders.length,
        products: customer?.products.length,
        messages: customer?.messages.length,
        mergeCandidates: merge.length,
      }, null, 2));
    }
  } finally {
    client.release();
    await pool.end();
  }
  console.log("SEED DONE");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
