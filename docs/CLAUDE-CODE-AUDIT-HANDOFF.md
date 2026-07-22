# Claude Code Submission Audit Handoff

Prepared on 2026-07-22 for the final pre-submission audit. This document covers
the hackathon project in this repository only. Do not copy, merge, deploy, or
write any of this work into TIA Coral.

## Read this first: submission-critical blocker

The product build, deterministic workflow checks, live ClickHouse checks, and
non-LLM Trigger.dev tasks pass. However, the configured Anthropic workspace hit
its API usage limit during the final live browser rehearsal:

> You have reached your specified workspace API usage limits. You will regain
> access on 2026-08-01 at 00:00 UTC.

No credential or organization identifier is recorded here. Until the key is
replaced, its quota is raised, or the provider configuration is changed, the
required Trigger.dev `chat.agent()` path cannot return an answer. This is a
hard submission blocker, not a cosmetic issue.

Immediate recovery sequence:

1. Replace or re-fund the Anthropic credential used by the local Trigger.dev
   worker. Keep secrets out of Git.
2. Start `npx trigger.dev@4.5.4 dev` and wait for `Local worker ready` before
   starting Next.js.
3. Run `npx tsx scripts/agent-check.ts` and confirm all agent probes pass.
4. Reset once at `/merchant/reset`, then rehearse the exact two video workflows
   below from a clean state.
5. Inspect the Trigger.dev run dashboard/logs and ClickHouse rows while the
   flows execute. Do not record until both are clean.

The prior implementation cycle had a passing agent check. The failure observed
on 2026-07-22 is current external quota state, not a TypeScript/build failure,
but it still makes the live demo fail.

## Current repository status

- Completed feature integration: merge commit `77f8b4c` on `main`.
- Feature branch tip: `01ea321` (`fix: reconcile demo week and auction truth`).
- The full implementation range is visible with
  `git log --oneline ab5e592..main`.
- This handoff is intentionally a documentation-only follow-up.
- The product has not been renamed. The requested CoralSeller rename is left to
  the final Claude Code pass.
- No TIA Coral files, services, themes, or workflows are part of this project.

## What changed

The work turned the original chat mockup into an executable seven-day operations
demo with typed visual answers and auditable state transitions.

### Daily operating workflows

- Sunday: cross-platform add-on discovery and guarded order merges.
- Monday: shipping blockers, shipping documents, label manifest review, and a
  Trigger.dev human-in-the-loop label purchase.
- Tuesday: autonomous last-minute delivery-change exception before carrier
  handoff, including staff notification, label void, and order hold.
- Wednesday: DOA customer resolution with review and owner-approved execution.
- Thursday: auction launch command and staged listing lifecycle.
- Friday: auction follow-through, campaign/listing operations, and live state.
- Saturday: deterministic auction close, winner emails, settlement, and funnel.

### Product and reliability work

- Replaced generic text responses with typed operational components.
- Added a seven-day demo clock and deterministic Sun–Sat state model.
- Added a safe, self-service demo reset with operation locks and ClickHouse
  fixture repair.
- Added owner authorization gates and fail-closed action handling.
- Added advisory-lock and idempotency protections for consequential actions.
- Added bounded polling and recovery states for Trigger.dev runs.
- Added rollback-safe integration tests for label purchase, shipment exception,
  DOA resolution, merge behavior, and reset behavior.
- Reconciled auction close time, generated bids, settlement totals, and UI copy
  to a single source of truth.

Recommended commits to inspect first:

- `77f8b4c` — merged weekday workflow program.
- `01ea321` — final demo-week and auction-truth reconciliation.
- `15ff9b3` — Saturday close and settlement lifecycle.
- `81afd0f` — Tuesday shipping command and urgent exception.
- `385d0ce` — Monday Trigger.dev label-purchase workflow.
- `110e87a` and `9bdc7a9` — executable Sunday merge flow and reconciliation.
- `1603aa7` — reset orchestration and deterministic reseeding.

## Architecture and workflow decisions

### Storage responsibilities

