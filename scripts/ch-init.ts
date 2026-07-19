/** Apply db/clickhouse/*.sql to the ClickHouse Cloud service. Idempotent. */
import { readFileSync } from "node:fs";
import { chClient } from "../src/lib/store/clickhouse";

process.loadEnvFile(".env.local");

async function main() {
  const client = chClient();
  const ddl = readFileSync("db/clickhouse/0001_events.sql", "utf8");
  const statements = ddl
    .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
    .split(";").map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    const head = stmt.split("\n")[0].slice(0, 70);
    await client.command({ query: stmt });
    console.log("applied:", head);
  }
  const tables = await client.query({ query: "SHOW TABLES", format: "JSONEachRow" });
  console.log("tables:", (await tables.json<{ name: string }>()).map((t) => t.name).join(", "));
  await client.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
