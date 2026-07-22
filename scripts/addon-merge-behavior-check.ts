/** Behavioral checks for Sunday ReefnBid-anchor + add-on reconciliation. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  anchorShipmentCode,
  isExactReadyMergeSet,
  mergeCode,
  mergeCodeForOrders,
  mergeOrderIds,
  restorePersistedMergeBatch,
  selectRequestedMergePlans,
  shipmentTargetDecision,
  unclaimedMergeEventState,
} from "../src/lib/merge-actions";
import type { AddonMergePlan } from "../src/lib/tools";

function plan(
  customerId: number,
  anchorUnits: number,
  addonUnits: number[],
  mergeState: AddonMergePlan["mergeState"] = "ready",
): AddonMergePlan {
  const customer = {
    customerId,
    displayName: `customer-${customerId}`,
    tier: 2 as const,
    platforms: ["auction", "web"] as ("auction" | "web")[],
  };
  const line = (qty: number, sku: string) => [{
    sku, name: sku, category: "other" as const, qty, priceCents: qty * 1_000,
  }];
  return {
    weekIndex: 28,
    customer,
    anchor: {
      orderId: `AUC-28-${customerId}`,
      platform: "auction",
      customer,
      items: line(anchorUnits, `anchor-${customerId}`),
      totalCents: anchorUnits * 10_000,
      destination: "Miami, FL",
      status: "paid",
      shipWeek: "W28",
    },
    addons: addonUnits.map((units, index) => ({
      orderId: `WEB-28-${customerId}-${index + 1}`,
      platform: "web" as const,
      customer,
      items: line(units, `addon-${customerId}-${index + 1}`),
      totalCents: units * 2_000,
      destination: "Miami, FL",
      status: "paid" as const,
      shipWeek: "W28",
      orderedAt: `2026-07-19T12:0${index}:00.000Z`,
    })),
    totalCoralUnits: anchorUnits + addonUnits.reduce((sum, units) => sum + units, 0),
    totalCents: anchorUnits * 10_000 + addonUnits.reduce((sum, units) => sum + units * 2_000, 0),
    mergeState,
  };
}

const plans = [
  plan(4, 1, [2]),
  plan(7, 1, [1]),
  plan(8, 2, [2]),
  plan(9, 1, [1]),
];
assert.equal(plans.length, 4);
assert.equal(plans.reduce((sum, item) => sum + item.addons.length, 0), 4);
assert.equal(plans.reduce((sum, item) => sum + mergeOrderIds(item).length, 0), 8);
assert.equal(plans.reduce((sum, item) => sum + item.totalCoralUnits, 0), 11);
assert.match(mergeCode(plans[0]), /^MRG-W28-C4-[a-f0-9]{12}$/);
assert.equal(mergeCode(plans[0]), mergeCodeForOrders(28, 4, mergeOrderIds(plans[0])));
assert.notEqual(mergeCode(plans[0]), mergeCode(plan(4, 1, [1, 1])),
  "a later add-on set must get a new durable merge identity");
assert.equal(anchorShipmentCode(plans[0]), "SHP-28-4");
assert.equal(mergeOrderIds(plan(10, 1, [1, 2])).length, 3,
  "one ReefnBid anchor may collect multiple eligible add-on orders");

const requested = plans.map((item) => ({
  customerId: item.customer.customerId,
  orderIds: mergeOrderIds(item),
}));
assert.deepEqual(selectRequestedMergePlans(plans, requested), plans,
  "the rendered batch must resolve to the same exact order groups");
assert.throws(() => selectRequestedMergePlans([plan(4, 1, [2], "merged")], [requested[0]]), /stale/,
  "non-recovered actions must reject a group that Postgres already marked merged");
assert.throws(() => selectRequestedMergePlans([plan(4, 1, [2], "review")], [requested[0]]), /stale/);
assert.throws(() => selectRequestedMergePlans(plans, [requested[0], requested[0]]), /duplicate/);
assert.throws(() => selectRequestedMergePlans(plans, [{ ...requested[0], orderIds: ["AUC-28-4"] }]), /stale/);

assert.equal(isExactReadyMergeSet(plans, plans), true,
  "Merge all must accept the exact server-derived ready set");
const mixedPlans = [plan(4, 1, [2], "merged"), plan(7, 1, [1], "ready")];
assert.equal(isExactReadyMergeSet(mixedPlans, [mixedPlans[1]]), true,
  "already merged plans remain visible but are excluded from the fresh action set");
assert.equal(isExactReadyMergeSet(mixedPlans, [mixedPlans[0]]), false,
  "an equal-size payload cannot substitute a merged plan for the ready plan");
assert.equal(isExactReadyMergeSet(plans, plans.slice(0, 3)), false,
  "a ready-plan subset cannot masquerade as Merge all");

const persisted = requested.map((group) => ({
  mergeCode: mergeCodeForOrders(28, group.customerId, group.orderIds),
  sourceOrderIds: group.orderIds,
  coralUnits: plans.find((item) => item.customer.customerId === group.customerId)!.totalCoralUnits,
}));
assert.deepEqual(restorePersistedMergeBatch(28, requested, persisted), {
  sourceOrders: 8,
  coralUnits: 11,
  mergeCodes: persisted.map((run) => run.mergeCode),
}, "a fully committed outbox must retry without reconstructing live eligibility");
assert.equal(restorePersistedMergeBatch(28, requested, persisted.slice(0, 3)), null,
  "a partial persisted batch must not masquerade as complete");
assert.equal(unclaimedMergeEventState("emitting"), "in-progress",
  "a simultaneous click must receive an idempotent in-progress state");
assert.equal(unclaimedMergeEventState("completed"), "completed");
assert.throws(() => unclaimedMergeEventState("pending_event"), /no retryable outbox state/);

const exactIds = mergeOrderIds(plans[0]);
assert.equal(shipmentTargetDecision({
  shipmentCode: "SHP-28-4", status: "planned", items: 1,
  destination: "Miami, FL", linkedOrderIds: [],
}, exactIds, 3, "Miami, FL", "SHP-28-4"), "update-planned");
assert.equal(shipmentTargetDecision({
  shipmentCode: "SHP-28-4", status: "purchased", items: 3,
  destination: "Miami, FL", linkedOrderIds: [],
}, exactIds, 3, "Miami, FL", "SHP-28-4"), "reuse-immutable");
assert.equal(shipmentTargetDecision({
  shipmentCode: "SHP-28-4", status: "purchased", items: 3,
  destination: "Miami, FL", linkedOrderIds: exactIds,
}, exactIds, 3, "Miami, FL", "SHP-28-4"), "already-linked");
assert.equal(shipmentTargetDecision({
  shipmentCode: "SHP-28-4", status: "planned", items: 2,
  destination: "Miami, FL", linkedOrderIds: exactIds,
}, exactIds, 3, "Miami, FL", "SHP-28-4"), "update-planned",
"an exact-linked planned row must still reconcile its metadata");
assert.throws(() => shipmentTargetDecision({
  shipmentCode: "SHP-28-4", status: "purchased", items: 2,
  destination: "Miami, FL", linkedOrderIds: exactIds,
}, exactIds, 3, "Miami, FL", "SHP-28-4"), /immutable purchased shipment has 2 items/,
"an exact-linked purchased row must not bypass immutable metadata validation");
assert.throws(() => shipmentTargetDecision({
  shipmentCode: "SHP-28-4", status: "purchased", items: 2,
  destination: "Miami, FL", linkedOrderIds: [],
}, exactIds, 3, "Miami, FL", "SHP-28-4"), /immutable purchased shipment has 2 items/);
assert.throws(() => shipmentTargetDecision({
  shipmentCode: "SHP-28-99", status: "purchased", items: 3,
  destination: "Miami, FL", linkedOrderIds: [],
}, exactIds, 3, "Miami, FL", "SHP-28-4"), /not the ReefnBid anchor shipment/);
assert.throws(() => shipmentTargetDecision({
  shipmentCode: "SHP-28-4", status: "purchased", items: 3,
  destination: "Miami, FL", linkedOrderIds: ["AUC-28-99"],
}, exactIds, 3, "Miami, FL", "SHP-28-4"), /different order set/);

const toolsSource = readFileSync(new URL("../src/lib/tools.ts", import.meta.url), "utf8");
assert.match(toolsSource, /filter\(\(plan\) => plan\.mergeState !== "review"\)/,
  "completed ReefnBid/add-on plans must remain visible instead of producing an empty board");
assert.match(toolsSource, /readyCandidates: readyPlans\.length/,
  "the batch must distinguish visible reconciled shipments from remaining merge actions");
assert.match(toolsSource, /actions: readyPlans\.length \?/,
  "Merge all must disappear after all visible shipments are merged");

console.log("✓ exact ReefnBid-anchor/add-on groups conserve orders and coral units");
console.log("✓ persisted retries recover separately while stale, merged, duplicate, and review groups fail closed");
console.log("✓ purchased/held labels stay immutable and require the exact anchor shipment");
console.log("✓ completed merge plans remain visible while actions target only ready plans");
