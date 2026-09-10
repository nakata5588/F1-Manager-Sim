export const PERFORMANCE_CALIBRATION_EVENT = Object.freeze({
  INITIALIZED: "race.performance_calibration_initialized",
  SESSION_APPLIED: "race.performance_calibration_applied",
  RESTORED: "race.performance_calibration_restored",
});

const EVENT = Object.freeze({
  CAREER_STARTED: "sim.career_started",
  PRACTICE_COMPLETED: "race.practice_completed",
  GRID_SET: "race.grid_set",
  COMPLETED: "race.completed",
});

const COMPONENTS = Object.freeze([
  "chassis_spec",
  "aero_spec",
  "gearbox_spec",
  "suspension_spec",
  "brakes_spec",
  "cooling_spec",
  "electronics_spec",
]);

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 4) {
  return Number(Number(value).toFixed(digits));
}

function normalizeRating(value, fallback = 50) {
  const parsed = numeric(value);
  if (parsed === null) return fallback;
  if (parsed >= 0 && parsed <= 1) return parsed * 100;
  if (parsed >= 1 && parsed <= 10) return parsed * 10;
  return clamp(parsed);
}

function dependency(track, names, fallback = 0.5) {
  for (const name of names) {
    const parsed = numeric(track?.[name]);
    if (parsed === null) continue;
    return clamp(parsed <= 1 ? parsed * 100 : parsed) / 100;
  }
  return fallback;
}

