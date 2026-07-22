import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import { resetSyntheticPostgres } from "../src/lib/synth/reset-postgres";

type LoggedQuery = { sql: string; values?: unknown[] };

class FakeClient {
  queries: LoggedQuery[] = [];
  constructor(private readonly failPattern?: RegExp) {}

  async query(sql: string, values?: unknown[]) {
    this.queries.push({ sql, values });
    if (this.failPattern?.test(sql)) throw new Error("synthetic query failure");
    if (sql.includes("(SELECT count(*)::int FROM customers)")) {
      return {
        rows: [{ customers: 10, identities: 20, orders: 0, items: 0, shipments: 0, messages: 0, requests: 0, cases: 0, campaigns: 0, sends: 0 }],
      };
    }
    return { rows: [] };
  }
}

async function main() {
  const success = new FakeClient();
  const summary = await resetSyntheticPostgres(success as unknown as PoolClient, {
    weeks: 0,
    now: new Date("2026-07-21T12:00:00.000Z"),
  });
  const successSql = success.queries.map((query) => query.sql);
  assert.equal(successSql[0], "BEGIN");
  assert.match(successSql[1], /pg_advisory_xact_lock/);
  assert.match(successSql[2], /TRUNCATE[\s\S]*merge_runs[\s\S]*action_log[\s\S]*report_snapshots/);
  assert.equal(successSql.at(-1), "COMMIT");
  assert.equal(summary.customers, 10);

  const failed = new FakeClient(/TRUNCATE/);
  await assert.rejects(
    resetSyntheticPostgres(failed as unknown as PoolClient, { weeks: 0 }),
    /synthetic query failure/,
  );
  assert.equal(failed.queries.at(-1)?.sql, "ROLLBACK", "a failed reset must roll back the transaction");
  assert.ok(!failed.queries.some((query) => query.sql === "COMMIT"));

  const routeSource = await readFile("src/app/api/demo/reset/route.ts", "utf8");
  const runnerSource = await readFile("src/components/chat/DemoResetRunner.tsx", "utf8");
  const actionSource = await readFile("src/app/api/actions/route.ts", "utf8");
  const doaRouteSource = await readFile("src/app/api/demo/doa-resolution/route.ts", "utf8");
  const shipRouteSource = await readFile("src/app/api/demo/ship-day-exception/route.ts", "utf8");
  const operationLockSource = await readFile("src/lib/demo-operation-lock.ts", "utf8");
  const doaTaskSource = await readFile("src/trigger/doa-resolution.ts", "utf8");
  const shipTaskSource = await readFile("src/trigger/ship-day-exception.ts", "utf8");
  const labelTaskSource = await readFile("src/trigger/label-day.ts", "utf8");
  const liveTickSource = await readFile("src/trigger/live-tick.ts", "utf8");
  const reefChatSource = await readFile("src/trigger/reef-chat.ts", "utf8");
  assert.match(routeSource, /await requireOwner\(\)/, "reset must require the signed owner session");
  assert.match(routeSource, /Same-origin request required/, "reset must reject cross-origin calls");
  assert.match(routeSource, /application\/json/, "reset must require JSON requests");
  assert.match(routeSource, /REEF_DEMO_RESET_ENABLED/, "production reset must be explicitly enabled");
  assert.match(routeSource, /resetInFlight/, "concurrent reset clicks must share one server operation");
  assert.match(routeSource, /runs\.cancel/, "reset must stop old durable workflows before reseeding");
  assert.match(routeSource, /label-day[\s\S]*doa-resolution[\s\S]*ship-day-exception[\s\S]*live-tick[\s\S]*reef-chat/, "all Postgres-mutating Trigger tasks and producers must be stopped");
  for (const source of [actionSource, doaRouteSource, shipRouteSource]) {
    assert.match(source, /tryDemoOperation\(pgPool\(\)\)/, "mutating routes must participate in the durable reset lock");
    assert.match(source, /operation\.release\(\)/, "mutating routes must release their durable lock");
  }
  assert.match(operationLockSource, /pg_try_advisory_lock_shared/, "actions must use the shared Postgres advisory lock");
  assert.match(operationLockSource, /pg_advisory_lock\(\$1\)/, "reset must use the exclusive Postgres advisory lock");
  for (const source of [doaTaskSource, shipTaskSource, labelTaskSource]) {
    assert.match(source, /tryDemoOperation/, "mutating Trigger tasks must refuse writes during reset");
    assert.match(source, /operation[\s\S]*release/, "mutating Trigger tasks must release their durable lock");
  }
  assert.match(liveTickSource, /tryDemoOperation/, "the scheduled Postgres writer must participate in the durable lock");
  assert.match(reefChatSource, /tryDemoOperation[\s\S]*buildManifest[\s\S]*labelDay\.trigger/, "the chat label-run producer must hold the durable lock through trigger admission");
  assert.match(runnerSource, /startsWith\("reef-command:"\)/, "success must clear every CoralSeller session key");
  assert.match(runnerSource, /window\.location\.replace\("\/merchant"\)/, "success must return to a fresh Sunday page");

  console.log("demo-reset-check: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
