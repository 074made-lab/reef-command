# Reef Command — Design (v2)

> **Status:** Capability skeleton approved by owner 2026-07-18. Implementation
> details may still evolve after team review. No application code has been
> written against this document yet.
>
> Built for the ClickHouse × Trigger.dev Virtual Summer Hackathon 2026
> ("Beyond the Wall of Text"). Designed from day one to migrate off hackathon
> infrastructure and into the owner's own stack (see §9).

## 0. What this is

**Reef Command is the operational front door for a small physical-commerce
business — and the engine that gradually, auditably takes over its digital
operations.**

It is a chat agent whose answers are visual, interactive components. But the
product thesis is bigger than rendering: today the business runs on ~23
scheduled jobs that push reports at a human, plus static dashboards and a
command-line approval queue. **The human is the bus** — every signal converges
on the owner, who merges, judges, decides, and executes.

Reef Command inverts that. One conversational surface where the owner:

1. sees what needs attention the moment they open it,
2. can ask *any* question about the business and get a correct answer or an
   honest refusal,
3. approves consequential actions with one click on assembled evidence, and
4. — critically — where **every click teaches the system**, so the set of
   things that still need a human shrinks measurably over time.

**North-star metric:** owner decisions per week go *down* while business
metrics go *up*. That is the progress bar of an AI-native company.

The domain is a real live-coral e-commerce operation (Tue/Wed-only shipping of
live animals, weather-gated packing, three sales channels, weekly auctions).
All data in this repo is synthetic (§8), but the problems are not.

## 1. Operating doctrine

The design implements one loop, borrowed from the owner's company constitution:

```text
GOAL -> SENSE -> IDENTIFY -> PRIORITIZE -> ACT OR REQUEST HUMAN
     -> VERIFY -> FOLLOW UP -> LEARN
```

Most ops tooling only covers the middle (SENSE/IDENTIFY/ACT: dashboards,
alerts, runbooks). The two ends — GOAL/PRIORITIZE (what should we do next?)
and FOLLOW UP/LEARN (did it close? did we get smarter?) — normally live in the
owner's head. Capability 0 exists to move them into the system.

Hard boundaries (constitutional, non-negotiable):

- **Money is always human**: refunds, charges, purchases, transfers. The agent
  assembles evidence and asks; it never executes.
- **No fabrication**: every number traces to a query, every policy answer to a
  document. Unknown stays unknown, stated plainly.
- **No proactive customer outreach**; the concierge is inbound-only.
- **The agent never widens its own authority** — promotion is proposed with
  evidence and decided by the owner (§5).

## 2. Capability stack

Capability 0 is the operating system; 1–5 run inside it.

### Capability 0 — Goal engine (the part that leads)

| Piece | Behavior |
|---|---|
| **Live goals** | Weekly funnel targets (awareness / trust / sales) held as state, not a doc. "How are we doing?" → gap-to-target with the driver named, not a data dump. |
| **Daily proposal** | The first message of the day is not a report but a ranked proposal: "Today I suggest X — biggest impact on this week's gap; here's what I've already prepared." Ranking = impact × urgency × confidence × risk. |
| **Commitments ledger** | Every case, accepted suggestion, and human request is tracked to *verified* closure. Nothing evaporates; "whatever happened to…?" always has an answer. |
| **Click-to-learn** | Every owner action in the UI is a recorded training signal: draft edits → tone corpus; rejections → rule proposals; repeated identical approvals → promotion evidence. |
| **Authority promotion flywheel** | When an action type accumulates a clean track record (N approvals, ~zero edits/incidents), the agent files a promotion request *with the evidence attached*: "You approved this 11 times unmodified — promote to auto?" Owner decides. |
| **Takeover map** | A live view of every action type's tier (observe / recommend / draft / execute), its track record, and what promotion would require. The AI-takeover progress bar. |

### Capability 1 — The morning three (proactive)

The owner's actual daily rhythm, in priority order, exceptions first,
everything actionable in place and queryable any time of day:

1. **Is anyone waiting on me?** Cross-channel unanswered-message queue, SLA
   aging, customer context (history, tier, open orders), and a ready reply
   draft beside each item. DOA/dispute/return intakes pinned to top.
