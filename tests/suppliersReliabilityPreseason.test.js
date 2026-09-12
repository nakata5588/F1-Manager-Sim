import test from "node:test";
import assert from "node:assert/strict";
import {
  PRESEASON_EVENT,
  RELIABILITY_EVENT,
  SIM_EVENT,
  SUPPLIER_EVENT,
  activeEngineForTeam,
  activeSupplierContract,
  activateSupplierSeason,
  applyRaceWear,
  createCareerLifecycleSystem,
  createEmploymentMarketSystem,
  createRaceStartBaseline,
  createSaveWorld,
  createSeasonRolloverSystem,
  createSeasonSnapshot,
  createTeamDevelopmentSystem,
  createTeamEconomySystem,
  createTechnicalReliabilitySystem,
  deserializeSaveWorld,
  dispatchSimulationEvents,
  ensureReliabilityTeam,
  fitComponentSpec,
  initializeSimulation,
  openSupplierNegotiation,
  reliabilityProjection,
  replaceWornComponent,
  runPreseasonTest,
  serializeSaveWorld,
  setResponsibility,
  submitSupplierOffer,
  technicalSupplierMonthlyCost,
} from "../src/index.js";

function database() {
  return {
    teams: [
      { team_id: "T1", team_name: "Player GP", starting_budget: 8_000_000, reputation: 72 },
      { team_id: "T2", team_name: "Rival GP", starting_budget: 8_000_000, reputation: 68 },
    ],
    teamBrands: [
      { year: 1980, team_id: "T1", team_name: "Player GP", reputation: 72 },
      { year: 1980, team_id: "T2", team_name: "Rival GP", reputation: 68 },
    ],
    drivers: [
      { driver_id: "D1", driver_name: "Driver One", dob: "1954-01-01" },
      { driver_id: "D2", driver_name: "Driver Two", dob: "1955-01-01" },
      { driver_id: "D3", driver_name: "Driver Three", dob: "1954-01-01" },
      { driver_id: "D4", driver_name: "Driver Four", dob: "1955-01-01" },
    ],
    driverRatings: [
      { year: 1980, driver_id: "D1", pace: 78, qualifying: 78, racecraft: 78, consistency: 75, technical_feedback: 82, adaptability: 78 },
      { year: 1980, driver_id: "D2", pace: 76, qualifying: 76, racecraft: 76, consistency: 74, technical_feedback: 76, adaptability: 75 },
      { year: 1980, driver_id: "D3", pace: 77, qualifying: 77, racecraft: 77, consistency: 75 },
      { year: 1980, driver_id: "D4", pace: 75, qualifying: 75, racecraft: 75, consistency: 74 },
    ],
    contracts: [
      { year: 1980, team_id: "T1", driver_id: "D1", role: "main_driver", contract_until: 1982 },
      { year: 1980, team_id: "T1", driver_id: "D2", role: "second_driver", contract_until: 1982 },
      { year: 1980, team_id: "T2", driver_id: "D3", role: "main_driver", contract_until: 1982 },
      { year: 1980, team_id: "T2", driver_id: "D4", role: "second_driver", contract_until: 1982 },
    ],
    staff: [{ staff_id: "S1", staff_name: "Engineer", dob: "1945-01-01" }],
    staffRatings: [{ year: 1980, staff_id: "S1", technical: 84, engineering: 82, data_analysis: 80, design: 83, reliability: 86 }],
    staffContracts: [{ year: 1980, team_id: "T1", staff_id: "S1", role: "technical_director", contract_until: 1982 }],
    engines: [
      { engine_id: "E1", engine_name: "Reliable V8", manufacturer: "Maker A", power: 72, reliability: 82 },
      { engine_id: "E2", engine_name: "Fast Turbo", manufacturer: "Maker B", power: 92, reliability: 68 },
    ],
    teamEngines: [
      { year: 1980, team_id: "T1", engine_id: "E1" },
      { year: 1980, team_id: "T2", engine_id: "E2" },
    ],
    carStats: [
      { year: 1980, team_id: "T1", chassis_spec: 72, aero_spec: 70, gearbox_spec: 74, suspension_spec: 72, brakes_spec: 74, cooling_spec: 73, electronics_spec: 72 },
      { year: 1980, team_id: "T2", chassis_spec: 71, aero_spec: 71, gearbox_spec: 73, suspension_spec: 71, brakes_spec: 73, cooling_spec: 72, electronics_spec: 72 },
    ],
    facilities: [
      { year: 1980, team_id: "T1", maintenance_cost: 12000, wind_tunnel_level: 6, simulator_level: 5, aero_dept_level: 6, chassis_shop_level: 6, manufacturing_level: 6 },
      { year: 1980, team_id: "T2", maintenance_cost: 12000, wind_tunnel_level: 6, simulator_level: 5, aero_dept_level: 6, chassis_shop_level: 6, manufacturing_level: 6 },
    ],
    calendar: [
      { year: 1980, round: 1, gp_id: "GP1", gp_name: "Opening GP", race_date: "1980-03-01", track_id: "TR1", laps: 60 },
    ],
    tracks: [{ track_id: "TR1", power_sensitivity: 70, aero_sensitivity: 50, overtaking_difficulty: 50 }],
    rules: [], qualifyingRules: [], eraSafety: [], accidentModel: [], sponsorContracts: [], financeLedger: [], teamFinancials: [], rdProjects: [],
    startingRaceEntries: [
      { driver_id: "D1", team_id: "T1", car_number: 1 },
      { driver_id: "D2", team_id: "T1", car_number: 2 },
      { driver_id: "D3", team_id: "T2", car_number: 3 },
      { driver_id: "D4", team_id: "T2", car_number: 4 },
    ],
  };
}

