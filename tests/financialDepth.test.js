import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  assessFinancialCommitment,
  createTeamEconomySystem,
  deserializeSaveWorld,
  dispatchSimulationEvents,
  financialPlanningProjection,
  initializeSimulation,
  serializeSaveWorld,
  setFinancialStrategy,
  SIM_EVENT,
} from "../src/index.js";

function economyWorld() {
  return {
    meta: { seed: "stage-17-finance" },
    clock: { date: "1980-01-01", season: 1980 },
    world: {
      season: 1980,
      teams: [{ team_id: "T1", team_name: "Finance GP" }],
      teamBrands: [{ year: 1980, team_id: "T1", team_name: "Finance GP" }],
      teamFinancials: [{ team_id: "T1", cash_balance: 1_000_000 }],
      financeModels: [{
        team_id: "T1",
        estimated_monthly_operating_burn_units: 200_000,
        estimated_sponsor_income_units: 1_200_000,
        cost_control_aggression: 50,
        data_status: "gameplay_design_estimate",
      }],
      sponsorContracts: [{
        team_id: "T1",
        start_year: 1980,
        end_year: 1980,
        annual_value: 1_200_000,
      }],
      contracts: [{
        driver_id: "D1",
        team_id: "T1",
        contract_start: 1980,
        contract_until: 1980,
        annual_salary: 120_000,
      }],
      staffContracts: [{
        staff_id: "S1",
        team_id: "T1",
        contract_start: 1980,
        contract_until: 1980,
        annual_salary: 240_000,
      }],
      employment: {
        drivers: { D1: { teamId: "T1", role: "main_driver", status: "employed" } },
        staff: { S1: { teamId: "T1", role: "technical_director", status: "employed" } },
        freeAgents: { drivers: [], staff: [] },
        vacancies: [],
      },
      facilities: [{ team_id: "T1", maintenance_cost: 12_000 }],
      technical: { teams: {}, suppliers: { teams: {} } },
    },
    simulation: { nextEventSequence: 0, systemState: {} },
    history: { finances: [] },
  };
}

test("opening financial plan uses Finance_Model calibration without claiming historical accounting", () => {
  const save = economyWorld();
  initializeSimulation(save, [createTeamEconomySystem()]);
  const projection = financialPlanningProjection(save, "T1");

  assert.equal(projection.strategy, "balanced");
  assert.equal(projection.monthlyIncome, 100_000);
  assert.equal(projection.monthlyExpenses, 200_000);
  assert.equal(projection.monthlyNet, -100_000);
  assert.equal(projection.reserveTarget, 400_000);
  assert.equal(projection.availableToCommit, 600_000);
  assert.equal(projection.recurringSource, "gameplay_finance_model_estimate");
  assert.equal(projection.model.dataStatus, "gameplay_design_estimate");
});

test("financial strategy changes protected reserves and commitment headroom", () => {
  const save = economyWorld();
  initializeSimulation(save, [createTeamEconomySystem()]);

  const balanced = financialPlanningProjection(save, "T1");
  const conservative = setFinancialStrategy(save, "T1", "conservative");
  const aggressive = setFinancialStrategy(save, "T1", "aggressive");

  assert.ok(conservative.reserveTarget > balanced.reserveTarget);
  assert.ok(conservative.availableToCommit < balanced.availableToCommit);
  assert.ok(aggressive.reserveTarget < conservative.reserveTarget);
  assert.ok(aggressive.availableToCommit > conservative.availableToCommit);
});

test("affordability protects reserves and recurring runway while allowing explicit emergency reserve use", () => {
  const save = economyWorld();
  initializeSimulation(save, [createTeamEconomySystem()]);

  const discretionary = assessFinancialCommitment(save, "T1", {
    amount: 650_000,
    kind: "facility_upgrade",
  });
  assert.equal(discretionary.allowed, false);
  assert.equal(discretionary.reason, "cash_reserve_breach");

  const emergency = assessFinancialCommitment(save, "T1", {
    amount: 650_000,
    kind: "reliability",
    allowReserveBreach: true,
  });
  assert.equal(emergency.allowed, true);

  const recurring = assessFinancialCommitment(save, "T1", {
    monthlyAdded: 160_000,
    strictRecurring: true,
    kind: "driver_contract",
  });
  assert.equal(recurring.allowed, false);
  assert.equal(recurring.reason, "recurring_commitment_too_risky");
});

test("monthly economy uses Finance_Model burn as a residual and does not double-count known payroll or maintenance", () => {
  const save = economyWorld();
  const systems = [createTeamEconomySystem()];
  initializeSimulation(save, systems);

  const events = dispatchSimulationEvents(save, [{
    type: SIM_EVENT.MONTH_STARTED,
    date: "1980-02-01",
    payload: { year: 1980, month: 2 },
  }], systems);
  const close = events.find((event) => event.type === "team.finance_month_closed");

  assert.ok(close);
  assert.equal(close.payload.breakdown.driverSalaries, 10_000);
  assert.equal(close.payload.breakdown.staffSalaries, 20_000);
  assert.equal(close.payload.breakdown.facilityMaintenance, 1_000);
  assert.equal(close.payload.breakdown.operations, 169_000);
  assert.equal(close.payload.breakdown.operationsSource, "gameplay_finance_model_residual");
  assert.equal(close.payload.expenses, 200_000);
  assert.equal(close.payload.income, 100_000);
  assert.equal(close.payload.net, -100_000);
  assert.equal(save.world.teamState.T1.cash, 900_000);
});

test("financial planning persists through save/load without becoming historical database state", () => {
  const save = economyWorld();
  initializeSimulation(save, [createTeamEconomySystem()]);
  setFinancialStrategy(save, "T1", "conservative");

  const restored = deserializeSaveWorld(serializeSaveWorld(save));
  const projection = financialPlanningProjection(restored, "T1");

  assert.equal(projection.strategy, "conservative");
  assert.equal(restored.world.teamState.T1.financialPlanning.source, "manager_or_ai_strategy");
  assert.equal(restored.world.financeModels[0].data_status, "gameplay_design_estimate");
});

test("Management UI exposes financial planning as projection and routes strategy changes through the server API", async () => {
  const [ui, server] = await Promise.all([
    readFile(new URL("../playtest/management.js", import.meta.url), "utf8"),
    readFile(new URL("../scripts/playtest-server.js", import.meta.url), "utf8"),
  ]);

  assert.match(ui, /Financial planning/);
  assert.match(ui, /Reserve target/);
  assert.match(ui, /Available to commit/);
  assert.match(ui, /Cash runway/);
  assert.match(ui, /data-financial-strategy/);
  assert.match(server, /\/api\/finances\/strategy/);
  assert.match(server, /developerSetFinancialStrategy/);
});