ClickHouse is the primary analytical and event data layer. It holds the large
operational event stream, powers the real-time read tools, and supports the
reporting, auction, attention, and funnel views. Its schema is in
`db/clickhouse/0001_events.sql`:

- `events` uses `MergeTree`, monthly partitions, and `(type, ts)` ordering.
- Two materialized views maintain hourly revenue/order and daily category
  rollups.
- The customer journey uses `windowFunnel` rather than computing the funnel in
  browser code.

ClickHouse-managed Postgres is the OLTP source of truth for customers, orders,
shipments, cases, action logs, and workflow coordination. Consequential writes
normally commit operational state to Postgres first and then emit the matching
ClickHouse event. That split is deliberate: ClickHouse answers the fast
cross-platform operating questions while Postgres protects transactional
invariants.

Audit the wording carefully against the hackathon requirement that ClickHouse be
the primary database. The implementation uses ClickHouse materially, but a judge
could incorrectly perceive it as secondary if the demo shows only the UI and
Postgres mutations. The video must visibly prove the ClickHouse event/query path.

### Trigger.dev responsibilities

- `src/trigger/reef-chat.ts` implements the required durable `chat.agent()` and
  typed tool access. The agent is configured in `src/lib/agent-config.ts`.
- `src/trigger/label-day.ts` uses a Trigger.dev waitpoint/token for explicit
  owner approval before buying labels.
- `src/trigger/ship-day-exception.ts` is an autonomous, retryable exception
  workflow.
- `src/trigger/doa-resolution.ts` executes an approved DOA resolution.
- `src/trigger/live-tick.ts` is the scheduled live-state tick.

Agent rules require visual components, short verdicts, real tool values, no
fabricated money, and no free-form promises. The current model is
`claude-sonnet-5`; provider configuration is presently a single point of failure.

### Authority and failure behavior

- Owner-gated actions fail closed when authorization is absent.
- The agent may read and propose, but consequential steps use typed server
  actions or dedicated Trigger.dev tasks.
- Merge execution uses Postgres advisory locks and staged state.
- General actions use advisory locking, an action log, and a matching ClickHouse
  event.
- Unsupported actions return `501` instead of pretending they completed.
- SMS, email, carrier, marketplace, and advertising sends are demo simulations;
  they are not production integrations.

### UI state

The merchant UI renders typed `ComponentSpec` objects through
`src/components/specs/SpecRenderer.tsx`. Routine and resolution progress is
persisted in `sessionStorage` for the current browser session. Full conversation
and workflow rehydration after a page refresh is not implemented.

## Demo chronology and source-of-truth data

The demo presents one chronological week, Sunday 2026-07-19 through Saturday
2026-07-25, backed by two auction cycles:

- W28 closed on Saturday 2026-07-18 at 20:00 and powers Sunday through Wednesday.
- W29 opens Thursday 2026-07-23 at 12:00 and closes Saturday 2026-07-25 at 20:00.
- W29 is the final close/settlement cycle. No generated bid occurs after close.

Day state is centralized in `src/lib/demo-clock.ts`; auction timing is centralized
in `src/lib/synth/schedule.ts`.

| Day | Header time | Important transitions |
| --- | ---: | --- |
| Sun Jul 19 | 14:20 | Work at 14:20, merge window 16:00, final check 18:30 |
| Mon Jul 20 | 18:10 | Blockers 08:30, documents 11:00, labels 16:30 |
| Tue Jul 21 | 09:30 | Prep 08:10, dispatch 13:00, urgent request 16:00, carrier 17:00 |
| Wed Jul 22 | 17:30 | DOA intake 09:30, review 10:05, resolution 17:30 |
| Thu Jul 23 | 20:45 | Prep 09:20/11:45, auction opens 12:00, status 20:45 |
| Fri Jul 24 | 21:30 | Campaign 15:30, follow-through 18:30, close prep 21:30 |
| Sat Jul 25 | 20:02 | Last call 19:30, close 20:00, emails 20:10, settlement 20:20 |

Representative verified data:

- W29 close: 12 lots, 12 winners, 194 bids, mismatch count 0, close at
  `2026-07-25T20:00:00Z`.