function average(values, fallback = 50) {
  const valid = values.map((value) => numeric(value)).filter((value) => value !== null);
  if (!valid.length) return fallback;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function calibrationStore(saveWorld) {
  saveWorld.simulation ??= { nextEventSequence: 0, systemState: {} };
  saveWorld.simulation.systemState ??= {};
  return saveWorld.simulation.systemState["race.performance_calibration"] ??= {
    initialized: false,
    teams: {},
    pendingWeekends: {},
  };
}

function sourceCar(saveWorld, teamId) {
  return (saveWorld.world?.carStats ?? []).find((row) => row.team_id === teamId) ?? {};
}

function carModel(saveWorld, teamId) {
  return (saveWorld.world?.carPerformanceModels ?? []).find((row) => row.team_id === teamId)
    ?? (saveWorld.world?.carStats ?? []).find((row) => row.team_id === teamId && numeric(row.race_pace) !== null)
    ?? null;
}

function sourceComponents(saveWorld, teamId) {
  const row = sourceCar(saveWorld, teamId);
  const components = {};
  for (const field of COMPONENTS) {
    const value = numeric(row[field]);
    if (value !== null) components[field] = normalizeRating(value);
  }
  return components;
}

function initialize(saveWorld) {
  const store = calibrationStore(saveWorld);
  if (store.initialized) return 0;
  let teams = 0;
  for (const team of saveWorld.world?.teams ?? []) {
    const teamId = team.team_id;
    const model = carModel(saveWorld, teamId);
    if (!teamId || !model) continue;
    store.teams[teamId] = {
      sourceComponents: sourceComponents(saveWorld, teamId),
      modelStatus: model.data_status ?? model.model_data_status ?? null,
    };
    teams += 1;
  }
  store.initialized = true;
  return teams;
}

function activeWeekend(saveWorld, event) {
  const key = event.payload?.weekend_key ?? event.payload?.key ?? null;
  if (!key) return null;
  return saveWorld.world?.raceWeekendState?.active?.[key] ?? null;
}

function currentTrack(saveWorld, weekend) {
  const id = weekend?.trackId ?? weekend?.race?.track_id ?? weekend?.race?.circuit_id;
  return (saveWorld.world?.tracks ?? []).find((row) => row.track_id === id || row.circuit_id === id)
    ?? weekend?.race
    ?? {};
}

function developmentSnapshot(saveWorld, teamId) {
  return structuredClone(saveWorld.world?.carState?.[teamId]?.components ?? sourceComponents(saveWorld, teamId));
}

function developmentDeltas(saveWorld, teamId, current) {
  const base = calibrationStore(saveWorld).teams?.[teamId]?.sourceComponents ?? sourceComponents(saveWorld, teamId);
  const deltas = {};
  for (const field of COMPONENTS) {
    const now = numeric(current?.[field]);
    const then = numeric(base?.[field]);
    if (now !== null && then !== null) deltas[field] = now - then;
  }
  return deltas;
}

function phaseTargets(model, track, phase) {
  const paceFallback = average([
    model?.qualifying_pace,
    model?.race_pace,
    model?.aero_efficiency,
    model?.mechanical_grip,
  ]);
  const pace = normalizeRating(phase === "qualifying" ? model?.qualifying_pace : model?.race_pace, paceFallback);
  const aero = normalizeRating(model?.aero_efficiency, pace);
  const mechanical = normalizeRating(model?.mechanical_grip, pace);
  const straight = normalizeRating(model?.straight_line_speed, pace);
  const low = normalizeRating(model?.low_speed_performance, mechanical);
  const high = normalizeRating(model?.high_speed_performance, aero);
  const tyreControl = normalizeRating(model?.tyre_wear_control, pace);
  const cooling = normalizeRating(model?.cooling_margin, pace);
  const reliability = normalizeRating(model?.reliability, pace);

  const powerSensitivity = dependency(track, ["power_sensitivity", "power_dependency", "engine_dependency"]);
  const aeroSensitivity = dependency(track, ["aero_sensitivity", "aero_dependency", "downforce_dependency"]);
  const brakeStress = dependency(track, ["brake_stress"], 0.5);
  const tyreWear = dependency(track, ["tyre_wear", "tire_wear"], 0.5);

  // Historical constructor rank/points are deliberately absent here. They are
  // evidence used to author the estimates, never direct race-performance inputs.
  return {
    chassis_spec: clamp(
      pace * 0.36 + mechanical * 0.24 + low * 0.16 + high * 0.14 + tyreControl * 0.10
      + (tyreControl - pace) * (tyreWear - 0.5) * 0.10,
    ),
    aero_spec: clamp(
      pace * 0.33 + aero * 0.42 + high * 0.25
      + (aero - pace) * (aeroSensitivity - 0.5) * 0.14,
    ),
    gearbox_spec: clamp(
      pace * 0.37 + straight * 0.53 + reliability * 0.10
      + (straight - pace) * (powerSensitivity - 0.5) * 0.16,
    ),
    suspension_spec: clamp(pace * 0.35 + mechanical * 0.40 + low * 0.25),
    brakes_spec: clamp(
      pace * 0.38 + mechanical * 0.36 + high * 0.16 + reliability * 0.10
      + (mechanical - pace) * (brakeStress - 0.5) * 0.12,
    ),
    cooling_spec: clamp(
      pace * 0.22 + cooling * 0.58 + reliability * 0.20
      + (cooling - pace) * (powerSensitivity - 0.5) * 0.10,
    ),
    electronics_spec: clamp(reliability * 0.70 + pace * 0.30),
  };
}

export function calibratedCarComponents(saveWorld, teamId, track, phase, currentComponents = null) {
  const model = carModel(saveWorld, teamId);
  if (!model) return currentComponents ? structuredClone(currentComponents) : sourceComponents(saveWorld, teamId);
  const current = currentComponents ?? developmentSnapshot(saveWorld, teamId);
  const deltas = developmentDeltas(saveWorld, teamId, current);
  const targets = phaseTargets(model, track, phase);
  const source = calibrationStore(saveWorld).teams?.[teamId]?.sourceComponents ?? sourceComponents(saveWorld, teamId);
  const result = {};

  for (const field of COMPONENTS) {
    // A null source field means the component is not part of this era's car
    // model. Ignore placeholder zeroes that older saves may have materialized.
    if (numeric(source?.[field]) === null) continue;
    result[field] = round(clamp(targets[field] + numeric(deltas[field], 0)), 4);
  }
  return result;
}

function pendingWeekend(saveWorld, weekend) {
  const store = calibrationStore(saveWorld);
  return store.pendingWeekends[weekend.key] ??= { teams: {} };
}

function captureTeam(saveWorld, pending, teamId) {
  if (pending.teams[teamId]) return pending.teams[teamId];
  const developmentComponents = developmentSnapshot(saveWorld, teamId);
  const record = {
    developmentComponents,
    developmentDeltas: developmentDeltas(saveWorld, teamId, developmentComponents),
  };
  pending.teams[teamId] = record;
  return record;
}

function applySessionCalibration(saveWorld, weekend, phase) {
  const track = currentTrack(saveWorld, weekend);
  const pending = pendingWeekend(saveWorld, weekend);
  const teamIds = [...new Set((weekend.entrants ?? []).map((row) => row.teamId).filter(Boolean))].sort();
  let applied = 0;

  for (const teamId of teamIds) {
    const model = carModel(saveWorld, teamId);
    const carState = saveWorld.world?.carState?.[teamId];
    if (!model || !carState) continue;
    const captured = captureTeam(saveWorld, pending, teamId);
    carState.components = calibratedCarComponents(saveWorld, teamId, track, phase, captured.developmentComponents);
    carState.performanceCalibration = {
      phase,
      weekendKey: weekend.key,
      modelStatus: model.data_status ?? model.model_data_status ?? null,
      appliedAt: weekend.date ?? saveWorld.clock?.date ?? null,
    };
    applied += 1;
  }
  return applied;
}

function tyreModelForTeam(saveWorld, teamId) {
  const supplier = String(saveWorld.world?.teamTyreSuppliers?.[teamId] ?? "").trim().toLowerCase();
  if (!supplier) return null;
  return (saveWorld.world?.tyreModels ?? []).find((row) => String(row.supplier_id ?? row.tyre_supplier ?? "").trim().toLowerCase() === supplier) ?? null;
}

function calibratedStintGrip(model, strategy, stint, track) {
  const isWet = String(strategy?.condition ?? "dry").toLowerCase() === "wet";
  const peak = normalizeRating(isWet ? model?.wet_performance : model?.dry_peak_grip, numeric(stint?.grip, 50));
  const warmup = normalizeRating(model?.warmup, 50);
  const wearResistance = normalizeRating(model?.wear_resistance, 50);
  const operatingWindow = normalizeRating(model?.operating_window_width, 50);
  const trackWear = dependency(track, ["tyre_wear", "tire_wear"], 0.5);
  const targetLaps = Math.max(1, numeric(stint?.targetLaps, 1));

  // Ratings affect expected stint performance without being converted into an
  // invented absolute tyre-life figure. Explicit durability-lap data, if ever
  // supplied, remains the only source for hard stint-life limits.
  const warmupPenalty = (100 - warmup) * 0.04 * Math.min(1, 6 / targetLaps);
  const wearPenalty = (100 - wearResistance) * trackWear * Math.min(1, targetLaps / 45) * 0.03;
  const windowPenalty = (100 - operatingWindow) * trackWear * 0.006;
  return round(clamp(peak - warmupPenalty - wearPenalty - windowPenalty), 3);
}

export function calibrateTyreStrategies(saveWorld, weekend) {
  if (!weekend?.strategies || !Object.keys(weekend.strategies).length) return 0;
  const track = currentTrack(saveWorld, weekend);
  const entrants = new Map((weekend.entrants ?? []).map((row) => [row.driverId, row]));
  let calibrated = 0;

  for (const [driverId, strategy] of Object.entries(weekend.strategies)) {
    const teamId = entrants.get(driverId)?.teamId;
    const model = tyreModelForTeam(saveWorld, teamId);
    if (!teamId || !model) continue;
    const supplier = String(model.supplier_id ?? model.tyre_supplier ?? "").trim().toLowerCase();
    strategy.stints = (strategy.stints ?? []).map((stint) => ({
      ...stint,
      grip: calibratedStintGrip(model, strategy, stint, track),
      supplierModel: {
        supplier,
        warmup: normalizeRating(model.warmup, 50),
        wearResistance: normalizeRating(model.wear_resistance, 50),
        wetPerformance: normalizeRating(model.wet_performance, 50),
        operatingWindowWidth: normalizeRating(model.operating_window_width, 50),
        dataStatus: model.data_status ?? model.gameplay_model_status ?? null,
      },
    }));
    strategy.tyreCalibration = {
      supplier,
      trackWear: round(dependency(track, ["tyre_wear", "tire_wear"], 0.5), 4),
      dataStatus: model.data_status ?? model.gameplay_model_status ?? null,
      durabilityPolicy: "rating_affects_pace_only_no_invented_lap_life",
    };
    calibrated += 1;
  }
  return calibrated;
}

function restore(saveWorld, weekendKey) {
  const store = calibrationStore(saveWorld);
  const pending = store.pendingWeekends[weekendKey];
  if (!pending) return 0;
  let restored = 0;
  for (const [teamId, record] of Object.entries(pending.teams ?? {})) {
    const carState = saveWorld.world?.carState?.[teamId];
    if (!carState) continue;
    carState.components = structuredClone(record.developmentComponents);
    delete carState.performanceCalibration;
    restored += 1;
  }
  delete store.pendingWeekends[weekendKey];
  return restored;
}

export function createPerformanceCalibrationSystem() {
  return {
    id: "race.performance_calibration",
    eventTypes: [EVENT.CAREER_STARTED, EVENT.PRACTICE_COMPLETED, EVENT.GRID_SET, EVENT.COMPLETED],
    handle({ saveWorld, event }) {
      if (event.type === EVENT.CAREER_STARTED) {
        const teams = initialize(saveWorld);
        return { type: PERFORMANCE_CALIBRATION_EVENT.INITIALIZED, payload: { teams } };
      }

      const weekend = activeWeekend(saveWorld, event);
      if (event.type === EVENT.PRACTICE_COMPLETED) {
        if (!weekend) return null;
        const teams = applySessionCalibration(saveWorld, weekend, "qualifying");
        return {
          type: PERFORMANCE_CALIBRATION_EVENT.SESSION_APPLIED,
          payload: { weekend_key: weekend.key, phase: "qualifying", teams },
        };
      }

      if (event.type === EVENT.GRID_SET) {
        if (!weekend) return null;
        const teams = applySessionCalibration(saveWorld, weekend, "race");
        const tyreStrategies = calibrateTyreStrategies(saveWorld, weekend);
        return {
          type: PERFORMANCE_CALIBRATION_EVENT.SESSION_APPLIED,
          payload: { weekend_key: weekend.key, phase: "race", teams, tyre_strategies: tyreStrategies },
        };
      }

      const key = event.payload?.key ?? event.payload?.weekend_key ?? null;
      if (!key) return null;
      const teams = restore(saveWorld, key);
      if (!teams) return null;
      return { type: PERFORMANCE_CALIBRATION_EVENT.RESTORED, payload: { weekend_key: key, teams } };
    },
  };
}
