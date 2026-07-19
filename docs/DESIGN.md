# Reef Command — Design (v3)

> **Status:** Approved by the team 2026-07-19. This version supersedes v2's
> capability-stack framing with a sharper spine: **the auction week**. Build
> starts against this document.
>
> Built for the ClickHouse × Trigger.dev Virtual Summer Hackathon 2026
> ("Beyond the Wall of Text"). Designed from day one to migrate off hackathon
> infrastructure onto the owner's own stack (§9).

## 0. What this is

**One week of a live-coral e-commerce business, run from one chat window.**

The business is modeled on the real weekly operations of
**[TIA Coral](https://tiacoral.com)**, a live-coral store in New York. All
data in this repository is synthetic; operational details are simplified for
the demo. The weekly multi-platform cycle:

```text
THU  auction opens on the auction platform (ReefnBid-style)
SAT  auction closes → winners get payment instructions + discount codes
     for the web store (Shopify-style) and marketplace (eBay-style)
SUN–MON  winners add on: one shipping fee, more corals; add-on margin
     beats auction margin — win-win
MON  label day: product labels + shipping labels (weight calc, weather
     check, batch purchase)
TUE–WED  combined shipping (live animals ship Tue/Wed only)
WED  weekly report closes the cycle and retargets next week's campaigns
```

Coral shipping is expensive; customers want one shipping fee to cover as many
corals as possible. Combining an auction win with add-on orders from other
platforms is the store's core economic move — and coordinating it across
three platforms is the store's hardest operational problem. That coordination
is what Reef Command automates, visualizes, and gates.

The chat surface is the only entrance: every artifact the system produces is
an interactive component in the conversation; every consequential action is a
chip on a card. Chat is the frame, components are the answers — the hackathon
theme, applied to a real operating rhythm.

## 1. The four tasks

### Task 1 — Unified customer store (customer 360)

Not just a contact list — one store holds *everything the business knows
about a customer*, and every platform and every task reads and writes it at
any time:

```text
customer
├── identity      name, emails[], phones[], platform accounts
│                 (auction / web store / marketplace, matched by
│                 email → phone → name)
├── tier          1–4 dossier tier (tier 4 = first-time customers, so the
│                 new-customer rate falls out of the tier mix automatically)
├── preferences   favored categories (zoas, euphyllia, …), contact prefs
├── orders        every order on every platform, incl. combined orders
├── products      every coral ever bought (derived from order items)
├── messages      campaign sends + inbound/outbound conversation log
└── requests      cancels, holds, address changes, claims, cases
```

Implementation: normalized Postgres tables (`customers`,
`customer_identities`, `orders`, `order_items`, `messages`, `requests`),
served as one `getCustomer()` profile read through Seam A — every task and
both chat surfaces see the same customer instantly. Every change streams
into ClickHouse, so analytics always sees the current identity graph and
purchase history.

### Task 2 — Campaigns and communication (advertising + operational, one system)

Driven by the durable week-cycle task (§4):

- **TUE** auction announcement + product previews
- **WED–THU** previews, countdowns, opening reminders
- **THU (live)** price updates and closing-time nudges while bids stream in
- **SAT** winner notifications: payment instructions, cross-platform discount
  codes, add-on tutorial, shipping schedule
- Audience selection per send = a ClickHouse query over tier × preference ×
  platform. Every send is logged as an event, so campaign performance is live.
- **Demo sends are simulated** (rendered previews + send log; no real e-mail/
  SMS service from a public repo). The seam makes the real sender a drop-in.

### Task 3 — Combined orders (the core — and the OLTP+OLAP showcase)

This task carries the bonus-category story: every consequential write here
lands in Postgres (transactional truth), emits events to ClickHouse, and the
affected charts update live on screen — see §4 for the two on-camera loops
(order merge, label batch purchase).

1. **Real-time monitoring + merge.** All three platforms' new orders stream
   in (auction wins, add-ons, and each platform's own organic sales). Every
   new order pings the attention feed; every order triggers a merge check
   against the CRM — when the same customer orders on different platforms,
   the two order cards visibly merge into one combined order on screen.
2. **Label day (MON).** A scheduled durable task: per-order weight from item
   count (per-coral unit weight + per-platform box tare, with a minimum
   billable floor; constants generic) → per-destination weather check
   (heat/cold pack verdicts) → two
   label sets generated: **product labels** (one per sold coral, bag-ready)
   and **shipping labels** (one per customer/combined order) → manifest
   rendered with costs and weather flags → **pauses on a human waitpoint**
   → merchant approves the whole batch with one click → task resumes and
   purchases labels (simulated carrier), progress streaming live to the UI.
   Batch-approve (not fully unattended) is deliberate: label purchase spends
   money, and the approval pause is Trigger.dev's native HITL on camera.
3. **Pre-ship request watch.** Inbound customer requests are classified:
   cancel this week / hold to next week / address change / last-second
   add-on. For cancels and address changes affecting purchased labels, the
   system **auto-voids the label first** (avoid carrier charges), **then**
   reports to the merchant with a request card.
4. **After-sales first response.** Codified templates answer immediately,
   then report: condition concern → reassurance (shipping stress is normal,
   give it time); DOA → support-ticket link; thank-you → acknowledgment.
   Anything beyond the templates escalates as a case card. Auto-replies are
   template-only — the model never freestyles customer-facing text.

### Task 4 — Weekly report (WED, after the last ship day)

Rendered entirely as interactive components, and always shown **against
history**: every headline number carries a week-over-week and
month-over-month delta plus a sparkline, so the report reads as a
trajectory, not a snapshot.

- **Customer analysis:** platform mix, tier mix, share of sales per tier,
  new-customer rate (= tier-4 share), and **retention through two lenses**:
  - *Snapshot* — **return customer rate**: customers with ≥2 lifetime
    orders ÷ all paying customers, as of the report date;
  - *Weekly flow* — this week's revenue split between returning and
    brand-new customers (the leading health indicator; it moves weeks
    before the snapshot does).

  Segments feed Task 2's targeting directly — the report is a control, not
  a rear-view mirror.
- **Product analysis:** six categories — zoas, euphyllia, goni, mushroom,
  sps, other — with unit price, share of sales, and WoW movement, to steer
  next week's stocking.
- **Auction top 10:** the week's ten highest hammer prices — item, category,
  winner handle, hammer price, vs its base price — the fastest read on what
  the market wants more of next week.
- **Cycle funnel:** auction win → discount code → cross-platform add-on
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
| **Durable multi-day tasks** (`wait.until`, survives restarts, costs nothing while sleeping) | **The auction week is literally one task**: wakes TUE to announce, THU to run the live auction watch, SAT to notify winners, MON for label day, WED for the report |
| **Human-in-the-loop waitpoints** | Label-manifest batch approval; campaign send confirmation |
| `chat.agent()` with tool approvals | The chat surface itself — the agent runtime |
| Realtime API | Labels purchasing one by one on screen; send-log streaming |
| Code-first TypeScript tasks | Merge logic, weight calc, tier rules as tested, typed code |

## 3. Chat surface and component protocol

The agent never answers with prose alone. Tools return typed data; the agent
composes `ComponentSpec`s the frontend renders inline in the chat stream
(full width, no separate canvas). Two routes: `/merchant` (the cockpit) and
`/shop` (customer-facing order tracking + requests, same brain, same policy
sources; out-of-authority requests become cases in the merchant feed).

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
  | { kind: "report";        sections: ReportSection[] }            // WED weekly report
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
        │  ComponentSpec JSON + Trigger.dev Realtime
Trigger.dev chat.agent() ── tools ──────────┐
Trigger.dev AuctionWeek durable task        │
  (TUE announce → THU live → SAT winners    │   seam A: DataStore
   → MON labels [waitpoint] → WED report)   │
Trigger.dev event-generator scheduled tasks │
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

### OLTP + OLAP on camera (bonus category)

Postgres holds transactional truth; ClickHouse holds the append-only event
stream and powers every visual. The loop is demonstrated live, twice:

1. Two orders merge → Postgres combined-order write → merge event →
   ClickHouse → funnel and revenue components update.
2. Label manifest approved → Postgres label rows + spend → label events →
   ship-radar and cost components update.

One click, both databases, visible consequence — that is the integration
story told in a single camera move.

## 5. Action tiers and boundaries

| Action | Tier |
|---|---|
| Order merge (same-customer detection) | auto, with visible card + undo |
| Campaign send | gated (one click per campaign) |
| Label batch purchase | gated (one click per manifest) |
| Label void on cancel/address change | auto **then** report (avoids carrier charges) |
| After-sales first response | auto, codified templates only |
| Refunds, payments, anything money-moving beyond the above | human-only; agent files a case |

Boundaries (constitutional, unchanged from v2): money decisions are human;
no fabricated numbers or policies (honest refusal instead); no free-form
model text to customers; the agent never widens its own authority.

## 6. Data: shape-calibrated synthesis

1. **Zero row-level real data.** No real order, customer, e-mail, or amount
   enters this repo or any third-party service. (Public repo + hackathon
   rules + owner's data-sovereignty stance.)
2. **Real shape.** The generator is calibrated from aggregate statistics of
   the real operation: three-platform mix, price bands, the weekly rhythm
   (THU–SAT auction arc, SUN–MON add-on wave, TUE/WED ship days), six-way
   product taxonomy, tier distribution, typical anomaly rates (address
   typos, cancels, DOA claims).
3. **Deterministic demo seed.** An idempotent `seed-demo` script plants the
   storyline: a full auction arc, winners who add on cross-platform, one
   cold-destination shipment, one cancel-after-label request, one DOA claim,
   organic sales on every platform. Live low-volume inserts run on top for
   ticking charts. Never rely on randomness during a recording.
4. **Scale & depth:** 8–12 weeks of backfill at realistic volume (hundreds
   of thousands to millions of events — bids, pageviews, messages, orders,
   inventory moves) so ClickHouse's speed is visible rather than claimed,
   and so the report's week-over-week and month-over-month comparisons have
   real history behind them.

## 7. Evaluation — the judge test

A blind set of 20–30 questions (half owner-written, half builder-written;
data / policy / definition / must-refuse categories; none from the demo
script), run after build:

- ✅ correct answer with correct component
- ✅ honest refusal where data doesn't exist
- ❌ fabricated number or policy → automatic fail, fix before submission

## 8. Demo script (~5 min, chronological — one week, compressed)

Narrative: *"This is one week of a real coral business, run from one chat
window."*

1. **TUE** — campaign card: audience breakdown by tier, message preview,
   one-click approve → simulated sends stream into the log.
2. **THU night** — live auction board ticking while bid events flood in
   (ClickHouse ingest+query on camera; scale moment).
3. **SAT** — winners notified: payment + discount codes + add-on tutorial.
4. **SUN** — a winner orders on the web store: **two order cards merge into
   one combined order on screen** (the signature shot; OLTP→OLAP #1).
5. **MON** — label manifest: weights, weather flags (heat pack for the cold
   destination), total cost → one-click batch approve → labels purchase
   live (waitpoint + Realtime on camera). A cancel request arrives: label
   auto-voids, request card reports it.
6. **WED** — weekly report: tier/platform mix and return-customer rate with
   WoW/MoM deltas, six-category product table, auction→add-on funnel vs
   previous weeks; one off-script question answered live.
7. **Close (~60s)** — architecture: both tools' unique features, the
   OLTP+OLAP loop, the two seams.

## 9. Migration home

Hackathon infrastructure is deliberately disposable; the seams are the
escape hatch.

| Hackathon | Home replacement |
|---|---|
| ClickHouse (events + analytics) | owner's SQLite event bus (schema mirrored from day one) |
| ClickHouse-managed Postgres (OLTP) | same SQLite CRM (tables/fields aligned) |
| Trigger.dev tasks + waitpoints | launchd + scripts + home approval queue |
| Trigger.dev `chat.agent()` | Claude API direct |
| Simulated carrier / message sender | real label pipeline / real e-mail+SMS services |

**What migrates untouched:** UI + component protocol · the week-cycle
orchestration design · CRM identity matching rules · label-day flow ·
codified after-sales templates · report definitions · the judge-test set.

## 10. Build sequence (4 days remain)

- **7/19** — lock design; retune generator to the weekly cycle + six-way
  taxonomy + tiers; protocol v3 types; Postgres + ClickHouse schemas.
- **7/20** — data plane live (tables, materialized views, CRM identity
  matching); chat cockpit shell; Task 1 + Task 3.1 (merge on screen).
  *Risk floor: merge + attention feed + auction board is submittable.*
- **7/21** — AuctionWeek durable task; Task 2 campaigns (simulated sender);
  Task 3.2 label day with waitpoint approval.
- **7/22** — Task 3.3 requests + auto-void; Task 3.4 after-sales templates;
  Task 4 report; judge test run; seed-demo polish.
- **7/23** — video, README, flip repo public, submit before midnight AoE.

## 11. Hackathon compliance

- ClickHouse is the primary database; Postgres is the ClickHouse-managed
  optional addition (per rules).
- Trigger.dev `chat.agent()` is the agent runtime; durable tasks + waitpoints
  + Realtime are used materially, not decoratively.
- All code written inside the 2026-07-17 → 07-23 window (git history is the
  evidence). No proprietary code; no real customer data; secrets in `.env*`
  only, never committed.
- MIT license; repo flips public at submission.
- Attribution: README, video, and this document credit TIA Coral
  (tiacoral.com) as the operational model, always paired with the
  synthetic-data + simplified-details disclaimer. No real internal numbers,
  no real message templates, no "TIA currently does X" claims.