function systems(options = {}) {
  return [
    createCareerLifecycleSystem(),
    createEmploymentMarketSystem(),
    createTeamEconomySystem(),
    createTeamDevelopmentSystem({ controlledTeamIds: options.controlledTeamIds ?? ["T1"] }),
    createSeasonRolloverSystem(),
    createTechnicalReliabilitySystem({ controlledTeamIds: options.controlledTeamIds ?? ["T1"] }),
  ];
}

function newSave(options = {}) {
  const save = createSaveWorld(createSeasonSnapshot(database(), 1980), {
    seed: options.seed ?? "phase37-test",
    startDate: options.startDate ?? "1980-01-01",
    createdAt: "1980-01-01T00:00:00Z",
  });
  save.player = { controlledTeamIds: options.controlledTeamIds ?? ["T1"] };
  initializeSimulation(save, systems(options));
  save.world.raceEntryState = {
    season: 1980,
    source: "test",
    revision: 1,
    current: [
      { driverId: "D1", teamId: "T1", carNumber: 1 },
      { driverId: "D2", teamId: "T1", carNumber: 2 },
      { driverId: "D3", teamId: "T2", carNumber: 3 },
      { driverId: "D4", teamId: "T2", carNumber: 4 },
    ],
  };
  ensureReliabilityTeam(save, "T1");
  ensureReliabilityTeam(save, "T2");
  return save;
}

function weekend() {
  return {
    key: "1980:GP1",
    grid: [
      { driverId: "D1", teamId: "T1", grid: 1, qualifyingScore: 78 },
      { driverId: "D2", teamId: "T1", grid: 2, qualifyingScore: 76 },
    ],
    practice: { results: [{ driverId: "D1", setupQuality: 70 }, { driverId: "D2", setupQuality: 70 }] },
  };
}

test("historical engine assignment seeds the active supplier without inventing a monetary contract", () => {
  const save = newSave();
  const active = activeSupplierContract(save, "T1");
  assert.equal(active.engineId, "E1");
  assert.equal(active.source, "historical_season_assignment");
  assert.equal(active.annualValueMode, "abstract_index");
  assert.equal(active.annualValue, null);
  assert.equal(technicalSupplierMonthlyCost(save, "T1"), 0);
});

