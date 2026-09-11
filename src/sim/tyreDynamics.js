function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 4) {
  return Number(Number(value).toFixed(digits));
}

function rating(value, fallback = 50) {
  const parsed = numeric(value);
  if (parsed === null) return fallback;
  if (parsed >= 0 && parsed <= 1) return parsed * 100;
  if (parsed >= 1 && parsed <= 10) return parsed * 10;
  return clamp(parsed, 0, 100);
}

function tyreModelForTeam(saveWorld, teamId) {
  const supplier = String(saveWorld.world?.teamTyreSuppliers?.[teamId] ?? "").trim().toLowerCase();
  if (!supplier) return null;
  return (saveWorld.world?.tyreModels ?? []).find((row) => String(row.supplier_id ?? row.tyre_supplier ?? "").trim().toLowerCase() === supplier) ?? null;
}

function conditionName(value) {
  const text = String(value ?? "dry").toLowerCase();
  return text === "wet" || text === "damp" ? text : "dry";
}

export function resolveTyreDynamicTraits(saveWorld, teamId, stint = {}) {
  const embedded = stint?.supplierModel ?? null;
  const model = tyreModelForTeam(saveWorld, teamId);
  const source = embedded ?? model ?? {};
  return {
    warmup: rating(source.warmup, 50),
    operatingWindowWidth: rating(source.operatingWindowWidth ?? source.operating_window_width, 50),
    wearResistance: rating(source.wearResistance ?? source.wear_resistance, 50),
    supplier: source.supplier ?? source.supplier_id ?? source.tyre_supplier ?? null,
    dataStatus: source.dataStatus ?? source.data_status ?? source.gameplay_model_status ?? null,
    source: embedded ? "calibrated_stint_model" : model ? "team_tyre_model" : "simulation_default",
  };
}

function idealTemperatureIndex(condition) {
  if (condition === "wet") return 68;
  if (condition === "damp") return 74;
  return 82;
}

function initialTemperature(traits, condition) {
  const ideal = idealTemperatureIndex(condition);
  const coldGap = 30 - traits.warmup * 0.18;
  return clamp(ideal - coldGap, 30, 95);
}

function windowStatus(temperature, ideal, halfWindow) {
  if (temperature < ideal - halfWindow) return "cold";
  if (temperature > ideal + halfWindow) return "hot";
  return "optimal";
}

function stintKey(stint) {
  return `${stint?.stint ?? 1}:${stint?.compoundId ?? "unknown"}:${stint?.startLap ?? 1}`;
}

export function advanceTyreThermalState(saveWorld, previousState, context = {}) {
  const condition = conditionName(context.condition);
  const traits = resolveTyreDynamicTraits(saveWorld, context.teamId, context.stint);
  const key = stintKey(context.stint);
  const ideal = idealTemperatureIndex(condition);
  const halfWindow = 6 + traits.operatingWindowWidth * 0.14;
  const isNewStint = !previousState || previousState.stintKey !== key;
  const priorTemperature = isNewStint
    ? initialTemperature(traits, condition)
    : clamp(numeric(previousState.temperatureIndex, initialTemperature(traits, condition)), 20, 110);

  const sector = context.sector ?? {};
  const brakeLoad = clamp(numeric(sector.brakeStress, 0.5), 0, 1);
  const technicalLoad = clamp(numeric(sector.technicality, 0.5), 0, 1);
  const aeroLoad = clamp(numeric(sector.aeroSensitivity, 0.5), 0, 1);
  const sectorWeight = clamp(numeric(sector.weight, 1 / 3), 0.05, 1);
  const trackGripIndex = clamp(numeric(context.trackGripIndex, 50), 25, 75);
  const neutralised = Boolean(context.neutralised);

  let target = ideal
    + (brakeLoad - 0.5) * 7
    + (technicalLoad - 0.5) * 4
    + (aeroLoad - 0.5) * 2
    + (trackGripIndex - 50) * 0.08;
  if (neutralised) target -= 12;
  const gripResponse = 0.94 + (trackGripIndex - 50) * 0.002;
  const response = (0.055 + traits.warmup * 0.00145)
    * clamp(sectorWeight * 3, 0.3, 1.8)
    * clamp(gripResponse, 0.88, 1.08);
  const nextTemperature = clamp(priorTemperature + (target - priorTemperature) * response, 20, 110);
  const status = windowStatus(nextTemperature, ideal, halfWindow);
  const deviation = Math.max(0, Math.abs(nextTemperature - ideal) - halfWindow);
  const dynamicPenalty = deviation / Math.max(6, halfWindow) * 0.72;

  // Pre-race calibration already includes an average warm-up/window penalty.
  // This compensation redistributes that expected penalty through the stint
  // rather than charging it a second time on top of the calibrated grip.
  const calibrationCompensation = (100 - traits.warmup) * 0.0018
    + (100 - traits.operatingWindowWidth) * 0.0008;
  const paceModifier = clamp(dynamicPenalty - calibrationCompensation, -0.22, 1.4);

  return {
    stintKey: key,
    compoundId: context.stint?.compoundId ?? null,
    temperatureIndex: round(nextTemperature, 3),
    idealIndex: ideal,
    halfWindowIndex: round(halfWindow, 3),
    trackGripIndex: round(trackGripIndex, 3),
    status,
    previousStatus: isNewStint ? null : previousState.status ?? null,
    paceModifier: round(paceModifier, 4),
    traits,
    lapsOnTyre: isNewStint ? 0 : Number(previousState.lapsOnTyre ?? 0),
    newStint: isNewStint,
  };
}

export function completeTyreThermalLap(state) {
  if (!state) return null;
  return { ...state, lapsOnTyre: Number(state.lapsOnTyre ?? 0) + 1 };
}
