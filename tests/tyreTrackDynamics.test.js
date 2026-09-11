import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceTyreThermalState,
  resolveTrackEvolutionModel,
  simulateTemporalRace,
  trackEvolutionAt,
} from "../src/index.js";

function thermalSave(seed = "phase19") {
  return {
    meta: { seed },
    world: {
      calendar: [{ year: 1980, round: 1, gp_id: "GP1", track_id: "TR1", laps: 6 }],
      tracks: [{
        track_id: "TR1",
        overtaking_difficulty: 50,
        incident_risk: 0,
        brake_stress: 55,
        aero_sensitivity: 60,
        track_evolution_rate: 80,
      }],
      drivers: [{ driver_id: "A" }],
      driverRatings: [{ driver_id: "A", racecraft: 80, consistency: 90, wet_skill: 70, crash_likelihood: 0 }],
      careerState: { drivers: { A: { attributes: {}, status: "employed" } }, staff: {} },
      employment: { staff: {} },
      eraSafety: { yellow_flags: true, red_flags: true, modern_safety_car: false, virtual_safety_car: false },
    },
  };
}

function stint(warmup = 70, operatingWindowWidth = 60) {
  return {
    stint: 1,
    compoundId: "DRY",
    condition: "dry",
    startLap: 1,
    targetLaps: 6,
    grip: 75,
    effectiveDurabilityLaps: 20,
    supplierModel: {
      supplier: "TEST",
      warmup,
      operatingWindowWidth,
      wearResistance: 60,
      dataStatus: "test_model",
    },
  };
}

function sector() {
  return {
    id: "S1",
    weight: 1 / 3,
    brakeStress: 0.6,
    technicality: 0.55,
    aeroSensitivity: 0.5,
  };
}

function weekend() {
  return {
    key: "1980:GP1",
    season: 1980,
    gpId: "GP1",
    round: 1,
    trackId: "TR1",
    grid: [{ grid: 1, driverId: "A", teamId: "TA" }],
    classification: [{
      position: 1,
      driverId: "A",
      teamId: "TA",
      grid: 1,
      status: "FINISHED",
      performanceIndex: 80,
      reliability: 100,
    }],
    strategies: {
      A: {
        source: "player",
        condition: "dry",
        dataStatus: "tyre_data_available",
        performanceModifier: 0,
        stints: [stint()],
        pitStops: [],
      },
    },
  };
}

test("better warm-up starts closer to the operating window without inventing Celsius", () => {
  const world = thermalSave("warmup");
  const high = advanceTyreThermalState(world, null, {
    teamId: "TA",
    stint: stint(90, 60),
    condition: "dry",
    sector: sector(),
    trackGripIndex: 50,
  });
  const low = advanceTyreThermalState(world, null, {
    teamId: "TA",
    stint: stint(20, 60),
    condition: "dry",
    sector: sector(),
    trackGripIndex: 50,
  });

  assert.ok(high.temperatureIndex > low.temperatureIndex);
  assert.equal(typeof high.temperatureIndex, "number");
  assert.equal(high.traits.source, "calibrated_stint_model");
});

test("Safety Car style neutralisation cools an already warm tyre state", () => {
  const world = thermalSave("cooling");
  const previous = {
    stintKey: "1:DRY:1",
    compoundId: "DRY",
    temperatureIndex: 84,
    status: "optimal",
    lapsOnTyre: 3,
  };
  const normal = advanceTyreThermalState(world, previous, {
    teamId: "TA",
    stint: stint(70, 60),
    condition: "dry",
    sector: sector(),
    neutralised: false,
    trackGripIndex: 55,
  });
  const neutralised = advanceTyreThermalState(world, previous, {
    teamId: "TA",
    stint: stint(70, 60),
    condition: "dry",
    sector: sector(),
    neutralised: true,
    trackGripIndex: 55,
  });

  assert.ok(neutralised.temperatureIndex < normal.temperatureIndex);
});

test("explicit track evolution improves dry grip while rain starts a new low-grip segment", () => {
  const track = { track_evolution_rate: 80 };
  const weather = [
    { lap: 1, condition: "dry" },
    { lap: 6, condition: "wet" },
  ];
  const model = resolveTrackEvolutionModel(track);
  const dryStart = trackEvolutionAt(track, weather, 1, 10, "dry");
  const dryLate = trackEvolutionAt(track, weather, 5, 10, "dry");
  const wetStart = trackEvolutionAt(track, weather, 6, 10, "wet");

  assert.equal(model.dataStatus, "explicit");
  assert.ok(dryLate.gripIndex > dryStart.gripIndex);
  assert.ok(dryLate.paceModifier < dryStart.paceModifier);
  assert.equal(wetStart.progress, 0);
  assert.ok(wetStart.gripIndex < dryLate.gripIndex);
});

test("tyre thermal state survives JSON pause/resume and produces identical race history", () => {
  const full = simulateTemporalRace(thermalSave("thermal-resume"), weekend());
  const paused = simulateTemporalRace(thermalSave("thermal-resume"), weekend(), { stopAfterLap: 2 });

  assert.equal(paused.timeline.completed, false);
  assert.ok(paused.resumeState.states.A.tyreThermal);
  assert.ok(paused.resumeState.states.A.tyreThermal.lapsOnTyre >= 1);
  assert.equal(paused.timeline.trackEvolution.model.dataStatus, "explicit");
  assert.ok(paused.timeline.trackEvolution.checkpoints.length >= 2);

  const serialized = JSON.parse(JSON.stringify(paused.resumeState));
  const resumed = simulateTemporalRace(thermalSave("thermal-resume"), weekend(), { resumeState: serialized });

  assert.deepEqual(resumed.classification, full.classification);
  assert.deepEqual(resumed.timeline.events, full.timeline.events);
  assert.deepEqual(resumed.timeline.tyreThermalSummary, full.timeline.tyreThermalSummary);
  assert.deepEqual(resumed.timeline.trackEvolution, full.timeline.trackEvolution);
});