- W29 settlement: $1,993.99, 12 sold/winner/order records, all 12 paid, one
  shipping-selection issue.
- Sunday W28 merge: 5 merge candidates, 10 source orders, 5 add-ons, 13 coral
  units, $1,473.65 combined total.
- W27 report: $51,812 revenue, 544 orders, $95 average order. Web $31,676 / 342
  orders; marketplace $17,966 / 191; auction $2,170 / 11.

### Tuesday autonomous exception fixture

- Incident: `DEMO-SHIP-CHANGE-001`.
- Customer: `tide_runner_88`, internal customer id `900003`.
- Shipment/order: `SHP-DEMO-TUE-001` / `WEB-DEMO-TUE-001`.
- Destination: Columbus, Ohio; 3 items; 3.4 lb.
- Protected label cost: $32.60.
- Request arrives at 16:00; carrier handoff is 17:00.
- State: `request_received` → simulated staff SMS → `label_voided`; the order is
  held and audit events are present in Postgres and ClickHouse.

### Wednesday DOA fixture

- Case: `DOA-DEMO-2401`.
- Customer/order: `reef_keeper_17` / `WEB-DEMO-4812`.
- Shipment changes from `SHP-DEMO-4812` to `SHP-DEMO-4812-R1`.
- Three replacement items increase the shipment from 2 to 5 items.
- Label cost changes from $28.75 to $31.40.
- The customer reply is drafted but not actually sent.

### Reset behavior

`src/lib/synth/ensure-auction-week.ts` repairs W29 with fixture revision
`auction-close-2000-v2`. It issues bounded `ALTER TABLE ... DELETE` mutations,
waits for their completion, and inserts a non-deduplicated canonical fixture.
Reset took approximately 13 seconds in the final rehearsal. Do not reset during
the recorded demo.

## Validation completed on the merged feature tree

The following passed on 2026-07-22:

```text
npx tsc --noEmit
npm run build
npx tsx scripts/workflow-contract-check.ts
npx tsx scripts/demo-week-check.ts
npx tsx scripts/owner-auth-check.ts
npx tsx scripts/labelday-recovery-check.ts
npx tsx scripts/routine-progress-check.ts
npx tsx scripts/demo-reset-check.ts
npx tsx scripts/addon-merge-behavior-check.ts
npx tsx scripts/shipping-documents-check.tsx
npx tsx scripts/shipping-blockers-check.ts
npx tsx scripts/ship-day-exception-check.ts
npx tsx scripts/doa-resolution-check.ts
npx tsx scripts/ch-verify.ts
npx tsx scripts/report-check.ts
npx tsx scripts/tools-check.ts
```

The production build compiled, typechecked, and generated all 15 routes. The only
build warning was Node's benign invalid `--localstorage-file` path warning.

The workflow contract check covered every Sun–Sat contract plus the DOA customer
boundary. Label-day recovery covered five cases: replay, Postgres failure,
ClickHouse failure, lost acknowledgment, and hold-after-review. The shipment and
DOA integration checks ran with rollback-safe fixtures.

Live ClickHouse verification passed. Representative query times were about 220 ms
for materialized-view weekly revenue, 47 ms for auction top ten, and 46 ms for
`windowFunnel`. The last complete historical verification cycle was
2026-07-09 through 2026-07-16.

Not currently passable:

- `npx tsx scripts/agent-check.ts`, because the live Anthropic credential is over
  quota. Re-run this after credential recovery; do not waive it.

Local `tsx` scripts initially received an `EPERM` error when their IPC socket was
run inside a restricted sandbox. They passed when executed normally. That was a
test-harness restriction, not an application failure.

## Live rehearsal findings

- The merchant cockpit is visually strong and clearly communicates a seven-day
  command center.
- Self-service reset returned the demo to Sunday `0/3` successfully.
- The non-LLM Tuesday Trigger.dev task completed in roughly 3.1 seconds when the
  worker was ready.
- Starting Next.js before the Trigger.dev worker caused the UI to poll a run that
  finished only after the client had timed out. The user saw a safe “workflow
  connection unavailable” result even though the late task eventually succeeded.
