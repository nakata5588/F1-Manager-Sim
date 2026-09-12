import { createRng } from "../../sim/random.js";

export const PRESEASON_EVENT = Object.freeze({
  INITIALIZED: "preseason.initialized",
  TEST_COMPLETED: "preseason.test_completed",
  SEASON_RESET: "preseason.season_reset",
});

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 2) {
  return Number(Number(value).toFixed(digits));
}

function teamTechnical(saveWorld, teamId) {
  return saveWorld.world?.technical?.teams?.[teamId] ?? null;
}

function currentSeasonRaces(saveWorld) {
  const season = Number(saveWorld.clock?.season);
  return (saveWorld.world?.calendar ?? []).filter((row) => {
    const year = Number(row.year ?? row.season ?? String(row.race_date ?? row.date ?? "").slice(0, 4));
    return !Number.isInteger(year) || year === season;
  });
}

function firstRaceDate(saveWorld) {
  const rows = currentSeasonRaces(saveWorld)
    .map((row) => String(row.race_date ?? row.date ?? "").slice(0, 10))
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();
  return rows[0] ?? null;
}

export function isPreseasonWindow(saveWorld) {
  const first = firstRaceDate(saveWorld);
  if (!first) return true;
  return String(saveWorld.clock?.date ?? "") < first;
}

function ensureHistory(saveWorld) {
  saveWorld.history.preseason ??= [];
  return saveWorld.history.preseason;
}

export function ensurePreseasonTeam(saveWorld, teamId, season = Number(saveWorld.clock?.season)) {
  const team = teamTechnical(saveWorld, teamId);
  if (!team) return null;
  if (!team.preseason || Number(team.preseason.season) !== Number(season)) {
    team.preseason = {
      season: Number(season),
      sessionsCompleted: 0,
      maxSessions: 3,
      developmentKnowledge: 0,
      reliabilityPrep: 0,
      setupKnowledge: 0,
      tests: [],
    };
  }
  ensureHistory(saveWorld);
  return team.preseason;
}

export function initializePreseasonWorld(saveWorld) {
  let teams = 0;
  for (const teamId of Object.keys(saveWorld.world?.technical?.teams ?? {})) {
    if (ensurePreseasonTeam(saveWorld, teamId)) teams += 1;
  }
  return teams;
}

