import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceDays,
  CAREER_EVENT,
  createCareerDevelopmentSystem,
  createCareerLifecycleSystem,
  createCoreWorldSystems,
  createSaveWorld,
  createSeasonSnapshot,
  initializeSimulation,
  retirementProbability,
} from "../src/index.js";

function developmentDatabase() {
  return {
    teams: [{ team_id: "TEAM1", team_name: "Team One" }],
    teamBrands: [{ year: 1980, team_id: "TEAM1", team_name: "Team One" }],
    drivers: [
      { driver_id: "YOUNG", display_name: "Young Driver", dob: "1960-06-01" },
      { driver_id: "VETERAN", display_name: "Veteran Driver", dob: "1940-06-01" },
    ],
    driverRatings: [
      {
        year: 1980,
        driver_id: "YOUNG",
        current_ability: 60,
        potential_ability: 90,
        reputation: 45,
        pace: 62,
        qualifying: 61,
        racecraft: 58,
        consistency: 57,
        technical_feedback: 55,
      },
      {
        year: 1980,
        driver_id: "VETERAN",
        current_ability: 82,
        potential_ability: 88,
        reputation: 80,
        pace: 84,
        qualifying: 82,
        racecraft: 88,
        consistency: 87,
        technical_feedback: 86,
      },
    ],
    contracts: [
      { year: 1980, team_id: "TEAM1", driver_id: "VETERAN", role: "main_driver", contract_until: 1985 },
    ],
    staff: [],
    staffRatings: [],
    staffContracts: [],
    engines: [],
    teamEngines: [],
    carStats: [],
    facilities: [],
    tracks: [],
    calendar: [],
    rules: [],
    qualifyingRules: [],
    eraSafety: [],
    accidentModel: [],
  };
}

test("young drivers develop while old drivers decline across a season boundary", () => {
  const save = createSaveWorld(createSeasonSnapshot(developmentDatabase(), 1980), {
    seed: "development-test",
    startDate: "1980-12-31",
  });
  const systems = [createCareerLifecycleSystem(), createCareerDevelopmentSystem()];
  initializeSimulation(save, systems);

  const result = advanceDays(save, 1, systems);
  const young = save.world.careerState.drivers.YOUNG;
  const veteran = save.world.careerState.drivers.VETERAN;

  assert.ok(young.currentAbility > 60);
  assert.ok(veteran.currentAbility < 82);
  assert.ok(young.attributes.racecraft > 58);
  assert.ok(veteran.attributes.pace < 84);
  assert.equal(young.developmentPhase, "rapid-development");
  assert.equal(veteran.developmentPhase, "decline");
  assert.ok(result.events.some((event) => event.type === CAREER_EVENT.DEVELOPED && event.payload.worker_id === "YOUNG"));
});

test("retirement probability is age-sensitive and does not force historical retirement dates", () => {
  assert.equal(retirementProbability("driver", { age: 28, status: "employed", currentAbility: 80 }), 0);
  assert.ok(retirementProbability("driver", { age: 40, status: "available", currentAbility: 55, reputation: 40 }) > 0.1);
  assert.equal(retirementProbability("driver", { age: 55, status: "employed", currentAbility: 95, reputation: 95 }), 1);
});

test("a retirement opens a vacancy and AI can replace the driver autonomously", () => {
  const database = developmentDatabase();
  database.drivers[1].dob = "1926-06-01";
  const save = createSaveWorld(createSeasonSnapshot(database, 1980), {
    seed: "retirement-replacement-test",
    startDate: "1980-12-31",
  });
  const systems = createCoreWorldSystems();
  initializeSimulation(save, systems);

  advanceDays(save, 1, systems);

  assert.equal(save.world.careerState.drivers.VETERAN.status, "retired");
  assert.equal(save.world.employment.drivers.VETERAN, undefined);
  assert.equal(save.world.employment.drivers.YOUNG.teamId, "TEAM1");
  assert.equal(save.world.employment.freeAgents.drivers.includes("VETERAN"), false);
  assert.equal(save.history.retirements.length, 1);
  assert.equal(save.history.retirements[0].workerId, "VETERAN");
  assert.ok(save.history.transfers.some((transfer) => transfer.workerId === "YOUNG" && transfer.teamId === "TEAM1"));
  assert.ok(save.world.employment.vacancies.some((vacancy) => vacancy.reason === "retirement" && vacancy.status === "filled"));
});

test("historical career end is not treated as a scripted retirement after career start", () => {
  const database = developmentDatabase();
  database.drivers[0].career_end_year = 1980;
  database.contracts.push({ year: 1980, team_id: "TEAM1", driver_id: "YOUNG", role: "reserve_driver", contract_until: 1983 });
  const save = createSaveWorld(createSeasonSnapshot(database, 1980), {
    seed: "alternative-history-test",
    startDate: "1980-12-31",
  });
  const systems = createCoreWorldSystems();
  initializeSimulation(save, systems);

  advanceDays(save, 1, systems);

  assert.notEqual(save.world.careerState.drivers.YOUNG.status, "retired");
  assert.equal(save.world.employment.drivers.YOUNG.teamId, "TEAM1");
});

test("annual development is reproducible for the same save seed", () => {
  const snapshot = createSeasonSnapshot(developmentDatabase(), 1980);
  const systemsA = [createCareerLifecycleSystem(), createCareerDevelopmentSystem()];
  const systemsB = [createCareerLifecycleSystem(), createCareerDevelopmentSystem()];
  const a = createSaveWorld(snapshot, { seed: "repeatable", startDate: "1980-12-31" });
  const b = createSaveWorld(snapshot, { seed: "repeatable", startDate: "1980-12-31" });
  initializeSimulation(a, systemsA);
  initializeSimulation(b, systemsB);
  advanceDays(a, 1, systemsA);
  advanceDays(b, 1, systemsB);

  assert.deepEqual(a.world.careerState, b.world.careerState);
});
