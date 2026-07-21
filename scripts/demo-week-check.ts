/** Deterministic contract gate for the seven selectable recording days. */
import assert from "node:assert/strict";
import {
  DEMO_DAYS,
  DEMO_AUCTION_WEEK_INDEX,
  demoAuctionMoment,
  dayBriefSpec,
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

assert.equal(DEMO_DAYS.length, 7, "the recording controller must expose seven days");
assert.deepEqual(DEMO_DAYS.map((day) => [day.id, day.label]), expected);
assert.equal(new Set(DEMO_DAYS.map((day) => day.id)).size, 7, "weekday ids must be unique");

for (const day of DEMO_DAYS) {
  assert.equal(day.priorities.length, 3, `${day.weekday} must have three priorities`);
  assert.ok(day.priorities.some((priority) => priority.prompt), `${day.weekday} needs a supported next prompt`);
  assert.ok(day.goal.length > 40, `${day.weekday} needs a meaningful goal`);
  assert.ok(day.reminder.length > 30, `${day.weekday} needs a meaningful reminder`);

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

console.log("\nALL PASS — seven-day demo-week contract");
