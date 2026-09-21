const DRIVER_SKILL_FIELDS = Object.freeze([
  "pace",
  "qualifying",
  "start_launch",
  "racecraft",
  "wet_skill",
  "consistency",
  "tire_management",
  "tyre_management",
  "race_intelligence",
  "technical_feedback",
  "adaptability",
  "ers_fuel_management",
  "mentality",
  "pressure_handling",
  "leadership",
  "team_player",
  "car_development_impact",
]);

const DRIVER_BEHAVIOUR_FIELDS = Object.freeze(["aggression", "agression", "crash_likelihood"]);

export const DRIVER_CAREER_STAGES = Object.freeze([
  "academy",
  "prospect",
  "rookie",
  "developing",
  "prime",
  "veteran",
  "decline",
]);

const STAGE_FACTORS = Object.freeze({
  academy: {
    raw: [0.45, 0.58], craft: [0.38, 0.52], technical: [0.36, 0.52], mental: [0.40, 0.55],
  },
  prospect: {
    raw: [0.58, 0.72], craft: [0.52, 0.67], technical: [0.52, 0.69], mental: [0.55, 0.69],
  },
  rookie: {
    raw: [0.72, 0.82], craft: [0.67, 0.80], technical: [0.69, 0.80], mental: [0.69, 0.80],
  },
  developing: {
    raw: [0.82, 0.94], craft: [0.80, 0.94], technical: [0.80, 0.94], mental: [0.80, 0.93],
  },
  prime: {
    raw: [0.94, 1.00], craft: [0.94, 1.00], technical: [0.94, 1.00], mental: [0.93, 1.00],
  },
  veteran: {
    raw: [0.99, 0.90], craft: [1.00, 0.97], technical: [1.00, 0.98], mental: [1.00, 0.98],
  },
  decline: {
    raw: [0.90, 0.62], craft: [0.97, 0.78], technical: [0.98, 0.82], mental: [0.98, 0.80],
  },
});

