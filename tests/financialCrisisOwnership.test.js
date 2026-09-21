import test from "node:test";
import assert from "node:assert/strict";

import {
  assessFinancialCommitment,
  assessFinancialCrisisMonth,
  arrangeBridgeFinance,
  attemptOwnerFunding,
  attemptOwnershipRescue,
  createFinancialCrisisSystem,
  createGovernanceManagementSystem,
  createTeamEconomySystem,
  createTeamExitCleanupSystem,
  dispatchSimulationEvents,
  ensureFinancialCrisisTeam,
  financialCrisisProjection,
  initializeFinancialCrisisWorld,
  initializeRegulationState,
  initializeSimulation,
  initializeTeamEvolutionState,
  monthlyCrisisDebtService,
  setFinancialCrisisCostFreeze,
  submitFinancialCrisisResponse,
  SIM_EVENT,
} from "../src/index.js";

function world({ teamCount = 11, controlled = true } = {}) {
  const teams = Array.from({ length: teamCount }, (_, index) => ({
    team_id: `T${index + 1}`,
    team_name: `Team ${index + 1}`,
    reputation: index === 0 ? 60 : 45,
  }));
  const teamState = Object.fromEntries(teams.map((team, index) => [team.team_id, {
    cash: index === 0 ? 1_000_000 : 750_000,
    openingCash: index === 0 ? 1_000_000 : 750_000,
    reputation: team.reputation,
    financialStatus: "stable",
    monthlyIncome: 0,
    monthlyExpenses: 0,
    monthlyNet: 0,
    projectedMonthlyIncome: 100_000,
    projectedMonthlyExpenses: 80_000,
    lastIncomeBreakdown: {},
    lastExpenseBreakdown: {},
  }]));

  return {
    meta: { seed: "stage-19-financial-crisis", sourceSeason: 1980 },
    clock: { date: "1980-01-01", season: 1980, day: 1 },
    player: {
      controlledTeamIds: controlled ? ["T1"] : [],
      manager: { name: "Test Manager" },
    },
    simulation: { nextEventSequence: 0, systemState: {} },
    history: {
      finances: [],
      governance: [],
      teamEvolution: [],
      financialCrises: [],
      ownership: [],
      transfers: [],
      retirements: [],
    },
    world: {
      season: 1980,
      rules: {},
      teams,
      teamState,
      teamBrands: teams.map((team) => ({ year: 1980, team_id: team.team_id, team_name: team.team_name })),
      teamFinancials: [],
      financeModels: [],
      sponsorContracts: [],
      contracts: [{ driver_id: "D1", team_id: "T1", role: "main_driver", contract_start: 1980, contract_until: 1982 }],
      staffContracts: [],
      drivers: [{ driver_id: "D1", driver_name: "Driver One" }],
      staff: [],
      employment: {
        drivers: { D1: { teamId: "T1", role: "main_driver", status: "employed", contractStart: 1980, contractUntil: 1982 } },
        staff: {},
        futureAssignments: { drivers: {}, staff: {} },
        freeAgents: { drivers: [], staff: [] },
        vacancies: [],
      },
      facilities: [],
      technical: { teams: {}, suppliers: { teams: {} } },
      governance: {},
    },
  };
}

test("persistent cash pressure escalates through warning into a spending freeze", () => {
  const save = world();
  initializeRegulationState(save);
  initializeFinancialCrisisWorld(save);
  save.world.teamState.T1.cash = -250_000;
  save.world.teamState.T1.projectedMonthlyIncome = 20_000;
  save.world.teamState.T1.projectedMonthlyExpenses = 100_000;

  const first = assessFinancialCrisisMonth(save, "T1", "1980-02-01");
  const second = assessFinancialCrisisMonth(save, "T1", "1980-03-01");

  assert.equal(first.after, "warning");
  assert.equal(second.after, "spending_freeze");
  assert.equal(financialCrisisProjection(save, "T1").spendingFreeze, true);

  save.world.teamState.T1.cash = 1_000_000;
  const discretionary = assessFinancialCommitment(save, "T1", { amount: 10_000, kind: "facility_upgrade" });
  const essential = assessFinancialCommitment(save, "T1", { amount: 10_000, kind: "reliability", allowReserveBreach: true });
  assert.equal(discretionary.allowed, false);
  assert.equal(discretionary.reason, "financial_crisis_spending_freeze");
  assert.equal(essential.allowed, true);
});

