import assert from "node:assert/strict";
import test from "node:test";

import {
  calibratedCarComponents,
  calibrateTyreStrategies,
  createPerformanceCalibrationSystem,
} from "../src/sim/systems/performanceCalibration.js";

function makeSave() {
  return {
    meta: { seed: "performance-calibration-test" },
    clock: { date: "1980-01-13", season: 1980 },
    simulation: { nextEventSequence: 0, systemState: {} },
    world: {
      teams: [{ team_id: "T1", team_name: "Test Team" }],
      carStats: [{
        team_id: "T1",
        chassis_spec: 80,
        aero_spec: 80,
        gearbox_spec: 80,
        suspension_spec: 80,
        brakes_spec: 80,
        cooling_spec: 80,
      }],
      carPerformanceModels: [{
        team_id: "T1",
        primary_chassis_package: "88",
        constructor_1980_rank_reference: 1,
        constructor_1980_points_reference: 120,
        qualifying_pace: 82,
        race_pace: 90,
        aero_efficiency: 91,
        mechanical_grip: 88,
        straight_line_speed: 84,
        low_speed_performance: 86,
        high_speed_performance: 92,
        tyre_wear_control: 87,
        cooling_margin: 83,
        reliability: 89,
        data_status: "historical_identity_plus_gameplay_estimate",
      }],
      carState: {
        T1: {
          teamId: "T1",
          components: {
            chassis_spec: 82,
            aero_spec: 85,
            gearbox_spec: 81,
            suspension_spec: 83,
            brakes_spec: 80,
            cooling_spec: 81,
          },
        },
      },
      tracks: [{
        track_id: "TR1",
        power_sensitivity: 80,
        aero_sensitivity: 90,
        brake_stress: 70,
        tyre_wear: 85,
      }],
      teamTyreSuppliers: { T1: "goodyear" },
      tyreModels: [{
        tyre_supplier: "Goodyear",
        supplier_id: "goodyear",
        dry_peak_grip: 84,
        warmup: 82,
        wear_resistance: 82,
        wet_performance: 78,
        operating_window_width: 82,
        data_status: "identity_confirmed_gameplay_estimate",
      }],
      raceWeekendState: {
        active: {
          "1980:GP1": {
            key: "1980:GP1",
            date: "1980-01-13",
            trackId: "TR1",
            entrants: [{ driverId: "D1", teamId: "T1" }],
            strategies: {
              D1: {
                source: "ai_generated",
                condition: "dry",
                dataStatus: "tyre_data_available",
                performanceModifier: 1,
                stints: [{ stint: 1, compoundId: "goodyear", targetLaps: 50, grip: 82 }],
              },
            },
          },
        },
      },
    },
    history: { development: [], races: [] },
  };
}

function event(type, payload = {}) {
  return { id: `test:${type}`, sequence: 1, type, date: "1980-01-13", payload };
}

test("car calibration is session-specific and preserves dynamic R&D deltas", () => {
  const save = makeSave();
  const system = createPerformanceCalibrationSystem();
  const original = structuredClone(save.world.carState.T1.components);

  system.handle({ saveWorld: save, event: event("sim.career_started", { season: 1980 }) });
  system.handle({ saveWorld: save, event: event("race.practice_completed", { weekend_key: "1980:GP1" }) });
  const qualifying = structuredClone(save.world.carState.T1.components);

  system.handle({ saveWorld: save, event: event("race.grid_set", { weekend_key: "1980:GP1" }) });
  const race = structuredClone(save.world.carState.T1.components);

  assert.notDeepEqual(qualifying, original);
  assert.notDeepEqual(race, qualifying);
  assert.ok(race.chassis_spec > qualifying.chassis_spec, "higher race-pace estimate should affect the race baseline");

  const noDevelopment = makeSave();
  noDevelopment.world.carState.T1.components = {
    chassis_spec: 80,
    aero_spec: 80,
    gearbox_spec: 80,
    suspension_spec: 80,
    brakes_spec: 80,
    cooling_spec: 80,
  };
  const noDevelopmentRace = calibratedCarComponents(
    noDevelopment,
    "T1",
    noDevelopment.world.tracks[0],
    "race",
    noDevelopment.world.carState.T1.components,
  );
  assert.equal(round(race.aero_spec - noDevelopmentRace.aero_spec), 5, "the +5 aero R&D delta must survive calibration");
  assert.equal(round(race.chassis_spec - noDevelopmentRace.chassis_spec), 2, "the +2 chassis R&D delta must survive calibration");

  system.handle({ saveWorld: save, event: event("race.completed", { key: "1980:GP1" }) });
  assert.deepEqual(save.world.carState.T1.components, original, "post-race state must return to the developed mutable car");
  assert.equal(save.world.carState.T1.performanceCalibration, undefined);
});

test("historical constructor rank, points and pseudo chassis-package fields never enter the race formula", () => {
  const first = makeSave();
  const second = makeSave();
  second.world.carPerformanceModels[0].constructor_1980_rank_reference = 15;
  second.world.carPerformanceModels[0].constructor_1980_points_reference = 0;
  second.world.carPerformanceModels[0].primary_chassis_package = "999999";

  const a = calibratedCarComponents(first, "T1", first.world.tracks[0], "race", first.world.carState.T1.components);
  const b = calibratedCarComponents(second, "T1", second.world.tracks[0], "race", second.world.carState.T1.components);
  assert.deepEqual(a, b);
});

test("supplier warm-up, wear resistance and wet rating alter stint grip without inventing tyre life", () => {
  const baseline = makeSave();
  const weekend = baseline.world.raceWeekendState.active["1980:GP1"];
  assert.equal(calibrateTyreStrategies(baseline, weekend), 1);
  const calibrated = weekend.strategies.D1;

  assert.ok(calibrated.stints[0].grip > 82 && calibrated.stints[0].grip < 84);
  assert.equal(calibrated.stints[0].effectiveDurabilityLaps, undefined);
  assert.equal(calibrated.tyreCalibration.durabilityPolicy, "rating_affects_pace_only_no_invented_lap_life");
  assert.equal(calibrated.stints[0].supplierModel.warmup, 82);
  assert.equal(calibrated.stints[0].supplierModel.wearResistance, 82);

  const betterWear = makeSave();
  betterWear.world.tyreModels[0].wear_resistance = 100;
  const betterWearWeekend = betterWear.world.raceWeekendState.active["1980:GP1"];
  calibrateTyreStrategies(betterWear, betterWearWeekend);
  assert.ok(betterWearWeekend.strategies.D1.stints[0].grip > calibrated.stints[0].grip);

  const wet = makeSave();
  wet.world.raceWeekendState.active["1980:GP1"].strategies.D1.condition = "wet";
  const wetWeekend = wet.world.raceWeekendState.active["1980:GP1"];
  calibrateTyreStrategies(wet, wetWeekend);
  assert.ok(wetWeekend.strategies.D1.stints[0].grip < calibrated.stints[0].grip, "Goodyear's v0.8 wet estimate is below its dry peak estimate");
});

function round(value) {
  return Number(Number(value).toFixed(4));
}
