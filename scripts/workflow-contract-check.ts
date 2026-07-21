/** Offline contract gate for the synthetic operational workflows. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEMO_DAYS } from "../src/lib/demo-clock";
import { DEMO_DOA_REVIEW } from "../src/lib/doa-demo";

const monday = DEMO_DAYS.find((day) => day.id === "monday");
const tuesday = DEMO_DAYS.find((day) => day.id === "tuesday");
assert.ok(monday && tuesday);

assert.deepEqual(
  monday.priorities.map((priority) => priority.label),
  ["Clear order issues", "Combine matching orders", "Prepare labels in bulk"],
  "Monday's visible Label Day routine must stay plain and task-focused",
);
assert.match(monday.priorities[0].prompt ?? "", /customer messages|holds|address changes/i);
assert.match(monday.priorities[0].prompt ?? "", /do not prepare the label manifest/i);
assert.equal(tuesday.priorities[1].label, "Stop urgent changes");
assert.equal(tuesday.priorities[1].prompt, "What needs my attention?");

assert.equal(DEMO_DOA_REVIEW.caseId, "DOA-DEMO-2401");
assert.equal(DEMO_DOA_REVIEW.claimedItems.length, 3);
assert.equal(DEMO_DOA_REVIEW.shipment.shipWhen, "Tomorrow");
assert.equal(DEMO_DOA_REVIEW.shipment.existingItems, 2);
assert.notEqual(DEMO_DOA_REVIEW.shipment.currentLabelId, DEMO_DOA_REVIEW.shipment.updatedLabelId);
assert.ok(DEMO_DOA_REVIEW.shipment.updatedLabelCostCents > 0);
assert.match(DEMO_DOA_REVIEW.replyDraft, /three replacement corals/i);
assert.match(DEMO_DOA_REVIEW.replyDraft, /scheduled for tomorrow/i);

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

const routerSource = readFileSync(new URL("../src/lib/router.ts", import.meta.url), "utf8");
assert.match(routerSource, /exceptions\?\|holds\?\|address changes\?/,
  "offline fallback must route exceptions to attention before the generic order rule");
assert.doesNotMatch(routerSource, /components: \[\.\.\.feed, \.\.\.pulse\]/,
  "attention must not silently append an unrelated revenue pulse");

console.log("✓ Monday stays Label Day; exception routing opens attention, not a manifest");
console.log("✓ Tuesday owns the urgent ship-day change and autonomous protection loop");
console.log("✓ DOA approval closes 3 replacements into tomorrow's updated shipment");
console.log("✓ Customer reply remains a draft and is never auto-sent");
console.log("\nALL PASS — synthetic workflow contracts");