test("owner support injects Save World capital without rewriting team historical identity", () => {
  const save = world();
  initializeFinancialCrisisWorld(save);
  const originalTeam = structuredClone(save.world.teams[0]);
  save.world.teamState.T1.cash = -500_000;

  const result = attemptOwnerFunding(save, "T1", { force: true, date: "1980-06-01", source: "test" });

  assert.equal(result.approved, true);
  assert.ok(result.amount > 0);
  assert.ok(save.world.teamState.T1.cash > -500_000);
  assert.ok(save.world.financialCrisis.teams.T1.owner.supportUsed > 0);
  assert.ok(save.history.financialCrises.some((row) => row.type === "owner_funding"));
  assert.deepEqual(save.world.teams[0], originalTeam, "crisis funding must not mutate the historical team profile");
});

test("bridge finance creates explicit debt and Team Economy services it through monthly cashflow", () => {
  const save = world();
  initializeFinancialCrisisWorld(save);
  save.world.teamState.T1.cash = -300_000;
  const crisis = ensureFinancialCrisisTeam(save, "T1");
  crisis.stage = "emergency";

  const bridge = arrangeBridgeFinance(save, "T1", { date: "1980-07-01", source: "test" });
  assert.equal(bridge.approved, true);
  assert.ok(crisis.debtPrincipal > 0);
  const debtBefore = crisis.debtPrincipal;
  const expectedService = monthlyCrisisDebtService(save, "T1");
  assert.ok(expectedService.total > 0);

  const systems = [createTeamEconomySystem()];
  const events = dispatchSimulationEvents(save, [{
    type: SIM_EVENT.MONTH_STARTED,
    date: "1980-08-01",
    payload: { year: 1980, month: 8 },
  }], systems);
  const close = events.find((event) => event.type === "team.finance_month_closed" && event.payload.teamId === "T1");

  assert.ok(close);
  assert.equal(close.payload.breakdown.crisisDebtService, expectedService.total);
  assert.ok(save.world.financialCrisis.teams.T1.debtPrincipal < debtBefore);
});

test("ownership rescue recapitalises the same stable team identity", () => {
  const save = world();
  initializeFinancialCrisisWorld(save);
  const originalId = save.world.teams[0].team_id;
  const originalOwner = ensureFinancialCrisisTeam(save, "T1").owner.ownershipId;
  save.world.teamState.T1.cash = -1_500_000;
  const crisis = ensureFinancialCrisisTeam(save, "T1");
  crisis.stage = "administration";
  crisis.saleMandate = true;

  const result = attemptOwnershipRescue(save, "T1", { force: true, date: "1980-09-01", source: "test" });

  assert.equal(result.acquired, true);
  assert.equal(save.world.teams[0].team_id, originalId);
  assert.notEqual(crisis.owner.ownershipId, originalOwner);
  assert.ok(result.capitalInjection > 0);
  assert.equal(save.history.ownership.length, 1);
  assert.equal(save.history.ownership[0].teamId, "T1");
  assert.equal(save.world.teams.some((row) => row.team_id === "T1"), true);
});

test("new ownership can commit temporary operating support through the normal Team Economy ledger", () => {
  const save = world();
  initializeFinancialCrisisWorld(save);
  save.world.teamState.T1.cash = -1_000_000;
  save.world.teamState.T1.projectedMonthlyIncome = 25_000;
  save.world.teamState.T1.projectedMonthlyExpenses = 225_000;
  const crisis = ensureFinancialCrisisTeam(save, "T1");
  crisis.stage = "administration";
  crisis.saleMandate = true;

  const rescue = attemptOwnershipRescue(save, "T1", { force: true, date: "1980-09-01", source: "test" });
  assert.equal(rescue.acquired, true);
  assert.ok(crisis.ownerOperatingGuarantee?.monthlyAmount > 0);
  assert.equal(crisis.ownerOperatingGuarantee?.monthsRemaining, 36);

  const systems = [createTeamEconomySystem()];
  const events = dispatchSimulationEvents(save, [{
    type: SIM_EVENT.MONTH_STARTED,
    date: "1980-10-01",
    payload: { year: 1980, month: 10 },
  }], systems);
  const close = events.find((event) => event.type === "team.finance_month_closed" && event.payload.teamId === "T1");

  assert.ok(close);
  assert.ok(close.payload.breakdown.ownerOperatingSupport > 0);
  assert.equal(crisis.ownerOperatingGuarantee.monthsRemaining, 35);
  assert.ok(crisis.ownerOperatingGuarantee.paidToDate > 0);
});

