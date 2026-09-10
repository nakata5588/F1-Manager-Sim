import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTRACT_EVENT,
  createEmploymentMarketSystem,
  createRaceEntrySystem,
  createRaceWeekendSystem,
  dispatchSimulationEvents,
  EMPLOYMENT_EVENT,
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

const entrySystems = [
  createEmploymentMarketSystem(),
  createRaceEntrySystem(),
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

test("historical round-entry reference never scripts race participation after career start", () => {
  const save = saveWorld();
  save.world.seasonPack = {
    roundEntryReference: [
      { round: 2, driver_id: "HISTORICAL_SUB", team_id: "TEAM", load_mode: "historical_reference_only" },
    ],
  };
  dispatchSimulationEvents(save, [{ type: SIM_EVENT.CAREER_STARTED, date: "1980-01-01", payload: { season: 1980 } }], entrySystems);

  dispatchSimulationEvents(save, [{
    type: SIM_EVENT.RACE_DAY,
    date: "1980-01-27",
    payload: { gp_id: "BRA", track_id: "TR", round: 2 },
  }], entrySystems);

  assert.deepEqual(save.world.raceEntryState.current.map((row) => row.driverId), ["RACE", "TEST"]);
  assert.equal(save.world.raceEntryState.current.some((row) => row.driverId === "HISTORICAL_SUB"), false);
});

test("new seasons preserve the evolved entry list but stop labelling it as a historical seed", () => {
  const save = saveWorld();
  dispatchSimulationEvents(save, [{ type: SIM_EVENT.CAREER_STARTED, date: "1980-01-01", payload: { season: 1980 } }], entrySystems);
  const before = structuredClone(save.world.raceEntryState.current);

  dispatchSimulationEvents(save, [{
    type: SIM_EVENT.SEASON_STARTED,
    date: "1981-01-01",
    payload: { previousSeason: 1980, season: 1981 },
  }], entrySystems);

  assert.equal(save.world.raceEntryState.season, 1981);
  assert.equal(save.world.raceEntryState.source, "save_world_dynamic");
  assert.deepEqual(save.world.raceEntryState.current, before);
});

test("a simulation signing reassigns an existing race entry and stale old-team expiry cannot remove it", () => {
  const save = saveWorld();
  dispatchSimulationEvents(save, [{ type: SIM_EVENT.CAREER_STARTED, date: "1980-01-01", payload: { season: 1980 } }], entrySystems);

  const transferEvents = dispatchSimulationEvents(save, [{
    type: EMPLOYMENT_EVENT.CONTRACT_SIGNED,
    date: "1980-06-01",
    payload: {
      worker_type: "driver",
      worker_id: "TEST",
      team_id: "TEAM2",
      role: "race_driver",
      contract_start: 1980,
      contract_until: 1982,
    },
  }], entrySystems);

  const entry = save.world.raceEntryState.current.find((row) => row.driverId === "TEST");
  assert.equal(entry.teamId, "TEAM2");
  assert.equal(entry.carNumber, 18, "existing car identity is preserved until the team changes it explicitly");
  assert.ok(transferEvents.some((event) => event.type === "race.entries_updated" && event.payload.reason === "race_driver_reassigned"));

  dispatchSimulationEvents(save, [{
    type: CONTRACT_EVENT.EXPIRED,
    date: "1981-01-01",
    payload: {
      contractType: "driver",
      driver_id: "TEST",
      team_id: "TEAM",
      role: "test_driver",
      contract_until: 1980,
    },
  }], entrySystems);

  assert.equal(save.world.raceEntryState.current.find((row) => row.driverId === "TEST").teamId, "TEAM2");
});
