import type { Pool, PoolClient } from "pg";

const DEMO_OPERATION_LOCK_ID = 7_281_947;

export type DemoOperationLease = {
  client: PoolClient;
  release: () => Promise<void>;
};

async function lease(client: PoolClient, unlockSql: string): Promise<DemoOperationLease> {
  let released = false;
  return {
    client,
    release: async () => {
      if (released) return;
      released = true;
      try {
        await client.query(unlockSql, [DEMO_OPERATION_LOCK_ID]);
      } finally {
        client.release();
      }
    },
  };
}

/** Admit an action only when no reset owns the durable Postgres lock. */
export async function tryDemoOperation(pool: Pool): Promise<DemoOperationLease | null> {
  const client = await pool.connect();
  try {
    const result = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock_shared($1) AS acquired",
      [DEMO_OPERATION_LOCK_ID],
    );
    if (!result.rows[0]?.acquired) {
      client.release();
      return null;
    }
    return lease(client, "SELECT pg_advisory_unlock_shared($1)");
  } catch (error) {
    client.release();
    throw error;
  }
}

/** Reset owns the exclusive lock across task cancellation and database seed. */
export async function acquireDemoReset(pool: Pool): Promise<DemoOperationLease> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [DEMO_OPERATION_LOCK_ID]);
    return lease(client, "SELECT pg_advisory_unlock($1)");
  } catch (error) {
    client.release();
    throw error;
  }
}

export function resetInProgressResponse(): Response {
  return Response.json(
    { ok: false, error: "Demo reset is in progress. This action was not started." },
    { status: 409 },
  );
}
