# 🪸 Reef Command

**One week of a live-coral business, run from one chat window — where the
answer is never a wall of text.**

Ask about the week and you don't get paragraphs; you get a live auction board,
two orders visibly merging into one shipping box, a reef-health report with
week-over-week deltas, or a one-click gated action. Chat is the frame;
interactive components are the answers.

Built for the **ClickHouse × Trigger.dev Virtual Summer Hackathon 2026** (theme:
*Beyond the Wall of Text*).

> **Inspired by the physical-commerce problems behind
> [TIA Coral](https://tiacoral.com), a live-coral store in New York.** The
> seven-day workflow, account links, customer bands, timing, economics, and
> rules in this repository are invented **synthetic demo fixtures**, not the
> store's operating playbook. No real customer, order, amount, or message
> appears anywhere. See [`docs/DESIGN.md`](docs/DESIGN.md).

---

## The week it runs

```
MON  label day (merge, weigh, weather, approve) → TUE  ship + next preview
WED  final ship + report     →  THU–FRI  ReefnBid live
SAT  close + winner codes    →  SUN  one-fee add-ons across Shopify/eBay
```

Live-animal fulfillment is time-sensitive: a missed customer change can become
wasted packing work, an avoidable carrier charge, or an incorrect shipment.
Reef Command demonstrates how a multi-channel merchant can automate, visualize,
audit, and **gate** that coordination without publishing TIA Coral's methods.

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
  ("purchasing 1/N → purchased") to completion. *Progress transport is
  deliberately simple polling in this build — the run already publishes its
  progress to run metadata, so subscribing via Trigger.dev Realtime is the
  drop-in next step, not a redesign.*
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

The **merge decision** executes too, one notch lighter: the card is computed
live from the Postgres OLTP scan, and clicking **Merge into one shipment**
validates the orders against Postgres truth, writes the audit row, and emits an
`orders_merged` event to ClickHouse (deduped per customer+cycle). Deliberately
not money and not physical — the orders are consolidated into one labeled box
at label day, exactly like the real store.

### Autonomous ship-day protection

On the synthetic Tuesday demo, a customer changes delivery timing after the
box is prepared. The owner does not ask Teddy to check anything. The inbound
event starts a durable Trigger.dev task that:

1. surfaces a floating cockpit alert;
2. records a **simulated SMS** telling the packing team to hold the box;
3. voids the still-voidable synthetic carrier label;
4. holds the linked shipment state in Postgres;
5. emits request, notification, and label-void events to ClickHouse.

The alert shows the preventable demo charge protected and opens the structured
audit trace. Replays are idempotent: they do not send another SMS, void twice,
or duplicate the ClickHouse events.

**Impact:** a late fulfillment change can otherwise become a mis-shipped live
order, wasted packing work, and an avoidable carrier charge. Reef Command turns
that fragmented handoff into one observable loop that acts before the owner
opens chat. For a small physical-commerce team, the practical outcome is fewer
avoidable fees, fewer incorrect shipments, faster customer handling, and one
mobile place to see what automation already did versus what still needs human
authority.

### Human-approved DOA closed loop

The attention feed contains one intentionally composed synthetic claim. It
assembles evidence, simple history counts, prior remedy counts, and an order
already scheduled for tomorrow. The arbitrary customer band is display context
only; it never decides eligibility. One explicit owner action approves exactly
three replacements and a $31.40 synthetic updated label. A durable Trigger.dev
task then records the decision, adds the replacements, voids the old label,
rebuilds the five-item packing list, purchases the approved updated label, and
prepares an editable customer reply draft. The draft is **not sent**.

Every consequential step writes Postgres audit state and a matching ClickHouse
event. All identifiers, counts, amounts, and outcomes are invented public demo
fixtures, not a real store policy or customer-value model.

## Boundaries (constitutional)

Money is human-only — the agent files a case, it never refunds, charges, or
pays out. It never fabricates a number or a policy (an honest "I don't have
that" beats a plausible guess), and it never writes free-form customer text.
These are enforced by the system prompt and provable — see `agent-check.ts`.

---

## Run it

Two ways to evaluate — **no secret of ours is needed or included** (`.env*` is
gitignored):

1. **Video (plus any hosted link in the submission)** — the whole flow with zero
   setup. This is the primary path; the video opens with a live screen recording.
2. **Run it locally** — clone and point it at *your own* external services
   (below). You supply your own keys; you choose your own `REEF_OWNER_TOKEN`.

### Prerequisites

- Node 20+ (developed on 25) · a ClickHouse Cloud service · a ClickHouse-managed
  Postgres · a Trigger.dev project (CLI logged in: `npx trigger.dev@4.5.4 login`)
  · an Anthropic API key · optionally, a self-chosen `REEF_OWNER_TOKEN` (any
  local passphrase) to enable the one gated action — see "Owner token" below.
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
npx trigger.dev@4.5.4 dev

# Terminal 2 — the app:
npm run dev
```

Open **http://localhost:3000/merchant** and click a suggestion chip or ask:

- *"What needs my attention?"* — open cases, requests, unanswered messages
- *"How's the auction going?"* — the live/closed board
- *"Any orders to merge?"* — ReefnBid / Shopify / eBay orders flow like water
  currents into one box (the signature shot)
- *"Run label day"* — the manifest + a gated **Approve** chip (the waitpoint)
- *"Weekly report"* — an interactive reef-health report with platform mix,
  synthetic channel movement, category movement, and funnel history

The header is a selectable seven-day **synthetic demo week**, so the story stays
stable regardless of a judge's real date. Choosing Monday–Sunday tells Teddy
what "today" means; the agent immediately renders that day's goal, work
priorities, reminder, and supported next actions. Tuesday/Wednesday explicitly
show the overlap between shipping the old cycle and previewing the next auction.
Each day's three priorities are executable routines, not static checklist copy.
The cockpit binds their progress to the durable chat lifecycle (submitted,
streaming, component returned), keeps the active task visible in a sticky live
dock, and preserves completed steps for the browser session. A label-batch task
reaching 100% means the manifest is ready; carrier spend still waits at the
human approval gate.
In the attention feed, the composed DOA row expands into the gated closed-loop
review above, while customer messages open an editable template draft. No
refund is issued and no external email is sent.

On `/shop`, the public demo includes one deliberately narrow sample route:
*“My coral arrived dead”* opens a synthetic DOA evidence form instead of becoming
a generic unanswered message. The sample exposes no real store policy or reply
playbook; see [`docs/DEMO-CUSTOMER-BOUNDARY.md`](docs/DEMO-CUSTOMER-BOUNDARY.md).

The public generator and report use invented account links and arbitrary demo
bands only to exercise the UI. They are not TIA Coral's identity-resolution,
customer-value, profitability, buying, targeting, margin, or species-economics
methods. Those production rules are neither copied nor approximated here.

No **owner-auth** config is required to browse the cockpit — chat, reports,
boards, and the read-only manifest need no passphrase (they still need the
external services in `.env.local`, like any run — this is not a static site).
Only the money-moving **Approve & buy labels** action is gated: set
`REEF_OWNER_TOKEN` and the chip prompts for that passphrase inline the first time
you approve (a label purchase spends money, so it stays behind a human + a
session). Unset → that one chip is disabled with a hint; everything else is
unaffected.

#### Owner token

`REEF_OWNER_TOKEN` is not an API key and is not tied to TIA Coral. Choose any
strong local passphrase yourself. If it is unset, the cockpit remains available
and only the synthetic "Approve & buy labels" action is disabled. Never commit
`.env.local` or reuse a production credential.

`/merchant` needs Terminal 1 running (the agent executes in the Trigger worker).
Run `npx tsx scripts/warmup.ts` once before recording to warm the queries.

### See it work without a browser (fastest verification)

Every check runs against the **live** stores and prints real output:

```bash
npx tsx scripts/agent-check.ts            # LLM → correct tool → live data + refusal guardrails
npx tsx scripts/report-check.ts           # weekly report: platform mix, WoW/MoM, sparklines
npx tsx scripts/labelday-check.ts         # the MON label manifest (read-only; no purchase)
npx tsx scripts/labelday-recovery-check.ts # fault-injected label recovery/idempotency (no network)
npx tsx scripts/owner-auth-check.ts       # owner-session sign/verify/expiry (no network)
npx tsx scripts/demo-scenarios-check.ts   # two public demo contracts (no network)
npx tsx scripts/doa-resolution-check.ts   # rollback-safe DOA writes; needs Postgres only
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