const ABILITY_WEIGHTS = Object.freeze({
  pace: 0.16,
  qualifying: 0.10,
  start_launch: 0.04,
  racecraft: 0.15,
  wet_skill: 0.07,
  consistency: 0.10,
  tire_management: 0.07,
  tyre_management: 0.07,
  race_intelligence: 0.08,
  technical_feedback: 0.05,
  adaptability: 0.06,
  pressure_handling: 0.07,
  leadership: 0.02,
  team_player: 0.01,
  car_development_impact: 0.02,
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
  return Number(Number(value ?? 0).toFixed(digits));
}

function interpolate([from, to], progress) {
  return from + (to - from) * clamp(progress, 0, 1);
}

export function driverAttributeGroup(field) {
  if (["pace", "qualifying", "start_launch", "wet_skill"].includes(field)) return "raw";
  if (["racecraft", "consistency", "tire_management", "tyre_management", "race_intelligence"].includes(field)) return "craft";
  if (["technical_feedback", "adaptability", "ers_fuel_management", "car_development_impact"].includes(field)) return "technical";
  return "mental";
}

export function driverStageFactor(stage, progress, field) {
  const normalized = DRIVER_CAREER_STAGES.includes(stage) ? stage : "developing";
  const group = driverAttributeGroup(field);
  return interpolate(STAGE_FACTORS[normalized][group], progress);
}

export function inferOpeningDriverStage(age, options = {}) {
  const junior = options.status === "junior" || options.pipelineStatus === "junior";
  if (age === null || age === undefined) return junior ? "prospect" : "developing";
  if (age <= 16) return "academy";
  if (age <= 19) return "prospect";
  if (age <= 22) return junior ? "prospect" : "rookie";
  if (age <= 27) return "developing";
  if (age <= 32) return "prime";
  if (age <= 36) return "veteran";
  return "decline";
}

export function inferOpeningStageProgress(stage, age) {
  if (age === null || age === undefined) return 0.35;
  const ranges = {
    academy: [14, 17],
    prospect: [16, 21],
    rookie: [19, 23],
    developing: [22, 28],
    prime: [27, 33],
    veteran: [32, 37],
    decline: [36, 44],
  };
  const [start, end] = ranges[stage] ?? [20, 30];
  return round(clamp((age - start) / Math.max(1, end - start), 0, 1), 4);
}

function weightedAverage(values, fallback = null) {
  let numerator = 0;
  let denominator = 0;
  for (const [field, weight] of Object.entries(ABILITY_WEIGHTS)) {
    const value = numeric(values?.[field]);
    if (value === null) continue;
    numerator += value * weight;
    denominator += weight;
  }
  return denominator > 0 ? numerator / denominator : fallback;
}

export function deriveDriverCurrentAbility(attributes, fallback = null) {
  return round(clamp(weightedAverage(attributes, fallback ?? 50), 1, 100));
}

export function deriveDriverPotentialAbility(ceilings, fallback = null) {
  return round(clamp(weightedAverage(ceilings, fallback ?? 50), 1, 100));
}

function sourceAttribute(source, field, fallback = null) {
  const direct = numeric(source?.[field]);
  if (direct !== null) return direct;
  if (field === "tire_management") return numeric(source?.tyre_management, fallback);
  if (field === "tyre_management") return numeric(source?.tire_management, fallback);
  return fallback;
}

function explicitCeiling(source, field) {
  for (const key of [`${field}_ceiling`, `max_${field}`, `${field}_potential`]) {
    const value = numeric(source?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function talentReferenceFor(saveWorld, driverId) {
  return (saveWorld.world?.driverTalentReferences ?? [])
    .find((row) => String(row?.driver_id ?? "") === String(driverId)) ?? null;
}

function deterministicTrait(saveWorld, driverId, salt, minimum, maximum) {
  const text = `${saveWorld.meta?.seed ?? "career"}|${driverId}|${salt}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const normalized = (hash >>> 0) / 4294967295;
  return minimum + normalized * (maximum - minimum);
}

function deriveCeilings(saveWorld, driverId, rating, reference, stage, progress) {
  const currentAbility = numeric(rating?.current_ability ?? reference?.openingCurrentAbility, 50);
  const potentialAbility = numeric(
    reference?.potentialAbility
      ?? rating?.potential_ability
      ?? rating?.current_ability,
    currentAbility,
  );
  const gap = Math.max(0, potentialAbility - currentAbility);
  const ceilings = {};
  const hasReferenceSignal = Number(reference?.sourceRows ?? 0) > 0
    || numeric(rating?.current_ability) !== null
    || DRIVER_SKILL_FIELDS.some((field) => sourceAttribute(rating, field) !== null);

  for (const field of DRIVER_SKILL_FIELDS) {
    const current = sourceAttribute(rating, field, currentAbility);
    const collapsed = numeric(reference?.ceilings?.[field]);
    const explicit = explicitCeiling(rating, field);
    const group = driverAttributeGroup(field);
    const gapMultiplier = group === "raw" ? 1.05 : group === "craft" ? 1 : group === "technical" ? 0.94 : 0.96;
    const stageFactor = Math.max(0.38, driverStageFactor(stage, progress, field));
    const inferredFromStage = hasReferenceSignal ? current / stageFactor : current;
    const inferredFromGap = current + gap * gapMultiplier;
    const neutralUnknownCeiling = hasReferenceSignal
      ? 0
      : 58 + deterministicTrait(saveWorld, driverId, `unknown-ceiling:${field}`, -5, 8);
    ceilings[field] = round(clamp(Math.max(current, explicit ?? 0, collapsed ?? 0, inferredFromStage, inferredFromGap, neutralUnknownCeiling), 1, 100));
  }

  return ceilings;
}

function materializeOpeningAttributes(rating, reference, ceilings, stage, progress, hasOpeningReference) {
  const attributes = {};
  for (const field of DRIVER_SKILL_FIELDS) {
    const exact = sourceAttribute(rating, field);
    const referenceOpening = numeric(reference?.openingAttributes?.[field]);
    const value = hasOpeningReference
      ? (exact ?? referenceOpening ?? ceilings[field] * driverStageFactor(stage, progress, field))
      : ceilings[field] * driverStageFactor(stage, progress, field);
    attributes[field] = round(clamp(value, 1, 100));
  }
  for (const field of DRIVER_BEHAVIOUR_FIELDS) {
    const value = sourceAttribute(rating, field, numeric(reference?.behaviour?.[field]));
    if (value !== null) attributes[field] = round(clamp(value, 1, 100));
  }
  return attributes;
}

export function initializeDriverTalentProfile(saveWorld, driverId, state, profile = {}, rating = {}, options = {}) {
  if (!state || !driverId) return state;
  if (state.talentProfile?.version >= 1 && state.attributes && Object.keys(state.attributes).length) {
    state.currentAbility = deriveDriverCurrentAbility(state.attributes, state.currentAbility);
    state.potentialAbility = deriveDriverPotentialAbility(state.talentProfile.ceilings, state.potentialAbility);
    return state;
  }

  const reference = talentReferenceFor(saveWorld, driverId);
  const age = numeric(state.age);
  const stage = inferOpeningDriverStage(age, {
    status: options.status ?? state.status,
    pipelineStatus: state.pipelineStatus,
  });
  const stageProgress = inferOpeningStageProgress(stage, age);
  const ceilings = deriveCeilings(saveWorld, driverId, rating, reference, stage, stageProgress);
  const hasOpeningReference = options.hasOpeningReference !== false
    && (numeric(rating?.current_ability) !== null || Object.keys(rating ?? {}).some((key) => DRIVER_SKILL_FIELDS.includes(key)));
  const attributes = materializeOpeningAttributes(rating, reference, ceilings, stage, stageProgress, hasOpeningReference);

  state.talentProfile = {
    version: 1,
    source: reference?.source ?? (rating?.source ? `rating_reference:${rating.source}` : "derived_gameplay_talent_reference"),
    referenceSeason: numeric(reference?.referenceSeason ?? rating?.year),
    ceilings,
    careerStage: stage,
    stageProgress,
    stageSeasons: 0,
    developmentRate: round(deterministicTrait(saveWorld, driverId, "development-rate", 0.88, 1.12), 4),
    declineResistance: round(deterministicTrait(saveWorld, driverId, "decline-resistance", 0.82, 1.18), 4),
    peakTiming: round(deterministicTrait(saveWorld, driverId, "peak-timing", -1.25, 1.25), 3),
    createdAt: saveWorld.clock?.date ?? null,
    policy: "static_attribute_ceilings_dynamic_career_curve",
  };
  state.careerStage = stage;
  state.stageProgress = stageProgress;
  state.attributes = attributes;
  state.currentAbility = deriveDriverCurrentAbility(attributes, numeric(rating?.current_ability, 50));
  state.potentialAbility = deriveDriverPotentialAbility(ceilings, numeric(reference?.potentialAbility ?? rating?.potential_ability, state.currentAbility));
  return state;
}

export function driverTalentProjection(saveWorld, driverId) {
  const state = saveWorld.world?.careerState?.drivers?.[driverId];
  if (!state?.talentProfile) return null;
  return {
    careerStage: state.talentProfile.careerStage,
    stageProgress: round(state.talentProfile.stageProgress, 3),
    developmentRate: state.talentProfile.developmentRate,
    declineResistance: state.talentProfile.declineResistance,
    currentAbility: state.currentAbility,
    potentialAbility: state.potentialAbility,
    ceilings: structuredClone(state.talentProfile.ceilings),
    policy: state.talentProfile.policy,
    source: state.talentProfile.source,
  };
}

export { DRIVER_SKILL_FIELDS, DRIVER_BEHAVIOUR_FIELDS };
