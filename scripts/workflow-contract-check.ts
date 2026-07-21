/** Offline contract gate for the synthetic operational workflows. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEMO_DAYS } from "../src/lib/demo-clock";
import { DEMO_DOA_REVIEW } from "../src/lib/doa-demo";
import { routeShopQuestion, SHOP_COMBINE_ANSWER } from "../src/lib/shop-authority";
import { nextAuctionAnnouncementMeta } from "../src/lib/tools";

const monday = DEMO_DAYS.find((day) => day.id === "monday");
const tuesday = DEMO_DAYS.find((day) => day.id === "tuesday");
const wednesday = DEMO_DAYS.find((day) => day.id === "wednesday");
const friday = DEMO_DAYS.find((day) => day.id === "friday");
const sunday = DEMO_DAYS.find((day) => day.id === "sunday");
assert.ok(monday && tuesday && wednesday && friday && sunday);

assert.deepEqual(
  monday.priorities.map((priority) => priority.label),
  ["Clear shipping blockers", "Combine eligible orders", "Prepare shipping docs"],
  "Monday's visible shipping-document routine must stay plain and task-focused",
);
assert.match(monday.priorities[0].prompt ?? "", /customer messages|holds|address changes/i);
assert.match(monday.priorities[0].prompt ?? "", /do not prepare the label manifest/i);
assert.equal(tuesday.priorities[1].label, "Stage Thursday listings");
assert.match(tuesday.priorities[1].prompt ?? "", /ReefnBid.*Shopify/i);
assert.equal(tuesday.priorities[2].label, "Request inventory check");
assert.match(tuesday.priorities[2].prompt ?? "", /human inventory reminder.*Shopify/i);
assert.equal(wednesday.priorities[1].label, "Review auction reminder");
assert.match(wednesday.priorities[1].prompt ?? "", /email.*SMS.*Thursday/i);
assert.equal(friday.priorities[1].label, "Review last-call ads");
assert.match(friday.priorities[1].prompt ?? "", /last-call advertisement/i);
assert.equal(sunday.priorities[0].label, "Watch add-on orders");
assert.match(sunday.priorities[0].prompt ?? "", /only the Sunday add-on orders board.*Shopify or eBay add-on.*ReefnBid anchor/i);
assert.match(sunday.priorities[0].prompt ?? "", /Do not open merge controls yet/i);
assert.equal(sunday.priorities[1].label, "Combine eligible orders");
assert.match(sunday.priorities[1].prompt ?? "", /ReefnBid-anchored shipment.*coral totals.*Merge all/i);
assert.equal(sunday.priorities[2].label, "Announce next auction");
assert.match(sunday.priorities[2].prompt ?? "", /Thursday through Saturday.*8 PM ET/i);
assert.match(sunday.priorities[2].prompt ?? "", /email and SMS recipient counts.*drafts.*send button/i);
const announcementMeta = nextAuctionAnnouncementMeta();
assert.equal(announcementMeta.dateRange, "Thu, Jul 23, 2026 – Sat, Jul 25, 2026");
assert.equal(announcementMeta.closeTime, "Saturday at 8:00 PM ET");

assert.equal(DEMO_DOA_REVIEW.caseId, "DOA-DEMO-2401");
assert.equal(DEMO_DOA_REVIEW.claimedItems.length, 3);
assert.equal(DEMO_DOA_REVIEW.shipment.shipWhen, "Tomorrow");
assert.equal(DEMO_DOA_REVIEW.shipment.existingItems, 2);
assert.notEqual(DEMO_DOA_REVIEW.shipment.currentLabelId, DEMO_DOA_REVIEW.shipment.updatedLabelId);
assert.ok(DEMO_DOA_REVIEW.shipment.updatedLabelCostCents > 0);
assert.match(DEMO_DOA_REVIEW.replyDraft, /three replacement corals/i);
assert.match(DEMO_DOA_REVIEW.replyDraft, /scheduled for tomorrow/i);

assert.equal(routeShopQuestion("My coral arrived dead"), "doa-claim");
assert.equal(routeShopQuestion("Can I combine an add-on order with my auction win?"), "direct-answer");
assert.equal(routeShopQuestion("Can you hold my box until next week?"), "human-intake");
assert.match(SHOP_COMBINE_ANSWER, /synthetic demo/i);
assert.match(SHOP_COMBINE_ANSWER, /store confirms/i);

const taskSource = readFileSync(new URL("../src/trigger/doa-resolution.ts", import.meta.url), "utf8");
const phases = [
  "approval-recorded",
  "replacements-recorded",
  "old-label-voided",
  "packing-list-ready",
  "updated-label-purchased",
  "reply-draft-ready",
  "completed",
];
let cursor = -1;
for (const phase of phases) {
  const next = taskSource.indexOf(`metadata.set(\"status\", \"${phase}\")`);
  assert.ok(next > cursor, `DOA phase ${phase} must appear in order`);
  cursor = next;
}
assert.match(taskSource, /metadata\.set\("replySent", false\)/);

const shipSource = readFileSync(new URL("../src/trigger/ship-day-exception.ts", import.meta.url), "utf8");
const detected = shipSource.indexOf('metadata.set("status", "request-detected")');
const notified = shipSource.indexOf('metadata.set("status", "packing-notified")');
const protectedAt = shipSource.indexOf('metadata.set("status", "protected")');
assert.ok(detected >= 0 && detected < notified && notified < protectedAt,
  "Tuesday must detect, notify packing, then protect the shipment");

const shipLogicSource = readFileSync(new URL("../src/lib/ship-day-exception.ts", import.meta.url), "utf8");
assert.match(shipLogicSource, /o\.status IN \('pending','paid','labeled'\)/,
  "ship-day selection must require a holdable linked order");
assert.match(shipLogicSource, /incident\.incidentId}:\$\{incident\.shipmentId}:request/,
  "ship-day event ids must be shipment-scoped");
assert.match(shipLogicSource, /r\.request_code = \$1[\s\S]*r\.status = 'auto_handled'[\s\S]*s\.status = 'voided'[\s\S]*o\.status = 'held'/,
  "only the fixed completed demo incident may re-arm its own held shipment");
assert.ok((shipLogicSource.match(/ship_week <> 'DEMO-TOMORROW'/g) ?? []).length >= 4,
  "every Tuesday selection path must exclude the DOA demo fixture (ship_week DEMO-TOMORROW)");
assert.match(shipLogicSource, /stageSelfContainedShipDayFixture/,
  "an empty pool must self-stage an isolated deterministic Tuesday fixture, never throw");
assert.match(shipSource, /payload\.incident \?\?/,
  "task retries must reuse the staged incident, never re-select a shipment mid-incident");

const doaReviewSource = readFileSync(new URL("../src/components/specs/DoaReview.tsx", import.meta.url), "utf8");
assert.match(doaReviewSource, /polls > 90/,
  "DOA workflow polling must stop with a visible failure state when the run never progresses");

const merchantSource = readFileSync(new URL("../src/components/chat/MerchantChat.tsx", import.meta.url), "utf8");
assert.match(merchantSource, /pollCount >= 60/,
  "ship-day alert polling must stop with a visible failure state");
assert.match(merchantSource, /body\.reused && body\.status === "protected"/,
  "fresh completed Tuesday incidents must be reused without another run");
assert.match(merchantSource, /setShipAlert\(PENDING_SHIP_ALERT\)/,
  "Tuesday must show the inbound change before its durable workflow responds");
assert.match(merchantSource, /demoDayId !== "tuesday"[\s\S]*shipAlertStartedRef\.current = false/,
  "leaving Tuesday must reset the autonomous alert for the next visit");
assert.match(merchantSource, /routineHadVisualRef\.current \? "complete" : "failed"/,
  "routine completion must require a structured operational component");
assert.doesNotMatch(merchantSource, /request\.then\(\(\) => finishRoutine\(active, "complete"\)\)/,
  "a resolved prose-only chat turn must not mark operational work complete");
assert.match(merchantSource, /CHAT_RESPONSE_TIMEOUT_MS = 30_000/,
  "chat requests must stop instead of loading forever when the worker is unavailable");
assert.match(merchantSource, /setRequestFailure\([\s\S]*Trigger\.dev worker is running/,
  "a timed-out chat request must explain the local recovery step");

const actionChipSource = readFileSync(new URL("../src/components/specs/ActionChips.tsx", import.meta.url), "utf8");
assert.match(actionChipSource, /res\.status === 202[\s\S]*chip\.taskId\.startsWith\("merge-"\)[\s\S]*attempt < 30/,
  "a concurrent merge response must poll its durable outbox instead of disabling the action as done");

const phaseSource = readFileSync(new URL("../src/components/chat/PhaseChip.tsx", import.meta.url), "utf8");
assert.doesNotMatch(phaseSource, /block truncate text-\[13px\]/,
  "demo-day labels must wrap instead of rendering ellipses");
assert.match(phaseSource, /text-balance break-words whitespace-normal/,
  "demo-day labels must use balanced dynamic wrapping");

const routineProgressSource = readFileSync(new URL("../src/components/chat/RoutineProgress.tsx", import.meta.url), "utf8");
assert.doesNotMatch(routineProgressSource, /numberRef|<span ref=\{numberRef\}>/,
  "the routine progress ring must remain visually clean without a misaligned percentage label");

const agentSource = readFileSync(new URL("../src/lib/agent-config.ts", import.meta.url), "utf8");
assert.match(agentSource, /structured_component_required=true[\s\S]*Call the matching live tool/,
  "routine retries must require a fresh structured tool call");
assert.match(agentSource, /Tuesday listing questions call listingPlan/,
  "Tuesday listing routines must have a structured review tool");
assert.match(agentSource, /Sunday's add-on monitor calls ONLY addonOrderBoard, never scanMerges or revenuePulse/,
  "Sunday's monitor must open the dedicated order board");
assert.match(agentSource, /ReefnBid is the anchor and only winner-code Shopify\/eBay orders are add-ons/,
  "Sunday's merge task must use the ReefnBid anchor/add-on contract");
assert.match(agentSource, /Sunday's next-auction task calls auctionAnnouncement/,
  "Sunday's announcement must open drafts, counts, and the gated send control");

const routerSource = readFileSync(new URL("../src/lib/router.ts", import.meta.url), "utf8");
assert.match(routerSource, /exceptions\?\|holds\?\|address changes\?/,
  "offline fallback must route exceptions to attention before the generic order rule");
assert.match(routerSource, /inventory reminder\|inventory check/,
  "offline fallback must route Tuesday inventory work to the listing plan");
assert.match(routerSource, /announcement\|last\[ -\]call/,
  "offline fallback must route promotion routines before auction keywords");
assert.match(routerSource, /add-on orders\? board[\s\S]*return await addOns/,
  "offline fallback must route the Sunday monitor to its board");
assert.match(routerSource, /next-auction announcement[\s\S]*return await announcement/,
  "offline fallback must route the Sunday announcement to its review package");
assert.doesNotMatch(routerSource, /components: \[\.\.\.feed, \.\.\.pulse\]/,
  "attention must not silently append an unrelated revenue pulse");

const rendererSource = readFileSync(new URL("../src/components/specs/SpecRenderer.tsx", import.meta.url), "utf8");
assert.match(rendererSource, /case "addon_order_board"/,
  "the add-on monitor must render a dedicated board");
assert.match(rendererSource, /case "merge_batch"/,
  "the merge routine must render its batch summary and Merge all control");
assert.match(rendererSource, /case "auction_announcement"/,
  "the next-auction package must render both drafts and its action");

const actionRouteSource = readFileSync(new URL("../src/app/api/actions/route.ts", import.meta.url), "utf8");
assert.match(actionRouteSource, /send-demo-auction-announcement/,
  "the announcement approval must have a wired action");
assert.match(actionRouteSource, /merge-all-orders/,
  "the combined-order routine must wire Merge all");
assert.match(actionRouteSource, /UPDATE orders SET shipment_id/,
  "merge actions must persist the source-order to shipment relationship");
assert.match(actionRouteSource, /pg_advisory_xact_lock/,
  "duplicate merge clicks must serialize on a durable merge key");
assert.match(actionRouteSource, /pending_event[\s\S]*emitting[\s\S]*completed/,
  "merge event delivery must use a retryable Postgres outbox lifecycle");
assert.match(actionRouteSource, /restorePersistedMergeBatch/,
  "a committed merge outbox must retry without reconstructing live eligibility");
assert.match(actionRouteSource, /taskId === "merge-orders" && groups\.length !== 1/,
  "an individual merge retry must remain bound to exactly one group");
assert.match(actionRouteSource, /status: "in-progress"[\s\S]*status: 202/,
  "a simultaneous retry must return an idempotent in-progress response");
assert.match(actionRouteSource, /UPDATE action_log SET outcome = 'ok'[\s\S]*payload->'mergeCodes'/,
  "the audit row must move from pending_event to ok after delivery completes");
assert.match(actionRouteSource, /decision === "update-planned"[\s\S]*status = 'planned'/,
  "only planned shipment rows may be changed by a merge");
assert.match(actionRouteSource, /shipmentTargetDecision/,
  "purchased and held shipments must pass the immutable target guard");
assert.match(actionRouteSource, /simulated: true[\s\S]*no external messages sent/,
  "the demo send must remain synthetic and state that boundary");

const toolSource = readFileSync(new URL("../src/lib/tools.ts", import.meta.url), "utf8");
assert.match(toolSource, /addon\.discount_code = concat\('RC', \$3::int, '-', addon\.customer_id\)/,
  "the add-on board and merge run must share the exact winner-code pairing rule");
assert.match(toolSource, /kind: "merge_batch"[\s\S]*label: "Merge all"/,
  "the merge batch must expose one explicit Merge all action");
assert.match(toolSource, /groups: plans\.map/,
  "Merge all must bind the click to every exact group rendered on the board");

const mergeMigrationSource = readFileSync(new URL("../db/postgres/0002_merge_runs.sql", import.meta.url), "utf8");
assert.match(mergeMigrationSource, /merge_code\s+TEXT PRIMARY KEY/,
  "merge runs must have one durable idempotency key");
assert.match(mergeMigrationSource, /pending_event','emitting','completed/,
  "the durable merge outbox must expose every delivery state");

const generatorSource = readFileSync(new URL("../src/lib/synth/generator.ts", import.meta.url), "utf8");
assert.match(generatorSource, /addonUnitsByCustomer/,
  "shipment fixtures must use actual add-on coral units");
assert.doesNotMatch(generatorSource, /addon \? 2 : 0/,
  "shipment fixtures must never hardcode two add-on units");

console.log("✓ Monday prepares shipping documents; exception routing opens attention, not a manifest");
console.log("✓ Tuesday ships, stages listings, and requests the human Shopify inventory check");
console.log("✓ Sunday reconciles ReefnBid anchors, add-on totals, Merge all, and the announcement package");
console.log("✓ Wednesday and Friday promotion work stays review-only");
console.log("✓ DOA approval closes 3 replacements into tomorrow's updated shipment");
console.log("✓ Customer reply remains a draft and is never auto-sent");
console.log("✓ Concierge answers the supported combine FAQ; DOA and human handoff stay explicit");
console.log("\nALL PASS — synthetic workflow contracts");
