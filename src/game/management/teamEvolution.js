import { initializeCommercialTeam } from "./commercial.js";
import { ensureReliabilityTeam } from "./reliability.js";
import { ensureSupplierTeam, expectedSupplierTerms, listSupplierMarket } from "./suppliers.js";
import { ensureTechnicalTeam } from "./technical.js";
import { regulationPackage } from "./regulations.js";
import { createRng } from "../../sim/random.js";

export const TEAM_EVOLUTION_EVENT = Object.freeze({
  INITIALIZED: "team_evolution.initialized",
  ENTRY_APPLICATION: "team_evolution.entry_application",
  ENTRY_ACCEPTED: "team_evolution.entry_accepted",
  ENTRY_REJECTED: "team_evolution.entry_rejected",
  TEAM_EXITED: "team_evolution.team_exited",
  TEAM_REBRANDED: "team_evolution.team_rebranded",
});

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 2) {
  return Number(Number(value).toFixed(digits));
}

function median(values, fallback = 0) {
  const list = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!list.length) return fallback;
  const middle = Math.floor(list.length / 2);
  return list.length % 2 ? list[middle] : (list[middle - 1] + list[middle]) / 2;
}

function teamId(row) {
  return row?.team_id ?? row?.entity_id ?? row?.id ?? null;
}

export function ensureTeamEvolutionState(saveWorld) {
  saveWorld.world.governance ??= {};
  saveWorld.world.governance.teamEvolution ??= {
    sequence: 0,
    initializedAt: null,
    applications: [],
    active: {},
    exited: {},
    rebrands: [],
  };
  saveWorld.history.teamEvolution ??= [];
  return saveWorld.world.governance.teamEvolution;
}

export function initializeTeamEvolutionState(saveWorld, date = saveWorld.clock?.date ?? null) {
  const state = ensureTeamEvolutionState(saveWorld);
  if (state.initializedAt) return state;
  state.initializedAt = date;
  for (const team of saveWorld.world?.teams ?? []) {
    const id = teamId(team);
    if (!id) continue;
    state.active[id] = {
      teamId: id,
      enteredSeason: Number(saveWorld.clock?.season),
      source: "career_start_active_team",
      distressSeasons: 0,
      currentBrand: team.team_name ?? team.name ?? id,
    };
  }
  saveWorld.history.teamEvolution.push({
    date,
    type: "team_evolution_initialized",
    activeTeams: Object.keys(state.active).length,
  });
  return state;
}

function nextId(saveWorld, prefix) {
  const state = ensureTeamEvolutionState(saveWorld);
  state.sequence = Number(state.sequence ?? 0) + 1;
  return `${prefix}:${Number(saveWorld.clock?.season)}:${state.sequence}`;
}

function activeTeamIds(saveWorld) {
  return new Set((saveWorld.world?.teams ?? []).map(teamId).filter(Boolean).map(String));
}

function eligibleFutureTeamProfiles(saveWorld) {
  const active = activeTeamIds(saveWorld);
  const eligibility = saveWorld.world?.entityAvailability?.team ?? {};
  return (saveWorld.world?.futureTeams ?? [])
    .filter((row) => {
      const id = teamId(row);
      return id && !active.has(String(id)) && eligibility[id]?.status === "eligible";
    });
}

function candidateReputation(row) {
  const value = numeric(row?.reputation ?? row?.prestige ?? row?.market_reputation, 45);
  if (value <= 1) return value * 100;
  if (value <= 10) return value * 10;
  return Math.min(100, Math.max(0, value));
}

export function listTeamEntryCandidates(saveWorld) {
  const season = Number(saveWorld.clock?.season);
  return eligibleFutureTeamProfiles(saveWorld).map((row) => {
    const id = teamId(row);
    const reputation = candidateReputation(row);
    const rng = createRng(`${saveWorld.meta.seed}|${season}|team-entry-interest|${id}`);
    const readiness = Math.min(100, Math.max(0, reputation * 0.7 + 18 + rng.next() * 22));
    return {
      teamId: id,
      name: row.team_name ?? row.name ?? id,
      reputation: round(reputation, 1),
      readiness: round(readiness, 1),
      referenceEntryYear: row.f1_debut_reference ?? row.f1_eligible_from ?? null,
      source: "eligible_future_team_identity",
    };
  }).sort((a, b) => b.readiness - a.readiness || a.teamId.localeCompare(b.teamId));
}

