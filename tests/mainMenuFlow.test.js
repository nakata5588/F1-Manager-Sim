import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  hasLoadableSaves,
  latestCompatibleSaveSlot,
  saveSlotStatus,
  shouldResumeCareer,
  usableSaveSlots,
} from "../playtest/main-menu-model.js";

const slots = [
  { slot: "old", savedAt: "2026-09-16T20:00:00.000Z", managerName: "Old", compatible: true },
  { slot: "new-incompatible", savedAt: "2026-09-17T22:00:00.000Z", compatible: false },
  { slot: "latest-valid", savedAt: "2026-09-17T21:00:00.000Z", managerName: "Latest", compatible: true },
  { slot: "broken", savedAt: "2026-09-17T23:00:00.000Z", invalid: true },
];

test("Continue Game selects the latest compatible valid save, not merely the newest file", () => {
  assert.equal(latestCompatibleSaveSlot(slots)?.slot, "latest-valid");
  assert.deepEqual(usableSaveSlots(slots).map((row) => row.slot), ["latest-valid", "old"]);
  assert.equal(hasLoadableSaves(slots), true);
});

test("clean launch stays at the front door while an explicitly active tab resumes its career", () => {
  const career = { screen: "home", career: { managerName: "Manager" } };
  assert.equal(shouldResumeCareer(null, career), false);
  assert.equal(shouldResumeCareer("1", career), true);
  assert.equal(shouldResumeCareer("1", { screen: "new_career" }), false);
});

test("save status gives useful load-game context without exposing raw persistence internals", () => {
  assert.equal(saveSlotStatus({ compatible: false }), "Incompatible with the loaded Season Database");
  assert.match(saveSlotStatus({ liveRace: { status: "paused", currentLap: 8, totalLaps: 40 } }), /Lap 8\/40/);
  assert.equal(saveSlotStatus({ weekend: { phase: "practice_results" } }), "Practice & Setup");
});

test("playtest front door exposes the required Main Menu actions and real save endpoints", () => {
  const app = readFileSync("playtest/app.js", "utf8");
  const server = readFileSync("scripts/playtest-server.js", "utf8");
  for (const label of ["New Game", "Continue Game", "Load Game", "Settings", "Exit"]) {
    assert.match(app, new RegExp(label.replace(" ", "\\s+"), "i"));
  }
  assert.match(server, /\/api\/saves\/continue/);
  assert.match(server, /validateDeveloperSaveCompatibility/);
  assert.match(app, /\/api\/setup/);
  assert.match(app, /screen:\s*"new_career"/);
});

test("Exit is runtime-aware instead of pretending a browser tab can always be closed", () => {
  const app = readFileSync("playtest/app.js", "utf8");
  assert.match(app, /f1ManagerRuntime\?\.exit/);
  assert.match(app, /browser runtime cannot reliably close a tab/i);
});
