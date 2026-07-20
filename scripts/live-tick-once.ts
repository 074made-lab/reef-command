/** Run one live tick locally (same logic the Trigger.dev task runs). */
import { chClient } from "../src/lib/store/clickhouse";
import { pgPool } from "../src/lib/store/postgres";
import { runTick } from "../src/lib/live";

process.loadEnvFile(".env.local");

async function main() {
  const ch = chClient();
  const pg = pgPool();
  const out = await runTick(ch, pg, new Date().toISOString());
  console.log("tick:", out);
  await ch.close();
  await pg.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