export function submitTeamEntryApplication(saveWorld, teamIdInput, input = {}) {
  const state = initializeTeamEvolutionState(saveWorld);
  const candidate = listTeamEntryCandidates(saveWorld).find((row) => row.teamId === teamIdInput);
  if (!candidate) throw new Error(`Team '${teamIdInput}' is not an eligible future entry candidate.`);
  const targetSeason = Math.max(Number(saveWorld.clock.season) + 1, Number(input.targetSeason ?? 0));
  const existing = state.applications.find((row) => row.teamId === teamIdInput && Number(row.targetSeason) === targetSeason && row.status === "pending");
  if (existing) return structuredClone(existing);
  const application = {
    applicationId: nextId(saveWorld, "team-entry"),
    teamId: teamIdInput,
    name: candidate.name,
    targetSeason,
    submittedAt: saveWorld.clock?.date ?? null,
    readiness: candidate.readiness,
    reputation: candidate.reputation,
    source: input.source ?? "simulation_candidate",
    status: "pending",
    decision: null,
  };
  state.applications.push(application);
  saveWorld.history.teamEvolution.push({ date: application.submittedAt, type: "entry_application", ...structuredClone(application) });
  return structuredClone(application);
}

export function decideTeamEntryApplication(saveWorld, applicationId, accepted, input = {}) {
  const state = initializeTeamEvolutionState(saveWorld);
  const application = state.applications.find((row) => row.applicationId === applicationId);
  if (!application) throw new Error(`Team entry application '${applicationId}' was not found.`);
  if (application.status !== "pending") return structuredClone(application);
  application.status = accepted ? "accepted" : "rejected";
  application.decidedAt = saveWorld.clock?.date ?? null;
  application.decision = {
    accepted: Boolean(accepted),
    source: input.source ?? "governance",
    reason: input.reason ?? null,
  };
  saveWorld.history.teamEvolution.push({
    date: application.decidedAt,
    type: accepted ? "entry_accepted" : "entry_rejected",
    applicationId,
    teamId: application.teamId,
    targetSeason: application.targetSeason,
    decision: structuredClone(application.decision),
  });
  return structuredClone(application);
}

function fieldComponentMedians(saveWorld) {
  const output = {};
  const values = {};
  for (const state of Object.values(saveWorld.world?.carState ?? {})) {
    for (const [component, rating] of Object.entries(state?.components ?? {})) {
      (values[component] ??= []).push(Number(rating));
    }
  }
  for (const [component, rows] of Object.entries(values)) output[component] = median(rows, 50);
  return output;
}

function fieldFacilityMedians(saveWorld) {
  const fields = ["wind_tunnel_level", "simulator_level", "aero_dept_level", "chassis_shop_level", "manufacturing_level"];
  const output = {};
  for (const field of fields) output[field] = median((saveWorld.world?.facilities ?? []).map((row) => row?.[field]), field === "simulator_level" ? 0 : 4);
  return output;
}

