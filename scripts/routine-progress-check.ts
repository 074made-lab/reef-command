import assert from "node:assert/strict";
import {
  createEmptyRoutineProgress,
  restoreRoutineProgress,
  routinePercent,
} from "../src/components/chat/RoutineProgress";

const progress = createEmptyRoutineProgress();
assert.equal(routinePercent(progress.monday), 0, "a fresh day starts at 0%");

progress.monday[0] = { status: "running", progress: 52 };
assert.equal(routinePercent(progress.monday), 17, "live work contributes only its real partial progress");

progress.monday[0] = { status: "complete", progress: 100 };
assert.equal(routinePercent(progress.monday), 33, "one of three completed tasks is 33%");

progress.monday[1] = { status: "complete", progress: 100 };
assert.equal(routinePercent(progress.monday), 67, "two of three completed tasks is 67%");

progress.monday[2] = { status: "complete", progress: 100 };
assert.equal(routinePercent(progress.monday), 100, "three completed tasks is 100%");

const restored = restoreRoutineProgress(JSON.stringify({
  monday: [
    { status: "complete", progress: 100 },
    { status: "running", progress: 72 },
    { status: "failed", progress: 0 },
  ],
}));
assert.deepEqual(restored.monday[0], { status: "complete", progress: 100 });
assert.deepEqual(restored.monday[1], { status: "idle", progress: 0 }, "a refreshed tab must not claim a stale run is active");
assert.deepEqual(restored.monday[2], { status: "failed", progress: 0 });

console.log("ALL PASS - routine progress contract");
