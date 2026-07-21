/** Offline contract gate for the synthetic operational workflows. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEMO_DAYS } from "../src/lib/demo-clock";
import { DEMO_DOA_REVIEW } from "../src/lib/doa-demo";
import { routeShopQuestion, SHOP_COMBINE_ANSWER } from "../src/lib/shop-authority";

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
assert.equal(sunday.priorities[2].label, "Review next announcement");
assert.match(sunday.priorities[2].prompt ?? "", /next-auction announcement/i);

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

const phaseSource = readFileSync(new URL("../src/components/chat/PhaseChip.tsx", import.meta.url), "utf8");
assert.doesNotMatch(phaseSource, /block truncate text-\[13px\]/,
  "demo-day labels must wrap instead of rendering ellipses");
assert.match(phaseSource, /text-balance break-words whitespace-normal/,
  "demo-day labels must use balanced dynamic wrapping");

const agentSource = readFileSync(new URL("../src/lib/agent-config.ts", import.meta.url), "utf8");
assert.match(agentSource, /structured_component_required=true[\s\S]*Call the matching live tool/,
  "routine retries must require a fresh structured tool call");
assert.match(agentSource, /Tuesday listing questions call listingPlan/,
  "Tuesday listing routines must have a structured review tool");
assert.match(agentSource, /Wednesday\/Friday\/Sunday promotion questions call promotionPlan/,
  "promotion routines must have a structured review tool");

const routerSource = readFileSync(new URL("../src/lib/router.ts", import.meta.url), "utf8");
assert.match(routerSource, /exceptions\?\|holds\?\|address changes\?/,
  "offline fallback must route exceptions to attention before the generic order rule");
assert.match(routerSource, /inventory reminder\|inventory check/,
  "offline fallback must route Tuesday inventory work to the listing plan");
assert.match(routerSource, /announcement\|last\[ -\]call/,
  "offline fallback must route promotion routines before auction keywords");
assert.doesNotMatch(routerSource, /components: \[\.\.\.feed, \.\.\.pulse\]/,
  "attention must not silently append an unrelated revenue pulse");

console.log("✓ Monday prepares shipping documents; exception routing opens attention, not a manifest");
console.log("✓ Tuesday ships, stages listings, and requests the human Shopify inventory check");
console.log("✓ Wednesday, Friday, and Sunday promotion work stays review-only");
console.log("✓ DOA approval closes 3 replacements into tomorrow's updated shipment");
console.log("✓ Customer reply remains a draft and is never auto-sent");
console.log("✓ Concierge answers the supported combine FAQ; DOA and human handoff stay explicit");
console.log("\nALL PASS — synthetic workflow contracts");
