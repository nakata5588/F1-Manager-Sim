import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateAiLiveStrategyDecision,
  isAiManagedStrategy,
  simulateTemporalRace,
} from "../src/index.js";

function save(seed = "ai-live") {
  return {
    meta: { seed },
    world: {
      eraSafety: {
        yellow_flags: true,
        red_flags: true,
        modern_safety_car: false,
        virtual_safety_car: false,
      },
      calendar: [{
        year: 1980,
        round: 1,
        gp_id: "GP1",
        track_id: "TR1",
        laps: 8,
        weather_timeline: JSON.stringify([
          { lap: 1, condition: "dry" },
          { lap: 4, condition: "wet" },
        ]),
      }],
      tracks: [{
        track_id: "TR1",
        overtaking_difficulty: 50,
        incident_risk: 20,
        brake_stress: 50,
      }],
      tyres: [
        { compound_id: "DRY", name: "Dry", condition: "dry", dry_grip: 72, wet_grip: 22, durability_laps: 10 },
        { compound_id: "WET", name: "Wet", condition: "wet", dry_grip: 30, wet_grip: 82, durability_laps: 10 },
      ],
      drivers: [{ driver_id: "A" }, { driver_id: "B" }],
      driverRatings: [
        { driver_id: "A", racecraft: 85, consistency: 90, wet_skill: 80, tire_management: 75, crash_likelihood: 0 },
        { driver_id: "B", racecraft: 80, consistency: 88, wet_skill: 70, tire_management: 70, crash_likelihood: 0 },
      ],
      careerState: {
        drivers: {
          A: { attributes: {}, status: "employed" },
          B: { attributes: {}, status: "employed" },
        },
        staff: {},
      },
      employment: { staff: {} },
    },
  };
}

function dryPlan(source) {
  return {
    source,
    condition: "dry",
    dataStatus: "tyre_data_available",
    performanceModifier: 0,
    stints: [
      { stint: 1, compoundId: "DRY", condition: "dry", targetLaps: 8, grip: 72, effectiveDurabilityLaps: 10 },
    ],
    pitStops: [],
    plannedStops: 0,
  };
}

function weekend() {
  return {
    key: "1980:GP1",
    season: 1980,
    gpId: "GP1",
    round: 1,
    trackId: "TR1",
    grid: [
      { grid: 1, driverId: "A", teamId: "TA" },
      { grid: 2, driverId: "B", teamId: "TB" },
    ],
    classification: [
      { position: 1, driverId: "A", teamId: "TA", grid: 1, status: "FINISHED", performanceIndex: 82, reliability: 100 },
      { position: 2, driverId: "B", teamId: "TB", grid: 2, status: "FINISHED", performanceIndex: 79, reliability: 100 },
    ],
    strategies: {
      A: dryPlan("ai_generated"),
      B: dryPlan("player"),
    },
  };
}

test("only AI/delegated strategies are eligible for autonomous live revision", () => {
  assert.equal(isAiManagedStrategy({ source: "ai_generated" }), true);
  assert.equal(isAiManagedStrategy({ source: "delegated" }), true);
  assert.equal(isAiManagedStrategy({ source: "ai_live" }), true);
  assert.equal(isAiManagedStrategy({ source: "player" }), false);
  assert.equal(isAiManagedStrategy({ source: "player_live" }), false);
});

test("AI reacts to a wet transition while an explicit player plan remains untouched", () => {
  const result = simulateTemporalRace(save("weather-ai"), weekend());
  const revisions = result.timeline.aiStrategyRevisions;
  const aiRevision = revisions.find((row) => row.driverId === "A" && row.trigger === "weather_mismatch");
  assert.ok(aiRevision);
  assert.equal(aiRevision.lap, 4);
  assert.equal(aiRevision.compoundId, "WET");
  assert.equal(revisions.some((row) => row.driverId === "B"), false);
});

test("AI can use worn tyres plus a Safety Car as a pit window without changing player plans", () => {
  const world = save("window");
  const raceWeekend = weekend();
  const decision = evaluateAiLiveStrategyDecision(world, raceWeekend, "A", {
    currentLap: 4,
    totalLaps: 8,
    condition: "dry",
    tyreWear: 0.76,
    activeControl: { type: "safety_car", startLap: 4, endLap: 6 },
  });
  assert.ok(decision);
  assert.equal(decision.trigger, "race_control_window");
  assert.equal(decision.compoundId, "DRY");

  const playerDecision = evaluateAiLiveStrategyDecision(world, raceWeekend, "B", {
    currentLap: 4,
    totalLaps: 8,
    condition: "wet",
    tyreWear: 1.1,
    activeControl: { type: "safety_car", startLap: 4, endLap: 6 },
  });
  assert.equal(playerDecision, null);
});

test("AI strategy revisions persist through a fresh-weekend JSON resume without duplicate decisions", () => {
  const fullWeekend = weekend();
  const full = simulateTemporalRace(save("ai-resume"), fullWeekend);

  const firstWeekend = weekend();
  const paused = simulateTemporalRace(save("ai-resume"), firstWeekend, { stopAfterLap: 4 });
  assert.equal(paused.timeline.completed, false);
  assert.ok(paused.timeline.aiStrategyRevisions.some((row) => row.driverId === "A" && row.lap === 4));
  assert.equal(paused.resumeState.version, 4);
  assert.equal(paused.resumeState.aiStrategies.A.source, "ai_live");

  const serialized = JSON.parse(JSON.stringify(paused.resumeState));
  const resumed = simulateTemporalRace(save("ai-resume"), weekend(), { resumeState: serialized });
  assert.deepEqual(resumed.classification, full.classification);
  assert.deepEqual(resumed.timeline.events, full.timeline.events);
  assert.equal(resumed.timeline.aiStrategyRevisions.filter((row) => row.driverId === "A").length, 1);
});