function initializeEntryResources(saveWorld, id, season) {
  const finances = Object.values(saveWorld.world?.teamState ?? {});
  const medianCash = median(finances.map((row) => row?.openingCash ?? row?.cash), 2_000_000);
  const medianReputation = median(finances.map((row) => row?.reputation), 50);
  saveWorld.world.teamState ??= {};
  saveWorld.world.teamState[id] = {
    cash: round(Math.max(250_000, medianCash * 0.62)),
    openingCash: round(Math.max(250_000, medianCash * 0.62)),
    reputation: round(Math.max(20, medianReputation - 8), 1),
    financialStatus: "stable",
    monthlyIncome: 0,
    monthlyExpenses: 0,
    monthlyNet: 0,
    lastFinanceDate: saveWorld.clock?.date ?? null,
    source: "simulation_entry_resource_baseline",
  };

  const components = fieldComponentMedians(saveWorld);
  const rng = createRng(`${saveWorld.meta.seed}|${season}|entry-car|${id}`);
  const carRow = { year: season, team_id: id, source: "simulation_entry_baseline", generated: true };
  for (const [component, center] of Object.entries(components)) carRow[component] = round(Math.max(20, center - 4 - rng.next() * 6), 2);
  saveWorld.world.carStats ??= [];
  saveWorld.world.carStats.push(carRow);

  const facilityMedian = fieldFacilityMedians(saveWorld);
  const facilityRow = { year: season, team_id: id, source: "simulation_entry_baseline", generated: true };
  for (const [field, center] of Object.entries(facilityMedian)) facilityRow[field] = round(Math.max(field === "simulator_level" ? 0 : 1, center - 1), 1);
  saveWorld.world.facilities ??= [];
  saveWorld.world.facilities.push(facilityRow);
}

function seedEntrySupplier(saveWorld, id, season) {
  const state = ensureSupplierTeam(saveWorld, id, saveWorld.clock?.date ?? null);
  if (state.active) return state.active;
  const candidates = listSupplierMarket(saveWorld, id)
    .filter((row) => row.interest?.score >= 20)
    .sort((a, b) => {
      const av = Number(a.expectedTerms?.annualValue ?? 0);
      const bv = Number(b.expectedTerms?.annualValue ?? 0);
      const as = Number(a.reliability ?? 0) * 0.55 + Number(a.power ?? 0) * 0.45 - av / 100000;
      const bs = Number(b.reliability ?? 0) * 0.55 + Number(b.power ?? 0) * 0.45 - bv / 100000;
      return bs - as || a.engineId.localeCompare(b.engineId);
    });
  const selected = candidates[0];
  if (!selected) return null;
  const terms = expectedSupplierTerms(saveWorld, id, selected.engineId, { effectiveSeason: season });
  state.active = {
    contractId: `entry-supplier:${season}:${id}:${selected.engineId}`,
    teamId: id,
    engineId: selected.engineId,
    engineName: selected.engineName,
    manufacturer: selected.manufacturer,
    startSeason: season,
    endSeason: season,
    effectiveSeason: season,
    annualValueMode: "currency",
    annualValue: terms.annualValue,
    annualValueIndex: null,
    valueSource: "simulation_entry_contract",
    source: "simulation_entry_contract",
    signedAt: saveWorld.clock?.date ?? null,
    status: "active",
  };
  return state.active;
}

function ensureEmploymentShape(saveWorld) {
  saveWorld.world.employment ??= { drivers: {}, staff: {}, futureAssignments: { drivers: {}, staff: {} }, freeAgents: { drivers: [], staff: [] }, vacancies: [] };
  saveWorld.world.employment.drivers ??= {};
  saveWorld.world.employment.staff ??= {};
  saveWorld.world.employment.freeAgents ??= { drivers: [], staff: [] };
  saveWorld.world.employment.freeAgents.drivers ??= [];
  saveWorld.world.employment.freeAgents.staff ??= [];
  saveWorld.world.employment.vacancies ??= [];
  return saveWorld.world.employment;
}

function createEntryVacancies(saveWorld, id, season) {
  const employment = ensureEmploymentShape(saveWorld);
  const roles = [
    { type: "driver", role: "driver" },
    { type: "driver", role: "driver" },
    { type: "staff", role: "technical_director" },
    { type: "staff", role: "chief_designer" },
  ];
  return roles.map((role, index) => {
    const vacancy = {
      vacancyId: `entry:${season}:${id}:${role.type}:${index + 1}`,
      type: role.type,
      teamId: id,
      role: role.role,
      openedAt: saveWorld.clock?.date ?? null,
      status: "open",
      source: "team_entry",
    };
    employment.vacancies.push(vacancy);
    return structuredClone(vacancy);
  });
}

