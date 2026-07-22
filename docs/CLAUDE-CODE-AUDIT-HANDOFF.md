# Claude Code Submission Audit Handoff

Finalized on 2026-07-22 after the independent Claude Code audit and the
display-only CoralSeller rename. This document covers the hackathon project in
this repository only. Do not copy, merge, deploy, or write any of this work into
TIA Coral.

## Read this first: engineering blockers resolved

The restored Anthropic credential is working. The independent audit fixed the
wall-clock rollover class, bounded Monday manifests to W28, made chronology an
asserting gate, aligned agent probes with the real transport contract, protected
Monday labels from Tuesday staging, converged the W29 ClickHouse fixture, and
carried Sunday's merged boxes into Monday's board.

The audited baseline passed all 17 validation gates, two consecutive 10/10 agent
runs, and a live Trigger.dev + ClickHouse + Postgres E2E covering merge, label
approval, Tuesday protection, DOA resolution, and reset. CoralSeller changes only
display copy, metadata, documentation, the package label, and the agent's
self-name; deployed `reef-*` task IDs and data/session identifiers remain stable.

## Current repository status

- Current audited engineering baseline: commit `b313508` on `main` before the
  display-only CoralSeller finalization.
- Completed feature integration: merge commit `77f8b4c`.
- Prior handoff document: commit `7de00c0`.
- Feature branch tip: `01ea321` (`fix: reconcile demo week and auction truth`).
- The full implementation range is visible with
  `git log --oneline ab5e592..main`.
- This handoff accompanies the final display-only CoralSeller rename; no
  workflow, persistence, task-ID, or synthetic-story behavior changed in that
  finalization.
- The public display name is CoralSeller. Internal `reef-*` identifiers remain
  unchanged intentionally to avoid orphaning deployed Trigger.dev tasks or
  invalidating deterministic fixture/session contracts.
- No TIA Coral repository file, service, theme, or workflow was touched. Existing
  provenance notes credit TIA Coral only as business inspiration and pair that
  credit with explicit synthetic-data boundaries.

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
The refreshed reset took 15.6 seconds and returned the browser to Sunday `0/3`.
Do not reset during the recorded demo.

The final audit pinned story surfaces to the demo clock, bounded Monday documents
and label preparation before `2026-07-23T00:00:00Z`, and made reset aging use the
synthetic horizon. `labelday-check.ts` now exits non-zero for an incorrect week,
empty batch, future-cycle order, or chronology violation.

## Validation completed on the merged feature tree

