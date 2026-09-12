import { activeEngineForTeam } from "../../game/management/suppliers.js";
import { adjustReliabilityForCondition, conditionPerformanceModifier } from "../../game/management/reliability.js";
import { createRng } from "../random.js";
import { SIM_EVENT } from "../timeEngine.js";

export const RACE_EVENT = Object.freeze({
  WEEKEND_STARTED: "race.weekend_started",
  PRACTICE_COMPLETED: "race.practice_completed",
  QUALIFYING_COMPLETED: "race.qualifying_completed",
  GRID_SET: "race.grid_set",
  COMPLETED: "race.completed",
  SKIPPED: "race.skipped",
});

const DRIVER_FIELDS = Object.freeze({
  qualifying: ["qualifying", "pace"],
  pace: ["pace", "qualifying"],
  start: ["start_launch", "starts", "racecraft"],
  racecraft: ["racecraft", "race_intelligence"],
  wet: ["wet_skill", "wet_ability"],
  consistency: ["consistency"],
  tyre: ["tire_management", "tyre_management"],
  intelligence: ["race_intelligence", "racecraft"],
  feedback: ["technical_feedback", "feedback"],
  adaptability: ["adaptability"],
  crash: ["crash_likelihood"],
});

const CAR_COMPONENTS = ["chassis_spec", "aero_spec", "gearbox_spec", "suspension_spec", "brakes_spec", "cooling_spec", "electronics_spec"];

function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function normalizeRating(value, fallback = 50) {
  const number = numeric(value);
  if (number === null) return fallback;
  if (number >= 0 && number <= 1) return number * 100;
  if (number >= 1 && number <= 10) return number * 10;
  return clamp(number, 0, 100);
}

function raceRole(role) {
  const text = String(role ?? "driver").trim().toLowerCase();
  if (["", "driver", "main_driver", "race_driver", "primary_driver", "secondary_driver", "lead_driver", "second_driver"].includes(text)) return true;
  return !text.includes("reserve") && !text.includes("test") && !text.includes("third") && !text.includes("development");
}

function entrants(saveWorld) {
  const assignments = saveWorld.world?.employment?.drivers ?? {};
  return Object.entries(assignments)
    .filter(([id, assignment]) => assignment?.status === "employed" && assignment.teamId && raceRole(assignment.role) && saveWorld.world?.careerState?.drivers?.[id]?.status !== "retired")
    .map(([driverId, assignment]) => ({ driverId, teamId: assignment.teamId, role: assignment.role ?? "driver" }))
    .sort((a, b) => a.teamId.localeCompare(b.teamId) || a.driverId.localeCompare(b.driverId));
}

function profile(saveWorld, driverId) {
  return (saveWorld.world?.drivers ?? []).find((row) => row.driver_id === driverId) ?? {};
}

function rating(saveWorld, driverId) {
  return (saveWorld.world?.driverRatings ?? []).find((row) => row.driver_id === driverId) ?? {};
}

function driverAttribute(saveWorld, driverId, keys, fallback = 50) {
  const state = saveWorld.world?.careerState?.drivers?.[driverId] ?? {};
  const dynamic = state.attributes ?? {};
  const sourceRating = rating(saveWorld, driverId);
  const sourceProfile = profile(saveWorld, driverId);
  for (const key of keys) {
    const value = numeric(dynamic[key] ?? sourceRating[key] ?? sourceProfile[key]);
    if (value !== null) return normalizeRating(value, fallback);
  }
  return fallback;
}

function formScore(saveWorld, driverId) {
  const value = numeric(saveWorld.world?.careerState?.drivers?.[driverId]?.form, 0);
  return clamp(value, -100, 100);
}

function currentRace(saveWorld, event) {
  return (saveWorld.world?.calendar ?? []).find((row) => row.gp_id === event.payload?.gp_id)
    ?? (saveWorld.world?.calendar ?? []).find((row) => Number(row.round) === Number(event.payload?.round))
    ?? {};
}

function trackById(saveWorld, id) {
  return (saveWorld.world?.tracks ?? []).find((row) => row.track_id === id || row.circuit_id === id) ?? {};
}

function currentTrack(saveWorld, event, race) {
  return trackById(saveWorld, event.payload?.track_id ?? race.track_id ?? race.circuit_id);
}

