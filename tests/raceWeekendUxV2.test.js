import test from "node:test";
import assert from "node:assert/strict";

import {
  eventTone,
  raceControlPresentation,
  raceDeskSummary,
  strategyTimeline,
  weekendStepRows,
} from "../playtest/race-weekend-ux-model.js";

test("Race Weekend UX v2 marks completed, active and upcoming weekend stages", () => {
  const rows = weekendStepRows("pre_race");
  assert.deepEqual(rows.map((row) => row.state), [
    "complete",
    "complete",
    "complete",
    "active",
    "upcoming",
    "upcoming",
  ]);
  assert.equal(rows.at(-1).label, "Results");
});

test("Race Control presentation maps known control states without inventing extra race state", () => {
  assert.deepEqual(raceControlPresentation(null), {
    tone: "green",
    label: "Green Flag",
    detail: "Race running under normal conditions.",
  });
  assert.equal(raceControlPresentation("SAFETY_CAR").label, "Safety Car");
  assert.equal(raceControlPresentation("VIRTUAL_SAFETY_CAR").label, "Virtual Safety Car");
  assert.equal(raceControlPresentation("RED_FLAG").tone, "red");
});

test("strategy timeline derives stint windows from the existing plan only", () => {
  const plan = {
    stints: [
      { stint: 1, compoundId: "soft", targetLaps: 10 },
      { stint: 2, compoundId: "medium", targetLaps: 15 },
      { stint: 3, compoundId: "hard", targetLaps: 20 },
    ],
  };
  const rows = strategyTimeline(plan, 12);
  assert.deepEqual(rows.map((row) => [row.startLap, row.endLap, row.state]), [
    [1, 10, "complete"],
    [11, 25, "current"],
    [26, 45, "upcoming"],
  ]);
});

test("race desk summary uses current projected race state", () => {
  const summary = raceDeskSummary({
    progress: 0.42,
    weather: "dry",
    activeControl: "SAFETY_CAR",
    trackPositions: { telemetryMode: "lap_boundary_only" },
    order: [
      { driverId: "D1", status: "RUNNING", controlled: true },
      { driverId: "D2", status: "RUNNING", controlled: false },
      { driverId: "D3", status: "DNF", controlled: false },
    ],
  });

  assert.equal(summary.fieldSize, 3);
  assert.equal(summary.running, 2);
  assert.equal(summary.retired, 1);
  assert.equal(summary.controlled.length, 1);
  assert.equal(summary.progressPercent, 42);
  assert.equal(summary.mapPrecision, "lap_boundary_only");
  assert.equal(summary.control.label, "Safety Car");
});

test("event tones keep race-feed categories presentation-only", () => {
  assert.equal(eventTone("race_control"), "control");
  assert.equal(eventTone("retirement"), "retirement");
  assert.equal(eventTone("damage"), "incident");
  assert.equal(eventTone("weather_change"), "weather");
  assert.equal(eventTone("strategy_revision"), "strategy");
  assert.equal(eventTone("something_else"), "neutral");
});
