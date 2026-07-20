/**
 * Component protocol v3 — the contract between the agent and the UI.
 * The agent never answers with prose alone: tools return typed data and the
 * agent composes ComponentSpecs rendered inline in the chat stream.
 * Everything above this file is portable to any data/orchestration stack.
 *
 * Money is integer cents everywhere (matches the SQL schemas; no float money).
 */

// ---------- shared scalars ----------

export type Platform = "auction" | "web" | "marketplace";

export type Metric = {
  label: string;
  value: number;
  unit?: string;          // "$", "orders", "%"
  deltaWoW?: number;      // vs last week, same unit
  deltaMoM?: number;      // vs ~4 weeks ago, same unit
  spark?: number[];       // tiny inline trend, oldest → newest
};

export type SeriesPoint = { t: string; v: number };
export type Series = { name: string; points: SeriesPoint[] };
export type Annotation = { t: string; label: string };

export type Evidence = {
  label: string;          // "Order WEB-4211", "Policy: DOA window"
  detail: string;
  href?: string;
};

export type CustomerRef = {
  customerId: number;
  displayName: string;    // synthetic handle
  tier: 1 | 2 | 3 | 4;    // 4 = first-time
  platforms: Platform[];
};

// ---------- week cycle ----------

export type WeekPhase =
  | "announce"            // TUE–WED  campaign cadence
  | "auction_live"        // THU–SAT  bids streaming
  | "winners"             // SAT      close + codes
  | "addon_window"        // SUN–MON  cross-platform add-ons
  | "label_day"           // MON      manifest → approve → buy
  | "ship_days"           // TUE–WED  combined shipping
  | "report";             // WED      cycle closes

export type PhaseStep = {
  phase: WeekPhase;
  label: string;          // "Auction closes 10pm Sat"
  at: string;             // ISO8601
  status: "done" | "current" | "pending";
};

// ---------- attention & operations ----------

export type AttentionItem = {
  id: string;
  kind: "new_order" | "merge" | "request" | "case" | "message" | "system";
  platform?: Platform;
  headline: string;       // "coral_km ordered on web — merge candidate"
  ageMinutes: number;
  href?: string;          // deep link to the owning card
};

export type OrderLine = { sku: string; name: string; category: CoralCategory; qty: number; priceCents: number };

export type OrderSummary = {
  orderId: string;        // "AUC-1042", "WEB-311", "MKT-88", "CMB-17"
  platform: Platform | "combined";
  customer: CustomerRef;
  items: OrderLine[];
  totalCents: number;
  destination: string;    // "Denver, CO"
  status: "pending" | "paid" | "labeled" | "shipped" | "cancelled" | "held";
  shipWeek: string;       // "2026-W30"
};

export type TimelineStep = {
  label: string;
  at?: string;
  status: "done" | "current" | "pending" | "blocked";
};

export type CustomerRequest = {
  requestId: string;
  kind: "cancel_ship" | "hold_next_week" | "address_change" | "late_addon" | "other";
  customer: CustomerRef;
  orderIds: string[];
  detail: string;         // what the customer asked, paraphrased
  receivedAt: string;
};

export type ShipmentLine = {
  shipmentId: string;
  customer: CustomerRef;
  orderIds: string[];     // ≥2 = combined
  items: number;          // coral count → weight
  weightLb: number;       // unit weight × items + platform tare, floored
  destination: string;
  pack: "none" | "heat" | "cold";
  costCents: number;
  status: "planned" | "purchased" | "voided" | "shipped";
};

export type WeatherFlag = {
  shipmentId: string;
  destination: string;
  lowF: number;
  highF: number;
  pack: "heat" | "cold";
  reason: string;         // "arrival window drops to 38°F"
};

export type HourTemp = { hour: string; tempF: number; ok: boolean };
export type PackVerdict = {
  ship: boolean;
  pack: "none" | "heat" | "cold";
  reason: string;
};

// ---------- auction & analytics ----------

export type LotPrice = {
  lotId: string;
  sku: string;
  name: string;
  category: CoralCategory;
  currentBidCents: number;
  bidCount: number;
  leader: string;         // bidder handle
  closesAt: string;
};

export type FunnelStep = {
  label: string;          // "auction win" → "code issued" → "add-on order"
  count: number;
  conversionFromPrev?: number;  // 0–1
};

export type CoralCategory = "zoas" | "euphyllia" | "goni" | "mushroom" | "sps" | "other";

export type ReportSection =
  | { kind: "metrics"; title: string; metrics: Metric[] }
  | { kind: "table"; title: string;
      columns: string[]; rows: (string | number)[][] }
  | { kind: "series"; title: string; series: Series[] }
  | { kind: "funnel"; title: string; steps: FunnelStep[];
      prevWeeks?: { week: string; overall: number }[] };

// ---------- campaigns ----------

export type AudienceBreakdown = {
  total: number;
  byTier: Record<"1" | "2" | "3" | "4", number>;
  byPlatform: Partial<Record<Platform, number>>;
  criteria: string;       // human-readable selection, e.g. "tier ≤ 2 AND prefers euphyllia"
};

export type MessagePreview = {
  channel: "email" | "sms";
  subject?: string;
  body: string;           // rendered template with sample customer
};

// ---------- actions ----------

/** An executable action. `gated` requires an explicit human click. */
export type ActionChip = {
  taskId: string;                       // TaskRunner task name
  label: string;                        // "Approve batch", "Merge orders"
  payload: Record<string, unknown>;
  risk: "auto" | "gated";
};

// ---------- the component union ----------

export type ComponentSpec =
  // cycle & attention
  | { kind: "cycle_timeline"; phase: WeekPhase; upcoming: PhaseStep[] }
  | { kind: "attention_feed"; items: AttentionItem[] }
  // analytics
  | { kind: "metric_row"; metrics: Metric[] }
  | { kind: "timeseries"; title: string; series: Series[]; annotations?: Annotation[] }
  | { kind: "auction_board"; lots: LotPrice[]; closesAt: string;
      state: "upcoming" | "live" | "closed" }
  | { kind: "funnel"; title: string; steps: FunnelStep[] }
  | { kind: "report"; weekLabel: string; sections: ReportSection[] }
  // operations
  | { kind: "campaign_card"; campaignId: string; phase: WeekPhase;
      audience: AudienceBreakdown; preview: MessagePreview;
      schedule: string; actions: ActionChip[] }
  | { kind: "merge_card"; orders: OrderSummary[]; customer: CustomerRef;
      combined: OrderSummary; confidence: "high" | "low";
      actions?: ActionChip[] }          // low confidence ⇒ gated merge chip
  | { kind: "label_manifest"; weekLabel: string; shipments: ShipmentLine[];
      productLabels: number; weatherFlags: WeatherFlag[];
      totalCostCents: number; actions: ActionChip[] }
  | { kind: "order_card"; order: OrderSummary; timeline: TimelineStep[];
      actions?: ActionChip[] }
  | { kind: "request_card"; request: CustomerRequest;
      autoActionsTaken: string[];       // e.g. "shipping label voided"
      actions: ActionChip[] }
  | { kind: "case_card"; caseId: string; title: string; evidence: Evidence[];
      actions: ActionChip[] }
  | { kind: "verdict_card"; verdict: string;
      confidence: "high" | "medium" | "low"; evidence: Evidence[] }
  | { kind: "weather_strip"; destination: string; hours: HourTemp[];
      policy: PackVerdict };

export type ChatResponse = {
  /** One-line answer, ≤140 chars. Optional — the components are the answer. */
  verdict?: string;
  components: ComponentSpec[];
};
