/** Apply db/postgres/*.sql to the managed Postgres service. Idempotent. */
import { readFileSync } from "node:fs";
import { Client } from "pg";

process.loadEnvFile(".env.local");

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error("POSTGRES_URL is not set (.env.local)");
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const ver = await client.query("SELECT version()");
  console.log("connected:", ver.rows[0].version.split(" on ")[0]);

  const ddl = readFileSync("db/postgres/0001_initial.sql", "utf8");
  try {
    await client.query(ddl);
    console.log("DDL applied");
  } catch (e: unknown) {
    const msg = (e as Error).message;
    // re-runs hit the ALTER TABLE … ADD CONSTRAINT (not IF NOT EXISTS-able) — fine
    if (msg.includes("already exists")) console.log("DDL already applied:", msg);
    else throw e;
  }

  const tables = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  console.log("tables:", tables.rows.map((r) => r.tablename).join(", "));
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
