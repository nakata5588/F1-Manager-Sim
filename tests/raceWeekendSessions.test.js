import test from "node:test";
import assert from "node:assert/strict";
import {
  createRaceWeekendSystem,
  createSaveWorld,
  dispatchSimulationEvents,
  RACE_EVENT,
  SIM_EVENT,
} from "../src/index.js";

function weekendSave(seed = "weekend-sessions") {
  const save = createSaveWorld({
    season: 1980,
    teams: [
      { team_id: "T1", team_name: "Alpha" },
      { team_id: "T2", team_name: "Beta" },
      { team_id: "T3", team_name: "Gamma" },
    ],
    drivers: [
      { driver_id: "D1", display_name: "Feedback Ace" },
      { driver_id: "D2", display_name: "Steady Driver" },
      { driver_id: "D3", display_name: "Raw Rookie" },
    ],
    driverRatings: [
      { driver_id: "D1", qualifying: 82, pace: 82, racecraft: 80, consistency: 84, tire_management: 80, race_intelligence: 82, technical_feedback: 96, adaptability: 94, start_launch: 80, crash_likelihood: 0 },
      { driver_id: "D2", qualifying: 80, pace: 80, racecraft: 80, consistency: 80, tire_management: 80, race_intelligence: 80, technical_feedback: 55, adaptability: 55, start_launch: 80, crash_likelihood: 0 },
      { driver_id: "D3", qualifying: 78, pace: 78, racecraft: 78, consistency: 55, tire_management: 75, race_intelligence: 75, technical_feedback: 20, adaptability: 20, start_launch: 75, crash_likelihood: 0 },
    ],
    staff: [],
    staffRatings: [],
    staffContracts: [],
    teamEngines: [
      { team_id: "T1", engine_id: "E1" },
      { team_id: "T2", engine_id: "E1" },
      { team_id: "T3", engine_id: "E1" },
    ],
    engines: [{ engine_id: "E1", power: 80, reliability: 100 }],
    carStats: [],
    tracks: [{ track_id: "TR1", track_name: "Technical Ring", power_dependency: 40, aero_dependency: 75, technicality: 80, overtaking_difficulty: 70 }],
    calendar: [{ year: 1980, round: 1, gp_id: "GP1", gp_name: "Test GP", track_id: "TR1", race_date: "1980-03-10", laps: 70 }],
    qualifyingRules: { year: 1980, practice_session_count: 3, session_count: 2, max_starters: 2 },
    rules: { year: 1980, points_system: "9-6-4-3-2-1" },
  }, { seed, startDate: "1980-03-10" });

  save.world.employment = {
    drivers: {
      D1: { teamId: "T1", role: "main_driver", status: "employed" },
      D2: { teamId: "T2", role: "main_driver", status: "employed" },
      D3: { teamId: "T3", role: "main_driver", status: "employed" },
    },
    staff: {},
    freeAgents: { drivers: [], staff: [] },
    vacancies: [],
  };
  save.world.careerState = {
    drivers: {
      D1: { status: "employed", form: 0 },
      D2: { status: "employed", form: 0 },
      D3: { status: "employed", form: 0 },
    },
    staff: {},
  };
  save.world.carState = {
    T1: { components: { chassis_spec: 80, aero_spec: 80, gearbox_spec: 100, suspension_spec: 80, brakes_spec: 100, cooling_spec: 100, electronics_spec: 100 } },
    T2: { components: { chassis_spec: 80, aero_spec: 80, gearbox_spec: 100, suspension_spec: 80, brakes_spec: 100, cooling_spec: 100, electronics_spec: 100 } },
    T3: { components: { chassis_spec: 80, aero_spec: 80, gearbox_spec: 100, suspension_spec: 80, brakes_spec: 100, cooling_spec: 100, electronics_spec: 100 } },
  };
  return save;
}

function raceDay() {
  return {
    type: SIM_EVENT.RACE_DAY,
    date: "1980-03-10",
    payload: { gp_id: "GP1", gp_name: "Test GP", track_id: "TR1", round: 1 },
  };
}

test("race day flows through explicit practice, qualifying, grid and race events", () => {
  const save = weekendSave();
  const events = dispatchSimulationEvents(save, [raceDay()], [createRaceWeekendSystem()]);
  assert.deepEqual(events.map((event) => event.type), [
    SIM_EVENT.RACE_DAY,
    RACE_EVENT.WEEKEND_STARTED,
    RACE_EVENT.PRACTICE_COMPLETED,
    RACE_EVENT.QUALIFYING_COMPLETED,
    RACE_EVENT.GRID_SET,
    RACE_EVENT.COMPLETED,
  ]);

  const weekend = save.history.races[0];
  assert.equal(weekend.practice.windows, 3);
  assert.equal(weekend.practice.source, "season_rules");
  assert.equal(weekend.qualifying.sessions, 2);
  assert.equal(weekend.qualifying.maxStarters, 2);
  assert.equal(weekend.grid.length, 2);
  assert.equal(weekend.classification.length, 2);
  assert.equal(weekend.phase, "completed");
});

test("practice knowledge responds to driver feedback and adaptability", () => {
  const save = weekendSave("practice-learning");
  dispatchSimulationEvents(save, [raceDay()], [createRaceWeekendSystem()]);
  const practice = save.history.races[0].practice.results;
  const ace = practice.find((row) => row.driverId === "D1");
  const rookie = practice.find((row) => row.driverId === "D3");
  assert.ok(ace.setupKnowledge > rookie.setupKnowledge);
  assert.ok(ace.setupKnowledge >= 20 && ace.setupKnowledge <= 100);
  assert.ok(ace.setupQuality >= 25 && ace.setupQuality <= 100);
  assert.equal(Object.keys(ace.setup).length, 4);
});

test("explicit grid-size rules create DNQ drivers instead of silently starting everybody", () => {
  const save = weekendSave("dnq-grid");
  dispatchSimulationEvents(save, [raceDay()], [createRaceWeekendSystem()]);
  const weekend = save.history.races[0];
  const dnq = weekend.qualifying.classification.filter((row) => row.status === "DNQ");
  assert.equal(dnq.length, 1);
  assert.equal(weekend.grid.length, 2);
  assert.equal(weekend.classification.some((row) => row.driverId === dnq[0].driverId), false);
});

test("full session pipeline remains deterministic for identical save seeds", () => {
  const a = weekendSave("same-weekend");
  const b = weekendSave("same-weekend");
  dispatchSimulationEvents(a, [raceDay()], [createRaceWeekendSystem()]);
  dispatchSimulationEvents(b, [raceDay()], [createRaceWeekendSystem()]);
  assert.deepEqual(a.history.races, b.history.races);
});