function staffTechnicalScore(saveWorld, teamId) {
  const employment = saveWorld.world?.employment?.staff ?? {};
  const ids = Object.entries(employment)
    .filter(([, row]) => row?.teamId === teamId && row?.status === "employed")
    .map(([id]) => id);
  const values = [];
  for (const id of ids) {
    const row = (saveWorld.world?.staffRatings ?? []).find((candidate) => candidate.staff_id === id) ?? {};
    for (const field of ["technical", "engineering", "data_analysis", "design", "reliability"]) {
      const value = numeric(row[field]);
      if (value !== null) values.push(value <= 10 ? value * 10 : value);
    }
  }
  if (!values.length) return 50;
  return clamp(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function driverFeedbackScore(saveWorld, teamId) {
  const employment = saveWorld.world?.employment?.drivers ?? {};
  const ids = Object.entries(employment)
    .filter(([, row]) => row?.teamId === teamId && row?.status === "employed")
    .map(([id]) => id);
  const values = [];
  for (const id of ids) {
    const row = (saveWorld.world?.driverRatings ?? []).find((candidate) => candidate.driver_id === id) ?? {};
    for (const field of ["technical_feedback", "car_development_impact", "adaptability"]) {
      const value = numeric(row[field]);
      if (value !== null) values.push(value <= 10 ? value * 10 : value);
    }
  }
  if (!values.length) return 50;
  return clamp(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function facilityScore(saveWorld, teamId) {
  const facilities = Object.values(teamTechnical(saveWorld, teamId)?.facilities ?? {});
  const relevant = facilities.filter((row) => ["simulator", "chassisShop", "aeroDepartment", "windTunnel"].includes(row.id));
  if (!relevant.length) return 50;
  return clamp(relevant.reduce((sum, row) => sum + numeric(row.level, 5) * 10, 0) / relevant.length);
}

function spend(saveWorld, teamId, amount) {
  const finance = saveWorld.world?.teamState?.[teamId];
  if (!finance) throw new Error(`Team '${teamId}' does not have initialized finances.`);
  const cost = Math.max(0, Math.round(amount * 100) / 100);
  if (numeric(finance.cash, 0) < cost) throw new Error("The team does not have enough cash for preseason testing.");
  finance.cash = Math.round((numeric(finance.cash, 0) - cost) * 100) / 100;
  return cost;
}

export function runPreseasonTest(saveWorld, teamId, input = {}) {
  if (!isPreseasonWindow(saveWorld)) throw new Error("Preseason testing is closed after the first race date.");
  const state = ensurePreseasonTeam(saveWorld, teamId);
  if (!state) throw new Error("Technical state is not initialized for this team.");
  if (state.sessionsCompleted >= state.maxSessions) throw new Error("All supported preseason test sessions have already been used.");

  const session = state.sessionsCompleted + 1;
  const focus = ["balanced", "reliability", "development"].includes(input.focus) ? input.focus : "balanced";
  const cost = spend(saveWorld, teamId, 45000 + (session - 1) * 12000);
  const staff = staffTechnicalScore(saveWorld, teamId);
  const drivers = driverFeedbackScore(saveWorld, teamId);
  const facilities = facilityScore(saveWorld, teamId);
  const rng = createRng(`${saveWorld.meta.seed}|${saveWorld.clock.season}|preseason|${teamId}|${session}|${focus}`);
  const effectiveness = clamp(staff * 0.38 + drivers * 0.32 + facilities * 0.3 + (rng.next() - 0.5) * 8, 20, 100);

  const developmentGain = round((3.2 + effectiveness * 0.045) * (focus === "development" ? 1.35 : focus === "reliability" ? 0.72 : 1));
  const reliabilityGain = round((2.4 + effectiveness * 0.035) * (focus === "reliability" ? 1.45 : focus === "development" ? 0.72 : 1));
  const setupGain = round(2 + effectiveness * 0.03);

  state.sessionsCompleted = session;
  state.developmentKnowledge = round(clamp(state.developmentKnowledge + developmentGain, 0, 25));
  state.reliabilityPrep = round(clamp(state.reliabilityPrep + reliabilityGain, 0, 15));
  state.setupKnowledge = round(clamp(state.setupKnowledge + setupGain, 0, 20));

  const result = {
    testId: `preseason:${saveWorld.clock.season}:${teamId}:${session}`,
    teamId,
    season: Number(saveWorld.clock.season),
    session,
    focus,
    date: saveWorld.clock.date,
    cost,
    effectiveness: round(effectiveness),
    developmentKnowledgeGain: developmentGain,
    reliabilityPrepGain: reliabilityGain,
    setupKnowledgeGain: setupGain,
    source: input.source ?? "player",
  };
  state.tests.push(result);
  ensureHistory(saveWorld).push({ type: "preseason_test", ...structuredClone(result) });
  return structuredClone(result);
}

export function preseasonDevelopmentBonus(saveWorld, teamId, targetSeason = Number(saveWorld.clock?.season)) {
  const state = teamTechnical(saveWorld, teamId)?.preseason;
  if (!state || Number(state.season) !== Number(saveWorld.clock?.season)) return 0;
  const nextSeason = Number(targetSeason) > Number(saveWorld.clock?.season);
  const factor = nextSeason ? 1 : 0.55;
  return round(clamp(numeric(state.developmentKnowledge, 0) / 100 * factor, 0, 0.22), 4);
}

export function preseasonProjection(saveWorld, teamId) {
  if (!teamId) return null;
  const state = ensurePreseasonTeam(saveWorld, teamId);
  return {
    ...structuredClone(state),
    windowOpen: isPreseasonWindow(saveWorld),
    firstRaceDate: firstRaceDate(saveWorld),
  };
}
