/**
 * Seam A — DataStore. Every read/write in the system goes through this
 * interface. The hackathon implementation is ClickHouse (OLAP event stream +
 * analytics) plus ClickHouse-managed Postgres (OLTP truth). A port to another
 * stack replaces the implementation, not the callers.
 *
 * Money is integer cents everywhere.
 */

import type {
  AttentionItem, AudienceBreakdown, CoralCategory, CustomerRef,
  CustomerRequest, FunnelStep, LotPrice, OrderSummary, Platform,
  ReportSection, Series, ShipmentLine, WeatherFlag,
} from "./protocol";

/** Append-only event, the OLAP side. Mirrors db/clickhouse/0001_events.sql. */
export type ReefEvent = {
  ts: string;                            // ISO8601
  type:
    // commerce
    | "pageview" | "order_placed" | "order_cancelled" | "inventory_move"
    // auction arc (THU open → SAT close)
    | "auction_opened" | "bid_placed" | "auction_closed" | "auction_won"
    | "discount_code_issued" | "discount_code_redeemed"
    // combined-order pipeline
    | "orders_merged" | "label_purchased" | "label_voided" | "order_shipped"
    | "order_delivered"
    // communication
    | "campaign_sent" | "message_out" | "message_in" | "message_answered"
    | "packing_sms_sent"
    | "request_received" | "case_opened" | "case_decided"
    // ops
    | "weather_checked" | "action_executed";
  platform: Platform | "system";
  sku?: string;
  category?: CoralCategory;
  customerId?: number;                   // 0/absent = unknown or n/a
  orderId?: string;
  amountCents?: number;
  meta?: Record<string, unknown>;
};

// ---------- OLTP shapes ----------

/** The customer-360 profile — Task 1's single read. */
export type Customer360 = {
  ref: CustomerRef;
  identity: {
    name: string;
    emails: string[];
    phones: string[];
    accounts: { platform: Platform; handle: string }[];
  };
  preferences: { categories: CoralCategory[]; contact: "email" | "sms" | "both" };
  totals: { orders: number; spentCents: number; firstOrderAt?: string; lastOrderAt?: string };
  orders: OrderSummary[];
  products: { sku: string; name: string; category: CoralCategory; qty: number; lastAt: string }[];
  messages: { at: string; direction: "in" | "out"; preview: string; campaignId?: string }[];
  requests: CustomerRequest[];
};

export type CaseRecord = {
  caseId: string;
  kind: "doa_claim" | "refund_request" | "beyond_template" | "other";
  orderId?: string;
  customerId: number;
  status: "open" | "approved" | "rejected";
  summary: string;
  evidence: { label: string; detail: string }[];
  createdAt: string;
  decidedAt?: string;
};

export type RevenuePulse = {
  weekToDateCents: number;
  ordersWeekToDate: number;
  deltaWoWPct: number;
  hourly: { t: string; v: number }[];
};

export interface DataStore {
  // ---------- OLAP (ClickHouse) ----------
  insertEvents(events: ReefEvent[]): Promise<void>;
  revenuePulse(): Promise<RevenuePulse>;
  salesTimeline(fromIso: string, toIso: string, bucket: "minute" | "hour" | "day"): Promise<Series[]>;
  auctionBoard(): Promise<{ lots: LotPrice[]; closesAt: string }>;
  cycleFunnel(weekLabel: string): Promise<FunnelStep[]>;
  weeklyReport(weekLabel: string): Promise<ReportSection[]>;   // public-safe aggregate trend sections
  attentionFeed(): Promise<AttentionItem[]>;

  // ---------- OLTP (Postgres) ----------
  getCustomer(customerId: number): Promise<Customer360 | null>;
  upsertOrder(order: OrderSummary): Promise<{ orderId: string }>;
  mergeOrders(orderIds: string[], customerId: number): Promise<OrderSummary>;   // → combined order
  unshippedShipments(weekLabel: string): Promise<ShipmentLine[]>;
  purchaseLabels(shipmentIds: string[]): Promise<ShipmentLine[]>;              // after waitpoint approval
  voidLabel(shipmentId: string, reason: string): Promise<ShipmentLine>;
  weatherFlags(weekLabel: string): Promise<WeatherFlag[]>;

  // campaigns
  selectAudience(criteria: string): Promise<AudienceBreakdown>;
  recordSends(campaignId: string, customerIds: number[], channel: "email" | "sms"): Promise<void>;

  // cases — the approval bridge between concierge and copilot
  createCase(c: Omit<CaseRecord, "caseId" | "status" | "createdAt">): Promise<CaseRecord>;
  listOpenCases(): Promise<CaseRecord[]>;
  decideCase(caseId: string, decision: "approved" | "rejected"): Promise<CaseRecord>;
}
