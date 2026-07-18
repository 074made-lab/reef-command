# Reef Command — Design (DRAFT — not final; under active discussion)

A two-sided chat agent for a live coral e-commerce store, built for the
ClickHouse × Trigger.dev Virtual Summer Hackathon 2026 ("Beyond the Wall of
Text"). Every answer is a visual, interactive component — text is the garnish,
not the meal.

Two chat surfaces share one data plane and one agent runtime:

- **Merchant copilot** (internal) — "what needs my attention?", live revenue
  pulse, sales anomaly drill-down, shipping weather verdicts, inventory drift
  with one-click gated actions.
- **Customer concierge** (external) — "where's my order?", product explorer,
  shipping ETA. Requests beyond the agent's authority (claims, refunds) become
  evidence-backed **cases** that surface in the merchant copilot for one-click
  human approval. Money is never spent by the agent.

The domain is real: the design is modeled on the operations of an actual coral
store (shipping live animals Tue/Wed only, weather-gated packing, three sales
channels). All data in this repo is synthetic.

## 1. Component protocol

The agent never answers with prose alone. Tools return typed data; the agent
composes a `ComponentSpec` that the frontend renders. The spec is the contract
between agent and UI — everything above it is portable to any stack.

```ts
type ChatResponse = {
  verdict?: string;            // one-line answer, ≤140 chars
  components: ComponentSpec[]; // the actual response
};

type ComponentSpec =
  | { kind: "metric_row";    metrics: Metric[] }                 // live KPI tiles
  | { kind: "timeseries";    series: Series[]; annotations?: Annotation[] }
  | { kind: "heatmap";       rows: string[]; cols: string[]; cells: Cell[] }
  | { kind: "verdict_card";  verdict: string; confidence: "high"|"medium"|"low";
      evidence: Evidence[] }                                     // fused decision
  | { kind: "weather_strip"; hours: HourTemp[]; policy: PackVerdict }
  | { kind: "order_card";    order: OrderSummary; timeline: TimelineStep[];
      actions?: ActionChip[] }
  | { kind: "aging_queue";   items: AgingItem[]; slaHours: number }
  | { kind: "product_grid";  products: ProductCard[]; filters: FilterState }
  | { kind: "case_card";     caseId: string; evidence: Evidence[];
      actions: ActionChip[] };                                   // approval gate

type ActionChip = {
  taskId: string;              // Trigger.dev task to fire
  label: string;
  payload: Record<string, unknown>;
  risk: "auto" | "gated";      // gated = requires explicit human click
};
```

Action chips are the "beyond text" loop closer: clicking one fires a
Trigger.dev task; results stream back via Realtime and the component re-renders.

## 2. Action catalog (risk-tiered)

| Action | Tier | Notes |
|---|---|---|
| Attention inbox / aging queue | read-only | unanswered conversations, SLA-colored |
| Ship-day radar (next-24h orders) | read-only | countdown + weather flags |
| Revenue pulse, anomaly drill-down | read-only | |
| Address validation & fix | auto → gated | clean fix auto; ambiguous → chip |
| Inventory sync across channels | gated | chip on drift heatmap |
| Hold order / void label | gated | |
| File claim / support case | gated | agent assembles evidence only |
| Discount within SOP limits | auto | policy codified as a tool |
| Discount beyond SOP / refund / any money movement | **human-only** | agent files a case; never executes |
| Goodwill gift (budget-capped) | gated | |

## 3. Architecture & the two seams

```
Next.js chat UI (two surfaces: /merchant, /shop)
        │  ComponentSpec JSON + Trigger.dev Realtime
Trigger.dev chat.agent() ── tools ──┐
Trigger.dev scheduled tasks         │  seam A: DataStore interface
  (synthetic event generator)       │
        ┌───────────────────────────┴──────────────┐
        │ ClickHouse Cloud (PRIMARY: event stream, │
        │ materialized views, analytics)           │
        │ ClickHouse-managed Postgres (OLTP:       │
        │ orders, inventory truth, cases)          │
        └──────────────────────────────────────────┘
  seam B: TaskRunner interface (action execution)
```

- **Seam A (`DataStore`)**: all reads/writes go through one interface.
  Hackathon: ClickHouse + Postgres. The agent logic never imports a DB client
  directly.
- **Seam B (`TaskRunner`)**: actions are named tasks with payloads. Hackathon:
  Trigger.dev tasks.

Everything above the seams (agent tools, component protocol, UI) is
infrastructure-agnostic by construction.

### OLTP + OLAP (bonus category)

Postgres (ClickHouse-managed) holds transactional truth: current inventory,
order state, open cases. ClickHouse holds the append-only event stream and
powers every visual. An approved action writes to Postgres, emits an event to
ClickHouse, and the affected charts update live — one click demonstrates the
full OLTP→OLAP loop.

## 4. Data model (synthetic, high-volume)

ClickHouse tables (MergeTree): `events` (orders, bids, messages, inventory
moves, pageviews — millions of rows via generator + continuous scheduled
inserts), materialized views for revenue rollups, SLA aging, drift detection.
Postgres tables: `orders`, `inventory`, `cases`, `action_log`.

Generator personality: three channels (web / auction / marketplace), auction
spikes at night, weekend browse surges, occasional address typos, drift
injections — so every demo question has something real to find.

## 5. Demo script (5 min, opens with live screen recording)

1. Merchant: "How's business right now?" → metric_row + timeseries ticking
   live as the generator inserts.
2. Merchant: "Why did sales spike last night?" → anomaly drill-down →
   verdict_card naming the auction that caused it.
3. Merchant: "Can I ship to Denver on Tuesday?" → weather_strip + pack
   verdict ("add heat pack — arrival window drops to 38°F").
4. Merchant: "Which corals risk overselling?" → drift heatmap → click sync
   chip → task runs → chart re-renders.
5. Closing, two windows side-by-side: customer files a DOA claim with the
   concierge → case_card appears in merchant copilot with evidence → merchant
   approves → customer's chat updates in real time.
6. 60-second architecture walkthrough (both tools, OLTP+OLAP loop).

## 6. Build sequence

- Days 2–4: merchant copilot end-to-end (risk floor: submittable alone).
- Days 5–6: concierge + case bridge (cut breadth, protect the closing scene).
- Day 7: polish, README, video, flip repo public, submit.

## 7. Hackathon compliance

- ClickHouse is the primary database; Postgres is the ClickHouse-managed
  optional addition (per rules).
- Trigger.dev `chat.agent()` is the agent runtime, literally.
- All code written inside the 2026-07-17 → 07-23 window (git history is the
  evidence). No proprietary code; no real customer data; secrets in `.env*`
  only, never committed.
- MIT license; repo flips public at submission.