2. **What ships next?** Ship-day countdown (Tue/Wed only), per-order
   readiness: paid? label bought? weather verdict (heat/cold pack)? holds?
   address problems? Stuck orders in their own lane, each with a next action.
3. **Is everything running?** Overnight jobs in business language ("inventory
   reconcile didn't run → today's drift detection is blind"), site/webhook
   liveness, cross-channel inventory drift and oversell risk, yesterday's
   revenue in one line with a vs-normal signal.

### Capability 2 — Answer anything (reactive)

Three answer layers; this is what separates a product from a demo:

- **L1 Curated**: high-frequency questions get purpose-built tools and rich
  components (the queue, the radar, the heatmap, the weather strip).
- **L2 Open analytics**: a guarded **read-only** SQL tool over the warehouse +
  a **semantic layer** (`metrics/` — the business dictionary: what counts as
  revenue, channel enums, ship-day rules, DOA-rate numerator/denominator) so
  the model composes *correct* queries for the long tail; a generic component
  fallback renders any result shape (table / timeseries / bar).
- **L3 Business knowledge**: policy and how-we-operate questions answered from
  a versioned `docs/business/` knowledge base (shipping policy, DOA policy,
  channel notes), every answer citing its source card.

**Honesty contract:** if the data doesn't exist, say so and offer the nearest
answerable thing. Fabrication is a hard product failure (§10 scores it zero).

### Capability 3 — Explain and suggest

- **Anomaly attribution**: not "sales spiked" but "the 9pm auction drove it;
  AOV 30% below normal; mostly new buyers."
- **Evidence-backed suggestions**: slow movers to reprice, customers gone
  quiet, channel trends — each with source data and a counter-metric, and each
  lands in the commitments ledger if accepted. Suggest-only.

### Capability 4 — Cases and gated actions

- Requests beyond authority (refunds, claims, big disputes) become a **case**:
  what happened, customer history, order evidence, policy basis, recommended
  options. One click to decide.
- **Risk tiers**: `auto` (typo-level address fix) · `gated` (inventory sync,
  hold order, void label, budget-capped goodwill) · `human-only` (anything
  touching money — the agent files a case, never executes).
- Every action is audit-logged: who approved, when, payload, outcome. The
  audit log doubles as promotion evidence for Capability 0.

### Capability 5 — Customer concierge (same brain, second face)

Order tracking, shipping ETA, policy questions — answered from the *same*
semantic layer and knowledge base as the merchant side, so the two surfaces
can never disagree. Anything beyond authority auto-escalates into a
Capability-4 case, which means the merchant's "waiting on me" queue itself
shrinks: routine questions never reach a human.

## 3. Component protocol

The agent never answers with prose alone. Tools return typed data; the agent
composes a `ComponentSpec` the frontend renders. The spec is the contract
between agent and UI — everything above it is stack-portable.

```ts
type ChatResponse = {
  verdict?: string;            // one-line answer, ≤140 chars
  components: ComponentSpec[]; // the actual response
};

type ComponentSpec =
  | { kind: "metric_row";    metrics: Metric[] }
  | { kind: "timeseries";    series: Series[]; annotations?: Annotation[] }
  | { kind: "heatmap";       rows: string[]; cols: string[]; cells: Cell[] }
  | { kind: "verdict_card";  verdict: string; confidence: "high"|"medium"|"low";
      evidence: Evidence[] }
  | { kind: "weather_strip"; hours: HourTemp[]; policy: PackVerdict }
  | { kind: "order_card";    order: OrderSummary; timeline: TimelineStep[];
      actions?: ActionChip[] }
  | { kind: "aging_queue";   items: AgingItem[]; slaHours: number }
  | { kind: "product_grid";  products: ProductCard[]; filters: FilterState }
  | { kind: "case_card";     caseId: string; evidence: Evidence[];
      actions: ActionChip[] }
  | { kind: "policy_card";   answer: string; source: string }        // L3 citations
  | { kind: "data_table";    columns: Column[]; rows: Row[] }        // L2 fallback
  | { kind: "goal_card";     goal: Goal; progress: number; drivers: Driver[] }
  | { kind: "promotion_card"; actionType: string; trackRecord: TrackRecord;
      proposal: string; actions: ActionChip[] };                     // flywheel

type ActionChip = {
  taskId: string;              // task to fire (Trigger.dev in hackathon)
  label: string;
  payload: Record<string, unknown>;
  risk: "auto" | "gated";      // gated = explicit human click required
};
```

UI layout: components render **inline in the chat stream**, full width. No
separate canvas — the question→component causality must stay visible. Two
routes: `/merchant`, `/shop`.

## 4. Action catalog (risk-tiered)

| Action | Tier | Notes |
|---|---|---|
| Attention queue / ship radar / revenue / anomaly drill-down | read-only | |
| Address validation & fix | auto → gated | clean fix auto; ambiguous → chip |
| Inventory sync across channels | gated | chip on drift heatmap |
| Hold order / void label | gated | |
| File claim / support case | gated | agent assembles evidence only |
| Discount within codified SOP limits | auto | policy is a tool with hard limits |
| Goodwill gift (budget-capped) | gated | |
| Discount beyond SOP / refund / any money movement | **human-only** | case, never executed by agent |
| Authority promotion of any of the above | **human-only** | agent proposes with evidence (Capability 0) |

v1 implements the full protocol but wires **two gated actions end-to-end**
(inventory sync, case approval) plus **one auto action** (address fix). The
rest remain catalog + types; depth over breadth.

## 5. Authority model

Four tiers per action type: `observe → recommend → draft/gated → execute`.
Promotion requires: ≥N clean approvals, ~zero edit/reject rate, no incidents,
owner sign-off — all measured automatically from the audit log. Demotion is
one click, always. The agent may file promotion proposals; it may never apply
them. This is the flywheel that makes the product an engine rather than a
mirror: **the interface is the instrument that collects the evidence
authority expansion legally requires.**

## 6. Architecture and the two seams

```
Next.js chat UI (/merchant, /shop)
        │  ComponentSpec JSON + Trigger.dev Realtime
Trigger.dev chat.agent() ── tools ──┐
Trigger.dev scheduled tasks         │  seam A: DataStore interface
  (synthetic event generator)       │
        ┌───────────────────────────┴──────────────┐
        │ ClickHouse Cloud (PRIMARY: event stream, │
        │ materialized views, all analytics)       │
        │ ClickHouse-managed Postgres (OLTP:       │
        │ orders, inventory truth, cases,          │
        │ commitments, audit/action log)           │
        └──────────────────────────────────────────┘
  seam B: TaskRunner interface (action execution)
```

- **Seam A (`DataStore`)**: every read/write goes through one interface. Agent
  logic never imports a DB client directly.
- **Seam B (`TaskRunner`)**: actions are named tasks with payloads.

### OLTP + OLAP (bonus category)

Postgres holds transactional truth (inventory, order state, open cases,
commitments, audit log). ClickHouse holds the append-only event stream and
powers every visual. An approved action writes to Postgres, emits an event to
ClickHouse, and affected components re-render live — one click demonstrates
the full OLTP→OLAP loop.

## 7. Semantic layer and knowledge base

- `metrics/` — versioned metric definitions (name, description, SQL fragment,
  grain, caveats). The L2 SQL tool is prompted *from* these definitions; the
  model never invents an aggregation.
- `docs/business/` — policy cards: shipping schedule and rationale, shipping
  rates, DOA policy, channel descriptions, packing rules. Small, versioned,
  citable. Source of truth for both surfaces.

Both are first-class durable extracts: the owner's real business currently has
its metric definitions buried in analytics scripts and its policies scattered
across agent docs. This repo makes the pattern explicit.

## 8. Data: shape-calibrated synthesis

Two rules, both hard:

1. **Zero row-level real data.** No real order, customer, e-mail, or amount
   enters this repo, ClickHouse Cloud, or any third party. (Public repo +
   hackathon rules + owner's data-sovereignty stance.)
2. **Real shape.** The generator is calibrated from *aggregate* statistics of
   the real operation: channel mix, price bands, weekly rhythm (Sat-night
   auction spike, Tue/Wed ship surge, small-hours drift detections), SKU
   taxonomy, typical anomaly rates. The world feels real because its
   distributions are; only its individuals are invented.

Generator personality: three channels, auction spikes at night, weekend browse
surges, occasional address typos, drift injections. Demo storylines are
**seeded deterministically** (idempotent `seed-demo` script): a last-night
auction spike, one cold-weather destination order, three drifting SKUs, one
over-SLA conversation, one delivered order eligible for a DOA claim. Live
low-volume inserts run on top for the ticking-chart effect. Never rely on
randomness during a recording.

Schema discipline: entity tables mirror the owner's home CRM schema
(`customers`, `orders`, `inventory`, `events`, `approvals`, …) by name and
field wherever sensible, so migration is a seam swap, not a remodel.

## 9. Migration home (the point of the whole exercise)

Hackathon infrastructure is deliberately disposable; the seams are the escape
hatch.

| Hackathon | Home replacement | Note |
|---|---|---|
| ClickHouse (events + analytics) | owner's SQLite event bus | event schema mirrors home `events` table from day one |
| ClickHouse-managed Postgres (OLTP) | same SQLite CRM (orders/inventory/approvals) | table/field names aligned |
| Trigger.dev tasks (Seam B) | launchd + scripts + home approval queue | `case_card` is literally the missing UI of the home approval inbox |
| Trigger.dev `chat.agent()` | Claude API direct | agent logic sits above the seams, unchanged |

**What migrates untouched (the durable extracts):** UI + component protocol ·
three-layer answer architecture · semantic layer + policy knowledge base ·
authority model + promotion flywheel + audit log design · commitments ledger ·
the judge-test evaluation set.

## 10. Evaluation — the judge test

A blind set of **20–30 questions** (half from the owner, half from the
builder; data, policy, definition, and must-refuse categories; none from the
demo script). Run after build, scored:

- ✅ correct answer with correct component
- ✅ correct, honest refusal ("we don't track cost data")
- ❌ fabricated number or policy → **automatic fail, fix before submission**

Budget: ~30 questions ≈ $1.5 at Sonnet pricing with caching — well inside the
$10 cap.

## 11. Demo (5 beats — capability slices, nothing more)

Narrative arc: *"This is how an AI safely takes over a small business — it
sees, it judges, it acts with permission, and it earns more authority with
every clean decision."*

1. **"What needs my attention?"** → daily proposal + attention queue + ship
   radar + live revenue (Capabilities 0+1; the conversationalized morning
   briefing).
2. **"Why did sales spike last night?"** → drill-down → verdict_card naming
   the auction (Capability 3).
3. **"Can I ship to Denver on Tuesday?"** → weather_strip + pack verdict
   (Capability 2 L1; the live-animal moment).
4. **"Which corals risk overselling?"** → drift heatmap → gated sync chip →
   task runs → chart re-renders live (Capability 4; both tools + OLTP→OLAP in
   one click). Follow with the **promotion_card** beat: "you've approved this
   N times — promote to auto?" (Capability 0, the flywheel on camera).
5. **Two windows side-by-side:** customer files a DOA claim with the concierge
   → case_card with evidence appears in the merchant copilot → one-click
   approve → customer's chat updates in real time (Capabilities 5+4).

Plus one off-script L2 question on camera ("show me AOV by channel this
week") to prove the long tail is real, and a 60-second architecture close
(both tools, OLTP+OLAP, seams).

## 12. Build sequence

- Days 2–4: merchant copilot end-to-end (Capabilities 1–4 core; risk floor —
  submittable alone).
- Days 5–6: concierge + case bridge + promotion flywheel + judge test run.
- Day 7: polish, README, video, flip repo public, submit.

## 13. Hackathon compliance

- ClickHouse is the primary database; Postgres is the ClickHouse-managed
  optional addition (per rules).
- Trigger.dev `chat.agent()` is the agent runtime, literally.
- All code written inside the 2026-07-17 → 07-23 window (git history is the
  evidence). No proprietary code; no real customer data (§8); secrets in
  `.env*` only, never committed.
- MIT license; repo flips public at submission.
