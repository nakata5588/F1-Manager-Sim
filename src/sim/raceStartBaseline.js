import { technicalCarComponentsForDriver } from "../game/management/technical.js";
import { activeEngineForTeam } from "../game/management/suppliers.js";
import { adjustReliabilityForCondition, conditionPerformanceModifier } from "../game/management/reliability.js";

function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeRating(value, fallback = 50) {
  const parsed = numeric(value);
  if (parsed === null) return fallback;
  if (parsed >= 0 && parsed <= 1) return parsed * 100;
  if (parsed >= 1 && parsed <= 10) return parsed * 10;
  return clamp(parsed);
}

function round(value, digits = 4) {
  return Number(Number(value).toFixed(digits));
}

function driverProfile(saveWorld, driverId) {
  return (saveWorld.world?.drivers ?? []).find((row) => row.driver_id === driverId) ?? {};
}

function driverRatingRow(saveWorld, driverId) {
  return (saveWorld.world?.driverRatings ?? []).find((row) => row.driver_id === driverId) ?? {};
}

function driverAttribute(saveWorld, driverId, names, fallback = 50) {
  const state = saveWorld.world?.careerState?.drivers?.[driverId] ?? {};
  const dynamic = state.attributes ?? {};
  const rating = driverRatingRow(saveWorld, driverId);
  const profile = driverProfile(saveWorld, driverId);
  for (const name of names) {
    const value = dynamic[name] ?? rating[name] ?? profile[name];
    if (numeric(value) !== null) return normalizeRating(value, fallback);
  }
  return fallback;
}

function teamCarComponents(saveWorld, teamId) {
  const dynamic = saveWorld.world?.carState?.[teamId]?.components;
  if (dynamic && Object.keys(dynamic).length) return dynamic;
  return (saveWorld.world?.carStats ?? []).find((row) => row.team_id === teamId) ?? {};
}

function carComponents(saveWorld, teamId, driverId = null) {
  const team = teamCarComponents(saveWorld, teamId);
  if (!driverId || !saveWorld.world?.technical?.teams?.[teamId]) return team;
  return technicalCarComponentsForDriver(saveWorld, teamId, driverId, team);
}

function engineForTeam(saveWorld, teamId) {
  return activeEngineForTeam(saveWorld, teamId) ?? {};
}

function average(values, fallback = 50) {
  const usable = values.map((value) => numeric(value)).filter((value) => value !== null).map((value) => normalizeRating(value));
  if (!usable.length) return fallback;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function carScore(saveWorld, teamId, driverId = null) {
  const car = carComponents(saveWorld, teamId, driverId);
  return average([
    car.chassis_spec,
    car.aero_spec,
    car.gearbox_spec,
    car.suspension_spec,
    car.brakes_spec,
    car.cooling_spec,
    car.electronics_spec,
  ]);
}

function reliabilityScore(saveWorld, teamId, driverId = null) {
  const car = carComponents(saveWorld, teamId, driverId);
  const engine = engineForTeam(saveWorld, teamId);
  const engineReliability = normalizeRating(engine.reliability, 65);
  const carReliability = average([
    car.gearbox_spec,
    car.brakes_spec,
    car.cooling_spec,
    car.electronics_spec,
  ], 65);
  const base = clamp(engineReliability * 0.58 + carReliability * 0.42);
  return driverId ? adjustReliabilityForCondition(saveWorld, teamId, driverId, base) : base;
}

function setupQuality(weekend, driverId) {
  return normalizeRating(weekend.practice?.results?.find((row) => row.driverId === driverId)?.setupQuality, 50);
}

function baselinePerformance(saveWorld, weekend, gridRow) {
  const driverId = gridRow.driverId;
  const teamId = gridRow.teamId;
  const pace = driverAttribute(saveWorld, driverId, ["pace", "qualifying"]);
  const racecraft = driverAttribute(saveWorld, driverId, ["racecraft", "race_intelligence"]);
  const consistency = driverAttribute(saveWorld, driverId, ["consistency"]);
  const tyre = driverAttribute(saveWorld, driverId, ["tire_management", "tyre_management"]);
  const intelligence = driverAttribute(saveWorld, driverId, ["race_intelligence", "racecraft"]);
  const start = driverAttribute(saveWorld, driverId, ["start_launch", "starts", "racecraft"]);
  const driver = pace * 0.32 + racecraft * 0.22 + consistency * 0.12 + tyre * 0.10 + intelligence * 0.08 + start * 0.06;
  const car = carScore(saveWorld, teamId, driverId);
  const enginePower = normalizeRating(engineForTeam(saveWorld, teamId).power, 50);
  const setup = setupQuality(weekend, driverId);
  const qualifying = normalizeRating(gridRow.qualifyingScore, driver);
  const gridContext = clamp(100 - Math.max(0, Number(gridRow.grid ?? 1) - 1) * 1.4, 35, 100);
  const conditionModifier = conditionPerformanceModifier(saveWorld, teamId, driverId);
  return clamp(
    driver * 0.55
      + car * 0.27
      + enginePower * 0.08
      + setup * 0.05
      + qualifying * 0.03
      + gridContext * 0.02
      + conditionModifier,
  );
}

/**
 * Builds the starting performance state consumed by the temporal race engine.
 *
 * This is deliberately NOT a race classification. It contains no retirement,
 * finishing-position or simulated outcome information. Grid order is merely the
 * initial order at lights out; the live race engine owns everything afterwards.
 */
export function createRaceStartBaseline(saveWorld, weekend) {
  if (!weekend?.key || !Array.isArray(weekend.grid) || !weekend.grid.length) {
    throw new TypeError("A race weekend with a populated grid is required.");
  }

  return weekend.grid.map((gridRow, index) => ({
    driverId: gridRow.driverId,
    teamId: gridRow.teamId,
    grid: Number(gridRow.grid ?? index + 1),
    startOrder: Number(gridRow.grid ?? index + 1),
    status: "STARTING",
    completedLaps: 0,
    performanceIndex: round(baselinePerformance(saveWorld, weekend, gridRow), 4),
    reliability: round(reliabilityScore(saveWorld, gridRow.teamId, gridRow.driverId), 2),
    source: "race_start_baseline",
  }));
}