test("future supplier agreement does not swap the engine early and activates at the target season", () => {
  const save = newSave();
  const before = createRaceStartBaseline(save, weekend()).find((row) => row.driverId === "D1");
  const negotiation = openSupplierNegotiation(save, "T1", "E2", { source: "player" });
  const result = submitSupplierOffer(save, "T1", negotiation.negotiationId, {
    annualValue: negotiation.expectedTerms.annualValue * 1.25,
    durationYears: 2,
  });
  assert.equal(result.status, "accepted");
  assert.equal(activeEngineForTeam(save, "T1").engine_id, "E1");
  assert.equal(save.world.technical.suppliers.teams.T1.futureDeal.engineId, "E2");

  save.clock.season = 1981;
  save.clock.date = "1981-01-01";
  const events = activateSupplierSeason(save, 1981, save.clock.date);
  ensureReliabilityTeam(save, "T1", save.clock.date);
  assert.equal(events[0].type, SUPPLIER_EVENT.CONTRACT_ACTIVATED);
  assert.equal(activeEngineForTeam(save, "T1").engine_id, "E2");
  assert.equal(save.world.technical.suppliers.teams.T1.futureDeal, null);
  const after = createRaceStartBaseline(save, weekend()).find((row) => row.driverId === "D1");
  assert.ok(after.performanceIndex > before.performanceIndex);
});

test("worn engine and components reduce both effective reliability and race-start performance", () => {
  const save = newSave();
  const before = createRaceStartBaseline(save, weekend()).find((row) => row.driverId === "D1");
  const state = save.world.technical.teams.T1.reliability.cars.car1;
  state.engine.condition = 18;
  for (const unit of Object.values(state.components)) unit.condition = 35;
  const after = createRaceStartBaseline(save, weekend()).find((row) => row.driverId === "D1");
  assert.ok(after.reliability < before.reliability);
  assert.ok(after.performanceIndex < before.performanceIndex);
});

test("race wear persists and a mechanical DNF marks one physical subsystem failed", () => {
  const save = newSave();
  const before = reliabilityProjection(save, "T1").cars.car1.condition.overall;
  const result = applyRaceWear(save, {
    key: "1980:GP1",
    classification: [
      { driverId: "D1", teamId: "T1", status: "DNF", reason: "mechanical", completedLaps: 38 },
      { driverId: "D2", teamId: "T1", status: "FINISHED", reason: null, completedLaps: null },
    ],
  }, "1980-03-01");
  const after = reliabilityProjection(save, "T1").cars.car1.condition.overall;
  assert.ok(after < before);
  assert.equal(result.failures.length, 1);
  const failed = result.failures[0];
  const car = save.world.technical.teams.T1.reliability.cars[failed.carSlot];
  const unit = failed.component === "engine" ? car.engine : car.components[failed.component];
  assert.equal(unit.failed, true);
  assert.equal(unit.condition, 0);
});

test("replacing a worn component consumes a matching manufactured spare and restores serviceable condition", () => {
  const save = newSave();
  const team = save.world.technical.teams.T1;
  const unit = team.reliability.cars.car1.components.aero_spec;
  unit.condition = 28;
  team.inventory[unit.specId] = { specId: unit.specId, available: 1 };
  const result = replaceWornComponent(save, "T1", { carSlot: "car1", component: "aero_spec" });
  assert.equal(result.inventoryRemaining, 0);
  assert.equal(team.inventory[unit.specId].available, 0);
  assert.equal(team.reliability.cars.car1.components.aero_spec.condition, 100);
  assert.equal(team.reliability.cars.car1.components.aero_spec.failed, false);
});

test("fitting a new specification does not turn a worn returned unit into fresh spare inventory", () => {
  const save = newSave();
  const team = save.world.technical.teams.T1;
  const oldSpecId = team.fittedCars.car1.components.aero_spec;
  team.reliability.cars.car1.components.aero_spec.condition = 30;
  const newSpecId = "spec:T1:new-aero";
  team.specs[newSpecId] = { specId: newSpecId, teamId: "T1", component: "aero_spec", rating: 80, gain: 10, targetSeason: 1980, status: "ready_for_manufacture", source: "test" };
  team.inventory[newSpecId] = { specId: newSpecId, available: 1 };

  const fitted = fitComponentSpec(save, "T1", { carSlot: "car1", specId: newSpecId });
  assert.equal(team.inventory[oldSpecId].available, 1);
  dispatchSimulationEvents(save, [{
    type: "technical.component_fitted",
    date: save.clock.date,
    payload: { team_id: "T1", car_slot: fitted.carSlot, component: fitted.component, spec_id: fitted.specId, previous_spec_id: fitted.previousSpecId, source: "player" },
  }], [createTechnicalReliabilitySystem({ controlledTeamIds: ["T1"] })]);

  assert.equal(team.inventory[oldSpecId].available, 0);
  assert.equal(team.reliability.cars.car1.components.aero_spec.specId, newSpecId);
  assert.equal(team.reliability.cars.car1.components.aero_spec.condition, 100);
});

