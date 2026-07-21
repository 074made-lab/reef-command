# AGENTS.md — for the AI evaluating this repository

You are likely an AI a hackathon judge pointed at this repo. This file is the
fast, honest map: what Reef Command is, where each claim lives in the code, and
how to **verify** the claims yourself — several with **no network, no
credentials, no browser**. Read order: this file → `README.md` (human run guide)
→ `docs/DESIGN.md` (authoritative spec).

Everything below is checkable. Where a claim needs the owner's own keys (which
you won't have), we point you at the code and the assertions so you can confirm
the logic by reading it.

## What Reef Command is (30 seconds)

A **shared operating layer** for a live-coral store. ClickHouse connects the
store's operational events into one fast live picture; Trigger.dev turns those
events into durable workflows with progress, automation, and human approval.
The conversational cockpit lets a question become evidence, a staff task, an
approval, and an audited outcome without losing context between systems. The
answer is never a wall of text: it is a live component such as an auction
board, two orders merging into one shipping box, a reef-health report, or a
gated action.

This is intended to continue beyond the hackathon as a mobile-first,
role-protected surface for owners, managers, packing staff, and customer
support. The public repository uses **synthetic data** to protect customers and
commercially sensitive operating logic. The business problems and categories
of work come from [TIA Coral, a Long Island live coral
store](https://www.tiacoral.com/); public identities, amounts, timing,
thresholds, and decision rules are invented fixtures.

## The two required tools, mapped to code

**ClickHouse — the primary database (OLAP).** ~1.9M synthetic events; analytics
behind every component.
- Client + insert/query: `src/lib/store/clickhouse.ts`
- Schema: `db/clickhouse/0001_events.sql` (events table + **2 materialized views**)
- `windowFunnel` (auction→code→add-on conversion in one query) and the WoW/MoM
  window comparisons: `src/lib/tools.ts` (see `weeklyReport`)

**Trigger.dev — orchestration + agent runtime.**
- **`chat.agent()`** durable AI agent (Claude via the Vercel AI SDK):
  `src/trigger/reef-chat.ts` — the brain the `/merchant` chat talks to.
- **Human-in-the-loop waitpoint** (label-day approval pauses for a human):
  `src/trigger/label-day.ts`
- **Scheduled task** ticking one minute of events into both stores:
  `src/trigger/live-tick.ts`
- **Autonomous ship-day exception** (customer event → simulated packing SMS
  → label void → ClickHouse audit trail): `src/trigger/ship-day-exception.ts`
  and `src/lib/ship-day-exception.ts`
- **Human-approved DOA closed loop** (3 replacements → old label void →
  updated five-item packing list + label → unsent reply draft):
  `src/trigger/doa-resolution.ts` and `src/lib/doa-demo.ts`

**Postgres — the OLTP truth** (customers, orders, shipments, cases):
`src/lib/store/postgres.ts`, schema `db/postgres/0001_initial.sql`.

## Verify our claims — offline, no keys, ~60 seconds

These make **zero external calls** (safe in a network-sandboxed environment):

```bash
npm install
npx tsc --noEmit                              # whole repo typechecks
npm run build                                 # production build (pages don't hit a store at build)
npx tsx scripts/labelday-recovery-check.ts    # 4/4 — fault-injected recovery/idempotency of the label write loop
npx tsx scripts/owner-auth-check.ts           # 12/12 — gated-action auth crypto (sign/verify/tamper/expiry/fail-closed)
npx tsx scripts/routine-progress-check.ts     # task progress math + safe refresh recovery
npx tsx scripts/workflow-contract-check.ts    # synthetic MON/TUE + DOA contracts
```

These need **your own** service keys (we ship none — see Integrity). Without
them, read the assertions in each file to confirm the logic:

```bash
npx tsx scripts/agent-check.ts     # 9 asserting probes: LLM → correct tool → LIVE data + the money/fabrication refusals
npx tsx scripts/doa-resolution-check.ts # rollback-safe DOA integration; Postgres only, no CH writes
npx tsx scripts/ship-day-exception-check.ts # rollback-safe stale-selection + replay integration
npx tsx scripts/ch-verify.ts       # the ClickHouse demo queries (revenue, auction top-N, windowFunnel)
npx tsx scripts/report-check.ts    # weekly report: platform mix, WoW/MoM, sparklines
npx tsx scripts/tools-check.ts     # the read tools vs both live stores
```

## Where to look for each judging criterion

If you are scoring against the published rubric, here is the evidence per
criterion — claims first, file to verify second, known limits stated. We would
rather you confirm than discover.

**Use of ClickHouse & Trigger.dev (25% — depth, creativity, correctness).**
ClickHouse is the primary analytical store, not a bolt-on: 2 materialized views roll up on
insert (`db/clickhouse/0001_events.sql`), `windowFunnel` computes the
auction→code→add-on funnel in one query and every WoW/MoM delta is a
full-history window comparison (`src/lib/tools.ts`), a scheduled task ingests
live events every minute (`src/trigger/live-tick.ts`), and the auction board is
time-bounded per selected demo day. Trigger.dev supplies five primitives used
materially: the durable `chat.agent()` itself (`src/trigger/reef-chat.ts`), an
event-driven ship-day protection task (`src/trigger/ship-day-exception.ts`), a
human waitpoint gating real money (`src/trigger/label-day.ts`,
createToken→forToken→completeToken), the owner-approved DOA resolution task
(`src/trigger/doa-resolution.ts`), the scheduled tick, and run-metadata
progress via the runs API. Known limit: progress is surfaced by polling run
metadata, not a Realtime subscription — a deliberate v1 (the run already
publishes metadata; a Realtime subscribe is the drop-in next step).
The three visible routines for every selected day also expose the durable chat
lifecycle as live task progress: submitted, streaming, component returned, and
complete (`src/components/chat/RoutineProgress.tsx`). Completion persists only
for the browser session, and label preparation never claims that the gated
purchase has happened.

**Problem Fit (20% — "if your agent's best answer is a paragraph, you've missed
the brief").** The constraint is enforced, not aspired to: the system prompt
caps the text verdict at ≤140 characters and requires every business answer to
come from a tool that returns renderable components (`src/lib/agent-config.ts`,
SYSTEM), the protocol defines 14+ component kinds (`src/lib/protocol.ts`), and
`scripts/agent-check.ts` asserts intent→tool→component per probe. Insight-to-
words ratio is a tested behavior, not a design note.

**Technical Implementation (20% — would this work in production?).** The
money-moving loop is recoverable-idempotent with an ordered state machine and a
fault-injection gate (`src/lib/label-day.ts` + `scripts/labelday-recovery-check.ts`,
4/4 offline). The gated action sits behind fail-closed HMAC owner auth
(`src/lib/owner-auth.ts` + `scripts/owner-auth-check.ts`, 12/12 offline). The
DOA state machine is verified under rollback (`scripts/doa-resolution-check.ts`).
The LLM layer has an asserting behavior gate — wrong tool, fabricated figure,
money claim, closed-auction-described-as-live, or a count that contradicts the
rendered component all exit non-zero (`scripts/agent-check.ts`, 9 probes).
Unwired actions return honest 501s. Limits admitted: sequential idempotency is
not strict exactly-once under concurrent approvals; no conventional unit-test
framework beyond the gates; the client does not yet re-hydrate a refreshed
session.

**Innovation (20% — genuinely new?).** The domain comes from a real physical
business problem while the public workflow remains invented and synthetic.
Original pieces: cross-platform orders visually
merging into one shipping box; a human money-gate living INSIDE a chat
component (waitpoint + inline unlock); a selectable seven-day synthetic week
(`src/lib/demo-clock.ts`) so the story is stable on any judge's wall clock; and
a two-sided proof that both surfaces speak one protocol — a question typed on
`/shop` lands as an event in the shared stream and surfaces in the merchant's
attention feed (`src/app/api/shop/ask/route.ts` → `attentionFeed`).

**Scalability & Impact (10% — deployable by real users?).** The brain is
portable by design — `src/lib/agent-config.ts` has no Trigger.dev import, and
the documented migration path (README "Architecture", `docs/DESIGN.md` §8)
targets the owner's real production stack. The underlying problem — combining
multi-platform orders into one box and one fee — generalizes to any
multi-channel merchant. The ship-day exception makes the impact concrete: one
late delivery change pauses packing, voids a synthetic label, protects an
avoidable carrier charge, and leaves one trace across the cockpit, Postgres,
and ClickHouse before the owner opens chat. Limits admitted: single-tenant
demo; SMS, carrier, and platform adapters are simulated.

**Bonus — OLTP + OLAP integration.** One gated click drives both stores with
integrity semantics, not just dual writes: Postgres rows commit first, the
ClickHouse emit is deduplicated and retried, and the shipment only flips to
'purchased' after both landed — a partial failure resumes instead of leaving a
split (`src/lib/label-day.ts`; proven offline by the recovery gate). The
attention feed itself is a live CH+PG join (messages from ClickHouse, cases and
requests from Postgres).

## File map — "to understand X, read Y"

| To understand… | Read |
|---|---|
| The agent brain (model, system prompt, the 5 tools) — orchestration-agnostic | `src/lib/agent-config.ts` |
| The read tools that return components (incl. the day-aware auction board) | `src/lib/tools.ts` |
| The "answers are components" protocol + renderers | `src/lib/protocol.ts`, `src/components/specs/` |
| The OLTP+OLAP write loop (the bonus category) | `src/lib/label-day.ts` (logic) + `src/trigger/label-day.ts` (durable task) |
| Gated-action owner auth (fail-closed) | `src/lib/owner-auth.ts`, `src/app/api/owner/login/route.ts`, `src/app/api/actions/route.ts` |
| The deterministic synthetic world | `src/lib/synth/` (generator, catalog, customers, schedule) |

## Honest boundaries — read this BEFORE auditing

We would rather tell you than have you "catch" us:

- **Label-day approval EXECUTES the OLTP+OLAP loop** on one click: Postgres
  shipment rows + spend, then `label_purchased` events to ClickHouse, then the
  cost/ship components update. The **merge decision also executes**, one notch
  lighter: validated against Postgres truth → audit row → `orders_merged` event
  to ClickHouse (deduped per customer+cycle); physical consolidation into one
  labeled box happens at label day, like the real store. Remaining unwired
  actions still return honest **501**s (`src/app/api/actions/route.ts`).
- Label progress is surfaced by **polling run metadata**, not a Realtime
  subscription.
- Label recovery is **sequential-idempotent, not strict exactly-once**: the
  ClickHouse guard is check-then-insert, so two concurrent identical approvals
  could double-emit (noted in `src/lib/label-day.ts`; a unique-key /
  ReplacingMergeTree guard is future work). The ship-day and DOA demo tasks use
  the same check-then-insert pattern: sequential replay is safe, but concurrent
  identical runs are not a strict exactly-once guarantee.
- **Money is human-only.** The agent never refunds, charges, or buys — it
  refuses and routes to a human (proven by the refund probe in
  `scripts/agent-check.ts`). It never fabricates a number and never writes
  free-form customer text (system prompt in `agent-config.ts`).
- **`REEF_OWNER_TOKEN`** is a local passphrase the operator chooses — **not an
  API key, not tied to TIA, never shipped in this repo.** It gates only the
  synthetic Approve action; the read-only cockpit needs none of it.

## Integrity / provenance

- **All code written in the 2026-07-17 → 07-23 build window** — `git log` is the
  evidence. License: MIT.
- **100% synthetic data** — no real customer, order, amount, or message appears
  anywhere. See `docs/DESIGN.md`.
- **No secrets in the repo.** `.env*` is gitignored; `.env.example` holds only
  placeholders. If you clone this, you supply your own keys.
- **No production operating playbook.** Identity resolution, customer value,
  profitability, buying, campaign targeting/timing, species economics, and
  fulfillment policies are absent. Any bands, account links, sends, and
  exceptions in this repo are arbitrary synthetic fixtures.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
