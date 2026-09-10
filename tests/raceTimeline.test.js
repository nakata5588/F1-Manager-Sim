import test from "node:test";
import assert from "node:assert/strict";
import { simulateTemporalRace } from "../src/index.js";

function baseSave(seed = "timeline-seed") {
  return {
    meta: { seed },
    world: {
      calendar: [{
        year: 1980,
        round: 1,
        gp_id: "GP1",
        track_id: "TR1",
        laps: 12,
      }],
      tracks: [{ track_id: "TR1", overtaking_difficulty: 45 }],
      drivers: [
        { driver_id: "A" },
        { driver_id: "B" },
      ],
      driverRatings: [
        { driver_id: "A", racecraft: 88, consistency: 90, wet_skill: 90, crash_likelihood: 0 },
        { driver_id: "B", racecraft: 68, consistency: 72, wet_skill: 45, crash_likelihood: 0 },
      ],
      careerState: {
        drivers: {
          A: { attributes: {}, status: "employed" },
          B: { attributes: {}, status: "employed" },
        },
      },
    },
  };
}

function baseWeekend() {
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
      { position: 2, driverId: "B", teamId: "TB", grid: 2, status: "FINISHED", performanceIndex: 70, reliability: 100 },
    ],
    strategies: {},
  };
}

test("lap timeline is deterministic and archives compact checkpoints instead of every driver on every lap", () => {
  const first = simulateTemporalRace(baseSave("same"), baseWeekend());
  const second = simulateTemporalRace(baseSave("same"), baseWeekend());

  assert.deepEqual(first, second);
  assert.equal(first.timeline.lapsSimulated, 12);
  assert.equal(first.timeline.leaderByLap.length, 12);
  assert.ok(first.timeline.snapshots.length < 12);
  assert.equal(first.timeline.fuel.dataStatus, "no_explicit_fuel_data");
  assert.equal(first.classification[0].driverId, "A");
  assert.equal(first.classification[0].status, "FINISHED");
});

test("explicit weather timeline creates an in-race transition and wet skill affects temporal pace", () => {
  const strongWet = baseSave("weather");
  strongWet.world.calendar[0].weather_timeline = JSON.stringify([
    { lap: 1, condition: "dry" },
    { lap: 5, condition: "wet" },
  ]);
  const weakWet = structuredClone(strongWet);
  weakWet.world.driverRatings.find((row) => row.driver_id === "A").wet_skill = 10;

  const good = simulateTemporalRace(strongWet, baseWeekend());
  const bad = simulateTemporalRace(weakWet, baseWeekend());

  assert.equal(good.timeline.weather.source, "explicit_timeline");
  assert.ok(good.timeline.events.some((row) => row.type === "weather_change" && row.lap === 5));
  assert.ok(good.classification.find((row) => row.driverId === "A").raceIndex < bad.classification.find((row) => row.driverId === "A").raceIndex);
});

test("explicit fuel data is consumed lap by lap and can produce fuel retirement", () => {
  const save = baseSave("fuel");
  save.world.calendar[0].laps = 10;
  save.world.calendar[0].starting_fuel_kg = 5;
  save.world.calendar[0].fuel_burn_per_lap_kg = 1;
  const weekend = baseWeekend();
  weekend.grid = [weekend.grid[0]];
  weekend.classification = [weekend.classification[0]];

  const result = simulateTemporalRace(save, weekend);
  const driver = result.classification[0];
  assert.equal(result.timeline.fuel.dataStatus, "explicit_fuel_data");
  assert.equal(driver.status, "DNF");
  assert.equal(driver.reason, "fuel");
  assert.equal(driver.completedLaps, 5);
  assert.ok(result.timeline.events.some((row) => row.type === "retirement" && row.reason === "fuel"));
});

test("locked multi-stint strategy creates its pit stop at the planned lap and tracks tyre wear", () => {
  const save = baseSave("pit");
  save.world.calendar[0].laps = 10;
  const weekend = baseWeekend();
  weekend.strategies = {
    A: {
      source: "player",
      condition: "dry",
      dataStatus: "tyre_data_available",
      performanceModifier: 0,
      stints: [
        { stint: 1, compoundId: "SOFT", targetLaps: 5, grip: 82, effectiveDurabilityLaps: 6 },
        { stint: 2, compoundId: "HARD", targetLaps: 5, grip: 68, effectiveDurabilityLaps: 12 },
      ],
      pitStops: [{ stop: 1, afterStint: 1, executionScore: 80, timeLossSeconds: 20 }],
    },
  };

  const result = simulateTemporalRace(save, weekend);
  const stop = result.timeline.events.find((row) => row.type === "pit_stop" && row.driverId === "A");
  assert.equal(stop.lap, 5);
  assert.equal(stop.timeLossSeconds, 20);
  assert.equal(result.timeline.tyreSummary.A.pitStopsCompleted, 1);
  assert.ok(result.timeline.tyreSummary.A.maxWearRatio > 0.8);
});
