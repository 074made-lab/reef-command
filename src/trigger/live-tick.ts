/**
 * Trigger.dev scheduled task — the store's heartbeat. Every minute, one
 * minute of synthetic reality flows into ClickHouse (charts tick live) and
 * Postgres (truth advances, merge candidates appear).
 */
import { schedules } from "@trigger.dev/sdk";
import { chClient } from "../lib/store/clickhouse";
import { pgPool } from "../lib/store/postgres";
import { runTick } from "../lib/live";
import { tryDemoOperation } from "../lib/demo-operation-lock";

export const liveTick = schedules.task({
  id: "live-tick",
  cron: "* * * * *",
  maxDuration: 55,
  retry: { maxAttempts: 1 },   // a missed minute is harmless; a replayed one double-counts
  run: async (payload) => {
    const ch = chClient();
    const pg = pgPool();
    const operation = await tryDemoOperation(pg);
    if (!operation) {
      await ch.close();
      return { skipped: true, reason: "demo-reset" };
    }
    try {
      return await runTick(ch, pg, payload.timestamp.toISOString());
    } finally {
      await operation.release();
      await ch.close();
    }
  },
});
