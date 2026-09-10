import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceLiveRaceSession,
  applyLiveStrategyInstruction,
  getLiveRaceSession,
  recommendLiveStrategyInstruction,
  reviseRaceStrategy,
  simulateTemporalRace,
  startLiveRaceSession,
} from "../src/index.js";

function save(seed = "live-strategy") {
  return {
    meta: { seed, sourceSeason: 1980 },
    clock: { date: "1980-01-01", season: 1980, day: 1 },
    world: {
      calendar: [{
        year: 1980,
        round: 1,
        gp_id: "GP1",
        track_id: "TR1",
        laps: 12,
        weather_timeline: JSON.stringify([
          { lap: 1, condition: "dry" },
          { lap: 5, condition: "wet" },
        ]),
        pit_lane_loss_seconds: 20,
      }],
      tracks: [{ track_id: "TR1", overtaking_difficulty: 50, incident_risk: 0 }],
      drivers: [{ driver_id: "A" }, { driver_id: "B" }],
      driverRatings: [
        { driver_id: "A", racecraft: 82, consistency: 90, wet_skill: 80, crash_likelihood: 0, tire_management: 80 },
        { driver_id: "B", racecraft: 75, consistency: 85, wet_skill: 65, crash_likelihood: 0, tire_management: 70 },
      ],
      staff: [{ staff_id: "S1" }],
      staffRatings: [{ staff_id: "S1", pitstop_management: 85 }],
      employment: {
        drivers: {},
        staff: { S1: { teamId: "TA", status: "employed" } },
        freeAgents: { drivers: [], staff: [] },
        vacancies: [],
      },
      careerState: {
        drivers: {
          A: { attributes: {}, status: "employed" },
          B: { attributes: {}, status: "employed" },
        },
        staff: { S1: { attributes: {}, status: "employed" } },
      },
      tyres: [
        { compound_id: "DRY", compound_name: "Dry", condition: "dry", dry_grip: 82, wet_grip: 25, durability_laps: 20 },
        { compound_id: "WET", compound_name: "Wet", condition: "wet", dry_grip: 30, wet_grip: 86, durability_laps: 20 },
      ],
      eraSafety: { yellow_flags: true, red_flags: true, modern_safety_car: false },
    },
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
      { position: 2, driverId: "B", teamId: "TB", grid: 2, status: "FINISHED", performanceIndex: 76, reliability: 100 },
    ],
    strategies: {
      A: {
        source: "player",
        condition: "dry",
        dataStatus: "tyre_data_available",
        performanceModifier: 0,
        stints: [{ stint: 1, compoundId: "DRY", targetLaps: 12, grip: 82, effectiveDurabilityLaps: 21.6 }],
        pitStops: [],
      },
      B: {
        source: "ai_generated",
        condition: "dry",
        dataStatus: "tyre_data_available",
        performanceModifier: 0,
        stints: [{ stint: 1, compoundId: "DRY", targetLaps: 12, grip: 82, effectiveDurabilityLaps: 21.12 }],
        pitStops: [],
      },
    },
  };
}

test("live controller advances one persistent race in chunks without replaying completed laps", () => {
  const fullSave = save("controller-equivalence");
  const steppedSave = save("controller-equivalence");
  const full = simulateTemporalRace(fullSave, weekend());

  startLiveRaceSession(steppedSave, weekend());
  assert.equal(getLiveRaceSession(steppedSave).currentLap, 0);
  advanceLiveRaceSession(steppedSave, { laps: 4 });
  assert.equal(getLiveRaceSession(steppedSave).currentLap, 4);
  assert.equal(getLiveRaceSession(steppedSave).status, "paused");
  advanceLiveRaceSession(steppedSave, { laps: 3 });
  assert.equal(getLiveRaceSession(steppedSave).currentLap, 7);
  const completed = advanceLiveRaceSession(steppedSave, { toLap: 12 });

  assert.equal(completed.completed, true);
  assert.deepEqual(completed.result.classification, full.classification);
  assert.deepEqual(completed.result.timeline.events, full.timeline.events);
  assert.equal(steppedSave.world.liveRaceState.completed.length, 1);
});

test("weather change can produce a live wet-tyre recommendation at a paused boundary", () => {
  const world = save("recommendation");
  startLiveRaceSession(world, weekend());
  advanceLiveRaceSession(world, { toLap: 4 });

  const instruction = recommendLiveStrategyInstruction(world, "A", "wet");
  assert.ok(instruction);
  assert.equal(instruction.action, "box");
  assert.equal(instruction.compoundId, "WET");
  assert.equal(instruction.pitAfterLap, 5);
});

test("live box instruction preserves completed strategy history and changes only the future", () => {
  const world = save("revision");
  const raceWeekend = weekend();
  raceWeekend.strategies.A.stints = [
    { stint: 1, compoundId: "DRY", targetLaps: 3, grip: 82, effectiveDurabilityLaps: 21.6 },
    { stint: 2, compoundId: "DRY", targetLaps: 9, grip: 82, effectiveDurabilityLaps: 21.6 },
  ];
  raceWeekend.strategies.A.pitStops = [{ stop: 1, afterStint: 1, executionScore: 80, timeLossSeconds: 20 }];

  const revised = reviseRaceStrategy(world, raceWeekend, "A", raceWeekend.strategies.A, {
    action: "box",
    compoundId: "WET",
    pitAfterLap: 6,
    reason: "rain_arriving",
  }, { currentLap: 4, source: "player_live" });

  assert.equal(revised.stints[0].targetLaps, 3);
  assert.equal(revised.stints[0].compoundId, "DRY");
  assert.equal(revised.stints[1].targetLaps, 3);
  assert.equal(revised.stints[1].compoundId, "DRY");
  assert.equal(revised.stints[2].targetLaps, 6);
  assert.equal(revised.stints[2].compoundId, "WET");
  assert.equal(revised.liveRevision.afterLap, 4);
  assert.equal(revised.liveRevision.pitAfterLap, 6);
});

test("live strategy revision survives whole Save World JSON persistence and executes the new stop", () => {
  let world = save("persisted-live-change");
  startLiveRaceSession(world, weekend());
  advanceLiveRaceSession(world, { toLap: 4 });

  const applied = applyLiveStrategyInstruction(world, "A", {
    action: "box",
    compoundId: "WET",
    pitAfterLap: 5,
    reason: "rain_response",
  });
  assert.equal(applied.revision.lapBoundary, 4);
  assert.equal(applied.revision.compoundId, "WET");

  world = JSON.parse(JSON.stringify(world));
  const finished = advanceLiveRaceSession(world, { toLap: 12 });
  assert.equal(finished.completed, true);
  assert.equal(finished.result.timeline.strategyRevisions.length, 1);
  assert.ok(finished.result.timeline.events.some((row) => row.type === "pit_stop" && row.driverId === "A" && row.lap === 5));
  assert.equal(world.world.liveRaceState.completed[0].strategyRevisions[0].reason, "rain_response");
});
