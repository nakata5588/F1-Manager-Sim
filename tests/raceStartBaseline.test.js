import test from "node:test";
import assert from "node:assert/strict";
import { createRaceStartBaseline } from "../src/sim/raceStartBaseline.js";

function saveWorld() {
  return {
    world: {
      drivers: [
        { driver_id: "D1" },
        { driver_id: "D2" },
      ],
      driverRatings: [
        { driver_id: "D1", pace: 82, racecraft: 81, consistency: 80, tire_management: 79, race_intelligence: 80, start_launch: 80 },
        { driver_id: "D2", pace: 78, racecraft: 79, consistency: 82, tire_management: 83, race_intelligence: 80, start_launch: 78 },
      ],
      careerState: { drivers: { D1: { attributes: {} }, D2: { attributes: {} } } },
      carState: {
        T1: { components: { chassis_spec: 82, aero_spec: 82, gearbox_spec: 84, suspension_spec: 81, brakes_spec: 83, cooling_spec: 85, electronics_spec: 85 } },
        T2: { components: { chassis_spec: 78, aero_spec: 78, gearbox_spec: 80, suspension_spec: 79, brakes_spec: 80, cooling_spec: 84, electronics_spec: 84 } },
      },
      carStats: [],
      teamEngines: [
        { team_id: "T1", engine_id: "E1" },
        { team_id: "T2", engine_id: "E2" },
      ],
      engines: [
        { engine_id: "E1", power: 84, reliability: 90 },
        { engine_id: "E2", power: 80, reliability: 88 },
      ],
    },
  };
}

function weekend() {
  return {
    key: "1980:GP1",
    grid: [
      { grid: 1, driverId: "D1", teamId: "T1", qualifyingScore: 84 },
      { grid: 2, driverId: "D2", teamId: "T2", qualifyingScore: 80 },
    ],
    practice: {
      results: [
        { driverId: "D1", setupQuality: 90 },
        { driverId: "D2", setupQuality: 80 },
      ],
    },
  };
}

test("race start baseline is deterministic starting state, not a race result", () => {
  const world = saveWorld();
  const a = createRaceStartBaseline(world, weekend());
  const b = createRaceStartBaseline(world, weekend());
  assert.deepEqual(a, b);
  assert.deepEqual(a.map((row) => row.startOrder), [1, 2]);
  assert.ok(a.every((row) => row.status === "STARTING"));
  assert.ok(a.every((row) => row.completedLaps === 0));
  assert.ok(a.every((row) => row.source === "race_start_baseline"));
  assert.ok(a.every((row) => !Object.hasOwn(row, "position")));
  assert.ok(a.every((row) => !Object.hasOwn(row, "reason")));
  assert.ok(a.every((row) => row.performanceIndex >= 0 && row.performanceIndex <= 100));
});
