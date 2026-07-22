/** Behavioral lane-conservation gate for Monday's blocker board. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AttentionItem } from "../src/lib/protocol";
import { categorizeShippingBlockers } from "../src/lib/tools";

const items: AttentionItem[] = [
  { id: "hold-request", kind: "request", headline: "keeper asks: hold next week", ageMinutes: 12 },
  { id: "late-addon", kind: "request", headline: "keeper asks: late addon", ageMinutes: 9 },
  { id: "address-message", kind: "message", headline: "wrong apartment number", detail: "Please change my address", ageMinutes: 8 },
  { id: "question", kind: "message", headline: "What light does this zoa need?", ageMinutes: 7 },
  { id: "replacement", kind: "case", headline: "3-item DOA review", ageMinutes: 6,
    doaReview: {
      caseId: "case", reviewWindow: "demo",
      customer: { displayName: "keeper", band: 2, platforms: ["web"] },
      claimedItems: ["A", "B", "C"],
      history: { orders: 1, coralItems: 3, priorDoa: 0, priorRefunds: 0, priorCredits: 0, priorReplacements: 0 },
      evidence: [],
      shipment: { orderId: "WEB-1", shipWhen: "Tuesday", destination: "Denver", existingItems: 1,
        currentLabelId: "OLD", currentLabelCostCents: 1000, updatedLabelId: "NEW", updatedLabelCostCents: 1200 },
      replyDraft: "draft",
    } },
  { id: "handled", kind: "system", headline: "delivery change protected", ageMinutes: 4, status: "handled" },
];

const { groups, openCount } = categorizeShippingBlockers(items);
const byKind = new Map(groups.map((group) => [group.kind, group]));
assert.equal(byKind.get("hold_requests")?.count, 2,
  "hold/address records must move to one lane, regardless of request or message source");
assert.equal(byKind.get("customer_questions")?.count, 1,
  "an address message must not be double-counted as a customer question");
assert.equal(byKind.get("replacement_items")?.count, 3);
assert.equal(openCount, 4, "openCount counts queue records, not replacement coral units");
assert.ok(!groups.some((group) => group.headlines.some((headline) => /late addon/i.test(headline))),
  "late add-ons belong to the merge command, not the hold lane");

const boardSource = readFileSync(new URL("../src/components/specs/ShippingBlockerBoard.tsx", import.meta.url), "utf8");
assert.match(boardSource, /APPROVE ALL · MARK HANDLED/,
  "the primary approval control must stay visible at the top of the compact blocker board");
assert.match(boardSource, /<details[\s\S]*REVIEW ISSUE SUMMARY/,
  "issue examples must use one progressive-disclosure summary instead of three long cards");
assert.match(boardSource, /setHandled\(true\)/,
  "the demo approval must visibly move the compact board into a handled state");
assert.doesNotMatch(boardSource, /open the detailed rows below/,
  "the blocker board must not promise a long queue beneath the approval control");

console.log("✓ blocker lanes are mutually exclusive");
console.log("✓ late add-ons stay out of hold requests");
console.log("✓ replacement coral units and open queue records remain distinct");
console.log("✓ compact top approval and issue-summary disclosure stay wired");
console.log("\nALL PASS — Monday blocker-lane conservation");
