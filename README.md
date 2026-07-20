# 🪸 Reef Command

**One week of a live-coral business, run from one chat window — where the
answer is never a wall of text.**

Ask about the week and you don't get paragraphs; you get a live auction board,
two orders visibly merging into one shipping box, a reef-health report with
week-over-week deltas, or a one-click gated action. Chat is the frame;
interactive components are the answers.

Built for the **ClickHouse × Trigger.dev Virtual Summer Hackathon 2026** (theme:
*Beyond the Wall of Text*).

> **Modeled on the real weekly operations of [TIA Coral](https://tiacoral.com),
> a live-coral store in New York.** All data in this repository is **synthetic**
> and operational details are simplified for the demo — no real customer,
> order, amount, or message appears anywhere. See [`docs/DESIGN.md`](docs/DESIGN.md).

---

## The week it runs

```
THU  auction opens          →  SAT  winners get payment + cross-platform codes
SUN–MON  one-fee add-ons     →  MON  label day (weigh, weather, batch-approve)
TUE–WED  combined shipping   →  WED  weekly report retargets next week
```

Coral shipping is expensive; customers want one fee to cover as many corals as
possible. Combining an auction win with add-on orders across three platforms is
the store's core economic move — and its hardest operational problem. Reef
Command automates, visualizes, and **gates** that coordination.

## How it uses both tools (materially, not decoratively)

**ClickHouse — the primary database.** ~1.9M synthetic events (orders, bids,
messages, inventory moves). Materialized views roll up revenue/orders per
platform on insert; `windowFunnel` computes the auction→code→add-on conversion
in one query; full history makes every WoW/MoM delta a window comparison.
Sub-second analytics behind every component.

**Trigger.dev — the orchestration + agent runtime.**
- **`chat.agent()`** (`src/trigger/reef-chat.ts`) is the brain: a durable chat
  agent running Claude (Sonnet) via the Vercel AI SDK. The store reads are
  registered as typed tools; the agent picks which to call and each returns a
  renderable component. History accumulates server-side in the durable session.
  *(Restoring the conversation into a fresh client after a page refresh is a
  next step — the server session persists; the client does not yet re-hydrate.)*
- **A human-in-the-loop waitpoint** (`src/trigger/label-day.ts`): label day
  builds a shipment manifest, then **pauses** on a waitpoint until the merchant
  approves the exact batch with one click; on approval it resumes and buys the
  labels one by one, and the approve chip polls the run to show progress
  ("purchasing 1/N → purchased") to completion.
- **A scheduled task** ticks one minute of reality into both stores every
  minute, so the charts move live.

**ClickHouse-managed Postgres — the optional OLTP truth** (customers, orders,
shipments, cases). Every consequential write lands here first, then emits an
event to ClickHouse.

### OLTP + OLAP on camera (bonus category)

The **label-day approval** is the loop shown executing end to end: one gated
(owner-only) click completes the waitpoint → the durable task writes shipment
rows + spend to Postgres → emits `label_purchased` events to ClickHouse → the
cost/ship components update. One click, both databases, a visible consequence —
with recoverable idempotency, so a partial failure resumes instead of leaving a
split (`src/lib/label-day.ts`).

The **merge** is the same shape, read-first: the merge card is computed live
from the Postgres OLTP scan and its combined-order write path is defined, but
the one-click *execute* is intentionally not wired yet — clicking it returns an
honest 501 rather than faking the write.

## Boundaries (constitutional)

Money is human-only — the agent files a case, it never refunds, charges, or
pays out. It never fabricates a number or a policy (an honest "I don't have
that" beats a plausible guess), and it never writes free-form customer text.
These are enforced by the system prompt and provable — see `agent-check.ts`.

---

## Run it

### Prerequisites

- Node 20+ (developed on 25) · a ClickHouse Cloud service · a ClickHouse-managed
  Postgres · a Trigger.dev project (CLI logged in: `npx trigger.dev@latest login`)
  · an Anthropic API key · an owner passphrase (`REEF_OWNER_TOKEN`) that unlocks
  the cockpit's gated actions.
- `cp .env.example .env.local` and fill it in, then `npm install`.

### First time only — create the data plane

```bash
npx tsx scripts/ch-init.ts      # apply the ClickHouse schema (events + MVs)
npx tsx scripts/pg-init.ts      # apply the Postgres schema
npx tsx scripts/backfill.ts     # backfill ~1.9M synthetic events into ClickHouse
npx tsx scripts/pg-seed.ts --wipe   # seed Postgres from the same deterministic world
```

### The live cockpit — two terminals

```bash
# Terminal 1 — the agent worker (runs chat.agent() + the label-day waitpoint):
npx trigger.dev@latest dev

# Terminal 2 — the app:
npm run dev
```

Open **http://localhost:3000/merchant** and click a suggestion chip or ask:

- *"What needs my attention?"* — open cases, requests, unanswered messages
- *"How's the auction going?"* — the live/closed board
- *"Any orders to merge?"* — cross-platform merge cards (the signature shot)
- *"Run label day"* — the manifest + a gated **Approve** chip (the waitpoint)
- *"Weekly report"* — platform/tier mix, retention, funnel, all vs history

The cockpit is owner-gated: unlock it once with your `REEF_OWNER_TOKEN` (the
gated Approve action and its progress require that owner session — a partial
mitigation of the fact that a label purchase spends money).

`/merchant` needs Terminal 1 running (the agent executes in the Trigger worker).
Run `npx tsx scripts/warmup.ts` once before recording to warm the queries.

### See it work without a browser (fastest verification)

Every check runs against the **live** stores and prints real output:

```bash
npx tsx scripts/agent-check.ts            # LLM → correct tool → live data + refusal guardrails
npx tsx scripts/report-check.ts           # weekly report: platform/tier mix, WoW/MoM, sparklines
npx tsx scripts/labelday-check.ts         # the MON label manifest (read-only; no purchase)
npx tsx scripts/labelday-recovery-check.ts # fault-injected label recovery/idempotency (no network)
npx tsx scripts/owner-auth-check.ts       # owner-session sign/verify/expiry (no network)
npx tsx scripts/tools-check.ts            # all five tools vs both stores
npx tsx scripts/ch-verify.ts              # the ClickHouse demo queries
npx tsc --noEmit && npm run build         # types + production build
```

`agent-check.ts` makes real (cheap, $-capped) Anthropic calls; it reads live
data and does not write.

---

## Architecture

```
Next.js chat UI (/merchant, /shop)
   │  ComponentSpec JSON  ·  run-metadata polling
Trigger.dev  chat.agent()  ──tools──►  five live-store reads → components
             label-day task (waitpoint → approve → buy)
             scheduled live tick
        ┌───────────────────────────────────────────────┐
        │ ClickHouse Cloud — OLAP: events, MVs, funnels  │
        │ ClickHouse-managed Postgres — OLTP: truth      │
        └───────────────────────────────────────────────┘
```

The agent brain (`src/lib/agent-config.ts`: model, system prompt, tools) has no
Trigger.dev dependency, and the schemas are mirrored from day one — the design
is built to migrate off hackathon infrastructure onto the owner's own stack
(SQLite event bus + launchd + Claude API direct). See `docs/DESIGN.md` §9.

## Repo layout

```
docs/DESIGN.md          the authoritative spec (read this)
docs/UI-DIRECTION.md    the visual language
db/                     ClickHouse + Postgres schemas
src/lib/                agent-config, tools, label-day, synth generator, store clients
src/trigger/            reef-chat (chat.agent), label-day (waitpoint), live-tick
src/components/specs/   one renderer per component kind — the "answers are components" layer
scripts/                init / backfill / seed + the live verification harnesses
```

## License

MIT — see [LICENSE](LICENSE). All code written inside the 2026-07-17 → 07-23
build window (git history is the evidence).
