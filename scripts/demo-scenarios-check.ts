/** Offline contract gate for the two public hackathon demo stories. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEMO_DAYS } from "../src/lib/demo-clock";
import { DEMO_DOA_REVIEW } from "../src/lib/doa-demo";

const monday = DEMO_DAYS.find((day) => day.id === "monday");
const tuesday = DEMO_DAYS.find((day) => day.id === "tuesday");
assert.ok(monday && tuesday);

assert.deepEqual(
  monday.priorities.map((priority) => priority.label),
  ["Validate orders before labels", "Find orders to combine", "Prepare the label batch"],
  "Monday's visible Label Day routine must stay unchanged",
);
assert.match(monday.priorities[0].prompt ?? "", /customer messages|holds|address changes/i);
assert.match(monday.priorities[0].prompt ?? "", /do not prepare the label manifest/i);
assert.match(tuesday.priorities[1].label, /last-minute exceptions/i);
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

const routerSource = readFileSync(new URL("../src/lib/router.ts", import.meta.url), "utf8");
assert.match(routerSource, /exceptions\?\|holds\?\|address changes\?/,
  "offline fallback must route exceptions to attention before the generic order rule");
assert.doesNotMatch(routerSource, /components: \[\.\.\.feed, \.\.\.pulse\]/,
  "attention must not silently append an unrelated revenue pulse");

console.log("✓ Monday stays Label Day; exception routing opens attention, not a manifest");
console.log("✓ Tuesday owns the urgent ship-day change and autonomous protection loop");
console.log("✓ DOA approval closes 3 replacements into tomorrow's updated shipment");
console.log("✓ Customer reply remains a draft and is never auto-sent");
console.log("\nALL PASS — two public demo scenarios");
