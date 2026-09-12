import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceDays,
  advanceTechnicalMonth,
  createCareerLifecycleSystem,
  createEmploymentMarketSystem,
  createSaveWorld,
  createSeasonSnapshot,
  createTeamDevelopmentSystem,
  createTeamEconomySystem,
  deserializeSaveWorld,
  ensureTechnicalTeam,
  fitComponentSpec,
  initializeSimulation,
  releaseNextSeasonSpecifications,
  serializeSaveWorld,
  setResponsibility,
  startFacilityUpgrade,
  startManufacturingJob,
  startTechnicalDesignProject,
  technicalCarComponentsForDriver,
  technicalFacilityMaintenanceAnnual,
  technicalProjection,
} from "../src/index.js";

function database() {
  return {
    teams: [{ team_id: "T1", team_name: "Technical GP", starting_budget: 8_000_000 }],
    teamBrands: [{ year: 1980, team_id: "T1", team_name: "Technical GP" }],
    drivers: [
      { driver_id: "D1", display_name: "Driver One", dob: "1955-01-01" },
      { driver_id: "D2", display_name: "Driver Two", dob: "1954-01-01" },
    ],
    driverRatings: [
      { year: 1980, driver_id: "D1", current_ability: 75, potential_ability: 80, technical_feedback: 82, car_development_impact: 78 },
      { year: 1980, driver_id: "D2", current_ability: 75, potential_ability: 80, technical_feedback: 75, car_development_impact: 72 },
    ],
    contracts: [
      { year: 1980, team_id: "T1", driver_id: "D1", role: "main_driver", salary: 120000, contract_until: 1982 },
      { year: 1980, team_id: "T1", driver_id: "D2", role: "second_driver", salary: 100000, contract_until: 1982 },
    ],
    staff: [{ staff_id: "S1", staff_name: "Designer", dob: "1945-01-01" }],
    staffRatings: [{ year: 1980, staff_id: "S1", current_ability: 80, technical: 82, design: 84, aero: 86, engineering: 80 }],
    staffContracts: [{ year: 1980, team_id: "T1", staff_id: "S1", role: "technical_director", salary: 240000, contract_until: 1982 }],
    engines: [],
    teamEngines: [],
    carStats: [{ year: 1980, team_id: "T1", chassis_spec: 60, aero_spec: 50, gearbox_spec: 70, suspension_spec: 65, brakes_spec: 68, cooling_spec: 63 }],
    facilities: [{ year: 1980, team_id: "T1", maintenance_cost: 12000, wind_tunnel_level: 6, aero_dept_level: 6, chassis_shop_level: 5, manufacturing_level: 6 }],
    sponsorContracts: [], financeLedger: [], teamFinancials: [], rdProjects: [], tracks: [], calendar: [], rules: [], qualifyingRules: [], eraSafety: [], accidentModel: [],
    startingRaceEntries: [
      { driver_id: "D1", team_id: "T1", car_number: 1 },
      { driver_id: "D2", team_id: "T1", car_number: 2 },
    ],
  };
}

function systems(options = {}) {
  return [
    createCareerLifecycleSystem(),
    createEmploymentMarketSystem(),
    createTeamEconomySystem(),
    createTeamDevelopmentSystem(options),
  ];
}

function newSave(options = {}) {
  const save = createSaveWorld(createSeasonSnapshot(database(), 1980), { seed: options.seed ?? "technical-test", startDate: "1980-01-01" });
  if (options.controlledTeamIds?.length) save.player = { controlledTeamIds: [...options.controlledTeamIds] };
  initializeSimulation(save, systems(options.systemOptions));
  save.world.raceEntryState = {
    season: 1980,
    source: "test",
    revision: 1,
    current: [
      { driverId: "D1", teamId: "T1", carNumber: 1 },
      { driverId: "D2", teamId: "T1", carNumber: 2 },
    ],
  };
  return save;
}

test("technical initialization creates physical starting specifications without inventing spare stock", () => {
  const save = newSave();
  const technical = ensureTechnicalTeam(save, "T1");
  assert.equal(technical.specs["initial:T1:aero_spec"].source, "historical_start_input");
  assert.equal(technical.fittedCars.car1.components.aero_spec, "initial:T1:aero_spec");
  assert.equal(technical.fittedCars.car2.components.aero_spec, "initial:T1:aero_spec");
  assert.equal(technical.inventory["initial:T1:aero_spec"], undefined);
  assert.equal(technical.facilities.manufacturing.source, "historical_start_input");
});

