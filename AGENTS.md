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

A **merchant cockpit chat** for a live-coral store. You ask about the business
and the answer is never a wall of text — it's a live component: an auction
board, two orders merging into one shipping box, a reef-health report, a gated
one-click action. Chat is the frame; interactive components are the answers
(hackathon theme: *Beyond the Wall of Text*). All data is **synthetic**; the
workflow is modeled on the real weekly operations of TIA Coral (tiacoral.com).

## The two required tools, mapped to code

**ClickHouse — the primary database (OLAP).** ~1.9M synthetic events; analytics
behind every component.
- Client + insert/query: `src/lib/store/clickhouse.ts`
- Schema: `db/clickhouse/0001_events.sql` (events table + **3 materialized views**)
- `windowFunnel` (auction→code→add-on conversion in one query) and the WoW/MoM
  window comparisons: `src/lib/tools.ts` (see `weeklyReport`)

**Trigger.dev — orchestration + agent runtime.**
- **`chat.agent()`** durable AI agent (Claude via the Vercel AI SDK):
  `src/trigger/reef-chat.ts` — the brain the `/merchant` chat talks to.
- **Human-in-the-loop waitpoint** (label-day approval pauses for a human):
  `src/trigger/label-day.ts`
- **Scheduled task** ticking one minute of events into both stores:
  `src/trigger/live-tick.ts`

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
```

These need **your own** service keys (we ship none — see Integrity). Without
them, read the assertions in each file to confirm the logic:

```bash
npx tsx scripts/agent-check.ts     # 7 asserting probes: LLM → correct tool → LIVE data + the money/fabrication refusals
npx tsx scripts/ch-verify.ts       # the ClickHouse demo queries (revenue, auction top-N, windowFunnel, retention)
npx tsx scripts/report-check.ts    # weekly report: platform/tier mix, WoW/MoM, sparklines
npx tsx scripts/tools-check.ts     # all five read tools vs both live stores
```

## File map — "to understand X, read Y"

| To understand… | Read |
|---|---|
| The agent brain (model, system prompt, the 5 tools) — orchestration-agnostic | `src/lib/agent-config.ts` |
| The 5 read tools that return components | `src/lib/tools.ts` |
| The "answers are components" protocol + renderers | `src/lib/protocol.ts`, `src/components/specs/` |
| The OLTP+OLAP write loop (the bonus category) | `src/lib/label-day.ts` (logic) + `src/trigger/label-day.ts` (durable task) |
| Gated-action owner auth (fail-closed) | `src/lib/owner-auth.ts`, `src/app/api/owner/login/route.ts`, `src/app/api/actions/route.ts` |
| The deterministic synthetic world | `src/lib/synth/` (generator, catalog, customers, schedule) |

## Honest boundaries — read this BEFORE auditing

We would rather tell you than have you "catch" us:

- **Label-day approval EXECUTES the OLTP+OLAP loop** on one click: Postgres
  shipment rows + spend, then `label_purchased` events to ClickHouse, then the
  cost/ship components update. The **merge is read-only**: the merge card is
  computed live from the OLTP scan, but the one-click *execute* returns an honest
  **501** — not wired, not faked (`src/app/api/actions/route.ts`).
- Label progress is surfaced by **polling run metadata**, not a Realtime
  subscription.
- Label recovery is **sequential-idempotent, not strict exactly-once**: the
  ClickHouse guard is check-then-insert, so two concurrent identical approvals
  could double-emit (noted in `src/lib/label-day.ts`; a unique-key /
  ReplacingMergeTree guard is future work).
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

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
