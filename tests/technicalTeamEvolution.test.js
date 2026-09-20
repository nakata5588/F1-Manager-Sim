import test from "node:test";
import assert from "node:assert/strict";

import {
  advanceTechnicalMonth,
  applyTechnicalEvolutionSeasonTransition,
  createCareerLifecycleSystem,
  createEmploymentMarketSystem,
  createSaveWorld,
  createSeasonSnapshot,
  createTeamDevelopmentSystem,
  createTeamEconomySystem,
  deserializeSaveWorld,
  ensureTechnicalIdentity,
  initializeRegulationState,
  initializeSimulation,
  rankTechnicalDevelopmentCandidates,
  recordTechnicalProjectCompletion,
  serializeSaveWorld,
  startManufacturingJob,
  startTechnicalDesignProject,
  technicalDevelopmentModifier,
  technicalIdentityProjection,
} from "../src/index.js";

function database() {
  return {
    teams: [
      { team_id: "T1", team_name: "Aero Works", starting_budget: 8_000_000 },
      { team_id: "T2", team_name: "Chassis Works", starting_budget: 8_000_000 },
    ],
    teamBrands: [
      { year: 1980, team_id: "T1", team_name: "Aero Works" },
      { year: 1980, team_id: "T2", team_name: "Chassis Works" },
    ],
    drivers: [
      { driver_id: "D1", display_name: "Driver One", dob: "1950-01-01" },
      { driver_id: "D2", display_name: "Driver Two", dob: "1951-01-01" },
      { driver_id: "D3", display_name: "Driver Three", dob: "1952-01-01" },
      { driver_id: "D4", display_name: "Driver Four", dob: "1953-01-01" },
    ],
    driverRatings: [
      { year: 1980, driver_id: "D1", technical_feedback: 75, car_development_impact: 75, adaptability: 70 },
      { year: 1980, driver_id: "D2", technical_feedback: 72, car_development_impact: 72, adaptability: 70 },
      { year: 1980, driver_id: "D3", technical_feedback: 75, car_development_impact: 75, adaptability: 70 },
      { year: 1980, driver_id: "D4", technical_feedback: 72, car_development_impact: 72, adaptability: 70 },
    ],
    contracts: [
      { year: 1980, team_id: "T1", driver_id: "D1", role: "main_driver", contract_until: 1982 },
      { year: 1980, team_id: "T1", driver_id: "D2", role: "second_driver", contract_until: 1982 },
      { year: 1980, team_id: "T2", driver_id: "D3", role: "main_driver", contract_until: 1982 },
      { year: 1980, team_id: "T2", driver_id: "D4", role: "second_driver", contract_until: 1982 },
    ],
    staff: [
      { staff_id: "S1", staff_name: "Aero Chief", dob: "1935-01-01" },
      { staff_id: "S2", staff_name: "Chassis Chief", dob: "1936-01-01" },
    ],
    staffRatings: [
      { year: 1980, staff_id: "S1", technical: 80, design: 82, aero: 85, engineering: 78 },
      { year: 1980, staff_id: "S2", technical: 80, design: 82, aero: 65, engineering: 84 },
    ],
    staffContracts: [
      { year: 1980, team_id: "T1", staff_id: "S1", role: "technical_director", contract_until: 1983 },
      { year: 1980, team_id: "T2", staff_id: "S2", role: "technical_director", contract_until: 1983 },
    ],
    carStats: [
      {
        year: 1980, team_id: "T1",
        aero_spec: 82, chassis_spec: 56, suspension_spec: 58,
        gearbox_spec: 62, brakes_spec: 61, cooling_spec: 60,
      },
      {
        year: 1980, team_id: "T2",
        aero_spec: 55, chassis_spec: 82, suspension_spec: 80,
        gearbox_spec: 62, brakes_spec: 61, cooling_spec: 60,
      },
    ],
    facilities: [
      { year: 1980, team_id: "T1", wind_tunnel_level: 7, aero_dept_level: 7, chassis_shop_level: 5, manufacturing_level: 6 },
      { year: 1980, team_id: "T2", wind_tunnel_level: 5, aero_dept_level: 5, chassis_shop_level: 7, manufacturing_level: 6 },
    ],
    engines: [],
    teamEngines: [],
    sponsorContracts: [],
    financeLedger: [],
    teamFinancials: [],
    rdProjects: [],
    tracks: [],
    calendar: [],
    rules: [],
    qualifyingRules: [],
    eraSafety: [],
    accidentModel: [],
    startingRaceEntries: [
      { driver_id: "D1", team_id: "T1", car_number: 1 },
      { driver_id: "D2", team_id: "T1", car_number: 2 },
      { driver_id: "D3", team_id: "T2", car_number: 3 },
      { driver_id: "D4", team_id: "T2", car_number: 4 },
    ],
  };
}

function systems() {
  return [
    createCareerLifecycleSystem(),
    createEmploymentMarketSystem(),
    createTeamEconomySystem(),
    createTeamDevelopmentSystem({ projectDurationMonths: 1 }),
  ];
}

