import test from "node:test";
import assert from "node:assert/strict";
import {
  CHAMPIONSHIP_EVENT,
  createChampionshipSystem,
  createRaceWeekendSystem,
  createSaveWorld,
  dispatchSimulationEvents,
  parsePointsSystem,
  RACE_EVENT,
  runHeadlessSimulation,
  SIM_EVENT,
} from "../src/index.js";

function directRaceSave(seed = "race-strength", unreliable = false) {
  const save = createSaveWorld({
    season: 1980,
    teams: [
      { team_id: "GOOD", team_name: "Good Team" },
      { team_id: "WEAK", team_name: "Weak Team" },
    ],
    drivers: [
      { driver_id: "FAST", display_name: "Fast Driver" },
      { driver_id: "SLOW", display_name: "Slow Driver" },
    ],
    driverRatings: [
      { driver_id: "FAST", qualifying: 96, pace: 95, racecraft: 93, consistency: 92, tire_management: 90, race_intelligence: 94, wet_skill: 91, crash_likelihood: 0, current_ability: 40 },
      { driver_id: "SLOW", qualifying: 45, pace: 44, racecraft: 48, consistency: 46, tire_management: 47, race_intelligence: 45, wet_skill: 50, crash_likelihood: 0, current_ability: 95 },
    ],
    teamEngines: [
      { team_id: "GOOD", engine_id: "E_GOOD" },
      { team_id: "WEAK", engine_id: "E_WEAK" },
    ],
    engines: [
      { engine_id: "E_GOOD", power: 96, reliability: unreliable ? 0 : 100 },
      { engine_id: "E_WEAK", power: 45, reliability: 100 },
    ],
    tracks: [{ track_id: "TR1", track_name: "Test Ring", power_dependency: 55, aero_dependency: 60 }],
    calendar: [{ year: 1980, round: 1, gp_id: "GP1", gp_name: "Test GP", track_id: "TR1", race_date: "1980-01-03", laps: 60 }],
    rules: { year: 1980, points_system: "9-6-4-3-2-1" },
  }, { seed, startDate: "1980-01-03" });

  save.world.employment = {
    drivers: {
      FAST: { teamId: "GOOD", role: "main_driver", status: "employed" },
      SLOW: { teamId: "WEAK", role: "main_driver", status: "employed" },
    },
    staff: {},
    freeAgents: { drivers: [], staff: [] },
    vacancies: [],
  };
  save.world.careerState = {
    drivers: {
      FAST: { status: "employed", currentAbility: 40, form: 0 },
      SLOW: { status: "employed", currentAbility: 95, form: 0 },
    },
    staff: {},
  };
  save.world.carState = {
    GOOD: { components: { chassis_spec: 95, aero_spec: 96, gearbox_spec: unreliable ? 0 : 95, suspension_spec: 94, brakes_spec: unreliable ? 0 : 95, cooling_spec: unreliable ? 0 : 95, electronics_spec: unreliable ? 0 : 95 } },
    WEAK: { components: { chassis_spec: 45, aero_spec: 44, gearbox_spec: 50, suspension_spec: 46, brakes_spec: 50, cooling_spec: 50, electronics_spec: 50 } },
  };
  return save;
}

function raceDayEvent() {
  return {
    type: SIM_EVENT.RACE_DAY,
    date: "1980-01-03",
    payload: { gp_id: "GP1", gp_name: "Test GP", track_id: "TR1", round: 1 },
  };
}

function seasonDatabase() {
  return {
    manifest: { databaseVersion: "season-1980-test", readiness: { "1980": "READY" } },
    teams: [
      { team_id: "T1", team_name: "Alpha", starting_budget: 0 },
      { team_id: "T2", team_name: "Beta", starting_budget: 0 },
    ],
    teamBrands: [
      { year: 1980, team_id: "T1", team_name: "Alpha" },
      { year: 1980, team_id: "T2", team_name: "Beta" },
    ],
    drivers: [
      { driver_id: "D1", display_name: "Driver One", dob: "1955-04-01" },
      { driver_id: "D2", display_name: "Driver Two", dob: "1956-04-01" },
    ],
    driverRatings: [
      { year: 1980, driver_id: "D1", current_ability: 80, potential_ability: 85, qualifying: 82, pace: 83, racecraft: 82, consistency: 80, tire_management: 80, race_intelligence: 81, crash_likelihood: 0 },
      { year: 1980, driver_id: "D2", current_ability: 70, potential_ability: 78, qualifying: 70, pace: 71, racecraft: 72, consistency: 70, tire_management: 70, race_intelligence: 71, crash_likelihood: 0 },
    ],
    contracts: [
      { year: 1980, team_id: "T1", driver_id: "D1", role: "main_driver", contract_start: 1980, contract_until: 1982 },
      { year: 1980, team_id: "T2", driver_id: "D2", role: "main_driver", contract_start: 1980, contract_until: 1982 },
    ],
    staff: [], staffRatings: [], staffContracts: [],
    engines: [
      { engine_id: "E1", power: 85, reliability: 100 },
      { engine_id: "E2", power: 72, reliability: 100 },
    ],
    teamEngines: [
      { year: 1980, team_id: "T1", engine_id: "E1" },
      { year: 1980, team_id: "T2", engine_id: "E2" },
    ],
    carStats: [
      { year: 1980, team_id: "T1", chassis_spec: 82, aero_spec: 82, gearbox_spec: 100, suspension_spec: 82, brakes_spec: 100, cooling_spec: 100, electronics_spec: 100 },
      { year: 1980, team_id: "T2", chassis_spec: 72, aero_spec: 72, gearbox_spec: 100, suspension_spec: 72, brakes_spec: 100, cooling_spec: 100, electronics_spec: 100 },
    ],
    facilities: [],
    sponsorContracts: [], teamFinancials: [], financeLedger: [], rdProjects: [],
    tracks: [{ track_id: "TR1", track_name: "Test Ring" }],
    calendar: [{ year: 1980, round: 1, gp_id: "GP1980", gp_name: "Opening GP", track_id: "TR1", race_date: "1980-01-03", laps: 60 }],
    rules: [{ year: 1980, points_system: "9-6-4-3-2-1" }],
    qualifyingRules: [], eraSafety: [], accidentModel: [],
  };
}

