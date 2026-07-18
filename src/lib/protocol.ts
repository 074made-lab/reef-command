/**
 * Component protocol — the contract between the agent and the UI.
 * The agent never answers with prose alone: tools return typed data and the
 * agent composes ComponentSpecs. Everything above this file is portable to
 * any data/orchestration stack.
 */

export type Metric = {
  label: string;
  value: number;
  unit?: string;          // "$", "orders", "msgs"
  delta?: number;         // vs previous period, same unit
  spark?: number[];       // tiny inline trend
};

export type SeriesPoint = { t: string; v: number };
export type Series = { name: string; points: SeriesPoint[] };
export type Annotation = { t: string; label: string };

export type Cell = { row: string; col: string; value: number };

export type Evidence = {
  label: string;          // "Order #4211", "Policy: DOA window"
  detail: string;
  href?: string;
};

export type HourTemp = { hour: string; tempF: number; ok: boolean };
export type PackVerdict = {
  ship: boolean;
  pack: "none" | "heat" | "cold";
  reason: string;         // "arrival window drops to 38°F"
};

export type TimelineStep = {
  label: string;
  at?: string;
  status: "done" | "current" | "pending" | "blocked";
};

export type OrderSummary = {
  orderId: string;
  channel: "web" | "auction" | "marketplace";
  customer: string;       // synthetic display name
  items: { sku: string; name: string; qty: number }[];
  destination: string;    // "Denver, CO"
  shipBy?: string;
};

export type AgingItem = {
  id: string;
  channel: OrderSummary["channel"];
  preview: string;        // first line of the unanswered message
  ageHours: number;
};

export type ProductCard = {
  sku: string;
  name: string;
  priceUsd: number;
  careLevel: "beginner" | "intermediate" | "expert";
  inStock: number;
  imageUrl?: string;
};

export type FilterState = Record<string, string | number | boolean>;

/** An executable action. `gated` requires an explicit human click. */
export type ActionChip = {
  taskId: string;                       // TaskRunner task name
  label: string;                        // "Sync inventory", "Approve claim"
  payload: Record<string, unknown>;
  risk: "auto" | "gated";
};

export type ComponentSpec =
  | { kind: "metric_row"; metrics: Metric[] }
  | { kind: "timeseries"; title: string; series: Series[]; annotations?: Annotation[] }
  | { kind: "heatmap"; title: string; rows: string[]; cols: string[]; cells: Cell[]; actions?: ActionChip[] }
  | { kind: "verdict_card"; verdict: string; confidence: "high" | "medium" | "low"; evidence: Evidence[] }
  | { kind: "weather_strip"; destination: string; hours: HourTemp[]; policy: PackVerdict }
  | { kind: "order_card"; order: OrderSummary; timeline: TimelineStep[]; actions?: ActionChip[] }
  | { kind: "aging_queue"; slaHours: number; items: AgingItem[] }
  | { kind: "product_grid"; products: ProductCard[]; filters: FilterState }
  | { kind: "case_card"; caseId: string; title: string; evidence: Evidence[]; actions: ActionChip[] };

export type ChatResponse = {
  /** One-line answer, ≤140 chars. Optional — the components are the answer. */
  verdict?: string;
  components: ComponentSpec[];
};