function newSave() {
  const save = createSaveWorld(createSeasonSnapshot(database(), 1980), {
    seed: "technical-evolution",
    startDate: "1980-01-01",
  });
  initializeSimulation(save, systems());
  initializeRegulationState(save);
  return save;
}

test("technical identity derives different opening concepts from relative car strengths", () => {
  const save = newSave();
  const aero = technicalIdentityProjection(save, "T1");
  const chassis = technicalIdentityProjection(save, "T2");

  assert.equal(aero.concept, "aero_led");
  assert.equal(chassis.concept, "chassis_led");
  assert.ok(aero.disciplines.find((row) => row.id === "aero").experienceIndex > 100);
  assert.ok(chassis.disciplines.find((row) => row.id === "chassis").experienceIndex > 100);
  assert.equal(aero.provenance, "derived_gameplay_technical_identity");
});

test("completed projects build persistent discipline familiarity without rewriting historical car data", () => {
  const save = newSave();
  const sourceCar = structuredClone(save.world.carStats.find((row) => row.team_id === "T1"));
  const before = ensureTechnicalIdentity(save, "T1").disciplines.aero.familiarity;

  const project = startTechnicalDesignProject(save, "T1", {
    component: "aero_spec",
    focus: "performance",
    durationMonths: 1,
  });
  advanceTechnicalMonth(save, "1980-02-01");

  const after = ensureTechnicalIdentity(save, "T1");
  assert.equal(after.totalCompletedProjects, 1);
  assert.equal(after.disciplines.aero.completedProjects, 1);
  assert.ok(after.disciplines.aero.familiarity > before);
  assert.equal(after.lastProjectAt, "1980-01-01");
  assert.ok(save.history.technicalEvolution.some((row) => row.type === "project_learning" && row.projectId === project.projectId));
  assert.deepEqual(save.world.carStats.find((row) => row.team_id === "T1"), sourceCar);
});

test("technical development modifier combines team familiarity with enacted regulation efficiency", () => {
  const save = newSave();
  save.world.governance.regulations.currentPackage.technical.developmentEfficiencyModifier = 0.8;

  const result = technicalDevelopmentModifier(save, "T1", "aero_spec", "performance");
  assert.equal(result.discipline, "aero");
  assert.ok(result.identityModifier > 1);
  assert.equal(result.regulationModifier, 0.8);
  assert.ok(result.totalModifier < 1);
});

test("technical regulation carry-over compresses accumulated know-how without erasing team identity", () => {
  const save = newSave();
  const identity = ensureTechnicalIdentity(save, "T1");

  for (let index = 0; index < 4; index += 1) {
    recordTechnicalProjectCompletion(save, "T1", {
      projectId: `manual:${index}`,
      component: "aero_spec",
      focus: "performance",
    }, 2);
  }
  const before = identity.disciplines.aero.familiarity;
  save.world.governance.regulations.currentPackage.technical.carryoverRetention = 0.5;

  const transitioned = applyTechnicalEvolutionSeasonTransition(save, 1981);
  const after = identity.disciplines.aero.familiarity;

  assert.equal(transitioned.length, 2);
  assert.equal(identity.currentSeason, 1981);
  assert.ok(after < before);
  assert.ok(after > 1);
  assert.ok(Math.abs(after - (1 + (before - 1) * 0.5)) < 0.002);
  assert.equal(identity.seasonTransitions.at(-1).carryoverRetention, 0.5);
});

test("AI development ranking balances weakness with learned technical identity", () => {
  const save = newSave();
  const ranked = rankTechnicalDevelopmentCandidates(save, "T1", {
    aero_spec: 60,
    chassis_spec: 60,
    gearbox_spec: 60,
  }, "performance");

  assert.equal(ranked[0].component, "aero_spec");
  assert.equal(ranked[0].discipline, "aero");
  assert.ok(ranked[0].familiarity > ranked.find((row) => row.component === "chassis_spec").familiarity);
});

test("manufacturing cost regulations now affect the real technical manufacturing pipeline", () => {
  const save = newSave();
  save.world.governance.regulations.currentPackage.technical.manufacturingCostModifier = 1.25;

  startTechnicalDesignProject(save, "T1", {
    component: "aero_spec",
    focus: "balanced",
    durationMonths: 1,
  });
  advanceTechnicalMonth(save, "1980-02-01");
  const team = save.world.technical.teams.T1;
  const spec = Object.values(team.specs).find((row) => row.source === "simulation_design");
  const job = startManufacturingJob(save, "T1", { specId: spec.specId, quantity: 1 });

  assert.equal(job.regulationCostModifier, 1.25);
  assert.ok(job.unitCost >= Math.round((12000 + spec.rating * 420) * 1.25) - 2);
});

test("technical identity and learning history survive Save World serialization", () => {
  const save = newSave();
  recordTechnicalProjectCompletion(save, "T1", {
    projectId: "persist:1",
    component: "aero_spec",
    focus: "performance",
  }, 1.5);

  const before = technicalIdentityProjection(save, "T1");
  const restored = deserializeSaveWorld(serializeSaveWorld(save));
  const after = technicalIdentityProjection(restored, "T1");

  assert.deepEqual(after, before);
  assert.ok(restored.history.technicalEvolution.some((row) => row.projectId === "persist:1"));
});
