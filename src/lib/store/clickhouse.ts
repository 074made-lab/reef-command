/**
 * ClickHouse side of Seam A — the OLAP event stream and every analytical read.
 * Uses the official @clickhouse/client over HTTPS (ClickHouse Cloud).
 *
 * Env: CLICKHOUSE_URL, CLICKHOUSE_USER, CLICKHOUSE_PASSWORD (.env.local).
 */

import { createClient, type ClickHouseClient } from "@clickhouse/client";
import type { ReefEvent } from "../datastore";

export function chClient(): ClickHouseClient {
  const url = process.env.CLICKHOUSE_URL;
  if (!url) throw new Error("CLICKHOUSE_URL is not set (copy .env.example → .env.local)");
  return createClient({
    url,
    username: process.env.CLICKHOUSE_USER ?? "default",
    password: process.env.CLICKHOUSE_PASSWORD ?? "",
    request_timeout: 120_000,
    compression: { request: true, response: true },
    keep_alive: { enabled: true },
    // Progress headers keep the socket alive under the Cloud load balancer's
    // idle timeout — without them the first cold query can drop with a TLS
    // ECONNRESET (Codex m4). Interval well under request_timeout.
    clickhouse_settings: {
      send_progress_in_http_headers: 1,
      http_headers_progress_interval_ms: "20000",
    },
  });
}

type EventRow = {
  ts: string;
  type: string;
  platform: string;
  sku: string;
  category: string;
  customer_id: number;
  order_id: string;
  amount_cents: number;
  meta: string;
};

export const toRow = (e: ReefEvent): EventRow => ({
  ts: e.ts,
  type: e.type,
  platform: e.platform,
  sku: e.sku ?? "",
  category: e.category ?? "",
  customer_id: e.customerId ?? 0,
  order_id: e.orderId ?? "",
  amount_cents: e.amountCents ?? 0,
  meta: JSON.stringify(e.meta ?? {}),
});

export async function insertEvents(
  client: ClickHouseClient,
  events: ReefEvent[],
  { deduplicate = true }: { deduplicate?: boolean } = {},
): Promise<void> {
  if (!events.length) return;
  await client.insert({
    table: "events",
    values: events.map(toRow),
    format: "JSONEachRow",
    clickhouse_settings: {
      date_time_input_format: "best_effort",
      insert_deduplicate: deduplicate ? 1 : 0,
    },
  });
}

export async function queryRows<T>(client: ClickHouseClient, query: string,
  params: Record<string, unknown> = {}): Promise<T[]> {
  // One bounded retry — reads are idempotent, and a cold connection can drop
  // once with a socket reset before it warms (Codex m4).
  for (let attempt = 1; ; attempt++) {
    try {
      const rs = await client.query({ query, query_params: params, format: "JSONEachRow" });
      return rs.json<T>();
    } catch (e) {
      if (attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}
