import { createRng } from "../random.js";
import { SIM_EVENT } from "../timeEngine.js";

export const RACE_EVENT = Object.freeze({
  QUALIFYING_COMPLETED: "race.qualifying_completed",
  COMPLETED: "race.completed",
  SKIPPED: "race.skipped",
});

const DRIVER_FIELDS = Object.freeze({
  qualifying: ["qualifying", "pace"],
  pace: ["pace", "qualifying"],
  racecraft: ["racecraft", "race_intelligence"],
  wet: ["wet_skill", "wet_ability"],
  consistency: ["consistency"],
  tyre: ["tire_management", "tyre_management"],
  intelligence: ["race_intelligence", "racecraft"],
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

function currentTrack(saveWorld, event, race) {
  const id = event.payload?.track_id ?? race.track_id ?? race.circuit_id;
  return (saveWorld.world?.tracks ?? []).find((row) => row.track_id === id || row.circuit_id === id) ?? {};
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
  const supply = (saveWorld.world?.teamEngines ?? []).find((row) => row.team_id === teamId) ?? {};
  return (saveWorld.world?.engines ?? []).find((row) => row.engine_id === supply.engine_id) ?? {};
}

function average(source, fields, fallback = 50) {
  const values = fields.map((field) => numeric(source?.[field])).filter((value) => value !== null).map((value) => normalizeRating(value));
  if (!values.length) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function carPerformance(saveWorld, teamId, track) {
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
  return clamp(baseCar / denominator, 0, 100);
}

function reliability(saveWorld, teamId) {
  const car = carComponents(saveWorld, teamId);
  const engine = engineForTeam(saveWorld, teamId);
  const engineReliability = average(engine, ["reliability"], 65);
  const carReliability = average(car, ["gearbox_spec", "cooling_spec", "electronics_spec", "brakes_spec"], 65);
  return clamp(engineReliability * 0.58 + carReliability * 0.42, 0, 100);
}

function wetRace(race, track) {
  const text = String(race.weather_condition ?? race.weather ?? track.weather_condition ?? "").toLowerCase();
  return text.includes("wet") || text.includes("rain") || text.includes("storm");
}

function qualifyingScore(saveWorld, entrant, event, track) {
  const qualifying = driverAttribute(saveWorld, entrant.driverId, DRIVER_FIELDS.qualifying);
  const pace = driverAttribute(saveWorld, entrant.driverId, DRIVER_FIELDS.pace);
  const car = carPerformance(saveWorld, entrant.teamId, track);
  const enginePower = average(engineForTeam(saveWorld, entrant.teamId), ["power"], 50);
  const form = formScore(saveWorld, entrant.driverId);
  const rng = createRng(`${saveWorld.meta.seed}|${event.id}|qualifying|${entrant.driverId}`);
  const noise = (rng.next() - 0.5) * 3;
  return round(qualifying * 0.42 + pace * 0.18 + car * 0.29 + enginePower * 0.08 + form * 0.03 + noise);
}

function raceScore(saveWorld, entrant, gridPosition, event, track, isWet) {
  const pace = driverAttribute(saveWorld, entrant.driverId, DRIVER_FIELDS.pace);
  const racecraft = driverAttribute(saveWorld, entrant.driverId, DRIVER_FIELDS.racecraft);
  const consistency = driverAttribute(saveWorld, entrant.driverId, DRIVER_FIELDS.consistency);
  const tyre = driverAttribute(saveWorld, entrant.driverId, DRIVER_FIELDS.tyre);
  const intelligence = driverAttribute(saveWorld, entrant.driverId, DRIVER_FIELDS.intelligence);
  const wet = driverAttribute(saveWorld, entrant.driverId, DRIVER_FIELDS.wet);
  const car = carPerformance(saveWorld, entrant.teamId, track);
  const form = formScore(saveWorld, entrant.driverId);
  const rng = createRng(`${saveWorld.meta.seed}|${event.id}|race-performance|${entrant.driverId}`);
  const noise = (rng.next() - 0.5) * 4;
  const gridBonus = Math.max(0, 3 - (gridPosition - 1) * 0.12);

  const driverScore = isWet
    ? pace * 0.15 + racecraft * 0.18 + consistency * 0.12 + tyre * 0.08 + intelligence * 0.1 + wet * 0.22
    : pace * 0.23 + racecraft * 0.2 + consistency * 0.14 + tyre * 0.1 + intelligence * 0.11 + wet * 0.02;
  return round(driverScore + car * 0.23 + form * 0.02 + gridBonus + noise);
}

function retirementOutcome(saveWorld, entrant, event, race) {
  const reliabilityScore = reliability(saveWorld, entrant.teamId);
  const crashLikelihood = driverAttribute(saveWorld, entrant.driverId, DRIVER_FIELDS.crash, 20);
  const mechanicalProbability = clamp(0.015 + (100 - reliabilityScore) * 0.0032, 0.01, 0.42);
  const incidentProbability = clamp(0.008 + crashLikelihood * 0.0011, 0.008, 0.16);
  const mechRng = createRng(`${saveWorld.meta.seed}|${event.id}|mechanical|${entrant.driverId}`);
  const incidentRng = createRng(`${saveWorld.meta.seed}|${event.id}|incident|${entrant.driverId}`);
  let reason = null;
  if (mechRng.next() < mechanicalProbability) reason = "mechanical";
  else if (incidentRng.next() < incidentProbability) reason = "incident";
  if (!reason) return { retired: false, reason: null, reliability: round(reliabilityScore, 2), completedLaps: null };

  const laps = Math.max(1, Math.round(numeric(race.laps ?? race.race_laps ?? race.total_laps, 60)));
  const progressRng = createRng(`${saveWorld.meta.seed}|${event.id}|retirement-lap|${entrant.driverId}`);
  return {
    retired: true,
    reason,
    reliability: round(reliabilityScore, 2),
    completedLaps: Math.floor(progressRng.next() * laps),
  };
}

function buildWeekend(saveWorld, event) {
  const race = currentRace(saveWorld, event);
  const track = currentTrack(saveWorld, event, race);
  const entries = entrants(saveWorld);
  if (!entries.length) return null;

  const qualifying = entries
    .map((entry) => ({ ...entry, score: qualifyingScore(saveWorld, entry, event, track) }))
    .sort((a, b) => b.score - a.score || a.driverId.localeCompare(b.driverId))
    .map((entry, index) => ({ position: index + 1, driverId: entry.driverId, teamId: entry.teamId, score: entry.score }));
  const grid = new Map(qualifying.map((row) => [row.driverId, row.position]));
  const isWet = wetRace(race, track);
  const rawRace = entries.map((entry) => {
    const outcome = retirementOutcome(saveWorld, entry, event, race);
    return {
      driverId: entry.driverId,
      teamId: entry.teamId,
      grid: grid.get(entry.driverId),
      score: raceScore(saveWorld, entry, grid.get(entry.driverId), event, track, isWet),
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

  return {
    season: Number(saveWorld.clock.season),
    gpId: event.payload?.gp_id ?? race.gp_id ?? null,
    gpName: event.payload?.gp_name ?? race.gp_name ?? null,
    round: numeric(event.payload?.round ?? race.round),
    trackId: event.payload?.track_id ?? race.track_id ?? race.circuit_id ?? null,
    date: event.date,
    conditions: isWet ? "wet" : "dry_or_unspecified",
    qualifying,
    classification,
  };
}

export function createRaceWeekendSystem() {
  return {
    id: "race.weekend",
    eventTypes: [SIM_EVENT.RACE_DAY],
    handle({ saveWorld, event }) {
      const state = saveWorld.simulation.systemState[this.id] ??= { completed: [] };
      const key = `${saveWorld.clock.season}:${event.payload?.gp_id ?? event.payload?.round ?? event.date}`;
      if (state.completed.includes(key)) return null;

      const weekend = buildWeekend(saveWorld, event);
      if (!weekend) {
        state.completed.push(key);
        return { type: RACE_EVENT.SKIPPED, payload: { gp_id: event.payload?.gp_id ?? null, reason: "no_race_drivers" } };
      }

      saveWorld.history.races ??= [];
      saveWorld.history.races.push(structuredClone(weekend));
      state.completed.push(key);
      state.completed.sort();
      return [
        {
          type: RACE_EVENT.QUALIFYING_COMPLETED,
          payload: {
            gp_id: weekend.gpId,
            round: weekend.round,
            pole_driver_id: weekend.qualifying[0]?.driverId ?? null,
            classification: weekend.qualifying,
          },
        },
        {
          type: RACE_EVENT.COMPLETED,
          payload: weekend,
        },
      ];
    },
  };
}