- Once the worker was ready, a chat request reached Trigger.dev but failed at the
  Anthropic provider because of quota.

Recording rule: start the Trigger.dev worker first, verify it is ready, then start
Next.js, warm both databases, reset once, and rehearse without restarting either
process.

## High-risk logic for Claude Code to audit

1. `src/trigger/reef-chat.ts` and `src/lib/agent-config.ts`: required
   `chat.agent()` use, tool routing, provider recovery, step limit, component-only
   answer contract, and secret handling.
2. `src/lib/synth/ensure-auction-week.ts`, `src/lib/synth/generator.ts`, and
   `src/lib/synth/schedule.ts`: destructive fixture repair scope, mutation wait,
   close-time consistency, and no post-close bids.
3. `src/trigger/label-day.ts`, `src/lib/label-day.ts`, and action routes:
   waitpoint replay, owner authorization, Postgres-first mutation, retry behavior,
   and hold-after-review handling.
4. `src/trigger/ship-day-exception.ts` and
   `src/lib/ship-day-exception.ts`: autonomous authorization boundary, idempotent
   label void/order hold, and partial-failure recovery.
5. `src/trigger/doa-resolution.ts` and `src/lib/doa-demo.ts`: replacement
   shipment invariants, retry behavior, customer-message simulation, and duplicate
   events.
6. `src/lib/merge-actions.ts` and `src/app/api/actions/route.ts`: advisory lock
   scope, merge totals, rollback boundaries, owner session validation, and
   duplicate requests.
7. `src/lib/store/clickhouse.ts` and `src/lib/tools.ts`: query parameterization,
   bounded retry, winner selection with `argMax`, date boundaries, and event
   deduplication.
8. `src/components/chat/MerchantChat.tsx`: stale run polling, the 30-second timeout,
   refresh behavior, and late-completing Trigger runs.

Important concurrency limitation: several specialized workflows use a
ClickHouse check-then-insert guard. They are sequentially idempotent but are not a
strict exactly-once protocol under two concurrent identical approvals/runs. The
label flow documents this tradeoff. Generic actions and merge flows have stronger
Postgres advisory-lock protection.

## Known limitations and unfinished areas

- Single tenant; no role-based access control beyond the owner gate.
- No production marketplace, carrier, SMS, email, or advertising adapters.
- Synthetic/staged data drives the deterministic demo.
- Browser state is session-scoped; full chat/run rehydration is absent.
- Run progress uses polling rather than Trigger.dev Realtime.
- Anthropic is the only configured agent provider and is currently quota-blocked.
- Reset requires ClickHouse mutation permission and is too slow for an on-camera
  recovery.
- A small set of unsupported actions intentionally returns `501`.
- External ClickHouse/Trigger/provider connectivity can still introduce demo
  latency despite bounded read retries.
- Naming is inconsistent by design for now; the owner requested that Claude Code
  perform the later rename.
- README/AGENTS claims such as “five live-store reads” and historical agent-check
  counts should be reconciled with the current, larger tool set and current quota
  state before submission.

## Recommended final audit order

1. Fix the Anthropic quota and run `scripts/agent-check.ts`.
2. Read `README.md`, `AGENTS.md`, `src/trigger/reef-chat.ts`, and
   `src/lib/agent-config.ts` to verify requirement claims match code.
3. Inspect `db/clickhouse/0001_events.sql`, `src/lib/store/clickhouse.ts`, and
   `src/lib/tools.ts` to confirm ClickHouse is central and queries are correct.
4. Inspect the eight high-risk areas above, especially reset/delete scope and
   retry/idempotency boundaries.
5. Run the full validation ledger exactly as listed.
6. Start Trigger.dev first, then Next.js, perform one reset, and execute both
   recommended workflows in a real browser.
7. Verify the corresponding Trigger.dev runs, Postgres state, and ClickHouse
   events—not just the rendered UI.
8. Check `git status`, the public repository license, secret scanning, deploy
   configuration, and the final public GitHub URL.
9. Perform the requested product rename last, then rerun typecheck, build, agent
   probes, reset, and both video workflows.