function dependency(track, names, fallback) {
  for (const name of names) {
    const value = numeric(track?.[name]);
    if (value === null) continue;
    return clamp(value <= 1 ? value : value / 100, 0, 1);
  }
  return fallback;
}

function carComponents(saveWorld, teamId) {
  const dynamic = saveWorld.world?.carState?.[teamId]?.components;
  if (dynamic && Object.keys(dynamic).length) return dynamic;
  return (saveWorld.world?.carStats ?? []).find((row) => row.team_id === teamId) ?? {};
}

function engineForTeam(saveWorld, teamId) {
  return activeEngineForTeam(saveWorld, teamId) ?? {};
}

function average(source, fields, fallback = 50) {
  const values = fields.map((field) => numeric(source?.[field])).filter((value) => value !== null).map((value) => normalizeRating(value));
  if (!values.length) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function carPerformance(saveWorld, teamId, track, driverId = null) {
  const car = carComponents(saveWorld, teamId);
  const engine = engineForTeam(saveWorld, teamId);
  const powerDependency = dependency(track, ["power_dependency", "engine_dependency", "power_sensitivity"], 0.45);
  const aeroDependency = dependency(track, ["aero_dependency", "downforce_dependency", "aero_sensitivity"], 0.5);
  const technicality = dependency(track, ["technicality", "technical_difficulty", "handling_dependency"], 0.5);

  const chassis = average(car, ["chassis_spec"], average(car, CAR_COMPONENTS));
  const aero = average(car, ["aero_spec"], average(car, CAR_COMPONENTS));
  const mechanical = average(car, ["gearbox_spec", "suspension_spec", "brakes_spec"], average(car, CAR_COMPONENTS));
  const power = average(engine, ["power"], 50);
  const baseCar = chassis * (0.28 + technicality * 0.08) + aero * (0.24 + aeroDependency * 0.1) + mechanical * 0.26 + power * (0.12 + powerDependency * 0.12);
  const denominator = (0.28 + technicality * 0.08) + (0.24 + aeroDependency * 0.1) + 0.26 + (0.12 + powerDependency * 0.12);
  const condition = driverId ? conditionPerformanceModifier(saveWorld, teamId, driverId) : 0;
  return clamp(baseCar / denominator + condition, 0, 100);
}

function reliability(saveWorld, teamId, driverId = null) {
  const car = carComponents(saveWorld, teamId);
  const engine = engineForTeam(saveWorld, teamId);
  const engineReliability = average(engine, ["reliability"], 65);
  const carReliability = average(car, ["gearbox_spec", "cooling_spec", "electronics_spec", "brakes_spec"], 65);
  const base = clamp(engineReliability * 0.58 + carReliability * 0.42, 0, 100);
  return driverId ? adjustReliabilityForCondition(saveWorld, teamId, driverId, base) : base;
}

function wetRace(race, track) {
  const text = String(race.weather_condition ?? race.weather ?? track.weather_condition ?? "").toLowerCase();
  return text.includes("wet") || text.includes("rain") || text.includes("storm");
}

function rulesNumber(rules, names, fallback = null) {
  for (const name of names) {
    const value = Number(rules?.[name]);
    if (Number.isFinite(value) && value > 0) return Math.round(value);
  }
  return fallback;
}

function weekendStore(saveWorld) {
  saveWorld.world.raceWeekendState ??= { active: {} };
  saveWorld.world.raceWeekendState.active ??= {};
  return saveWorld.world.raceWeekendState;
}

function weekendKey(saveWorld, event) {
  return `${saveWorld.clock.season}:${event.payload?.gp_id ?? event.payload?.round ?? event.date}`;
}

function activeWeekend(saveWorld, key) {
  return weekendStore(saveWorld).active[key] ?? null;
}

function engineeringSupport(saveWorld, teamId) {
  const assignments = saveWorld.world?.employment?.staff ?? {};
  const ids = Object.entries(assignments)
    .filter(([, row]) => row?.teamId === teamId && row?.status === "employed")
    .map(([id]) => id);
  if (!ids.length) return 50;

  const values = ids.map((id) => {
    const state = saveWorld.world?.careerState?.staff?.[id] ?? {};
    const dynamic = state.attributes ?? {};
    const ratingRow = (saveWorld.world?.staffRatings ?? []).find((row) => row.staff_id === id) ?? {};
    return (
      normalizeRating(dynamic.technical ?? ratingRow.technical, 50) * 0.5
      + normalizeRating(dynamic.data_analysis ?? ratingRow.data_analysis, 50) * 0.3
      + normalizeRating(dynamic.communication ?? ratingRow.communication, 50) * 0.2
    );
  });
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function idealSetup(track) {
  const power = dependency(track, ["power_dependency", "engine_dependency", "power_sensitivity"], 0.45);
  const aero = dependency(track, ["aero_dependency", "downforce_dependency", "aero_sensitivity"], 0.5);
  const technical = dependency(track, ["technicality", "technical_difficulty", "handling_dependency"], 0.5);
  return {
    aeroBalance: round(30 + aero * 60, 2),
    mechanicalGrip: round(35 + technical * 55, 2),
    gearing: round(30 + power * 60, 2),
    cooling: round(48 + power * 18 + technical * 8, 2),
  };
}

function setupQuality(actual, ideal) {
  const fields = Object.keys(ideal);
  const meanError = fields.reduce((sum, field) => sum + Math.abs(numeric(actual[field], ideal[field]) - ideal[field]), 0) / fields.length;
  return round(clamp(100 - meanError * 2.35, 25, 100), 2);
}

function preseasonSetupKnowledge(saveWorld, teamId) {
  const state = saveWorld.world?.technical?.teams?.[teamId]?.preseason;
  if (!state || Number(state.season) !== Number(saveWorld.clock?.season)) return 0;
  return clamp(numeric(state.setupKnowledge, 0), 0, 20);
}

function simulatePractice(saveWorld, weekend, event) {
  const track = trackById(saveWorld, weekend.trackId);
  const ideal = idealSetup(track);
  const rules = saveWorld.world?.qualifyingRules ?? saveWorld.world?.rules ?? {};
  const windows = rulesNumber(rules, ["practice_session_count", "practice_sessions", "free_practice_sessions"], 2);
  const source = rulesNumber(rules, ["practice_session_count", "practice_sessions", "free_practice_sessions"], null) ? "season_rules" : "simulation_default";

  const results = weekend.entrants.map((entry) => {
    const feedback = driverAttribute(saveWorld, entry.driverId, DRIVER_FIELDS.feedback, 50);
    const adaptability = driverAttribute(saveWorld, entry.driverId, DRIVER_FIELDS.adaptability, 50);
    const consistency = driverAttribute(saveWorld, entry.driverId, DRIVER_FIELDS.consistency, 50);
    const engineering = engineeringSupport(saveWorld, entry.teamId);
    const preseason = preseasonSetupKnowledge(saveWorld, entry.teamId);
    const learningRate = clamp((feedback * 0.34 + adaptability * 0.22 + consistency * 0.14 + engineering * 0.3) / 100 + preseason * 0.003, 0.2, 0.97);
    const baseRng = createRng(`${saveWorld.meta.seed}|${weekend.key}|practice-base|${entry.driverId}`);
    const actual = {};
    for (const [field, target] of Object.entries(ideal)) {
      const initialError = (baseRng.next() - 0.5) * 40;
      const retainedError = initialError * Math.pow(1 - learningRate * 0.48, windows);
      actual[field] = round(clamp(target + retainedError, 0, 100), 2);
    }
    const knowledgeNoise = createRng(`${saveWorld.meta.seed}|${weekend.key}|practice-knowledge|${entry.driverId}`).next() * 4 - 2;
    const knowledge = clamp(25 + learningRate * 58 + windows * 4 + preseason * 0.45 + knowledgeNoise, 20, 100);
    return {
      driverId: entry.driverId,
      teamId: entry.teamId,
      practiceWindows: windows,
      setupKnowledge: round(knowledge, 2),
      setupQuality: setupQuality(actual, ideal),
      setup: actual,
      idealSetup: ideal,
    };
  });

  weekend.practice = { windows, source, results };
  weekend.phase = "practice_completed";
  return weekend.practice;
}

function setupFor(weekend, driverId) {
  return weekend.practice?.results?.find((row) => row.driverId === driverId) ?? { setupQuality: 50, setupKnowledge: 50 };
}

function qualifyingScore(saveWorld, entrant, weekend, event, track, session) {
  const qualifying = driverAttribute(saveWorld, entrant.driverId, DRIVER_FIELDS.qualifying);
  const pace = driverAttribute(saveWorld, entrant.driverId, DRIVER_FIELDS.pace);
  const car = carPerformance(saveWorld, entrant.teamId, track, entrant.driverId);
  const enginePower = average(engineForTeam(saveWorld, entrant.teamId), ["power"], 50);
  const form = formScore(saveWorld, entrant.driverId);
  const setup = setupFor(weekend, entrant.driverId);
  const setupEffect = (setup.setupQuality - 50) * 0.055 + (setup.setupKnowledge - 50) * 0.012;
  const rng = createRng(`${saveWorld.meta.seed}|${event.id}|qualifying|${session}|${entrant.driverId}`);
  const noise = (rng.next() - 0.5) * 3;
  return round(qualifying * 0.4 + pace * 0.17 + car * 0.28 + enginePower * 0.08 + form * 0.025 + setupEffect + noise);
}

function simulateQualifying(saveWorld, weekend, event) {
  const track = trackById(saveWorld, weekend.trackId);
  const rules = saveWorld.world?.qualifyingRules ?? {};
  const sessions = rulesNumber(rules, ["session_count", "qualifying_sessions", "number_of_sessions"], 1);
  const maxStarters = rulesNumber(rules, ["max_starters", "race_grid_size", "grid_size", "max_grid_size"], null);
  const attempts = weekend.entrants.map((entry) => {
    const sessionScores = Array.from({ length: sessions }, (_, index) => ({
      session: index + 1,
      score: qualifyingScore(saveWorld, entry, weekend, event, track, index + 1),
    }));
    const best = Math.max(...sessionScores.map((row) => row.score));
    return { ...entry, sessions: sessionScores, bestScore: best };
  });

  const classification = attempts
    .sort((a, b) => b.bestScore - a.bestScore || a.driverId.localeCompare(b.driverId))
    .map((entry, index) => ({
      position: index + 1,
      driverId: entry.driverId,
      teamId: entry.teamId,
      score: entry.bestScore,
      sessions: entry.sessions,
      status: maxStarters !== null && index >= maxStarters ? "DNQ" : "QUALIFIED",
    }));

  weekend.qualifying = {
    sessions,
    maxStarters,
    ruleSource: (sessions !== 1 || maxStarters !== null) ? "season_rules" : "simulation_default",
    classification,
  };
  weekend.phase = "qualifying_completed";
  return weekend.qualifying;
}

function buildGrid(weekend) {
  const qualified = (weekend.qualifying?.classification ?? []).filter((row) => row.status === "QUALIFIED");
  const grid = qualified.map((row, index) => ({
    grid: index + 1,
    driverId: row.driverId,
    teamId: row.teamId,
    qualifyingPosition: row.position,
    qualifyingScore: row.score,
    penaltyPlaces: 0,
  }));
  weekend.grid = grid;
  weekend.phase = "grid_set";
  return grid;
}

function raceScore(saveWorld, entrant, gridPosition, weekend, event, track, isWet) {
  const pace = driverAttribute(saveWorld, entrant.driverId, DRIVER_FIELDS.pace);
  const racecraft = driverAttribute(saveWorld, entrant.driverId, DRIVER_FIELDS.racecraft);
  const consistency = driverAttribute(saveWorld, entrant.driverId, DRIVER_FIELDS.consistency);
  const tyre = driverAttribute(saveWorld, entrant.driverId, DRIVER_FIELDS.tyre);
  const intelligence = driverAttribute(saveWorld, entrant.driverId, DRIVER_FIELDS.intelligence);
  const wet = driverAttribute(saveWorld, entrant.driverId, DRIVER_FIELDS.wet);
  const start = driverAttribute(saveWorld, entrant.driverId, DRIVER_FIELDS.start);
  const car = carPerformance(saveWorld, entrant.teamId, track, entrant.driverId);
  const form = formScore(saveWorld, entrant.driverId);
  const setup = setupFor(weekend, entrant.driverId);
  const overtakingDifficulty = dependency(track, ["overtaking_difficulty", "passing_difficulty"], 0.5);
  const rng = createRng(`${saveWorld.meta.seed}|${event.id}|race-performance|${entrant.driverId}`);
  const noise = (rng.next() - 0.5) * 4;
  const gridBonus = Math.max(0, (3.3 + overtakingDifficulty * 1.4) - (gridPosition - 1) * (0.11 + overtakingDifficulty * 0.06));
  const startEffect = (start - 50) * 0.018;
  const setupEffect = (setup.setupQuality - 50) * 0.038;

  const driverScore = isWet
    ? pace * 0.14 + racecraft * 0.18 + consistency * 0.12 + tyre * 0.08 + intelligence * 0.1 + wet * 0.22
    : pace * 0.22 + racecraft * 0.2 + consistency * 0.14 + tyre * 0.1 + intelligence * 0.11 + wet * 0.02;
  return round(driverScore + car * 0.23 + form * 0.02 + gridBonus + startEffect + setupEffect + noise);
}

function retirementOutcome(saveWorld, entrant, weekend, event) {
  const reliabilityScore = reliability(saveWorld, entrant.teamId, entrant.driverId);
  const crashLikelihood = driverAttribute(saveWorld, entrant.driverId, DRIVER_FIELDS.crash, 20);
  const setup = setupFor(weekend, entrant.driverId);
  const setupStress = Math.max(0, 60 - setup.setupQuality) * 0.00035;
  const mechanicalProbability = clamp(0.015 + (100 - reliabilityScore) * 0.0032 + setupStress, 0.01, 0.42);
  const incidentProbability = clamp(0.008 + crashLikelihood * 0.0011, 0.008, 0.16);
  const mechRng = createRng(`${saveWorld.meta.seed}|${event.id}|mechanical|${entrant.driverId}`);
  const incidentRng = createRng(`${saveWorld.meta.seed}|${event.id}|incident|${entrant.driverId}`);
  let reason = null;
  if (mechRng.next() < mechanicalProbability) reason = "mechanical";
  else if (incidentRng.next() < incidentProbability) reason = "incident";
  if (!reason) return { retired: false, reason: null, reliability: round(reliabilityScore, 2), completedLaps: null };

  const laps = Math.max(1, Math.round(numeric(weekend.race.laps ?? weekend.race.race_laps ?? weekend.race.total_laps, 60)));
  const progressRng = createRng(`${saveWorld.meta.seed}|${event.id}|retirement-lap|${entrant.driverId}`);
  return {
    retired: true,
    reason,
    reliability: round(reliabilityScore, 2),
    completedLaps: Math.floor(progressRng.next() * laps),
  };
}

function simulateRace(saveWorld, weekend, event) {
  const track = trackById(saveWorld, weekend.trackId);
  const isWet = wetRace(weekend.race, track);
  const entrantsById = new Map(weekend.entrants.map((entry) => [entry.driverId, entry]));
  const rawRace = (weekend.grid ?? []).map((gridRow) => {
    const entry = entrantsById.get(gridRow.driverId);
    const outcome = retirementOutcome(saveWorld, entry, weekend, event);
    return {
      driverId: entry.driverId,
      teamId: entry.teamId,
      grid: gridRow.grid,
      score: raceScore(saveWorld, entry, gridRow.grid, weekend, event, track, isWet),
      ...outcome,
    };
  });
  const finishers = rawRace.filter((row) => !row.retired).sort((a, b) => b.score - a.score || a.grid - b.grid);
  const retirees = rawRace.filter((row) => row.retired).sort((a, b) => b.completedLaps - a.completedLaps || b.score - a.score);
  const classification = [...finishers, ...retirees].map((row, index) => ({
    position: index + 1,
    driverId: row.driverId,
    teamId: row.teamId,
    grid: row.grid,
    status: row.retired ? "DNF" : "FINISHED",
    reason: row.reason,
    completedLaps: row.completedLaps,
    performanceIndex: row.score,
    reliability: row.reliability,
  }));
  weekend.conditions = isWet ? "wet" : "dry_or_unspecified";
  weekend.classification = classification;
  weekend.phase = "completed";
  return classification;
}

function startWeekend(saveWorld, event) {
  const store = weekendStore(saveWorld);
  const state = saveWorld.simulation.systemState["race.weekend"] ??= { completed: [] };
  const key = weekendKey(saveWorld, event);
  if (state.completed.includes(key) || store.active[key]?.phase === "completed") return null;

  const race = currentRace(saveWorld, event);
  const track = currentTrack(saveWorld, event, race);
  const entries = entrants(saveWorld);
  if (!entries.length) {
    state.completed.push(key);
    state.completed.sort();
    return { type: RACE_EVENT.SKIPPED, payload: { gp_id: event.payload?.gp_id ?? null, reason: "no_race_drivers" } };
  }

  const weekend = {
    key,
    season: Number(saveWorld.clock.season),
    gpId: event.payload?.gp_id ?? race.gp_id ?? null,
    gpName: event.payload?.gp_name ?? race.gp_name ?? null,
    round: numeric(event.payload?.round ?? race.round),
    trackId: event.payload?.track_id ?? race.track_id ?? race.circuit_id ?? null,
    date: event.date,
    phase: "started",
    entrants: entries,
    race: structuredClone(race),
    trackName: track.track_name ?? track.circuit_name ?? null,
  };
  store.active[key] = weekend;
  return {
    type: RACE_EVENT.WEEKEND_STARTED,
    payload: { weekend_key: key, gp_id: weekend.gpId, round: weekend.round, entrants: entries.length },
  };
}

function finishWeekend(saveWorld, weekend, event) {
  simulateRace(saveWorld, weekend, event);
  const state = saveWorld.simulation.systemState["race.weekend"] ??= { completed: [] };
  if (!state.completed.includes(weekend.key)) state.completed.push(weekend.key);
  state.completed.sort();
  saveWorld.history.races ??= [];
  const archived = structuredClone(weekend);
  delete archived.race;
  saveWorld.history.races.push(archived);
  return {
    type: RACE_EVENT.COMPLETED,
    payload: archived,
  };
}

export function createRaceWeekendSystem() {
  return {
    id: "race.weekend",
    eventTypes: [SIM_EVENT.RACE_DAY, RACE_EVENT.WEEKEND_STARTED, RACE_EVENT.PRACTICE_COMPLETED, RACE_EVENT.QUALIFYING_COMPLETED, RACE_EVENT.GRID_SET],
    handle({ saveWorld, event }) {
      if (event.type === SIM_EVENT.RACE_DAY) return startWeekend(saveWorld, event);
      const key = event.payload?.weekend_key ?? null;
      const weekend = key ? activeWeekend(saveWorld, key) : null;
      if (!weekend) return null;

      if (event.type === RACE_EVENT.WEEKEND_STARTED) {
        const practice = simulatePractice(saveWorld, weekend, event);
        return {
          type: RACE_EVENT.PRACTICE_COMPLETED,
          payload: {
            weekend_key: key,
            gp_id: weekend.gpId,
            practice_windows: practice.windows,
            average_setup_quality: round(practice.results.reduce((sum, row) => sum + row.setupQuality, 0) / practice.results.length, 2),
            results: practice.results,
          },
        };
      }

      if (event.type === RACE_EVENT.PRACTICE_COMPLETED) {
        const qualifying = simulateQualifying(saveWorld, weekend, event);
        return {
          type: RACE_EVENT.QUALIFYING_COMPLETED,
          payload: {
            weekend_key: key,
            gp_id: weekend.gpId,
            round: weekend.round,
            pole_driver_id: qualifying.classification.find((row) => row.status === "QUALIFIED")?.driverId ?? null,
            sessions: qualifying.sessions,
            max_starters: qualifying.maxStarters,
            classification: qualifying.classification,
          },
        };
      }

      if (event.type === RACE_EVENT.QUALIFYING_COMPLETED) {
        const grid = buildGrid(weekend);
        return {
          type: RACE_EVENT.GRID_SET,
          payload: { weekend_key: key, gp_id: weekend.gpId, grid, starters: grid.length },
        };
      }

      return finishWeekend(saveWorld, weekend, event);
    },
  };
}