export function activateAcceptedTeamEntry(saveWorld, applicationId) {
  const state = initializeTeamEvolutionState(saveWorld);
  const application = state.applications.find((row) => row.applicationId === applicationId);
  if (!application || application.status !== "accepted") throw new Error("A previously accepted team-entry application is required.");
  const season = Number(saveWorld.clock?.season);
  if (Number(application.targetSeason) > season) throw new Error("Team entry is not effective yet.");
  if (activeTeamIds(saveWorld).has(String(application.teamId))) return { teamId: application.teamId, alreadyActive: true, vacancies: [] };

  const profile = (saveWorld.world?.futureTeams ?? []).find((row) => teamId(row) === application.teamId);
  if (!profile) throw new Error(`Future team profile '${application.teamId}' is unavailable.`);
  const activeProfile = {
    ...structuredClone(profile),
    team_id: application.teamId,
    team_name: profile.team_name ?? profile.name ?? application.name,
    activated_season: season,
    source: "simulation_entry_from_historical_identity",
    historical_reference_entry_not_mandatory: true,
  };
  saveWorld.world.teams ??= [];
  saveWorld.world.teams.push(activeProfile);
  saveWorld.world.futureTeams = (saveWorld.world.futureTeams ?? []).filter((row) => teamId(row) !== application.teamId);
  saveWorld.world.futureEntities = (saveWorld.world.futureEntities ?? []).filter((row) => !(String(row.entity_type ?? row.type).toLowerCase() === "team" && (row.entity_id ?? row.id) === application.teamId));
  saveWorld.world.teamBrands ??= [];
  saveWorld.world.teamBrands.push({
    year: season,
    team_id: application.teamId,
    team_name: activeProfile.team_name,
    brand_name: activeProfile.team_name,
    source: "simulation_entry",
    generated: true,
  });

  initializeEntryResources(saveWorld, application.teamId, season);
  ensureTechnicalTeam(saveWorld, application.teamId, saveWorld.clock?.date ?? null);
  seedEntrySupplier(saveWorld, application.teamId, season);
  ensureReliabilityTeam(saveWorld, application.teamId);
  try { initializeCommercialTeam(saveWorld, application.teamId, saveWorld.clock?.date ?? null); } catch { /* commercial data is optional for a new entrant */ }
  const vacancies = createEntryVacancies(saveWorld, application.teamId, season);

  state.active[application.teamId] = {
    teamId: application.teamId,
    enteredSeason: season,
    source: "simulation_entry",
    distressSeasons: 0,
    currentBrand: activeProfile.team_name,
  };
  application.status = "activated";
  application.activatedAt = saveWorld.clock?.date ?? null;
  saveWorld.history.teamEvolution.push({
    date: application.activatedAt,
    type: "team_entry_activated",
    applicationId,
    teamId: application.teamId,
    season,
    brand: activeProfile.team_name,
    vacancies: vacancies.length,
  });
  return { teamId: application.teamId, season, profile: structuredClone(activeProfile), vacancies };
}

function addFreeAgent(employment, type, id) {
  const bucket = type === "driver" ? employment.freeAgents.drivers : employment.freeAgents.staff;
  if (!bucket.includes(id)) bucket.push(id);
  bucket.sort();
}

export function exitTeam(saveWorld, teamIdInput, input = {}) {
  const state = initializeTeamEvolutionState(saveWorld);
  const index = (saveWorld.world?.teams ?? []).findIndex((row) => teamId(row) === teamIdInput);
  if (index < 0) throw new Error(`Active team '${teamIdInput}' was not found.`);
  const [profile] = saveWorld.world.teams.splice(index, 1);
  const employment = ensureEmploymentShape(saveWorld);
  const released = [];
  for (const type of ["driver", "staff"]) {
    const bucket = type === "driver" ? employment.drivers : employment.staff;
    for (const [id, assignment] of Object.entries(bucket)) {
      if (assignment?.teamId !== teamIdInput || assignment?.status !== "employed") continue;
      delete bucket[id];
      addFreeAgent(employment, type, id);
      released.push({ type, id });
    }
  }
  saveWorld.world.inactiveTeams ??= [];
  saveWorld.world.inactiveTeams.push({
    ...structuredClone(profile),
    inactive_from: Number(saveWorld.clock?.season),
    exit_reason: input.reason ?? "simulation_team_exit",
  });
  state.exited[teamIdInput] = {
    teamId: teamIdInput,
    season: Number(saveWorld.clock?.season),
    date: saveWorld.clock?.date ?? null,
    reason: input.reason ?? "simulation_team_exit",
    releasedWorkers: released.length,
  };
  delete state.active[teamIdInput];
  saveWorld.history.teamEvolution.push({ date: saveWorld.clock?.date ?? null, type: "team_exited", ...structuredClone(state.exited[teamIdInput]) });
  return { ...structuredClone(state.exited[teamIdInput]), released };
}