test("design completion creates a specification but does not magically improve the fitted car", () => {
  const save = newSave();
  const openingCash = save.world.teamState.T1.cash;
  const project = startTechnicalDesignProject(save, "T1", { component: "aero_spec", focus: "performance", durationMonths: 1 });
  assert.ok(save.world.teamState.T1.cash < openingCash);
  assert.equal(save.world.carState.T1.components.aero_spec, 50);

  advanceTechnicalMonth(save, "1980-02-01");
  const team = ensureTechnicalTeam(save, "T1");
  const spec = team.specs[project.specId ?? team.designProjects[0].specId];
  assert.ok(spec);
  assert.equal(spec.status, "ready_for_manufacture");
  assert.ok(spec.rating > 50);
  assert.equal(save.world.carState.T1.components.aero_spec, 50);
});

test("manufacturing creates stock and fitting can give car 1 a newer component than car 2", () => {
  const save = newSave();
  startTechnicalDesignProject(save, "T1", { component: "aero_spec", durationMonths: 1 });
  advanceTechnicalMonth(save, "1980-02-01");
  const team = ensureTechnicalTeam(save, "T1");
  const spec = Object.values(team.specs).find((row) => row.source === "simulation_design");
  const job = startManufacturingJob(save, "T1", { specId: spec.specId, quantity: 1, durationMonths: 1 });
  advanceTechnicalMonth(save, "1980-03-01");
  assert.equal(team.manufacturingJobs.find((row) => row.jobId === job.jobId).status, "completed");
  assert.equal(team.inventory[spec.specId].available, 1);

  fitComponentSpec(save, "T1", { carSlot: "car1", specId: spec.specId });
  const car1 = technicalCarComponentsForDriver(save, "T1", "D1");
  const car2 = technicalCarComponentsForDriver(save, "T1", "D2");
  assert.ok(car1.aero_spec > car2.aero_spec);
  assert.equal(team.inventory[spec.specId].available, 0);
  assert.equal(team.inventory["initial:T1:aero_spec"].available, 1);
});

test("next-season research remains unavailable to manufacturing until its target season", () => {
  const save = newSave();
  startTechnicalDesignProject(save, "T1", { component: "chassis_spec", targetSeason: "next", durationMonths: 1 });
  advanceTechnicalMonth(save, "1980-02-01");
  const team = ensureTechnicalTeam(save, "T1");
  const spec = Object.values(team.specs).find((row) => row.source === "simulation_design");
  assert.equal(spec.targetSeason, 1981);
  assert.equal(spec.status, "future");
  assert.throws(() => startManufacturingJob(save, "T1", { specId: spec.specId }), /future-season/);
  const released = releaseNextSeasonSpecifications(save, 1981);
  assert.equal(released.length, 1);
  assert.equal(spec.status, "ready_for_manufacture");
});

test("facility upgrades take time and increase dynamic maintenance instead of mutating historical facility rows", () => {
  const save = newSave();
  const historicalLevel = save.world.facilities[0].manufacturing_level;
  const upgrade = startFacilityUpgrade(save, "T1", "manufacturing");
  const team = ensureTechnicalTeam(save, "T1");
  for (let index = 0; index < upgrade.durationMonths; index += 1) advanceTechnicalMonth(save, `1980-${String(index + 2).padStart(2, "0")}-01`);
  assert.equal(team.facilities.manufacturing.level, historicalLevel + 1);
  assert.equal(save.world.facilities[0].manufacturing_level, historicalLevel);
  assert.ok(technicalFacilityMaintenanceAnnual(save, "T1") > 0);
});

test("delegated car development uses the same design-manufacture-fit pipeline as AI teams", () => {
  const save = newSave({
    controlledTeamIds: ["T1"],
    systemOptions: { controlledTeamIds: ["T1"], projectDurationMonths: 1 },
  });
  setResponsibility(save, "T1", "carDevelopment", "delegated");
  const result = advanceDays(save, 200, systems({ controlledTeamIds: ["T1"], projectDurationMonths: 1 }));
  assert.ok(result.events.some((event) => event.type === "technical.design_started"));
  assert.ok(save.history.technical.some((row) => row.type === "design_completed"));
  assert.ok(save.history.technical.some((row) => row.type === "manufacturing_started"));
  assert.ok(save.history.technical.some((row) => row.type === "component_fitted"));
});

test("technical operations survive Save World serialization", () => {
  const save = newSave();
  startTechnicalDesignProject(save, "T1", { component: "aero_spec", durationMonths: 2 });
  const restored = deserializeSaveWorld(serializeSaveWorld(save));
  const projection = technicalProjection(restored, "T1");
  assert.equal(projection.design.active.length, 1);
  assert.equal(projection.design.active[0].component, "aero_spec");
  assert.equal(projection.facilities.find((row) => row.id === "manufacturing").level, 6);
});
