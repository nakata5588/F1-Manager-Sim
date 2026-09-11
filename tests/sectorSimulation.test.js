import assert from "node:assert/strict";
import test from "node:test";

import {
  decideLiveRaceControl,
  resolveSectorModel,
  simulateTemporalRace,
} from "../src/index.js";

function save(seed = "sector-test") {
  return {
    meta: { seed },
    world: {
      eraSafety: {
        yellow_flags: true,
        red_flags: true,
        modern_safety_car: false,
        virtual_safety_car: false,
        source: "test-era",
      },
      calendar: [{ year: 1980, round: 1, gp_id: "GP1", track_id: "TR1", laps: 9 }],
      tracks: [{
        track_id: "TR1",
        overtaking_difficulty: 45,
        incident_risk: 40,
        power_sensitivity: 70,
        aero_sensitivity: 55,
        brake_stress: 65,
        sector_model: JSON.stringify([
          { sector: "A", name: "Fast", weight: 0.25, overtaking_difficulty: 30, incident_risk: 20, power_sensitivity: 90 },
          { sector: "B", name: "Technical", weight: 0.45, overtaking_difficulty: 80, incident_risk: 55, aero_sensitivity: 85 },
          { sector: "C", name: "Braking", weight: 0.30, overtaking_difficulty: 25, incident_risk: 65, brake_stress: 90 },
        ]),
      }],
      drivers: [{ driver_id: "A" }, { driver_id: "B" }],
      driverRatings: [
        { driver_id: "A", racecraft: 88, consistency: 90, wet_skill: 75, crash_likelihood: 0 },
        { driver_id: "B", racecraft: 70, consistency: 75, wet_skill: 50, crash_likelihood: 0 },
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
      { position: 2, driverId: "B", teamId: "TB", grid: 2, status: "FINISHED", performanceIndex: 72, reliability: 100 },
    ],
    strategies: {},
  };
}

test("explicit sector data is normalized and preferred over derived sectors", () => {
  const model = resolveSectorModel(save().world.tracks[0]);
  assert.equal(model.source, "explicit_sector_data");
  assert.equal(model.dataStatus, "explicit");
  assert.deepEqual(model.sectors.map((row) => row.id), ["A", "B", "C"]);
  assert.ok(Math.abs(model.sectors.reduce((sum, row) => sum + row.weight, 0) - 1) < 1e-9);
  assert.ok(model.sectors[1].overtakingDifficulty > model.sectors[0].overtakingDifficulty);
});

test("tracks without sector data receive a labelled simulation approximation", () => {
  const model = resolveSectorModel({
    overtaking_difficulty: 50,
    incident_risk: 40,
    power_sensitivity: 70,
    aero_sensitivity: 60,
    brake_stress: 65,
  });
  assert.equal(model.source, "derived_track_traits");
  assert.equal(model.dataStatus, "simulation_approximation");
  assert.equal(model.sectors.length, 3);
});

test("local yellow is scoped to the sector where the incident occurred", () => {
  const world = save("yellow");
  const decision = decideLiveRaceControl(world, { key: "1980:GP1", trackId: "TR1" }, {
    type: "retirement",
    reason: "incident",
    lap: 4,
    sectorId: "B",
    driverId: "A",
    severity: 70,
  });
  assert.equal(decision.type, "local_yellow");
  assert.equal(decision.scope, "sector");
  assert.equal(decision.sectorId, "B");
  assert.equal(decision.overtakingAllowed, false);
});

test("sector race remains identical after JSON pause/resume", () => {
  const full = simulateTemporalRace(save("resume-sector"), weekend());
  const paused = simulateTemporalRace(save("resume-sector"), weekend(), { stopAfterLap: 4 });
  assert.equal(paused.timeline.completed, false);
  assert.equal(paused.resumeState.version, 2);
  assert.equal(paused.resumeState.model, "sector_lap_v1_resumable");

  const serialized = JSON.parse(JSON.stringify(paused.resumeState));
  const resumed = simulateTemporalRace(save("resume-sector"), weekend(), { resumeState: serialized });
  assert.deepEqual(resumed.classification, full.classification);
  assert.deepEqual(resumed.timeline.events, full.timeline.events);
  assert.deepEqual(resumed.timeline.leaderByLap, full.timeline.leaderByLap);
  assert.equal(resumed.timeline.model, "sector_lap_v1_resumable");
  assert.equal(resumed.timeline.sectorModel.source, "explicit_sector_data");
  assert.equal(resumed.timeline.sectorSummary.length, 3);
});