test("controlled team can withdraw in administration and manager career continues unemployed", () => {
  const save = world({ teamCount: 11, controlled: true });
  initializeRegulationState(save);
  initializeTeamEvolutionState(save);
  initializeFinancialCrisisWorld(save);
  const crisis = ensureFinancialCrisisTeam(save, "T1");
  crisis.stage = "administration";
  crisis.spendingFreeze = true;

  const systems = [createFinancialCrisisSystem({ controlledTeamIds: ["T1"] }), createTeamExitCleanupSystem()];
  const events = dispatchSimulationEvents(save, [
    submitFinancialCrisisResponse(save, "T1", "voluntary_withdrawal", { date: "1980-10-01", source: "player_decision" }),
  ], systems);

  assert.equal(save.world.teams.some((row) => row.team_id === "T1"), false);
  assert.equal(save.world.inactiveTeams.some((row) => row.team_id === "T1"), true);
  assert.equal(save.player.controlledTeamIds.length, 0);
  assert.equal(save.player.manager.career.status, "unemployed");
  assert.equal(save.player.manager.career.currentTeamId, null);
  assert.ok(save.world.employment.freeAgents.drivers.includes("D1"));
  assert.ok(save.world.financialCrisis.inactiveTeams.T1);
  assert.equal(save.world.financialCrisis.teams.T1, undefined);
  assert.ok(events.some((event) => event.type === "team_evolution.team_exited"));
});

test("minimum-grid protection blocks a crisis withdrawal", () => {
  const save = world({ teamCount: 10, controlled: true });
  initializeRegulationState(save);
  initializeTeamEvolutionState(save);
  initializeFinancialCrisisWorld(save);
  const crisis = ensureFinancialCrisisTeam(save, "T1");
  crisis.stage = "emergency";

  const system = createFinancialCrisisSystem({ controlledTeamIds: ["T1"] });
  const events = dispatchSimulationEvents(save, [
    submitFinancialCrisisResponse(save, "T1", "voluntary_withdrawal", { date: "1980-10-01", source: "player_decision" }),
  ], [system]);

  assert.equal(save.world.teams.some((row) => row.team_id === "T1"), true);
  assert.ok(events.some((event) => event.type === "financial_crisis.withdrawal_blocked"));
  assert.equal(save.player.controlledTeamIds[0], "T1");
});

test("governance no longer removes a team through the old annual distress roulette", () => {
  const save = world({ teamCount: 11, controlled: false });
  initializeRegulationState(save);
  initializeTeamEvolutionState(save);
  save.world.teamState.T1.cash = -500_000;
  save.world.teamState.T1.financialStatus = "distressed";
  save.world.governance.teamEvolution.active.T1.distressSeasons = 3;

  const system = createGovernanceManagementSystem();
  const events = system.handle({
    saveWorld: save,
    event: { type: SIM_EVENT.SEASON_STARTED, date: "1980-01-01", payload: { previousSeason: 1979, season: 1980 } },
  }) ?? [];

  assert.equal(save.world.teams.some((row) => row.team_id === "T1"), true);
  assert.equal(events.some((event) => event.type === "team_evolution.team_exited"), false);
  assert.equal(save.world.governance.teamEvolution.active.T1.distressSeasons, 4);
});

test("newly activated teams can receive a financial-crisis ownership state immediately", () => {
  const save = world();
  initializeFinancialCrisisWorld(save);
  save.world.teams.push({ team_id: "NEW", team_name: "New Team", reputation: 40 });
  save.world.teamState.NEW = {
    cash: 500_000,
    openingCash: 500_000,
    reputation: 40,
    financialStatus: "stable",
    projectedMonthlyIncome: 50_000,
    projectedMonthlyExpenses: 45_000,
  };

  const system = createFinancialCrisisSystem();
  system.handle({
    saveWorld: save,
    event: { type: "team_evolution.entry_accepted", date: "1981-01-01", payload: { team_id: "NEW", activated: true } },
  });

  assert.ok(save.world.financialCrisis.teams.NEW);
  assert.equal(save.world.financialCrisis.teams.NEW.owner.source, "derived_gameplay_ownership_profile");
});