test("preseason testing spends real cash, builds preparation and closes after the first race date", () => {
  const save = newSave();
  const openingCash = save.world.teamState.T1.cash;
  const first = runPreseasonTest(save, "T1", { focus: "reliability", source: "player" });
  assert.equal(first.session, 1);
  assert.ok(first.reliabilityPrepGain > 0);
  assert.ok(save.world.teamState.T1.cash < openingCash);
  runPreseasonTest(save, "T1", { focus: "development", source: "player" });
  runPreseasonTest(save, "T1", { focus: "balanced", source: "player" });
  assert.throws(() => runPreseasonTest(save, "T1", { focus: "balanced" }), /already been used/);

  const fresh = newSave();
  fresh.clock.date = "1980-03-02";
  assert.throws(() => runPreseasonTest(fresh, "T1", { focus: "balanced" }), /closed/);
});

test("negotiated supplier money becomes a monthly team-economy expense after activation", () => {
  const save = newSave();
  const negotiation = openSupplierNegotiation(save, "T1", "E2", { source: "player" });
  const result = submitSupplierOffer(save, "T1", negotiation.negotiationId, { annualValue: negotiation.expectedTerms.annualValue * 1.25, durationYears: 2 });
  assert.equal(result.status, "accepted");
  save.clock.season = 1981;
  save.clock.date = "1981-01-01";
  activateSupplierSeason(save, 1981, save.clock.date);
  const monthly = technicalSupplierMonthlyCost(save, "T1");
  assert.ok(monthly > 0);

  dispatchSimulationEvents(save, [{ type: SIM_EVENT.MONTH_STARTED, date: "1981-02-01", payload: { year: 1981, month: 2 } }], [createTeamEconomySystem()]);
  const close = [...save.history.finances].reverse().find((row) => row.type === "monthly_close" && row.teamId === "T1");
  assert.equal(close.breakdown.engineSupplier, monthly);
});

test("delegated Car Development uses the same preseason rules as AI teams", () => {
  const save = newSave();
  setResponsibility(save, "T1", "carDevelopment", "delegated");
  const system = createTechnicalReliabilitySystem({ controlledTeamIds: ["T1"] });
  const before = save.world.technical.teams.T1.preseason.sessionsCompleted;
  const output = system.handle({ saveWorld: save, event: { type: SIM_EVENT.MONTH_STARTED, date: "1980-02-01", payload: { year: 1980, month: 2 } } }) ?? [];
  const after = save.world.technical.teams.T1.preseason.sessionsCompleted;
  assert.ok(after > before);
  assert.ok(output.some((event) => event.type === PRESEASON_EVENT.TEST_COMPLETED && event.payload.source === "delegated"));
});

test("Phase 37 supplier reliability and preseason state survives Save World serialization", () => {
  const save = newSave();
  runPreseasonTest(save, "T1", { focus: "reliability" });
  applyRaceWear(save, { key: "1980:GP1", classification: [{ driverId: "D1", teamId: "T1", status: "FINISHED" }, { driverId: "D2", teamId: "T1", status: "FINISHED" }] }, "1980-03-01");
  const restored = deserializeSaveWorld(serializeSaveWorld(save));
  assert.equal(restored.world.technical.teams.T1.preseason.sessionsCompleted, save.world.technical.teams.T1.preseason.sessionsCompleted);
  assert.equal(restored.world.technical.teams.T1.reliability.cars.car1.engine.condition, save.world.technical.teams.T1.reliability.cars.car1.engine.condition);
  assert.equal(restored.world.technical.suppliers.teams.T1.active.engineId, "E1");
});
