import test from "node:test";
import assert from "node:assert/strict";
import {
  createEmploymentMarketSystem,
  createRaceEntrySystem,
  createRaceWeekendSystem,
  dispatchSimulationEvents,
  SIM_EVENT,
} from "../src/index.js";

function saveWorld() {
  return {
    meta: { seed: "race-entry-separation" },
    clock: { date: "1980-01-13", season: 1980, day: 13 },
    simulation: { nextEventSequence: 0, systemState: {} },
    history: { races: [], transfers: [], retirements: [], events: [] },
    world: {
      drivers: [
        { driver_id: "RACE", driver_name: "Race Driver" },
        { driver_id: "TEST", driver_name: "Test Driver" },
      ],
      driverRatings: [
        { driver_id: "RACE", pace: 80, qualifying: 80, racecraft: 80, consistency: 80, crash_likelihood: 0 },
        { driver_id: "TEST", pace: 65, qualifying: 64, racecraft: 64, consistency: 65, crash_likelihood: 0 },
      ],
      contracts: [
        { year: 1980, driver_id: "RACE", team_id: "TEAM", role: "main_driver", contract_start: 1979, contract_until: 1981 },
        { year: 1980, driver_id: "TEST", team_id: "TEAM", role: "test_driver", contract_start: 1980, contract_until: 1980 },
      ],
      staff: [],
      staffContracts: [],
      staffRatings: [],
      careerState: {
        drivers: {
          RACE: { status: "active", attributes: {} },
          TEST: { status: "active", attributes: {} },
        },
        staff: {},
      },
      startingRaceEntries: [
        { driver_id: "RACE", team_id: "TEAM", car_number: 17, source_role: "round_1_starter" },
        { driver_id: "TEST", team_id: "TEAM", car_number: 18, source_role: "round_1_starter" },
      ],
      calendar: [{ year: 1980, round: 1, gp_id: "ARG", gp_name: "Argentine Grand Prix", track_id: "TR", laps: 10 }],
      tracks: [{ track_id: "TR", overtaking_difficulty: 50 }],
      carStats: [{ year: 1980, team_id: "TEAM", chassis_spec: 70, aero_spec: 70, gearbox_spec: 70, suspension_spec: 70, brakes_spec: 70, cooling_spec: 70 }],
      teamEngines: [],
      engines: [],
      qualifyingRules: { session_count: 2 },
      rules: { points_system: "9-6-4-3-2-1" },
    },
  };
}

const systems = [
  createEmploymentMarketSystem(),
  createRaceEntrySystem(),
  createRaceWeekendSystem(),
];

test("explicit race entry can start a contractually test-role driver without changing employment role", () => {
  const save = saveWorld();
  dispatchSimulationEvents(save, [{ type: SIM_EVENT.CAREER_STARTED, date: "1980-01-01", payload: { season: 1980 } }], systems);

  assert.equal(save.world.employment.drivers.TEST.role, "test_driver");
  assert.equal(save.world.raceEntryState.current.length, 2);
  assert.ok(save.world.raceEntryState.current.some((row) => row.driverId === "TEST" && row.carNumber === 18));

  const events = dispatchSimulationEvents(save, [{
    type: SIM_EVENT.RACE_DAY,
    date: "1980-01-13",
    payload: { gp_id: "ARG", track_id: "TR", round: 1 },
  }], systems);

  const started = events.find((event) => event.type === "race.weekend_started");
  assert.equal(started.payload.entrants, 2);
  assert.equal(save.history.races[0].entrants.length, 2);
  assert.ok(save.history.races[0].entrants.some((row) => row.driverId === "TEST"));
  assert.equal(save.world.employment.drivers.TEST.role, "test_driver");
  assert.equal(save.simulation.systemState["race.entries"].projection, null);
});

test("without explicit Season Pack entries, race-entry state falls back to race-role employment", () => {
  const save = saveWorld();
  save.world.startingRaceEntries = [];
  dispatchSimulationEvents(save, [{ type: SIM_EVENT.CAREER_STARTED, date: "1980-01-01", payload: { season: 1980 } }], systems);

  assert.equal(save.world.raceEntryState.source, "employment_fallback");
  assert.deepEqual(save.world.raceEntryState.current.map((row) => row.driverId), ["RACE"]);
});