import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceDays,
  ageOnDate,
  CAREER_EVENT,
  createCoreWorldSystems,
  createSaveWorld,
  createSeasonSnapshot,
  EMPLOYMENT_EVENT,
  ENTITY_EVENT,
  initializeSimulation,
} from "../src/index.js";

function lifecycleDatabase() {
  return {
    manifest: { databaseVersion: "test-life", sourceSha256: "life123", readiness: { "1980": "READY" } },
    teams: [{ team_id: "TEAM1", team_name: "Team One" }],
    teamBrands: [{ year: 1980, team_id: "TEAM1", team_name: "Team One" }],
    drivers: [
      { driver_id: "DRV1", display_name: "Incumbent", dob: "1950-06-15", career_start_year: 1975, career_end_year: 1980 },
      { driver_id: "DRV2", display_name: "Free Star", dob: "1955-03-01", career_start_year: 1979, career_end_year: 1990 },
      { driver_id: "DRV3", display_name: "Future Talent", dob: "1962-09-20" },
    ],
    driverRatings: [
      { year: 1980, driver_id: "DRV1", current_ability: 50, potential_ability: 52, reputation: 55 },
      { year: 1980, driver_id: "DRV2", current_ability: 95, potential_ability: 97, reputation: 90 },
    ],
    contracts: [{ year: 1980, team_id: "TEAM1", driver_id: "DRV1", role: "main_driver", contract_start: 1980, contract_until: 1980 }],
    staff: [{ staff_id: "ST1", staff_name: "Engineer", dob: "1940-01-10" }],
    staffRatings: [{ year: 1980, staff_id: "ST1", technical: 80, leadership: 70, reputation: 75 }],
    staffContracts: [{ year: 1980, team_id: "TEAM1", staff_id: "ST1", role: "chief_engineer", contract_until: 1982 }],
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
    availabilityTimeline: [
      {
        entity_type: "driver",
        entity_id: "DRV3",
        name: "Future Talent",
        activation_year: 1981,
        next_reference_f1_entry_year: 1984,
        eligible_when_reached: true,
      },
    ],
  };
}

function createLifecycleSave(startDate = "1980-01-01") {
  return createSaveWorld(createSeasonSnapshot(lifecycleDatabase(), 1980), {
    startDate,
    seed: "career-life-test",
    createdAt: "1980-01-01T00:00:00.000Z",
  });
}

test("age calculation respects birthday instead of only subtracting years", () => {
  assert.equal(ageOnDate({ dob: "1950-06-15" }, "1980-06-14"), 29);
  assert.equal(ageOnDate({ dob: "1950-06-15" }, "1980-06-15"), 30);
});

test("career initialization creates mutable driver and staff state plus employment market", () => {
  const save = createLifecycleSave();
  const result = initializeSimulation(save, createCoreWorldSystems());

  assert.equal(save.world.careerState.drivers.DRV1.age, 29);
  assert.equal(save.world.careerState.drivers.DRV1.currentAbility, 50);
  assert.equal(save.world.careerState.staff.ST1.age, 39);
  assert.equal(save.world.employment.drivers.DRV1.teamId, "TEAM1");
  assert.deepEqual(save.world.employment.freeAgents.drivers, ["DRV2"]);
  assert.ok(result.events.some((event) => event.type === CAREER_EVENT.INITIALIZED));
  assert.ok(result.events.some((event) => event.type === EMPLOYMENT_EVENT.INITIALIZED));
});

test("future eligible driver is activated into the live career pool without scripted F1 entry", () => {
  const save = createLifecycleSave("1980-12-31");
  const systems = createCoreWorldSystems({ controlledTeamIds: ["TEAM1"] });
  initializeSimulation(save, systems);

  const result = advanceDays(save, 1, systems);
  assert.ok(result.events.some((event) => event.type === ENTITY_EVENT.ELIGIBLE && event.payload.entity_id === "DRV3"));
  assert.ok(result.events.some((event) => event.type === CAREER_EVENT.PROFILE_ACTIVATED && event.payload.entity_id === "DRV3"));
  assert.equal(save.world.drivers.some((driver) => driver.driver_id === "DRV3"), true);
  assert.equal(save.world.careerState.drivers.DRV3.status, "available");
  assert.ok(save.world.employment.freeAgents.drivers.includes("DRV3"));
  assert.equal(save.world.employment.drivers.DRV3, undefined);
});

test("AI team fills an expired driver seat with the strongest available candidate", () => {
  const save = createLifecycleSave("1980-12-31");
  const systems = createCoreWorldSystems();
  initializeSimulation(save, systems);

  const result = advanceDays(save, 1, systems);
  const vacancy = result.events.find((event) => event.type === EMPLOYMENT_EVENT.VACANCY_OPENED);
  const signing = result.events.find((event) => event.type === EMPLOYMENT_EVENT.CONTRACT_SIGNED);

  assert.ok(vacancy);
  assert.ok(signing);
  assert.equal(signing.payload.worker_id, "DRV2");
  assert.equal(signing.payload.team_id, "TEAM1");
  assert.equal(save.world.employment.drivers.DRV2.teamId, "TEAM1");
  assert.equal(save.world.employment.drivers.DRV1, undefined);
  assert.ok(save.world.employment.freeAgents.drivers.includes("DRV1"));
  assert.equal(save.history.transfers.at(-1).workerId, "DRV2");
  assert.equal(save.world.contracts.at(-1).source, "simulation");
});

test("human-controlled team vacancy remains open for player action", () => {
  const save = createLifecycleSave("1980-12-31");
  const systems = createCoreWorldSystems({ controlledTeamIds: ["TEAM1"] });
  initializeSimulation(save, systems);

  const result = advanceDays(save, 1, systems);
  assert.ok(result.events.some((event) => event.type === EMPLOYMENT_EVENT.VACANCY_OPENED));
  assert.equal(result.events.some((event) => event.type === EMPLOYMENT_EVENT.CONTRACT_SIGNED), false);
  assert.equal(save.world.employment.vacancies.at(-1).status, "open");
});

test("historical career end year does not force retirement in an alternative-history save", () => {
  const save = createLifecycleSave("1980-12-31");
  const systems = createCoreWorldSystems({ controlledTeamIds: ["TEAM1"] });
  initializeSimulation(save, systems);
  advanceDays(save, 1, systems);

  assert.notEqual(save.world.careerState.drivers.DRV1.status, "retired");
});
