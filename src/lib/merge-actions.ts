import { createHash } from "node:crypto";
import type { AddonMergePlan } from "./tools";

export type RequestedMergeGroup = {
  customerId: number;
  orderIds: string[];
};

export type PersistedMergeRun = {
  mergeCode: string;
  sourceOrderIds: string[];
  coralUnits: number;
};

export const mergeOrderIds = (plan: AddonMergePlan) => [
  plan.anchor.orderId,
  ...plan.addons.map((addon) => addon.orderId),
];

export const mergeCode = (plan: AddonMergePlan) => {
  return mergeCodeForOrders(plan.weekIndex, plan.customer.customerId, mergeOrderIds(plan));
};

export const mergeCodeForOrders = (weekIndex: number, customerId: number, orderIds: string[]) => {
  const fingerprint = createHash("sha256")
    .update([...orderIds].sort().join("|"))
    .digest("hex")
    .slice(0, 12);
  return `MRG-W${weekIndex}-C${customerId}-${fingerprint}`;
};

/** The synthetic label ledger derives its anchor shipment from the ReefnBid id. */
export const anchorShipmentCode = (plan: AddonMergePlan) =>
  plan.anchor.orderId.replace(/^AUC-/, "SHP-");

const sameIds = (left: string[], right: string[]) =>
  [...left].sort().join("|") === [...right].sort().join("|");

/** Bind a click to the exact groups rendered in the review card. */
export function selectRequestedMergePlans(
  plans: AddonMergePlan[],
  groups: RequestedMergeGroup[],
): AddonMergePlan[] {
  if (!groups.length) throw new Error("at least one merge group is required");
  const seen = new Set<number>();
  return groups.map((group) => {
    if (seen.has(group.customerId)) {
      throw new Error(`duplicate merge group for customer ${group.customerId}`);
    }
    seen.add(group.customerId);
    const plan = plans.find((candidate) =>
      candidate.customer.customerId === group.customerId && candidate.mergeState !== "review");
    if (!plan || !sameIds(mergeOrderIds(plan), group.orderIds)) {
      throw new Error(`merge group for customer ${group.customerId} is stale`);
    }
    return plan;
  });
}

/** Recover a fully committed batch without rebuilding eligibility from live orders. */
export function restorePersistedMergeBatch(
  weekIndex: number,
  groups: RequestedMergeGroup[],
  runs: PersistedMergeRun[],
): { sourceOrders: number; coralUnits: number; mergeCodes: string[] } | null {
  const mergeCodes = groups.map((group) =>
    mergeCodeForOrders(weekIndex, group.customerId, group.orderIds));
  if (!groups.length || runs.length !== groups.length) return null;
  const exact = groups.every((group, index) => {
    const run = runs.find((candidate) => candidate.mergeCode === mergeCodes[index]);
    return run && sameIds(run.sourceOrderIds, group.orderIds);
  });
  if (!exact) return null;
  return {
    sourceOrders: groups.reduce((sum, group) => sum + group.orderIds.length, 0),
    coralUnits: runs.reduce((sum, run) => sum + Number(run.coralUnits), 0),
    mergeCodes,
  };
}

export function unclaimedMergeEventState(status: string | undefined): "completed" | "in-progress" {
  if (status === "completed") return "completed";
  if (status === "emitting") return "in-progress";
  throw new Error("merge event has no retryable outbox state");
}

export type ShipmentTarget = {
  shipmentCode: string;
  status: "planned" | "purchased" | "held";
  items: number;
  destination: string;
  linkedOrderIds: string[];
};

/**
 * Planned shipments may be updated before purchase. Purchased/held shipments
 * are immutable and can only be reused when their recorded contents already
 * equal the exact ReefnBid + add-on plan.
 */
export function shipmentTargetDecision(
  target: ShipmentTarget,
  expectedOrderIds: string[],
  expectedItems: number,
  expectedDestination: string,
  expectedShipmentCode: string,
): "update-planned" | "reuse-immutable" | "already-linked" {
  if (target.linkedOrderIds.length) {
    if (!sameIds(target.linkedOrderIds, expectedOrderIds)) {
      throw new Error("shipment already contains a different order set");
    }
  }
  if (target.status === "planned") return "update-planned";
  if (target.shipmentCode !== expectedShipmentCode) {
    throw new Error(`immutable ${target.status} shipment is not the ReefnBid anchor shipment`);
  }
  if (target.items !== expectedItems) {
    throw new Error(`immutable ${target.status} shipment has ${target.items} items; merge needs ${expectedItems}`);
  }
  if (target.destination && expectedDestination && target.destination !== expectedDestination) {
    throw new Error(`immutable ${target.status} shipment has a different destination`);
  }
  return target.linkedOrderIds.length ? "already-linked" : "reuse-immutable";
}
