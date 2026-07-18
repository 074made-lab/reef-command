/**
 * Seam A — DataStore. Every read/write in the system goes through this
 * interface. The hackathon implementation is ClickHouse (OLAP stream +
 * analytics) plus ClickHouse-managed Postgres (OLTP truth). A port to another
 * stack replaces the implementation, not the callers.
 */

import type { AgingItem, OrderSummary, ProductCard } from "./protocol";

/** Append-only event, the OLAP side. */
export type ReefEvent = {
  ts: string;                            // ISO8601
  type:
    | "order_placed" | "order_shipped" | "bid_placed" | "auction_ended"
    | "message_in" | "message_answered" | "inventory_move" | "pageview"
    | "draft_edited" | "action_executed";
  channel: "web" | "auction" | "marketplace";
  sku?: string;
  orderId?: string;
  amountUsd?: number;
  meta?: Record<string, unknown>;
};

export type RevenuePulse = {
  todayUsd: number; ordersToday: number; deltaPct: number;
  minutely: { t: string; v: number }[];
};

export type DriftRow = {
  sku: string; name: string;
  byChannel: Record<string, number>;     // channel -> listed qty
  truth: number;                         // OLTP inventory
  risk: "oversell" | "understock" | "ok";
};

export type CaseRecord = {
  caseId: string; kind: "doa_claim" | "refund_request" | "discount_over_sop" | "other";
  orderId: string; status: "open" | "approved" | "rejected";
  summary: string; evidence: { label: string; detail: string }[];
  createdAt: string; decidedAt?: string;
};

export interface DataStore {
  // OLAP — analytics reads
  insertEvents(events: ReefEvent[]): Promise<void>;
  revenuePulse(): Promise<RevenuePulse>;
  salesTimeline(fromIso: string, toIso: string, bucket: "minute" | "hour"): Promise<{ t: string; v: number; channel: string }[]>;
  anomalyWindow(dayIso: string): Promise<{ t: string; v: number; expected: number }[]>;
  agingQueue(slaHours: number): Promise<AgingItem[]>;
  inventoryDrift(): Promise<DriftRow[]>;

  // OLTP — transactional truth
  getOrder(orderId: string): Promise<OrderSummary | null>;
  ordersDueWithin(hours: number): Promise<OrderSummary[]>;
  searchProducts(filters: Record<string, unknown>): Promise<ProductCard[]>;
  setInventory(sku: string, qty: number): Promise<void>;

  // Cases — the approval bridge between concierge and copilot
  createCase(c: Omit<CaseRecord, "caseId" | "status" | "createdAt">): Promise<CaseRecord>;
  listOpenCases(): Promise<CaseRecord[]>;
  decideCase(caseId: string, decision: "approved" | "rejected"): Promise<CaseRecord>;
}
