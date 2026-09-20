import { createRng } from "../../sim/random.js";

export const DRIVER_AVAILABILITY_EVENT = Object.freeze({
  INITIALIZED: "driver.availability_initialized",
  INJURED: "driver.injured",
  RECOVERED: "driver.recovered",
  REPLACEMENT_APPOINTED: "driver.replacement_appointed",
  REPLACEMENT_ENDED: "driver.replacement_ended",
  REPLACEMENT_UNAVAILABLE: "driver.replacement_unavailable",
});

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function isoDate(value) {
  const text = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function addDays(dateText, days) {
  const date = new Date(`${String(dateText).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) return String(dateText).slice(0, 10);
  date.setUTCDate(date.getUTCDate() + Math.max(0, Math.round(days)));
  return date.toISOString().slice(0, 10);
}

function effectiveRow(value, season) {
  if (!Array.isArray(value)) return value && typeof value === "object" ? value : {};
  return [...value]
    .filter((row) => {
      const year = Number(row?.year);
      return !Number.isFinite(year) || year <= season;
    })
    .sort((a, b) => Number(b?.year ?? -Infinity) - Number(a?.year ?? -Infinity))[0] ?? {};
}

function normalizeProbability(value) {
  const parsed = numeric(value);
  if (parsed === null) return null;
  if (parsed > 1) return clamp(parsed / 100, 0, 1);
  return clamp(parsed, 0, 1);
}

function normalizeSafetyIndex(value) {
  const parsed = numeric(value);
  if (parsed === null) return null;
  if (parsed > 1) return clamp(parsed / 100, 0, 1);
  return clamp(parsed, 0, 1);
}

export function ensureDriverAvailabilityState(saveWorld) {
  saveWorld.world.driverAvailability ??= {
    drivers: {},
    injuries: [],
    replacements: [],
    nextInjuryId: 1,
    nextReplacementId: 1,
  };
  const state = saveWorld.world.driverAvailability;
  state.drivers ??= {};
  state.injuries ??= [];
  state.replacements ??= [];
  state.nextInjuryId = Math.max(1, Math.round(numeric(state.nextInjuryId, 1)));
  state.nextReplacementId = Math.max(1, Math.round(numeric(state.nextReplacementId, 1)));
  saveWorld.history.driverAvailability ??= [];
  return state;
}

export function ensureDriverMedicalState(saveWorld, driverId) {
  const state = ensureDriverAvailabilityState(saveWorld);
  state.drivers[driverId] ??= {
    driverId,
    status: "fit",
    injuryId: null,
    injuryClass: null,
    injuredAt: null,
    unavailableUntil: null,
    expectedReturnDate: null,
    recoveredAt: null,
    temporaryRaceTeamId: null,
    replacementForDriverId: null,
  };
  return state.drivers[driverId];
}

export function initializeDriverAvailability(saveWorld, date = saveWorld.clock?.date) {
  const state = ensureDriverAvailabilityState(saveWorld);
  let created = 0;
  for (const profile of saveWorld.world?.drivers ?? []) {
    const id = profile?.driver_id;
    if (!id || state.drivers[id]) continue;
    ensureDriverMedicalState(saveWorld, id);
    created += 1;
  }
  for (const [id, career] of Object.entries(saveWorld.world?.careerState?.drivers ?? {})) {
    const medical = ensureDriverMedicalState(saveWorld, id);
    if (career?.status === "retired") {
      medical.status = "retired";
      medical.unavailableUntil = null;
      medical.expectedReturnDate = null;
    }
  }
  state.initializedAt ??= date ?? null;
  return { created, total: Object.keys(state.drivers).length };
}

export function isDriverRaceAvailable(saveWorld, driverId, date = saveWorld.clock?.date) {
  if (!driverId) return false;
  if (saveWorld.world?.careerState?.drivers?.[driverId]?.status === "retired") return false;
  const medical = ensureDriverMedicalState(saveWorld, driverId);
  if (medical.status === "retired") return false;
  if (["injured", "unavailable"].includes(medical.status)) {
    const until = isoDate(medical.unavailableUntil);
    const current = isoDate(date);
    if (!until || !current || current <= until) return false;
  }
  return true;
}

function defaultInjuryRisk(season) {
  if (season < 1985) return 0.035;
  if (season < 1995) return 0.025;
  if (season < 2005) return 0.018;
  return 0.012;
}

function injuryPolicy(saveWorld) {
  const season = Number(saveWorld.clock?.season);
  const accident = effectiveRow(saveWorld.world?.accidentModel, season);
  const safety = effectiveRow(saveWorld.world?.eraSafety, season);
  const explicit = normalizeProbability(
    accident?.injury_prob
      ?? accident?.injury_probability
      ?? accident?.driver_injury_probability,
  );
  const safetyIndex = normalizeSafetyIndex(
    safety?.era_safety_index
      ?? safety?.safety_index
      ?? accident?.era_safety_index,
  );
  return {
    baseProbability: explicit ?? defaultInjuryRisk(season),
    baseSource: explicit === null ? "simulation_default_era_injury_risk" : "season_database_accident_model",
    safetyIndex,
    safetySource: safetyIndex === null ? "unspecified" : (safety?.source ?? "season_database_era_safety"),
  };
}

function injuryClass(severity, rng) {
  const score = clamp(severity + (rng.next() - 0.5) * 18, 0, 100);
  if (score < 45) return "minor";
  if (score < 68) return "moderate";
  if (score < 88) return "serious";
  return "career_threatening";
}

function durationRange(kind) {
  if (kind === "minor") return [2, 10];
  if (kind === "moderate") return [11, 35];
  if (kind === "serious") return [36, 105];
  return [90, 220];
}

function injuryProbability(policy, incident) {
  const severity = clamp(numeric(incident?.severity, 0), 0, 100);
  if (policy.baseProbability >= 0.999) return 1;
  const severityFactor = 0.15 + ((severity / 100) ** 2) * 3.5;
  const terminalFactor = incident?.terminal === true ? 1.35 : 1;
  const safetyFactor = policy.safetyIndex === null ? 1 : 1.15 - policy.safetyIndex * 0.45;
  return clamp(policy.baseProbability * severityFactor * terminalFactor * safetyFactor, 0, 0.65);
}

export function resolveDriverInjury(saveWorld, race, incident, options = {}) {
  const driverId = incident?.driverId ?? incident?.driver_id;
  if (!driverId) return null;
  const medical = ensureDriverMedicalState(saveWorld, driverId);
  if (!isDriverRaceAvailable(saveWorld, driverId, options.date ?? saveWorld.clock?.date)) return null;

  const policy = injuryPolicy(saveWorld);
  const probability = injuryProbability(policy, incident);
  const key = `${saveWorld.meta?.seed}|injury|${race?.key ?? race?.gpId ?? "race"}|${incident?.lap ?? 0}|${driverId}|${incident?.severity ?? 0}`;
  const rng = createRng(key);
  if (rng.next() >= probability) return null;

  const kind = injuryClass(clamp(numeric(incident?.severity, 0), 0, 100), rng);
  const [minimum, maximum] = durationRange(kind);
  const durationDays = minimum + Math.floor(rng.next() * (maximum - minimum + 1));
  const date = isoDate(options.date ?? race?.date ?? saveWorld.clock?.date) ?? String(saveWorld.clock?.date).slice(0, 10);
  const unavailableUntil = addDays(date, durationDays);
  const expectedReturnDate = addDays(unavailableUntil, 1);
  const state = ensureDriverAvailabilityState(saveWorld);
  const injuryId = `injury:${String(state.nextInjuryId++).padStart(6, "0")}`;
  const entry = (saveWorld.world?.raceEntryState?.current ?? []).find((row) => String(row.driverId) === String(driverId)) ?? null;

  const injury = {
    id: injuryId,
    driverId,
    teamId: entry?.teamId ?? saveWorld.world?.employment?.drivers?.[driverId]?.teamId ?? null,
    date,
    season: Number(saveWorld.clock?.season),
    raceKey: race?.key ?? null,
    gpId: race?.gpId ?? race?.gp_id ?? null,
    lap: numeric(incident?.lap),
    sectorId: incident?.sectorId ?? incident?.sector_id ?? null,
    incidentSeverity: Number(clamp(numeric(incident?.severity, 0), 0, 100).toFixed(2)),
    damageType: incident?.damageType ?? null,
    terminalDamage: incident?.terminal === true,
    injuryClass: kind,
    durationDays,
    unavailableUntil,
    expectedReturnDate,
    probability: Number(probability.toFixed(4)),
    probabilitySource: policy.baseSource,
    safetySource: policy.safetySource,
    status: "active",
    carNumber: entry?.carNumber ?? null,
    entrantId: entry?.entrantId ?? null,
    tyreSupplier: entry?.tyreSupplier ?? null,
    sourceRole: entry?.sourceRole ?? null,
  };
  state.injuries.push(injury);

  Object.assign(medical, {
    status: "injured",
    injuryId,
    injuryClass: kind,
    injuredAt: date,
    unavailableUntil,
    expectedReturnDate,
    recoveredAt: null,
  });

  saveWorld.history.driverAvailability.push({
    date,
    type: "injury",
    driverId,
    teamId: injury.teamId,
    injuryId,
    injuryClass: kind,
    durationDays,
    raceKey: injury.raceKey,
    incidentSeverity: injury.incidentSeverity,
  });
  return structuredClone(injury);
}

export function recoverDueDrivers(saveWorld, date = saveWorld.clock?.date) {
  const current = isoDate(date);
  if (!current) return [];
  const state = ensureDriverAvailabilityState(saveWorld);
  const recovered = [];
  for (const [driverId, medical] of Object.entries(state.drivers)) {
    if (medical?.status !== "injured") continue;
    const until = isoDate(medical.unavailableUntil);
    if (!until || current <= until) continue;
    const injury = state.injuries.find((row) => row.id === medical.injuryId) ?? null;
    medical.status = "fit";
    medical.recoveredAt = current;
    medical.injuryClass = null;
    medical.unavailableUntil = null;
    medical.expectedReturnDate = null;
    const injuryId = medical.injuryId;
    medical.injuryId = null;
    if (injury) {
      injury.status = "recovered";
      injury.recoveredAt = current;
    }
    const result = {
      driverId,
      teamId: injury?.teamId ?? saveWorld.world?.employment?.drivers?.[driverId]?.teamId ?? null,
      injuryId,
      recoveredAt: current,
      injuryClass: injury?.injuryClass ?? null,
      carNumber: injury?.carNumber ?? null,
      entrantId: injury?.entrantId ?? null,
      tyreSupplier: injury?.tyreSupplier ?? null,
      sourceRole: injury?.sourceRole ?? null,
    };
    recovered.push(result);
    saveWorld.history.driverAvailability.push({
      date: current,
      type: "recovery",
      driverId,
      teamId: result.teamId,
      injuryId,
    });
  }
  return recovered;
}

export function driverAvailabilityProjection(saveWorld, driverId) {
  const state = saveWorld.world?.driverAvailability;
  const medical = state?.drivers?.[driverId] ?? {
    driverId,
    status: saveWorld.world?.careerState?.drivers?.[driverId]?.status === "retired" ? "retired" : "fit",
    injuryId: null,
    injuryClass: null,
    injuredAt: null,
    unavailableUntil: null,
    expectedReturnDate: null,
    recoveredAt: null,
  };
  const activeReplacement = (state?.replacements ?? []).find((row) =>
    row.status === "active"
      && (row.absentDriverId === driverId || row.replacementDriverId === driverId)) ?? null;
  return {
    ...structuredClone(medical),
    raceAvailable: medical.status === "fit" && saveWorld.world?.careerState?.drivers?.[driverId]?.status !== "retired",
    activeReplacement: activeReplacement ? structuredClone(activeReplacement) : null,
  };
}