export function rebrandTeam(saveWorld, teamIdInput, displayName, input = {}) {
  const state = initializeTeamEvolutionState(saveWorld);
  const team = (saveWorld.world?.teams ?? []).find((row) => teamId(row) === teamIdInput);
  if (!team) throw new Error(`Active team '${teamIdInput}' was not found.`);
  const name = String(displayName ?? "").trim();
  if (!name) throw new Error("A non-empty team brand name is required.");
  const previous = team.team_name ?? team.name ?? teamIdInput;
  team.team_name = name;
  team.name = name;
  saveWorld.world.teamBrands ??= [];
  saveWorld.world.teamBrands.push({
    year: Number(saveWorld.clock?.season),
    team_id: teamIdInput,
    team_name: name,
    brand_name: name,
    previous_brand_name: previous,
    source: input.source ?? "simulation_rebrand",
    generated: true,
  });
  const record = {
    rebrandId: nextId(saveWorld, "team-rebrand"),
    teamId: teamIdInput,
    season: Number(saveWorld.clock?.season),
    date: saveWorld.clock?.date ?? null,
    previousName: previous,
    newName: name,
    source: input.source ?? "simulation_rebrand",
  };
  state.rebrands.push(record);
  state.active[teamIdInput] ??= { teamId: teamIdInput, enteredSeason: Number(saveWorld.clock?.season), source: "existing" };
  state.active[teamIdInput].currentBrand = name;
  saveWorld.history.teamEvolution.push({ type: "team_rebranded", ...structuredClone(record) });
  return structuredClone(record);
}

export function updateTeamDistress(saveWorld, controlledTeamIds = []) {
  const state = initializeTeamEvolutionState(saveWorld);
  const controlled = new Set((controlledTeamIds ?? []).map(String));
  const packageState = regulationPackage(saveWorld);
  const minimum = Number(packageState.grid?.minTeams ?? 10);
  const activeCount = saveWorld.world?.teams?.length ?? 0;
  const candidates = [];
  for (const team of saveWorld.world?.teams ?? []) {
    const id = teamId(team);
    if (!id) continue;
    state.active[id] ??= { teamId: id, enteredSeason: Number(saveWorld.clock?.season), source: "existing", distressSeasons: 0 };
    const finance = saveWorld.world?.teamState?.[id] ?? {};
    const distressed = finance.financialStatus === "distressed" || numeric(finance.cash, 0) < 0;
    state.active[id].distressSeasons = distressed ? Number(state.active[id].distressSeasons ?? 0) + 1 : 0;
    if (!controlled.has(String(id)) && activeCount > minimum && state.active[id].distressSeasons >= 2) candidates.push(id);
  }
  return candidates;
}

export function teamEvolutionProjection(saveWorld) {
  const state = initializeTeamEvolutionState(saveWorld);
  const rules = regulationPackage(saveWorld);
  return {
    grid: {
      activeTeams: saveWorld.world?.teams?.length ?? 0,
      minTeams: Number(rules.grid?.minTeams ?? 10),
      maxTeams: Number(rules.grid?.maxTeams ?? 18),
    },
    candidates: listTeamEntryCandidates(saveWorld),
    applications: state.applications.map((row) => structuredClone(row)),
    active: Object.values(state.active).map((row) => structuredClone(row)),
    exited: Object.values(state.exited).map((row) => structuredClone(row)),
    rebrands: state.rebrands.slice(-20).map((row) => structuredClone(row)),
  };
}