The following commands passed on the audited baseline on 2026-07-22:

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
npx tsx scripts/labelday-check.ts
npx tsx scripts/ship-day-exception-check.ts
npx tsx scripts/doa-resolution-check.ts
npx tsx scripts/ch-verify.ts
npx tsx scripts/report-check.ts
npx tsx scripts/tools-check.ts
npx tsx scripts/agent-check.ts  # 10/10 twice consecutively
```

The production build compiled, typechecked, and generated all 15 routes. The only
build warning was Node's benign invalid `--localstorage-file` path warning.

The workflow contract check covered every Sun–Sat contract plus the DOA customer
boundary. Label-day recovery covered five cases: replay, Postgres failure,
ClickHouse failure, lost acknowledgment, and hold-after-review. The shipment and
DOA integration checks ran with rollback-safe fixtures.

Live ClickHouse verification passed. Representative refreshed query times were
254 ms for materialized-view weekly revenue, 54 ms for auction top ten, and 53 ms for
`windowFunnel`. The last complete historical verification cycle was
2026-07-09 through 2026-07-16.

Final audit evidence also includes a simulated Jul-26 clock with the same
5-candidate / 10-order / 13-coral / $1,473.65 story, an exact canonical W29
ClickHouse fixture, 1,973,931 events, and a live four-workflow E2E. The former
agent-probe and label-chronology failures were independently reproduced before
their fixes and passed after them.

Local `tsx` scripts initially received an `EPERM` error when their IPC socket was
run inside a restricted sandbox. They passed when executed normally. That was a
test-harness restriction, not an application failure.

## Live rehearsal findings

- The merchant cockpit is visually strong and clearly communicates a seven-day
  command center.
- The restored provider successfully answered through Trigger.dev
  `chat.agent()`. The Sunday UI prompt `Any orders to merge?` rendered five
  candidates, 10 source orders, 13 coral units, and $1,473.65.
- Selecting Tuesday returned its AI-generated day brief through the same live
  agent path.
- The Tuesday Trigger.dev task completed in 3.1 seconds and visibly transitioned
  from request detected to packing notified, label voided, and `$32.60`
  protected.
- Self-service reset completed in 15.6 seconds and returned to Sunday `0/3`.
- Starting Next.js before the Trigger.dev worker caused the UI to poll a run that
  finished only after the client had timed out. The user saw a safe “workflow
  connection unavailable” result even though the late task eventually succeeded.
- Reset cancels the still-open durable chat session after its streamed response;
  this is expected cleanup, but it means reset must never run during recording.

Recording rule: start the Trigger.dev worker first, verify it is ready, then start
Next.js, warm both databases, reset once, and rehearse without restarting either
process.

## High-risk logic for Claude Code to audit

1. `scripts/agent-check.ts`, `src/trigger/reef-chat.ts`, and
   `src/lib/agent-config.ts`: verify the generic merge probe retains the same
   synthetic-day marker that `MerchantChat` adds. Require repeated 10/10 results.
2. `src/app/api/demo/reset/route.ts`, `src/lib/synth/reset-postgres.ts`, and
   `src/lib/label-day.ts`: verify Monday W28 label approval remains bounded away
   from future W29 auction orders while preserving the selectable Saturday demo.
3. `src/trigger/reef-chat.ts` and `src/lib/agent-config.ts`: required
   `chat.agent()` use, tool routing, provider recovery, step limit, component-only
   answer contract, and secret handling.
4. `src/lib/synth/ensure-auction-week.ts`, `src/lib/synth/generator.ts`, and
   `src/lib/synth/schedule.ts`: destructive fixture repair scope, mutation wait,
   close-time consistency, and no post-close bids.
5. `src/trigger/label-day.ts`, `src/lib/label-day.ts`, and action routes:
   waitpoint replay, owner authorization, Postgres-first mutation, retry behavior,
   and hold-after-review handling.
6. `src/trigger/ship-day-exception.ts` and
   `src/lib/ship-day-exception.ts`: autonomous authorization boundary, idempotent
   label void/order hold, and partial-failure recovery.
7. `src/trigger/doa-resolution.ts` and `src/lib/doa-demo.ts`: replacement
   shipment invariants, retry behavior, customer-message simulation, and duplicate
   events.
8. `src/lib/merge-actions.ts` and `src/app/api/actions/route.ts`: advisory lock
   scope, merge totals, rollback boundaries, owner session validation, and
   duplicate requests.
9. `src/lib/store/clickhouse.ts` and `src/lib/tools.ts`: query parameterization,
   bounded retry, winner selection with `argMax`, date boundaries, and event
   deduplication.
10. `src/components/chat/MerchantChat.tsx`: stale run polling, the 30-second timeout,
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
- Anthropic is the only configured agent provider; it is healthy in the refreshed
  audit but has no fallback.
- Reset requires ClickHouse mutation permission and is too slow for an on-camera
  recovery.
- A small set of unsupported actions intentionally returns `501`.
- External ClickHouse/Trigger/provider connectivity can still introduce demo
  latency despite bounded read retries.
- `npm audit --omit=dev` currently reports 27 production-tree advisories
  (0 critical, 6 high). The high findings are in Next/Sharp and Trigger.dev's
  Socket.IO/WebSocket transitive tree; the offered fixes require unsafe
  major-version changes or a Trigger.dev downgrade, so no submission-day
  dependency churn was applied. Practical exposure is reduced because this is a
  synthetic hackathon demo with no untrusted image-upload surface, but a
  post-submission dependency upgrade should be the first security task.
- The public name is CoralSeller while internal `reef-*` identifiers remain for
  deployment and data compatibility; this is deliberate and invisible to users.

## Recommended final audit order

1. Read `README.md`, `AGENTS.md`, `src/trigger/reef-chat.ts`, and
   `src/lib/agent-config.ts` to verify requirement claims match code.
2. Inspect `db/clickhouse/0001_events.sql`, `src/lib/store/clickhouse.ts`, and
   `src/lib/tools.ts` to confirm ClickHouse is central and queries are correct.
3. Inspect the high-risk areas above, especially reset/delete scope, chronology,
   and retry/idempotency boundaries.
4. Run the full validation ledger exactly as listed, including two consecutive
   10/10 agent runs and the asserting label chronology check.
5. Start Trigger.dev first, then Next.js, perform one reset, and execute both
   recommended workflows in a real browser.
6. Verify the corresponding Trigger.dev runs, Postgres state, and ClickHouse
   events—not just the rendered UI.
7. Check `git status`, the public repository license, secret scanning, deploy
   configuration, and the final public GitHub URL.

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

The W28/W29 label-manifest defect is fixed and guarded by a non-zero asserting
check, so this complete workflow is safe to record after the final release gate.

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

The independent post-fix assessment rates CoralSeller as a genuine contender,
not a lock. Engineering blockers are resolved; presentation quality, public-repo
availability, and the five-minute video are now the dominant variables.

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
- A strict repository security audit will surface the unresolved transitive
  dependency advisories above. Do not claim a clean `npm audit`; explain the
  tested synthetic-demo boundary and the deliberate decision not to risk a
  major-version migration immediately before submission.
- A long founder intro and catalog-style closing would spend scarce time without
  proving either sponsor technology.

Subjective odds, because the field size and judge preferences are unknown:

- Independent post-fix ranges: 55–75% finalist chance, 40–60% chance of any
  prize, 45–65% chance of the OLTP + OLAP bonus, and 15–30% grand-prize chance.

Those ranges are an informed judgment, not a statistical forecast. The project’s
largest upside is the combination of an authentic niche operator story and
technically substantive orchestration. Its largest risk is that judges see a
beautiful pre-scripted demo before they see ClickHouse and Trigger.dev doing
indispensable work.
