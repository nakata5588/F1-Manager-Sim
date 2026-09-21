import test from "node:test";
import assert from "node:assert/strict";

import {
  CAREER_EVENT,
  DEVELOPMENT_SIGNAL_EVENT,
  PRESEASON_EVENT,
  RACE_EVENT,
  SIM_EVENT,
  createCareerDevelopmentSystem,
  createCareerLifecycleSystem,
  createDevelopmentSignalsSystem,
  createEmploymentMarketSystem,
  createSaveWorld,
  createSeasonSnapshot,
  dispatchSimulationEvents,
  driverDevelopmentEvidence,
  driverStageFactor,
  initializeSimulation,
  staffDevelopmentEvidence,
} from "../src/index.js";

function database() {
  return {
    teams: [{ team_id: "T1", team_name: "Development Racing", reputation: 60, starting_budget: 2_000_000 }],
    teamBrands: [{ year: 1980, team_id: "T1", team_name: "Development Racing" }],
    drivers: [
      { driver_id: "YOUNG", display_name: "Young Driver", dob: "1960-01-01" },
      { driver_id: "MENTOR", display_name: "Senior Driver", dob: "1948-01-01" },
      { driver_id: "TEST", display_name: "Test Driver", dob: "1956-01-01" },
    ],
    driverRatings: [
      { year: 1980, driver_id: "YOUNG", current_ability: 60, potential_ability: 88, pace: 61, qualifying: 60, racecraft: 58, consistency: 57, technical_feedback: 55, adaptability: 58, leadership: 38, team_player: 62 },
      { year: 1980, driver_id: "MENTOR", current_ability: 79, potential_ability: 82, pace: 78, qualifying: 77, racecraft: 84, consistency: 83, technical_feedback: 88, adaptability: 76, leadership: 90, team_player: 86 },
      { year: 1980, driver_id: "TEST", current_ability: 66, potential_ability: 76, pace: 64, qualifying: 63, racecraft: 70, consistency: 72, technical_feedback: 82, adaptability: 80, leadership: 60, team_player: 78 },
    ],
    contracts: [
      { year: 1980, driver_id: "YOUNG", team_id: "T1", role: "main_driver", contract_start: 1980, contract_until: 1983 },
      { year: 1980, driver_id: "MENTOR", team_id: "T1", role: "second_driver", contract_start: 1980, contract_until: 1983 },
      { year: 1980, driver_id: "TEST", team_id: "T1", role: "test_driver", contract_start: 1980, contract_until: 1983 },
    ],
    staff: [
      { staff_id: "COACH", display_name: "Driver Coach", role: "team_manager", dob: "1940-01-01" },
      { staff_id: "JUNIOR", display_name: "Junior Engineer", role: "design_engineer", dob: "1952-01-01" },
      { staff_id: "SENIOR", display_name: "Senior Engineer", role: "technical_director", dob: "1938-01-01" },
    ],
    staffRatings: [
      { year: 1980, staff_id: "COACH", current_ability: 75, potential_ability: 80, driver_development: 90, motivation: 85, communication: 86, leadership: 84 },
      { year: 1980, staff_id: "JUNIOR", current_ability: 58, potential_ability: 82, technical: 60, data_analysis: 57, innovation: 59, communication: 62, leadership: 45 },
      { year: 1980, staff_id: "SENIOR", current_ability: 82, potential_ability: 85, technical: 88, data_analysis: 84, innovation: 83, communication: 80, leadership: 86 },
    ],
    staffContracts: [
      { year: 1980, staff_id: "COACH", team_id: "T1", role: "team_manager", contract_start: 1980, contract_until: 1984 },
      { year: 1980, staff_id: "JUNIOR", team_id: "T1", role: "design_engineer", contract_start: 1980, contract_until: 1984 },
      { year: 1980, staff_id: "SENIOR", team_id: "T1", role: "technical_director", contract_start: 1980, contract_until: 1984 },
    ],
    teamFinancials: [{ year: 1980, team_id: "T1", cash_balance: 2_000_000 }],
    carStats: [{ year: 1980, team_id: "T1", chassis_spec: 60, aero_spec: 60, gearbox_spec: 60 }],
    facilities: [{ year: 1980, team_id: "T1", wind_tunnel_level: 6, manufacturing_level: 6 }],
    sponsorContracts: [],
    engines: [],
    teamEngines: [],
    tracks: [],
    calendar: [],
    rules: [],
    qualifyingRules: [],
    eraSafety: [],
    accidentModel: [],
  };
}

function initialized(startDate = "1980-01-01") {
  const save = createSaveWorld(createSeasonSnapshot(database(), 1980), {
    seed: "stage-20-development",
    startDate,
  });
  const systems = [
    createCareerLifecycleSystem(),
    createCareerDevelopmentSystem(),
    createDevelopmentSignalsSystem(),
    createEmploymentMarketSystem(),
  ];
  initializeSimulation(save, systems);
  return { save, systems };
}

