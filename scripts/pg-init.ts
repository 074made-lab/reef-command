/** Apply db/postgres/*.sql to the managed Postgres service. Idempotent. */
import { readFileSync, readdirSync } from "node:fs";
import { Client } from "pg";

process.loadEnvFile(".env.local");

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error("POSTGRES_URL is not set (.env.local)");
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const ver = await client.query("SELECT version()");
  console.log("connected:", ver.rows[0].version.split(" on ")[0]);

  const migrations = readdirSync("db/postgres")
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of migrations) {
    const ddl = readFileSync(`db/postgres/${file}`, "utf8");
    try {
      await client.query(ddl);
      console.log("DDL applied:", file);
    } catch (e: unknown) {
      const msg = (e as Error).message;
      // The original migration predates a migration ledger and contains one
      // named ALTER constraint. Re-runs may stop there; later files still run.
      if (msg.includes("already exists")) console.log("DDL already applied:", file, msg);
      else throw e;
    }
  }

  const tables = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  console.log("tables:", tables.rows.map((r) => r.tablename).join(", "));
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
