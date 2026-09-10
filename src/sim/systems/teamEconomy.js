import { SIM_EVENT } from "../timeEngine.js";

export const TEAM_FINANCE_EVENT = Object.freeze({
  INITIALIZED: "team.finance_initialized",
  MONTH_CLOSED: "team.finance_month_closed",
});

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function ensureTeamState(saveWorld) {
  saveWorld.world.teamState ??= {};
  saveWorld.history.finances ??= [];
  return saveWorld.world.teamState;
}

function teamBrand(saveWorld, teamId) {
  return (saveWorld.world?.teamBrands ?? []).find((row) => row.team_id === teamId) ?? {};
}

function startingCash(team, brand, financial) {
  const candidates = [financial?.cash_balance, financial?.cash, financial?.starting_budget, team?.cash_balance, team?.starting_budget, team?.budget, brand?.starting_budget, brand?.budget];
  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function seasonFinancial(saveWorld, teamId) {
  return (saveWorld.world?.teamFinancials ?? []).find((row) => row.team_id === teamId) ?? {};
}

function initializeTeams(saveWorld, date) {
  const state = ensureTeamState(saveWorld);
  let created = 0;
  for (const team of saveWorld.world?.teams ?? []) {
    const id = team.team_id;
    if (!id || state[id]) continue;
    const brand = teamBrand(saveWorld, id);
    const financial = seasonFinancial(saveWorld, id);
    const cash = startingCash(team, brand, financial);
    state[id] = {
      cash: roundMoney(cash),
      openingCash: roundMoney(cash),
      reputation: numeric(financial.reputation ?? brand.reputation ?? team.reputation, null),
      financialStatus: cash < 0 ? "distressed" : cash === 0 ? "unknown" : "stable",
      monthlyIncome: 0,
      monthlyExpenses: 0,
      monthlyNet: 0,
      lastFinanceDate: date,
    };
    created += 1;
  }
  return created;
}

function rowActiveInSeason(row, season) {
  const startRaw = row?.contract_start ?? row?.start_year ?? row?.start_season;
  const endRaw = row?.contract_until ?? row?.end_year ?? row?.end_season;
  const start = Number(startRaw);
  const end = Number(endRaw);
  if (Number.isFinite(start) || Number.isFinite(end)) {
    if (Number.isFinite(start) && season < start) return false;
    if (Number.isFinite(end) && season > end) return false;
    return true;
  }
  const exact = Number(row?.year);
  return Number.isInteger(exact) ? exact === season : true;
}

function sponsorIncome(saveWorld, teamId, season) {
  let total = 0;
  for (const contract of saveWorld.world?.sponsorContracts ?? []) {
    if (contract.team_id !== teamId || !rowActiveInSeason(contract, season)) continue;
    const monthly = Number(contract.monthly_fee ?? contract.monthly_income);
    if (Number.isFinite(monthly)) total += monthly;
    else {
      const annual = Number(contract.annual_income ?? contract.annual_value ?? contract.value);
      if (Number.isFinite(annual)) total += annual / 12;
    }
  }
  return total;
}

function assignmentSalary(saveWorld, teamId, type, season) {
  const employment = type === "driver" ? saveWorld.world?.employment?.drivers : saveWorld.world?.employment?.staff;
  const contracts = type === "driver" ? saveWorld.world?.contracts : saveWorld.world?.staffContracts;
  const idField = type === "driver" ? "driver_id" : "staff_id";
  let total = 0;
  for (const [id, assignment] of Object.entries(employment ?? {})) {
    if (assignment?.teamId !== teamId || assignment?.status !== "employed") continue;
    const matching = [...(contracts ?? [])].reverse().find((row) => row?.[idField] === id && row.team_id === teamId && rowActiveInSeason(row, season));
    if (!matching) continue;
    const annual = Number(matching.annual_salary ?? matching.salary ?? matching.wage);
    if (Number.isFinite(annual)) total += annual / 12;
  }
  return total;
}

function facilityMaintenance(saveWorld, teamId) {
  const facility = (saveWorld.world?.facilities ?? []).find((row) => row.team_id === teamId);
  const annual = Number(facility?.maintenance_cost ?? facility?.annual_maintenance_cost);
  return Number.isFinite(annual) ? annual / 12 : 0;
}

function operatingCost(saveWorld, teamId) {
  const team = (saveWorld.world?.teams ?? []).find((row) => row.team_id === teamId) ?? {};
  const brand = teamBrand(saveWorld, teamId);
  const annual = Number(team.annual_operating_cost ?? brand.annual_operating_cost);
  return Number.isFinite(annual) ? annual / 12 : 0;
}

function closeMonth(saveWorld, event) {
  const state = ensureTeamState(saveWorld);
  const season = Number(saveWorld.clock.season);
  const output = [];
  for (const teamId of Object.keys(state).sort()) {
    const team = state[teamId];
    const sponsors = sponsorIncome(saveWorld, teamId, season);
    const driverSalaries = assignmentSalary(saveWorld, teamId, "driver", season);
    const staffSalaries = assignmentSalary(saveWorld, teamId, "staff", season);
    const maintenance = facilityMaintenance(saveWorld, teamId);
    const operations = operatingCost(saveWorld, teamId);
    const income = sponsors;
    const expenses = driverSalaries + staffSalaries + maintenance + operations;
    const net = income - expenses;
    team.cash = roundMoney(numeric(team.cash) + net);
    team.monthlyIncome = roundMoney(income);
    team.monthlyExpenses = roundMoney(expenses);
    team.monthlyNet = roundMoney(net);
    team.financialStatus = team.openingCash === 0 && team.cash === 0 && income === 0 && expenses === 0 ? "unknown" : team.cash < 0 ? "distressed" : team.cash < Math.max(100000, team.openingCash * 0.08) ? "tight" : "stable";
    team.lastFinanceDate = event.date;
    const record = { date: event.date, season, teamId, income: roundMoney(income), expenses: roundMoney(expenses), net: roundMoney(net), closingCash: team.cash, breakdown: { sponsors: roundMoney(sponsors), driverSalaries: roundMoney(driverSalaries), staffSalaries: roundMoney(staffSalaries), facilityMaintenance: roundMoney(maintenance), operations: roundMoney(operations) } };
    saveWorld.history.finances.push(record);
    output.push({ type: TEAM_FINANCE_EVENT.MONTH_CLOSED, payload: record });
  }
  return output;
}

export function createTeamEconomySystem() {
  return {
    id: "team.economy",
    eventTypes: [SIM_EVENT.CAREER_STARTED, SIM_EVENT.MONTH_STARTED],
    handle({ saveWorld, event }) {
      if (event.type === SIM_EVENT.CAREER_STARTED) {
        const teams = initializeTeams(saveWorld, event.date);
        return { type: TEAM_FINANCE_EVENT.INITIALIZED, payload: { teams } };
      }
      return closeMonth(saveWorld, event);
    },
  };
}