## Strongest two-workflow demo story

### 1. Tuesday: autonomous last-minute shipping exception

Open with an inbound customer delivery-change request arriving one hour before
carrier handoff. Show Trigger.dev detecting it without an owner prompt, notifying
staff, voiding the label, holding the order, and recording the event trail. This
is the sharpest proof of real-time monitoring, durable automation, customer
impact, and safe state transitions.

### 2. Sunday/Monday: cross-platform add-on merge to approved labels

Ask, “Any orders to merge?” Show five auction anchors plus five add-on orders
across platforms becoming five shipments: 10 source orders, 13 coral units, and
$1,473.65. Continue into Monday's shipping-document and label review, then approve
the Trigger.dev waitpoint. Show the Postgres shipping mutation and the matching
ClickHouse `label_purchased` events.

Together, these workflows tell a better story than using two customer-service
exceptions. The first proves autonomous urgency; the second proves the core
“one chat, every platform, always a plan” value, human approval, and the OLTP +
OLAP architecture. Keep the DOA flow as a short backup or repository proof.

Suggested sub-five-minute cut:

- 0:00–0:10: product already open; one-sentence founder/problem line.
- 0:10–0:30: ClickHouse event layer and Trigger.dev agent/run proof.
- 0:30–1:55: Tuesday autonomous exception.
- 1:55–4:05: cross-platform merge through owner-approved labels.
- 4:05–4:40: visible ClickHouse query/MV/`windowFunnel` result and Trigger log.
- 4:40–4:58: one-sentence outcome and closing.

The official hackathon page says the video is capped at five minutes and should
open directly with a screen recording of the working product. The supplied
opening and closing are authentic, but too long for this format. Do not read the
full feature inventory. Compress the opening to:

> CoralSeller is the operating cockpit we built after ten years in a coral
> store: one chat, every platform, always a plan.

Compress the closing to:

> CoralSeller turns fragmented daily operations into one plan, durable
> workflows, and human-approved outcomes.

Official requirements: <https://triggerdev.clickhouse.com/>

## Candid prize assessment

This is a credible finalist-quality project after the agent credential is fixed,
but it is not yet a clear grand-prize favorite.

Strengths:

- Authentic, specific business problem with a founder who actually operates the
  workflow.
- Unusually polished visual answers rather than a wall of chat text.
- Deep Trigger.dev use: `chat.agent()`, a waitpoint, scheduled work, retryable
  autonomous tasks, and progress metadata.
- Material ClickHouse use: roughly 1.9 million events, materialized views,
  cross-platform live queries, and `windowFunnel`.
- Strong deterministic demo design, owner boundaries, rollback tests, and
  explicit failure states.

Weaknesses that can cost the prize:

- With the current provider quota, grand-prize chances are effectively zero and
  the required agent experience cannot be demonstrated.
- The seven-day breadth can look like a scripted dashboard rather than one
  indispensable product. The video needs two decisive workflows, not a feature
  tour.
- Postgres owns transactional truth, so ClickHouse may look bolted on unless its
  real-time event/query role is shown directly.
- Synthetic data and simulated external integrations reduce production
  credibility. A visible live event-to-state transition is essential.
- The best architecture is hidden behind the polished interface. Show the
  Trigger run and ClickHouse evidence briefly on screen.
- Polling, single-tenant state, no full refresh recovery, and provider fragility
  expose hackathon-grade edges.
- A long founder intro and catalog-style closing would spend scarce time without
  proving either sponsor technology.

Subjective odds, because the field size and judge preferences are unknown:

- Current quota-blocked state: approximately 0% chance of the grand prize.
- After fixing the agent, rehearsing the exact route, and visibly proving both
  sponsor technologies: roughly 20–35% grand-prize chance, 35–55% chance of any
  judged prize, and 45–65% chance of the OLTP + OLAP bonus.

Those ranges are an informed judgment, not a statistical forecast. The project’s
largest upside is the combination of an authentic niche operator story and
technically substantive orchestration. Its largest risk is that judges see a
beautiful pre-scripted demo before they see ClickHouse and Trigger.dev doing
indispensable work.
