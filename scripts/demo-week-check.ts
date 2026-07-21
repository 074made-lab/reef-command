/** Deterministic contract gate for the seven selectable synthetic days. */
import assert from "node:assert/strict";
import {
  DEMO_DAYS,
  DEMO_AUCTION_WEEK_INDEX,
  DEMO_DAY_STORAGE_KEY,
  demoAuctionMoment,
  dayBriefSpec,
  isDemoDayId,
  parseDemoDayContext,
  stripDemoDayContext,
  withDemoDayContext,
} from "../src/lib/demo-clock";

const expected = [
  ["monday", "Label Day"],
  ["tuesday", "Ship + Preview"],
  ["wednesday", "Ship + Report"],
  ["thursday", "Auction Opens"],
  ["friday", "Auction Momentum"],
  ["saturday", "Close + Winners"],
  ["sunday", "Add-on Day"],
] as const;

assert.equal(DEMO_DAYS.length, 7, "the synthetic-week controller must expose seven days");
assert.equal(DEMO_DAY_STORAGE_KEY, "reef-command:demo-day");
assert.equal(isDemoDayId("thursday"), true);
assert.equal(isDemoDayId("demo-day"), false);
assert.deepEqual(DEMO_DAYS.map((day) => [day.id, day.label]), expected);
assert.equal(new Set(DEMO_DAYS.map((day) => day.id)).size, 7, "weekday ids must be unique");

for (const day of DEMO_DAYS) {
  assert.equal(day.priorities.length, 3, `${day.weekday} must have three priorities`);
  assert.ok(day.priorities.every((priority) => priority.prompt), `${day.weekday} focus cards must all start a supported routine`);
  assert.ok(
    day.priorities.every((priority) => /attention|exception|combine|merge|label|business|auction|report/i.test(priority.prompt ?? "")),
    `${day.weekday} focus cards must map to a supported agent tool`,
  );
  assert.ok(day.goal.length > 40, `${day.weekday} needs a meaningful goal`);
  assert.ok(day.reminder.length > 30, `${day.weekday} needs a meaningful reminder`);
  assert.ok(day.goal.length <= 100, `${day.weekday} goal must stay glanceable`);
  assert.ok(day.reminder.length <= 100, `${day.weekday} note must stay glanceable`);
  assert.ok(
    day.priorities.every((priority) => priority.label.length <= 28),
    `${day.weekday} job labels must fit on one line`,
  );
  assert.ok(
    day.priorities.every((priority) => priority.detail.length <= 110),
    `${day.weekday} job details must stay concise`,
  );
  const visibleCopy = [
    day.goal,
    day.reminder,
    ...day.priorities.flatMap((priority) => [priority.label, priority.detail]),
  ].join(" ");
  assert.doesNotMatch(
    visibleCopy,
    /synthetic|public demo|production|customer-value|targeting|bounded|triage|operational signal|pre-linked|unambiguous/i,
    `${day.weekday} visible copy must use plain staff language`,
  );

  const spec = dayBriefSpec(day.id)[0];
  assert.equal(spec.kind, "day_brief");
  if (spec.kind !== "day_brief") throw new Error("wrong component kind");
  assert.equal(spec.dayId, day.id);
  assert.equal(spec.label, day.label);
  assert.equal(spec.priorities.length, 3);

  const contextual = withDemoDayContext(day.id, "What matters now?");
  assert.equal(parseDemoDayContext(contextual), day.id);
  assert.equal(stripDemoDayContext(contextual), "What matters now?");
  assert.equal(
    Math.floor((demoAuctionMoment(day.id) - Date.UTC(2026, 0, 1)) / (7 * 24 * 60 * 60_000)),
    DEMO_AUCTION_WEEK_INDEX,
    `${day.weekday} must stay inside the stable auction cycle`,
  );
  console.log(`✓ ${day.short} ${day.weekday.padEnd(9)} → ${day.label}`);
}

const traceMessage = withDemoDayContext(
  "tuesday",
  "[SYNTHETIC SHIP TRACE: status=protected; shipment=SHP-DEMO]\nExplain this ship-day automation trace.",
);
assert.equal(stripDemoDayContext(traceMessage), "Explain this ship-day automation trace.");

console.log("\nALL PASS — seven-day demo-week contract");
