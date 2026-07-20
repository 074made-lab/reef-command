/**
 * Trigger.dev scheduled task — the store's heartbeat. Every minute, one
 * minute of synthetic reality flows into ClickHouse (charts tick live) and
 * Postgres (truth advances, merge candidates appear).
 */
import { schedules } from "@trigger.dev/sdk";
import { chClient } from "../lib/store/clickhouse";
import { pgPool } from "../lib/store/postgres";
import { runTick } from "../lib/live";

export const liveTick = schedules.task({
  id: "live-tick",
  cron: "* * * * *",
  maxDuration: 55,
  run: async (payload) => {
    const ch = chClient();
    const pg = pgPool();
    const out = await runTick(ch, pg, payload.timestamp.toISOString());
    await ch.close();
    return out;
  },
});