function racePayload() {
  return {
    key: "1980:1:TEST",
    season: 1980,
    gpId: "TEST",
    practice: {
      results: [
        { driverId: "YOUNG", practiceWindows: 2, setupKnowledge: 82 },
        { driverId: "MENTOR", practiceWindows: 2, setupKnowledge: 84 },
      ],
    },
    qualifying: {
      classification: [
        { driverId: "YOUNG", teamId: "T1", position: 1, status: "QUALIFIED" },
        { driverId: "MENTOR", teamId: "T1", position: 2, status: "QUALIFIED" },
      ],
    },
    classification: [
      { driverId: "YOUNG", teamId: "T1", position: 1, status: "FINISHED", performanceIndex: 82, reason: null },
      { driverId: "MENTOR", teamId: "T1", position: 2, status: "FINISHED", performanceIndex: 76, reason: null },
    ],
  };
}

test("race participation records real development evidence and updates form against a teammate benchmark", () => {
  const { save, systems } = initialized();
  const beforeForm = save.world.careerState.drivers.YOUNG.form;

  const events = dispatchSimulationEvents(save, [{
    type: RACE_EVENT.COMPLETED,
    date: "1980-03-01",
    payload: racePayload(),
  }], systems);

  const young = driverDevelopmentEvidence(save, "YOUNG");
  const mentor = driverDevelopmentEvidence(save, "MENTOR");
  assert.equal(young.raceStarts, 1);
  assert.equal(young.raceFinishes, 1);
  assert.equal(young.practiceWindows, 2);
  assert.ok(young.averageTeammatePerformanceDelta > 0);
  assert.ok(mentor.averageTeammatePerformanceDelta < 0);
  assert.ok(save.world.careerState.drivers.YOUNG.form > beforeForm);
  assert.ok(events.some((event) => event.type === DEVELOPMENT_SIGNAL_EVENT.RACE_RECORDED));
});

test("test and reserve roles gain more testing exposure than race drivers", () => {
  const { save, systems } = initialized();

  dispatchSimulationEvents(save, [{
    type: PRESEASON_EVENT.TEST_COMPLETED,
    date: "1980-02-01",
    payload: { team_id: "T1", test_id: "test:1", effectiveness: 80, focus: "development" },
  }], systems);

  const raceDriver = driverDevelopmentEvidence(save, "YOUNG");
  const testDriver = driverDevelopmentEvidence(save, "TEST");
  assert.equal(raceDriver.testingSessions, 1);
  assert.equal(testDriver.testingSessions, 1);
  assert.ok(testDriver.testingMileage > raceDriver.testingMileage);
});

test("monthly team environment creates coaching mentoring and staff peer-learning evidence", () => {
  const { save, systems } = initialized();

  dispatchSimulationEvents(save, [{
    type: SIM_EVENT.MONTH_STARTED,
    date: "1980-02-01",
    payload: { year: 1980, month: 2 },
  }], systems);

  const young = driverDevelopmentEvidence(save, "YOUNG");
  const junior = staffDevelopmentEvidence(save, "JUNIOR");
  assert.equal(young.teamEnvironmentMonths, 1);
  assert.equal(young.coachingMonths, 1);
  assert.equal(young.mentoringMonths, 1);
  assert.ok(young.averageMentoring > 70);
  assert.equal(junior.employedMonths, 1);
  assert.equal(junior.departmentMonths, 1);
  assert.equal(junior.peerLearningMonths, 1);
  assert.ok(junior.averagePeerLearning > 60);
});

test("injury burden is retained as development evidence and lowers morale without inventing a diagnosis", () => {
  const { save, systems } = initialized();
  const beforeMorale = save.world.careerState.drivers.YOUNG.morale;

  dispatchSimulationEvents(save, [{
    type: "driver.injured",
    date: "1980-05-01",
    payload: {
      driver_id: "YOUNG",
      injury_class: "serious",
      duration_days: 70,
    },
  }], systems);

  const evidence = driverDevelopmentEvidence(save, "YOUNG");
  assert.equal(evidence.injuryDays, 70);
  assert.ok(evidence.injuryBurden >= 0.8);
  assert.equal(evidence.seriousInjuries, 1);
  assert.ok(save.world.careerState.drivers.YOUNG.morale < beforeMorale);
});

test("annual development consumes the completed season evidence, stays below PA, then archives and resets it", () => {
  const { save, systems } = initialized("1980-12-31");
  for (let month = 1; month <= 8; month += 1) {
    dispatchSimulationEvents(save, [{
      type: SIM_EVENT.MONTH_STARTED,
      date: `1980-${String(Math.min(12, month + 1)).padStart(2, "0")}-01`,
      payload: { year: 1980, month: month + 1 },
    }], systems);
  }
  for (let race = 0; race < 8; race += 1) {
    const payload = racePayload();
    payload.key = `1980:${race + 1}:TEST`;
    dispatchSimulationEvents(save, [{
      type: RACE_EVENT.COMPLETED,
      date: "1980-12-20",
      payload,
    }], systems);
  }
  dispatchSimulationEvents(save, [{
    type: PRESEASON_EVENT.TEST_COMPLETED,
    date: "1980-12-20",
    payload: { team_id: "T1", test_id: "test:development", effectiveness: 85 },
  }], systems);

  const before = save.world.careerState.drivers.YOUNG.currentAbility;
  const events = dispatchSimulationEvents(save, [{
    type: SIM_EVENT.SEASON_STARTED,
    date: "1981-01-01",
    payload: { previousSeason: 1980, season: 1981 },
  }], systems);

  const career = save.world.careerState.drivers.YOUNG;
  assert.ok(career.currentAbility > before);
  assert.ok(career.currentAbility <= career.potentialAbility);
  const developed = events.find((event) => event.type === CAREER_EVENT.DEVELOPED && event.payload.worker_id === "YOUNG");
  assert.ok(developed);
  assert.ok(developed.payload.evidence.race_starts >= 8);
  assert.ok(developed.payload.evidence.mentoring > 0);
  assert.equal(save.world.developmentState.history[0].season, 1980);
  assert.equal(driverDevelopmentEvidence(save, "YOUNG").season, 1981);
  assert.equal(driverDevelopmentEvidence(save, "YOUNG").raceStarts, 0);
});

