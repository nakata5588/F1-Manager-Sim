import { createRng } from "../../sim/random.js";
import { activeEngineForTeam } from "./suppliers.js";

export const RELIABILITY_EVENT = Object.freeze({
  INITIALIZED: "reliability.initialized",
  RACE_WEAR_APPLIED: "reliability.race_wear_applied",
  CONDITION_WARNING: "reliability.condition_warning",
  COMPONENT_FAILED: "reliability.component_failed",
  COMPONENT_REPLACED: "reliability.component_replaced",
  COMPONENT_REBUILT: "reliability.component_rebuilt",
  ENGINE_SERVICED: "reliability.engine_serviced",
});

const BASE_WEAR = Object.freeze({
  chassis_spec: 0.9,
  aero_spec: 1.1,
  gearbox_spec: 3.8,
  suspension_spec: 1.8,
  brakes_spec: 2.2,
  cooling_spec: 2.6,
  electronics_spec: 2.0,
  turbo_spec: 3.6,
  kers_spec: 2.2,
  ers_mgu_k: 2.5,
  ers_mgu_h: 3.2,
  battery_pack: 2.4,
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

function normalizedRating(value, fallback = 70) {
  const parsed = numeric(value);
  if (parsed === null) return fallback;
  if (parsed >= 0 && parsed <= 1) return parsed * 100;
  if (parsed >= 1 && parsed <= 10) return parsed * 10;
  return clamp(parsed);
}

function ensureTechnicalTeamState(saveWorld, teamId) {
  saveWorld.world.technical ??= { teams: {} };
  saveWorld.world.technical.teams ??= {};
  const team = saveWorld.world.technical.teams?.[teamId];
  if (!team) return null;
  return team;
}

function createComponentUnit(specId, source, date) {
  return {
    specId,
    condition: 100,
    racesUsed: 0,
    failures: 0,
    failed: false,
    source,
    fittedAt: date,
    lastServicedAt: date,
  };
}

function engineUnit(saveWorld, source = "derived_serviceable_start_baseline", date = saveWorld.clock?.date ?? null) {
  const engine = activeEngineForTeam(saveWorld, "__none__");
  void engine;
  return {
    engineId: null,
    condition: 100,
    racesUsed: 0,
    failures: 0,
    failed: false,
    source,
    fittedAt: date,
    lastServicedAt: date,
  };
}

function ensureHistory(saveWorld) {
  saveWorld.history.reliability ??= [];
  return saveWorld.history.reliability;
}

export function driverCarSlot(saveWorld, teamId, driverId) {
  const entries = (saveWorld.world?.raceEntryState?.current ?? [])
    .filter((entry) => entry.teamId === teamId)
    .sort((a, b) => Number(a.carNumber ?? 999) - Number(b.carNumber ?? 999) || String(a.driverId).localeCompare(String(b.driverId)));
  const index = entries.findIndex((entry) => entry.driverId === driverId);
  return index === 1 ? "car2" : "car1";
}

function currentEngineId(saveWorld, teamId) {
  const engine = activeEngineForTeam(saveWorld, teamId);
  return engine?.engine_id ?? engine?.engine_package_id ?? engine?.id ?? null;
}

function freshEngineUnit(saveWorld, teamId, source, date) {
  return {
    ...engineUnit(saveWorld, source, date),
    engineId: currentEngineId(saveWorld, teamId),
  };
}

export function ensureReliabilityTeam(saveWorld, teamId, date = saveWorld.clock?.date ?? null) {
  const team = ensureTechnicalTeamState(saveWorld, teamId);
  if (!team) return null;
  team.reliability ??= {
    initializedAt: date,
    cars: {
      car1: { components: {}, engine: freshEngineUnit(saveWorld, teamId, "derived_serviceable_start_baseline", date) },
      car2: { components: {}, engine: freshEngineUnit(saveWorld, teamId, "derived_serviceable_start_baseline", date) },
    },
    lastRaceDate: null,
  };
  for (const carSlot of ["car1", "car2"]) {
    team.reliability.cars[carSlot] ??= { components: {}, engine: freshEngineUnit(saveWorld, teamId, "derived_serviceable_start_baseline", date) };
    team.reliability.cars[carSlot].components ??= {};
    const engine = team.reliability.cars[carSlot].engine;
    const activeId = currentEngineId(saveWorld, teamId);
    if (!engine || engine.engineId !== activeId) team.reliability.cars[carSlot].engine = freshEngineUnit(saveWorld, teamId, "supplier_change_new_unit", date);
    for (const [component, specId] of Object.entries(team.fittedCars?.[carSlot]?.components ?? {})) {
      const current = team.reliability.cars[carSlot].components[component];
      if (!current || current.specId !== specId) {
        team.reliability.cars[carSlot].components[component] = createComponentUnit(specId, "derived_serviceable_start_baseline", date);
      }
    }
  }
  ensureHistory(saveWorld);
  return team.reliability;
}

export function initializeReliabilityWorld(saveWorld, date = saveWorld.clock?.date ?? null) {
  let teams = 0;
  for (const teamId of Object.keys(saveWorld.world?.technical?.teams ?? {})) {
    if (ensureReliabilityTeam(saveWorld, teamId, date)) teams += 1;
  }
  return teams;
}

export function registerFittedComponentUnit(saveWorld, teamId, carSlot, component, specId, source = "fitted_serviceable_unit") {
  const reliability = ensureReliabilityTeam(saveWorld, teamId);
  if (!reliability) return null;
  reliability.cars[carSlot].components[component] = createComponentUnit(specId, source, saveWorld.clock?.date ?? null);
  return structuredClone(reliability.cars[carSlot].components[component]);
}

export function fittedComponentReturnable(saveWorld, teamId, carSlot, component) {
  const reliability = ensureReliabilityTeam(saveWorld, teamId);
  const unit = reliability?.cars?.[carSlot]?.components?.[component];
  if (!unit) return true;
  return !unit.failed && Number(unit.condition ?? 100) >= 72;
}

function componentReliabilityRating(team, carSlot, component) {
  const specId = team.fittedCars?.[carSlot]?.components?.[component];
  const spec = team.specs?.[specId] ?? {};
  return normalizedRating(spec.reliabilityRating ?? spec.reliabilityReference, 70);
}

function conditionScoreForSlot(saveWorld, teamId, carSlot) {
  const team = ensureTechnicalTeamState(saveWorld, teamId);
  const reliability = ensureReliabilityTeam(saveWorld, teamId);
  if (!team || !reliability) return { components: 100, engine: 100, overall: 100 };
  const rows = Object.entries(reliability.cars?.[carSlot]?.components ?? {});
  const componentScore = rows.length
    ? rows.reduce((sum, [, row]) => sum + clamp(numeric(row.condition, 100)), 0) / rows.length
    : 100;
  const engineScore = clamp(numeric(reliability.cars?.[carSlot]?.engine?.condition, 100));
  return {
    components: round(componentScore, 2),
    engine: round(engineScore, 2),
    overall: round(componentScore * 0.58 + engineScore * 0.42, 2),
  };
}

export function conditionForDriver(saveWorld, teamId, driverId) {
  return conditionScoreForSlot(saveWorld, teamId, driverCarSlot(saveWorld, teamId, driverId));
}

export function adjustReliabilityForCondition(saveWorld, teamId, driverId, baseReliability) {
  const team = ensureTechnicalTeamState(saveWorld, teamId);
  if (!team?.reliability) return clamp(numeric(baseReliability, 65));
  const condition = conditionForDriver(saveWorld, teamId, driverId);
  const prep = clamp(numeric(team.preseason?.reliabilityPrep, 0), 0, 15);
  const adjusted = numeric(baseReliability, 65) * 0.73 + condition.overall * 0.27 + prep * 0.32;
  return clamp(round(adjusted, 2));
}

export function conditionPerformanceModifier(saveWorld, teamId, driverId) {
  const team = ensureTechnicalTeamState(saveWorld, teamId);
  if (!team?.reliability) return 0;
  const condition = conditionForDriver(saveWorld, teamId, driverId).overall;
  if (condition >= 78) return 0;
  return round(-Math.min(6, (78 - condition) * 0.095), 3);
}

function raceLaps(saveWorld, payload) {
  const timeline = numeric(payload?.timeline?.totalLaps);
  if (timeline !== null && timeline > 0) return timeline;
  const race = (saveWorld.world?.calendar ?? []).find((row) => row.gp_id === payload?.gpId || row.gp_id === payload?.gp_id)
    ?? (saveWorld.world?.calendar ?? []).find((row) => Number(row.round) === Number(payload?.round));
  return Math.max(1, Math.round(numeric(race?.laps ?? race?.race_laps ?? race?.total_laps, 60)));
}

function wearMultiplierFromSpec(team, carSlot, component) {
  const rating = componentReliabilityRating(team, carSlot, component);
  return clamp(1.18 - rating / 220, 0.68, 1.15);
}

function applyWear(unit, amount, date) {
  unit.condition = round(clamp(numeric(unit.condition, 100) - amount), 2);
  unit.racesUsed = Number(unit.racesUsed ?? 0) + 1;
  unit.lastRaceDate = date;
}

function failureCandidates(team, carSlot) {
  const candidates = ["engine", "gearbox_spec", "cooling_spec", "electronics_spec", "brakes_spec"];
  return candidates.filter((component) => component === "engine" || team.fittedCars?.[carSlot]?.components?.[component]);
}

function chooseFailureComponent(saveWorld, teamId, carSlot, driverId, date, team) {
  const candidates = failureCandidates(team, carSlot);
  if (!candidates.length) return "engine";
  const rng = createRng(`${saveWorld.meta.seed}|${date}|mechanical-failure|${teamId}|${carSlot}|${driverId}`);
  return candidates[Math.min(candidates.length - 1, Math.floor(rng.next() * candidates.length))];
}

function markFailure(saveWorld, teamId, carSlot, driverId, date, team, reliability) {
  const component = chooseFailureComponent(saveWorld, teamId, carSlot, driverId, date, team);
  const unit = component === "engine"
    ? reliability.cars[carSlot].engine
    : reliability.cars[carSlot].components[component];
  if (!unit) return null;
  unit.condition = 0;
  unit.failed = true;
  unit.failures = Number(unit.failures ?? 0) + 1;
  unit.lastFailureAt = date;
  return { teamId, carSlot, driverId, component, specId: component === "engine" ? null : unit.specId, engineId: component === "engine" ? unit.engineId : null };
}

export function applyRaceWear(saveWorld, payload = {}, date = saveWorld.clock?.date ?? null) {
  const classification = payload.classification ?? [];
  if (!Array.isArray(classification) || !classification.length) return { teams: [], warnings: [], failures: [] };
  const totalLaps = raceLaps(saveWorld, payload);
  const teamRecords = new Map();
  const warnings = [];
  const failures = [];

  for (const row of classification) {
    const teamId = row.teamId ?? row.team_id;
    const driverId = row.driverId ?? row.driver_id;
    if (!teamId || !driverId) continue;
    const team = ensureTechnicalTeamState(saveWorld, teamId);
    const reliability = ensureReliabilityTeam(saveWorld, teamId, date);
    if (!team || !reliability) continue;
    const carSlot = driverCarSlot(saveWorld, teamId, driverId);
    const finished = String(row.status ?? "").toUpperCase() === "FINISHED";
    const completed = finished ? totalLaps : Math.max(0, numeric(row.completedLaps ?? row.completed_laps, 0));
    const usage = clamp(completed / totalLaps, 0.08, 1);
    const prep = clamp(numeric(team.preseason?.reliabilityPrep, 0), 0, 15);
    const prepFactor = 1 - Math.min(0.12, prep * 0.008);

    for (const [component, unit] of Object.entries(reliability.cars[carSlot].components ?? {})) {
      const base = BASE_WEAR[component] ?? 1.6;
      const rng = createRng(`${saveWorld.meta.seed}|${date}|wear|${teamId}|${carSlot}|${component}`);
      const variation = 0.88 + rng.next() * 0.24;
      applyWear(unit, base * usage * wearMultiplierFromSpec(team, carSlot, component) * variation * prepFactor, date);
      if (unit.condition < 45) warnings.push({ teamId, carSlot, component, condition: unit.condition, critical: true });
      else if (unit.condition < 65) warnings.push({ teamId, carSlot, component, condition: unit.condition, critical: false });
    }

    const engine = reliability.cars[carSlot].engine;
    const engineProfile = activeEngineForTeam(saveWorld, teamId);
    const engineRel = normalizedRating(engineProfile.reliability ?? engineProfile.reliability_rating, 65);
    const engineRng = createRng(`${saveWorld.meta.seed}|${date}|engine-wear|${teamId}|${carSlot}`);
    const engineWear = 5.0 * usage * clamp(1.24 - engineRel / 210, 0.72, 1.2) * (0.9 + engineRng.next() * 0.2) * prepFactor;
    applyWear(engine, engineWear, date);
    if (engine.condition < 45) warnings.push({ teamId, carSlot, component: "engine", condition: engine.condition, critical: true });
    else if (engine.condition < 65) warnings.push({ teamId, carSlot, component: "engine", condition: engine.condition, critical: false });

    if (String(row.status ?? "").toUpperCase() === "DNF" && String(row.reason ?? "").toLowerCase() === "mechanical") {
      const failure = markFailure(saveWorld, teamId, carSlot, driverId, date, team, reliability);
      if (failure) failures.push(failure);
    }

    reliability.lastRaceDate = date;
    const record = teamRecords.get(teamId) ?? { teamId, cars: {} };
    record.cars[carSlot] = reliabilityProjection(saveWorld, teamId).cars[carSlot];
    teamRecords.set(teamId, record);
  }

  const record = {
    date,
    season: Number(saveWorld.clock?.season),
    type: "race_wear",
    raceKey: payload.key ?? payload.weekendKey ?? payload.gpId ?? payload.gp_id ?? null,
    teams: [...teamRecords.values()],
    failures: structuredClone(failures),
  };
  ensureHistory(saveWorld).push(record);
  return { teams: [...teamRecords.values()], warnings, failures };
}

function spend(saveWorld, teamId, amount, reason) {
  const finance = saveWorld.world?.teamState?.[teamId];
  if (!finance) throw new Error(`Team '${teamId}' does not have initialized finances.`);
  const cost = Math.max(0, round(amount));
  if (numeric(finance.cash, 0) < cost) throw new Error(`Team '${teamId}' does not have enough cash for ${reason}.`);
  finance.cash = round(numeric(finance.cash, 0) - cost);
  return cost;
}

export function replaceWornComponent(saveWorld, teamId, input = {}) {
  const carSlot = input.carSlot === "car2" ? "car2" : "car1";
  const component = String(input.component ?? "");
  const team = ensureTechnicalTeamState(saveWorld, teamId);
  const reliability = ensureReliabilityTeam(saveWorld, teamId);
  if (!team || !reliability) throw new Error("Technical reliability state is not initialized.");
  const specId = team.fittedCars?.[carSlot]?.components?.[component];
  if (!specId) throw new Error(`Component '${component}' is not fitted to ${carSlot}.`);
  const inventory = team.inventory?.[specId];
  if (!inventory || numeric(inventory.available, 0) < 1) throw new Error("No matching manufactured spare is available.");
  inventory.available -= 1;
  reliability.cars[carSlot].components[component] = createComponentUnit(specId, "manufactured_spare_replacement", saveWorld.clock.date);
  const record = { date: saveWorld.clock.date, type: "component_replaced", teamId, carSlot, component, specId, inventoryRemaining: inventory.available };
  ensureHistory(saveWorld).push(record);
  return record;
}

export function rebuildFittedComponent(saveWorld, teamId, input = {}) {
  const carSlot = input.carSlot === "car2" ? "car2" : "car1";
  const component = String(input.component ?? "");
  const team = ensureTechnicalTeamState(saveWorld, teamId);
  const reliability = ensureReliabilityTeam(saveWorld, teamId);
  const unit = reliability?.cars?.[carSlot]?.components?.[component];
  if (!team || !unit) throw new Error(`Component '${component}' is not available for rebuild.`);
  const spec = team.specs?.[unit.specId] ?? {};
  const cost = spend(saveWorld, teamId, Math.max(7000, 9000 + numeric(spec.rating, 50) * 260), `${component} rebuild`);
  unit.condition = 88;
  unit.failed = false;
  unit.lastServicedAt = saveWorld.clock.date;
  const record = { date: saveWorld.clock.date, type: "component_rebuilt", teamId, carSlot, component, specId: unit.specId, condition: unit.condition, cost };
  ensureHistory(saveWorld).push(record);
  return record;
}

export function serviceEngineUnit(saveWorld, teamId, carSlotInput = "car1") {
  const carSlot = carSlotInput === "car2" ? "car2" : "car1";
  const reliability = ensureReliabilityTeam(saveWorld, teamId);
  const unit = reliability?.cars?.[carSlot]?.engine;
  if (!unit) throw new Error("Engine reliability state is not initialized.");
  const engine = activeEngineForTeam(saveWorld, teamId);
  const power = normalizedRating(engine.power ?? engine.power_rating, 50);
  const cost = spend(saveWorld, teamId, Math.max(45000, 35000 + power * 900), "engine service/rebuild");
  unit.condition = 92;
  unit.failed = false;
  unit.lastServicedAt = saveWorld.clock.date;
  unit.engineId = currentEngineId(saveWorld, teamId);
  const record = { date: saveWorld.clock.date, type: "engine_serviced", teamId, carSlot, engineId: unit.engineId, condition: unit.condition, cost };
  ensureHistory(saveWorld).push(record);
  return record;
}

export function reliabilityProjection(saveWorld, teamId) {
  if (!teamId) return null;
  const team = ensureTechnicalTeamState(saveWorld, teamId);
  const reliability = ensureReliabilityTeam(saveWorld, teamId);
  if (!team || !reliability) return null;
  const cars = {};
  for (const carSlot of ["car1", "car2"]) {
    cars[carSlot] = {
      engine: structuredClone(reliability.cars[carSlot].engine),
      components: Object.fromEntries(Object.entries(reliability.cars[carSlot].components ?? {}).map(([component, unit]) => [component, {
        ...structuredClone(unit),
        reliabilityRating: componentReliabilityRating(team, carSlot, component),
        inventoryAvailable: numeric(team.inventory?.[unit.specId]?.available, 0),
      }])),
      condition: conditionScoreForSlot(saveWorld, teamId, carSlot),
    };
  }
  return { teamId, cars, lastRaceDate: reliability.lastRaceDate };
}