test("race weekend is deterministic and is not driven by Current Ability alone", () => {
  const a = directRaceSave("race-strength");
  const b = directRaceSave("race-strength");
  dispatchSimulationEvents(a, [raceDayEvent()], [createRaceWeekendSystem()]);
  dispatchSimulationEvents(b, [raceDayEvent()], [createRaceWeekendSystem()]);

  assert.deepEqual(a.history.races, b.history.races);
  assert.equal(a.history.races.length, 1);
  const weekend = a.history.races[0];
  assert.equal(weekend.qualifying.classification[0].driverId, "FAST");
  assert.equal(weekend.classification[0].driverId, "FAST");
  assert.equal(weekend.classification[0].status, "FINISHED");
  assert.equal(a.world.careerState.drivers.FAST.currentAbility, 40);
  assert.equal(a.world.careerState.drivers.SLOW.currentAbility, 95);
});

test("low reliability can create an explicit mechanical DNF", () => {
  const save = directRaceSave("dnf-3", true);
  save.world.employment.drivers = { FAST: save.world.employment.drivers.FAST };
  save.world.drivers = save.world.drivers.filter((row) => row.driver_id === "FAST");
  save.world.driverRatings = save.world.driverRatings.filter((row) => row.driver_id === "FAST");
  dispatchSimulationEvents(save, [raceDayEvent()], [createRaceWeekendSystem()]);

  const result = save.history.races[0].classification[0];
  assert.equal(result.driverId, "FAST");
  assert.equal(result.status, "DNF");
  assert.equal(result.reason, "mechanical");
  assert.ok(result.completedLaps >= 0 && result.completedLaps < 60);
});

test("championship parses historical points and stores gross standings without claiming official era scoring", () => {
  assert.deepEqual(parsePointsSystem("9-6-4-3-2-1"), [9, 6, 4, 3, 2, 1]);
  const save = directRaceSave("championship-test");
  const system = createChampionshipSystem();
  dispatchSimulationEvents(save, [{ type: SIM_EVENT.CAREER_STARTED, date: "1980-01-01", payload: { season: 1980 } }], [system]);
  const events = dispatchSimulationEvents(save, [{
    type: RACE_EVENT.COMPLETED,
    date: "1980-01-03",
    payload: {
      season: 1980,
      gpId: "GP1",
      classification: [
        { position: 1, driverId: "FAST", teamId: "GOOD", status: "FINISHED" },
        { position: 2, driverId: "SLOW", teamId: "WEAK", status: "FINISHED" },
      ],
    },
  }], [system]);

  assert.equal(save.world.championship.drivers.FAST.points, 9);
  assert.equal(save.world.championship.drivers.SLOW.points, 6);
  assert.equal(save.world.championship.scoringMode, "gross_points");
  assert.equal(save.world.championship.standingsStatus, "provisional_era_rules_pending");
  assert.ok(events.some((event) => event.type === CHAMPIONSHIP_EVENT.UPDATED));
});

test("missing points rules remain unscored instead of receiving invented defaults", () => {
  const save = directRaceSave("no-rules");
  save.world.rules = null;
  const system = createChampionshipSystem();
  dispatchSimulationEvents(save, [{ type: SIM_EVENT.CAREER_STARTED, date: "1980-01-01", payload: { season: 1980 } }], [system]);
  dispatchSimulationEvents(save, [{
    type: RACE_EVENT.COMPLETED,
    date: "1980-01-03",
    payload: { season: 1980, classification: [{ position: 1, driverId: "FAST", teamId: "GOOD", status: "FINISHED" }] },
  }], [system]);
  assert.equal(save.world.championship.drivers.FAST.points, 0);
  assert.equal(save.world.championship.scoringMode, "unscored_missing_rules");
});

test("a 1980-only season package can roll into 1981 and race again without historical 1981 data", () => {
  const result = runHeadlessSimulation(seasonDatabase(), {
    season: 1980,
    days: 369,
    seed: "two-season",
    createdAt: "1980-01-01T00:00:00.000Z",
  });

  assert.equal(result.summary.finalDate, "1981-01-04");
  assert.equal(result.summary.currentSeason, 1981);
  assert.equal(result.summary.completedRaces, 2);
  assert.equal(result.summary.scheduledRaceDaysReached, 2);
  assert.equal(result.saveWorld.history.races[0].season, 1980);
  assert.equal(result.saveWorld.history.races[1].season, 1981);
  assert.equal(result.saveWorld.history.races[1].date, "1981-01-03");
  assert.equal(result.saveWorld.history.championships.length, 1);
  assert.equal(result.saveWorld.history.championships[0].season, 1980);
  assert.equal(result.saveWorld.world.championship.season, 1981);
  assert.equal(result.saveWorld.world.championship.racesCompleted, 1);
  assert.equal(result.saveWorld.world.calendar[0].generated, true);
  assert.equal(result.saveWorld.world.calendar[0].generation_source, "previous_season_calendar");
});