test("confidence changes potential realization without bypassing PA", () => {
  const low = initialized("1980-12-31");
  const high = initialized("1980-12-31");

  for (const target of [low.save, high.save]) {
    target.world.developmentState.drivers.YOUNG.raceStarts = 10;
    target.world.developmentState.drivers.YOUNG.raceFinishes = 9;
    target.world.developmentState.drivers.YOUNG.teamEnvironmentMonths = 10;
    target.world.developmentState.drivers.YOUNG.teamEnvironmentTotal = 10;
    target.world.developmentState.drivers.YOUNG.coachingMonths = 10;
    target.world.developmentState.drivers.YOUNG.coachingTotal = 750;
    target.world.management ??= {};
    target.world.management.people ??= { drivers: {}, staff: {} };
    target.world.management.people.drivers ??= {};
    target.world.management.people.drivers.YOUNG = {
      mentality: { confidence: 50, morale: 50 },
    };
  }

  low.save.world.management.people.drivers.YOUNG.mentality.confidence = 20;
  high.save.world.management.people.drivers.YOUNG.mentality.confidence = 80;

  const lowEvents = dispatchSimulationEvents(low.save, [{
    type: SIM_EVENT.SEASON_STARTED,
    date: "1981-01-01",
    payload: { previousSeason: 1980, season: 1981 },
  }], low.systems);
  const highEvents = dispatchSimulationEvents(high.save, [{
    type: SIM_EVENT.SEASON_STARTED,
    date: "1981-01-01",
    payload: { previousSeason: 1980, season: 1981 },
  }], high.systems);

  const lowDev = lowEvents.find((event) => event.type === CAREER_EVENT.DEVELOPED && event.payload.worker_id === "YOUNG");
  const highDev = highEvents.find((event) => event.type === CAREER_EVENT.DEVELOPED && event.payload.worker_id === "YOUNG");
  assert.ok(high.save.world.careerState.drivers.YOUNG.currentAbility > low.save.world.careerState.drivers.YOUNG.currentAbility);
  assert.ok(high.save.world.careerState.drivers.YOUNG.currentAbility <= high.save.world.careerState.drivers.YOUNG.potentialAbility);
  assert.equal(lowDev.payload.confidence, 20);
  assert.equal(highDev.payload.confidence, 80);
});

test("career-stage curves let raw pace decline earlier than experience-led racecraft", () => {
  assert.ok(driverStageFactor("decline", 1, "pace") < driverStageFactor("decline", 1, "racecraft"));
  assert.ok(driverStageFactor("veteran", 1, "pace") < driverStageFactor("veteran", 1, "technical_feedback"));
  assert.equal(driverStageFactor("prime", 1, "pace"), 1);
  assert.equal(driverStageFactor("prime", 1, "racecraft"), 1);
});

test("driver CA and PA are derived from current attributes and static ceilings", () => {
  const { save } = initialized();
  const young = save.world.careerState.drivers.YOUNG;
  assert.equal(young.talentProfile.policy, "static_attribute_ceilings_dynamic_career_curve");
  assert.equal(young.careerStage, "rookie");
  assert.ok(young.talentProfile.ceilings.pace >= young.attributes.pace);
  assert.ok(young.potentialAbility >= young.currentAbility);
  const potentialBefore = young.potentialAbility;
  const ceilingBefore = young.talentProfile.ceilings.pace;
  young.attributes.pace = Math.max(1, young.attributes.pace - 5);
  assert.equal(young.potentialAbility, potentialBefore);
  assert.equal(young.talentProfile.ceilings.pace, ceilingBefore);
});

test("development evidence and dynamic form survive save-world structured cloning", () => {
  const { save, systems } = initialized();
  dispatchSimulationEvents(save, [{
    type: RACE_EVENT.COMPLETED,
    date: "1980-03-01",
    payload: racePayload(),
  }], systems);
  const clone = structuredClone(save);
  assert.deepEqual(driverDevelopmentEvidence(clone, "YOUNG"), driverDevelopmentEvidence(save, "YOUNG"));
  assert.equal(clone.world.careerState.drivers.YOUNG.form, save.world.careerState.drivers.YOUNG.form);
});
