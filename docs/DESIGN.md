# Reef Command — Design (v3)

> **Status:** Public-safe implementation guide, updated 2026-07-21. It records
> only behavior shipped in the public synthetic build. Production TIA Coral identity,
> customer-value, margin, buying, targeting, and fulfillment rules are not
> included.
>
> Built for the ClickHouse × Trigger.dev Virtual Summer Hackathon 2026
> ("Beyond the Wall of Text"). Designed from day one to migrate off hackathon
> infrastructure onto the owner's own stack (§8).

## 0. What this is

**One week of a live-coral e-commerce business, run from one chat window.**

The domain is inspired by
**[TIA Coral, a Long Island live coral store](https://www.tiacoral.com/)**.
All data and operational rules in this repository are invented synthetic
fixtures; they do not document the store's workflow. The compressed synthetic
operating cycle:

```text
SUN  eligible add-ons consolidate + next-auction announcement draft
MON  shipping documents: product labels + shipping labels (weight calc,
     weather check, gated batch purchase)
TUE  combined shipping + Thursday listing drafts + human inventory check
WED  final regular shipping + Tuesday-box monitoring + weekly operations report
THU  auction opens + four launch drafts + Wednesday-box monitoring
FRI  auction momentum + social task + prior-cycle customer resolutions
SAT  last-call approvals → auction close → winner emails + settlement
```

The selectable story is chronological: W28's completed auction feeds Sunday
through Wednesday operations (Jul 19–22), Sunday announces W29, and W29 powers
the Thursday through Saturday auction (Jul 23–25). The public demo auction
opens Thursday at noon and closes Saturday at 8:00 PM ET.

Live-animal fulfillment has little room for missed handoffs: a customer change
can affect packing, carrier state, and the merchant at once. The public demo
uses an invented seven-day scenario to show how one cockpit coordinates those
systems. The weekdays, routing, account links, bands, economics, and rules are
synthetic fixtures, not a description of TIA Coral's current process.

The chat surface is the only entrance: every artifact the system produces is
an interactive component in the conversation; every consequential action is a
chip on a card. Chat is the frame, components are the answers — the hackathon
theme, applied to a real operating rhythm.

The product goal is larger than the public build. Reef Command is intended to
become a mobile-first, role-protected operating surface shared by store owners,
managers, packing staff, and customer-support staff. ClickHouse supplies the
shared operational picture; Trigger.dev supplies durable coordination and
human approval. Public fixtures prove the architecture without publishing real
customer records or the store's private operating logic.

## 1. The four tasks

### Task 1 — Unified customer store (customer 360)

The synthetic data plane keeps one pre-linked customer record available to
every demo task. The repository intentionally does not publish how the real
store resolves identity or values customers:

```text
synthetic customer
├── pre-linked platform references
├── arbitrary demo band (visualization only)
├── synthetic orders and shipment state
├── synthetic messages and requests
└── public-safe action audit
```

Implementation: normalized Postgres tables (`customers`,
`customer_identities`, `orders`, `order_items`, `messages`, `requests`) use
invented records generated for the demo. Every operational change emits an
event into ClickHouse. The generator's linking and bands are test fixtures,
not TIA Coral methods and not production recommendations.

### Task 2 — Campaigns and communication (advertising + operational, one system)

The public build stores synthetic send events so the data layer can demonstrate
communication history. It deliberately publishes no production schedule,
audience-selection, preference, margin, or channel strategy. All outbound
messages in the repository are simulated.

### Task 3 — Combined orders (the core — and the OLTP+OLAP showcase)

This task carries the bonus-category story: every consequential write here
lands in Postgres (transactional truth), emits events to ClickHouse, and the
affected charts update live on screen — see §4 for the two closed loops
(order merge, label batch purchase).

1. **Real-time monitoring + merge.** All three platforms' new orders stream
   in (auction wins, add-ons, and each platform's own organic sales). Every
   new order pings the attention feed; every order triggers a merge check
   against the CRM — when the same customer orders on different platforms,
   the two order cards visibly merge into one combined order on screen.
2. **Shipping documents (MON).** A scheduled durable task: per-order weight from item
   count (per-coral unit weight + per-platform box tare, with a minimum
   billable floor; constants generic) → per-destination weather check
   (heat/cold pack verdicts) → two
   label sets generated: **product labels** (one per sold coral, bag-ready)
   and **shipping labels** (one per customer/combined order) → manifest
   rendered with costs and weather flags → **pauses on a human waitpoint**
   → merchant approves the whole batch with one click → task resumes and
   purchases labels (simulated carrier), progress streaming live to the UI.
   Batch-approve (not fully unattended) is deliberate: label purchase spends
   money, and the approval pause is Trigger.dev's native HITL control.
3. **Autonomous ship-day exception.** One public-safe synthetic example proves
   the loop: a customer changes delivery timing before carrier handoff → a
   Trigger task immediately records the request → the packing team receives a
   simulated SMS hold → a still-voidable demo label is voided → Postgres and
   ClickHouse retain the trace → a floating alert tells the merchant what was
   protected. This is a generic demo policy, not TIA Coral's routing logic.
4. **After-sales first response.** Codified templates answer immediately,
   then report: condition concern → reassurance (shipping stress is normal,
   give it time); DOA → support-ticket link; thank-you → acknowledgment.
   Anything beyond the templates escalates as a case card. Auto-replies are
   template-only — the model never freestyles customer-facing text.
   The public `/shop` proof implements the synthetic DOA-link example plus one
   public-safe order-combining FAQ. Other questions enter the owner attention
   feed. This demonstrates direct service, routing, and human decision authority
   without publishing the real store's policy corpus or response playbook.

### Task 4 — Weekly report (on demand after the last ship day)

Rendered entirely as interactive components, and always shown **against
history**: every headline number carries a week-over-week and
month-over-month delta plus a sparkline, so the report reads as a
trajectory, not a snapshot.

- **Channel analysis:** synthetic platform mix with order and revenue movement.
  The public report deliberately omits customer-value, first-purchase,
  profitability, identity-resolution, and targeting analysis.
- **Product analysis:** invented categories show share and WoW movement as a
  ClickHouse query proof. The public UI remains descriptive and emits no
  stocking, buying, species-margin, or customer-profit recommendation.
- **Auction top 10:** the week's ten highest hammer prices — item, category,
  winner handle, hammer price, vs its base price — the fastest read on what
  the market wants more of next week.
- **Cycle funnel:** auction winner → add-on discount code issued → add-on order using that code
  conversion (`windowFunnel` over the event stream) — the weekly economic
  thesis, quantified in one query and compared against previous weeks.
- **History mechanics:** ClickHouse retains the full event stream, so any
  past week's report is computable on demand — WoW/MoM is a window
  comparison in one query, not a pre-built snapshot pipeline. Each published
  report additionally persists a compact snapshot event (idempotent by week
  label) for audit and fast trend charts.

## 2. Why these two tools (unique-feature mapping)

The design deliberately leans on capabilities each tool has that commodity
alternatives (spreadsheets/local DB; generic workflow builders) do not.

### ClickHouse

| Unique capability | Used for |
|---|---|
| High-rate ingest + sub-second aggregation simultaneously | Thursday-night live auction board while bid events flood in |
| Materialized views (rollups updated on insert, not on cron) | Live revenue, per-platform order flow, cross-platform merge-candidate detection |
| Funnel/sequence SQL (`windowFunnel`, `sequenceMatch`) | The auction→code→add-on conversion funnel (Task 4) in one query |
| Columnar compression, full history retained | Complete cross-platform customer history, forever queryable |

### Trigger.dev

| Unique capability | Used for |
|---|---|
| **Durable event-driven tasks** | Ship-day customer change → packing notification → label void → audited outcome |
| **Human-in-the-loop waitpoints** | Label-manifest batch approval |
| `chat.agent()` with tool approvals | The chat surface itself — the agent runtime |
| Run metadata + polling | Labels purchasing one by one on screen — the approve chip polls the run's metadata to completion (a Realtime subscription is a later step) |
| Code-first TypeScript tasks | Synthetic merge fixtures, weight calculation, and typed orchestration |

## 3. Chat surface and component protocol

The agent never answers with prose alone. Tools return typed data; the agent
composes `ComponentSpec`s the frontend renders inline in the chat stream
(full width, no separate canvas). Two routes: `/merchant` (the live cockpit)
and `/shop` (a deliberately narrow public-safe proof: one synthetic combine
FAQ, one DOA route, plus a human-handoff message in the merchant feed).

```ts
type ChatResponse = {
  verdict?: string;            // one-line answer, ≤140 chars
  components: ComponentSpec[];
};

type ComponentSpec =
  // cycle & attention
  | { kind: "cycle_timeline"; phase: WeekPhase; upcoming: PhaseStep[] }
  | { kind: "attention_feed"; items: AttentionItem[] }        // new orders, requests, cases
  // analytics
  | { kind: "metric_row";    metrics: Metric[] }
  | { kind: "timeseries";    series: Series[]; annotations?: Annotation[] }
  | { kind: "auction_board"; lots: LotPrice[]; closesAt: string }   // live THU board
  | { kind: "funnel";        steps: FunnelStep[] }                  // auction→code→add-on
  | { kind: "report";        sections: ReportSection[] }            // on-demand weekly report
  // operations
  | { kind: "campaign_card"; audience: AudienceBreakdown; preview: MessagePreview;
      schedule: string; actions: ActionChip[] }
  | { kind: "merge_card";    orders: OrderSummary[]; customer: CustomerRef;
      combined: OrderSummary; actions?: ActionChip[] }
  | { kind: "label_manifest"; shipments: ShipmentLine[]; productLabels: number;
      weatherFlags: WeatherFlag[]; totalCost: number; actions: ActionChip[] }
  | { kind: "order_card";    order: OrderSummary; timeline: TimelineStep[];
      actions?: ActionChip[] }
  | { kind: "request_card";  request: CustomerRequest; autoActionsTaken: string[];
      actions: ActionChip[] }                                  // e.g. "label voided"
  | { kind: "case_card";     caseId: string; evidence: Evidence[];
      actions: ActionChip[] }
  | { kind: "verdict_card";  verdict: string; confidence: "high"|"medium"|"low";
      evidence: Evidence[] }
  | { kind: "weather_strip"; hours: HourTemp[]; policy: PackVerdict };

type ActionChip = {
  taskId: string;              // Trigger.dev task to fire
  label: string;
  payload: Record<string, unknown>;
  risk: "auto" | "gated";      // gated = explicit human click required
};
```

## 4. Architecture

```
Next.js chat UI (/merchant, /shop)
        │  ComponentSpec JSON + run-metadata polling
Trigger.dev chat.agent() ── tools ──────────┐
Trigger.dev label-day task [waitpoint]      │   seam A: DataStore
Trigger.dev ship-day exception task         │
Trigger.dev event-generator scheduled task  │
        ┌───────────────────────────────────┴──────┐
        │ ClickHouse Cloud — OLAP: event stream,   │
        │ materialized views, funnels, reports     │
        │ ClickHouse-managed Postgres — OLTP:      │
        │ customers (CRM), orders, labels,         │
        │ requests, cases, action log              │
        └──────────────────────────────────────────┘
  seam B: TaskRunner (actions; simulated carrier + message sender behind it)
```

- **Seam A (`DataStore`)**: all reads/writes through one interface; agent
  logic never imports a DB client.
- **Seam B (`TaskRunner`)**: actions are named tasks with payloads; the
  simulated carrier and message sender sit behind it, so real services are
  drop-ins later.

### OLTP + OLAP closed loop (bonus category)

Postgres holds transactional truth; ClickHouse holds the append-only event
stream and powers every visual. The label-day loop executes end to end:

- Label manifest approved (owner-gated) → Postgres label rows + spend → label
  events → ClickHouse → ship-radar and cost components update, with recoverable
  idempotency (a partial failure resumes instead of leaving a split).

The merge decision executes one notch lighter: the card is computed live from
the Postgres OLTP scan, and the gated click validates the orders against
Postgres truth, writes the audit row, and emits an `orders_merged` event to
ClickHouse (deduped per customer+cycle). Not money, not physical — the orders
consolidate into one labeled box at label day, like the real store.

One click, both databases, visible consequence — that is the integration
contract.

## 5. Action tiers and boundaries

| Action | Tier |
|---|---|
| Order merge (same-customer detection) | auto, with visible card + undo |
| Label batch purchase | gated (one click per manifest) |
| Synthetic ship-day timing change | auto: packing hold + demo label void + report |
| After-sales first response | auto, codified templates only |
| Refunds, payments, anything money-moving beyond the above | human-only; agent files a case |

Boundaries (constitutional, unchanged from v2): money decisions are human;
no fabricated numbers or policies (honest refusal instead); no free-form
model text to customers; the agent never widens its own authority.

## 6. Data: shape-calibrated synthesis

1. **Zero row-level real data.** No real order, customer, e-mail, or amount
   enters this repo or any third-party service. (Public repo + hackathon
   rules + owner's data-sovereignty stance.)
2. **Plausible public shape.** The generator creates an invented weekly rhythm,
   varied synthetic order sizes, arbitrary demo bands, and generic exceptions.
   It is not calibrated to expose TIA Coral's distribution, identity logic,
   profitability, customer valuation, targeting, or species economics.
3. **Deterministic synthetic seed.** An idempotent seed plants a full auction
   arc, winners who add on cross-platform, one
   cold-destination shipment, one cancel-after-label request, one DOA claim,
   organic sales on every platform. Live low-volume inserts run on top for
   ticking charts. Operational checks never rely on randomness.
4. **Scale & depth:** 8–12 weeks of backfill at realistic volume (hundreds
   of thousands to millions of events — bids, pageviews, messages, orders,
   inventory moves) so ClickHouse's speed is visible rather than claimed,
   and so the report's week-over-week and month-over-month comparisons have
   real history behind them.

## 7. Evaluation — the judge test

A blind set of 20–30 questions (half owner-written, half builder-written;
data / policy / definition / must-refuse categories), run after build:

- ✅ correct answer with correct component
- ✅ honest refusal where data doesn't exist
- ❌ fabricated number or policy → automatic fail, fix before submission

## 8. Migration home

Hackathon infrastructure is deliberately disposable; the seams are the
escape hatch.

| Hackathon | Home replacement |
|---|---|
| ClickHouse (events + analytics) | owner's SQLite event bus (schema mirrored from day one) |
| ClickHouse-managed Postgres (OLTP) | same SQLite CRM (tables/fields aligned) |
| Trigger.dev tasks + waitpoints | launchd + scripts + home approval queue |
| Trigger.dev `chat.agent()` | Claude API direct |
| Simulated carrier / message sender | real label pipeline / real e-mail+SMS services |

**What migrates untouched:** UI + component protocol · label-day and exception
orchestration patterns · report query shapes · the judge-test set. Production
identity, segmentation, campaign, margin, and fulfillment policies remain in
the owner's private systems and are not migration artifacts from this repo.

The production path adds mobile-first staff access and role-based permissions:
owners retain policy and money authority; managers coordinate exceptions;
packing and customer-support roles receive only the views and actions required
for their work. Every consequential action remains attributable and auditable.

## 9. Shipped public scope

- Trigger.dev `chat.agent()` with typed ClickHouse/Postgres read tools.
- Three executable priorities per demo day with chat-lifecycle progress, a
  persistent session checklist, and a compact live progress dock.
- Trigger.dev label-day task with a human waitpoint and progress metadata.
- Trigger.dev autonomous ship-day exception task with synthetic SMS, label
  void, audit log, and ClickHouse events.
- Scheduled synthetic live tick, interactive merge, attention, auction, label,
  and report components.
- No production campaign, identity-resolution, customer-valuation, buying,
  margin, species-profit, or fulfillment-policy implementation.

## 10. Hackathon compliance

- ClickHouse is the primary database; Postgres is the ClickHouse-managed
  optional addition (per rules).
- Trigger.dev `chat.agent()` is the agent runtime; durable tasks + waitpoints
  + run-metadata polling are used materially, not decoratively.
- All code written inside the 2026-07-17 → 07-23 window (git history is the
  evidence). No proprietary code; no real customer data; secrets in `.env*`
  only, never committed.
- MIT license; repo flips public at submission.
- Attribution: README and this document credit
  [TIA Coral](https://www.tiacoral.com/) as the business inspiration, always paired with the
  synthetic-data + simplified-details disclaimer. No real internal numbers,
  no real message templates, no "TIA currently does X" claims.
