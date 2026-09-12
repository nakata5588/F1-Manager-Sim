import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceDays,
  createCareerLifecycleSystem,
  createEmploymentMarketSystem,
  createSaveWorld,
  createSeasonSnapshot,
  createTeamDevelopmentSystem,
  createTeamEconomySystem,
  initializeSimulation,
  TEAM_DEVELOPMENT_EVENT,
  TEAM_FINANCE_EVENT,
} from "../src/index.js";

function teamDatabase() {
  return {
    teams: [{ team_id: "TEAM1", team_name: "Team One", starting_budget: 1200000 }],
    teamBrands: [{ year: 1980, team_id: "TEAM1", team_name: "Team One" }],
    drivers: [{ driver_id: "D1", display_name: "Driver One", dob: "1955-01-01" }],
    driverRatings: [{ year: 1980, driver_id: "D1", current_ability: 75, potential_ability: 80 }],
    contracts: [{ year: 1980, team_id: "TEAM1", driver_id: "D1", role: "main_driver", salary: 120000, contract_until: 1982 }],
    staff: [{ staff_id: "S1", staff_name: "Engineer One", dob: "1945-01-01" }],
    staffRatings: [{ year: 1980, staff_id: "S1", current_ability: 75, technical: 80 }],
    staffContracts: [{ year: 1980, team_id: "TEAM1", staff_id: "S1", role: "technical_director", salary: 240000, contract_until: 1982 }],
    engines: [],
    teamEngines: [],
    carStats: [{
      year: 1980,
      team_id: "TEAM1",
      chassis_spec: 60,
      aero_spec: 50,
      gearbox_spec: 70,
      suspension_spec: 65,
      brakes_spec: 68,
      cooling_spec: 63,
    }],
    facilities: [{
      year: 1980,
      team_id: "TEAM1",
      maintenance_cost: 12000,
      wind_tunnel_level: 6,
      simulator_level: 5,
      aero_dept_level: 6,
      chassis_shop_level: 5,
      manufacturing_level: 6,
    }],
    sponsorContracts: [{
      team_id: "TEAM1",
      start_year: 1980,
      end_year: 1982,
      monthly_fee: 100000,
    }],
    financeLedger: [],
    teamFinancials: [],
    rdProjects: [],
    tracks: [],
    calendar: [],
    rules: [],
    qualifyingRules: [],
    eraSafety: [],
    accidentModel: [],
  };
}

function economySystems(extra = []) {
  return [
    createCareerLifecycleSystem(),
    createEmploymentMarketSystem(),
    createTeamEconomySystem(),
    ...extra,
  ];
}

test("season snapshot carries finance and sponsor inputs for active teams", () => {
  const snapshot = createSeasonSnapshot(teamDatabase(), 1980);
  assert.equal(snapshot.sponsorContracts.length, 1);
  assert.equal(snapshot.facilities.length, 1);
  assert.equal(snapshot.carStats.length, 1);
});

test("monthly team cashflow uses sponsors salaries and maintenance from the season package", () => {
  const save = createSaveWorld(createSeasonSnapshot(teamDatabase(), 1980), {
    seed: "finance-test",
    startDate: "1980-01-01",
  });
  const systems = economySystems();
  const init = initializeSimulation(save, systems);
  assert.ok(init.events.some((event) => event.type === TEAM_FINANCE_EVENT.INITIALIZED));
  assert.equal(save.world.teamState.TEAM1.cash, 1200000);

  const result = advanceDays(save, 31, systems);
  const month = result.events.find((event) => event.type === TEAM_FINANCE_EVENT.MONTH_CLOSED);
  assert.ok(month);
  assert.equal(month.date, "1980-02-01");
  assert.equal(month.payload.breakdown.sponsors, 100000);
  assert.equal(month.payload.breakdown.driverSalaries, 10000);
  assert.equal(month.payload.breakdown.staffSalaries, 20000);
  assert.equal(month.payload.breakdown.facilityMaintenance, 1000);
  assert.equal(month.payload.net, 69000);
  assert.equal(save.world.teamState.TEAM1.cash, 1269000);
});

test("AI development spends real cash and reaches the car only after design manufacture and fit", () => {
  const save = createSaveWorld(createSeasonSnapshot(teamDatabase(), 1980), {
    seed: "development-team-test",
    startDate: "1980-01-01",
  });
  const systems = economySystems([createTeamDevelopmentSystem({ projectDurationMonths: 1 })]);
  initializeSimulation(save, systems);
  const result = advanceDays(save, 120, systems);

  const starts = result.events.filter((event) => event.type === TEAM_DEVELOPMENT_EVENT.PROJECT_STARTED);
  const completions = result.events.filter((event) => event.type === TEAM_DEVELOPMENT_EVENT.PROJECT_COMPLETED);
  const manufacture = result.events.filter((event) => event.type === TEAM_DEVELOPMENT_EVENT.MANUFACTURING_COMPLETED);
  const fitted = result.events.filter((event) => event.type === TEAM_DEVELOPMENT_EVENT.COMPONENT_FITTED);
  assert.ok(starts.length >= 1);
  assert.ok(completions.length >= 1);
  assert.ok(manufacture.length >= 1);
  assert.ok(fitted.length >= 1);
  assert.equal(starts[0].payload.component, "aero_spec");
  assert.ok(save.world.carState.TEAM1.components.aero_spec > 50);
  assert.ok(save.history.technical.some((entry) => entry.type === "design_completed"));
  assert.ok(save.history.technical.some((entry) => entry.type === "manufacturing_completed"));
  assert.ok(save.history.technical.some((entry) => entry.type === "component_fitted"));
  assert.ok(save.world.teamState.TEAM1.cash < 1200000 + 69000 * 4);
});

test("AI does not start technical projects for a human-controlled team", () => {
  const save = createSaveWorld(createSeasonSnapshot(teamDatabase(), 1980), {
    seed: "controlled-team-test",
    startDate: "1980-01-01",
  });
  save.player = { controlledTeamIds: ["TEAM1"] };
  const systems = economySystems([
    createTeamDevelopmentSystem({ controlledTeamIds: ["TEAM1"], projectDurationMonths: 1 }),
  ]);
  initializeSimulation(save, systems);
  const result = advanceDays(save, 60, systems);
  assert.equal(result.events.some((event) => event.type === TEAM_DEVELOPMENT_EVENT.PROJECT_STARTED), false);
  assert.equal(save.world.technical.teams.TEAM1.designProjects.length, 0);
  assert.equal(save.world.carState.TEAM1.components.aero_spec, 50);
});
