import { createRng } from "../random.js";
import { SIM_EVENT } from "../timeEngine.js";
import { CAREER_EVENT } from "./careerLifecycle.js";
import {
  driverDevelopmentEvidence,
  staffDevelopmentEvidence,
} from "../../game/management/development.js";
import {
  DRIVER_BEHAVIOUR_FIELDS,
  DRIVER_CAREER_STAGES,
  DRIVER_SKILL_FIELDS,
  deriveDriverCurrentAbility,
  deriveDriverPotentialAbility,
  driverStageFactor,
  initializeDriverTalentProfile,
} from "../../game/management/talentProfile.js";

const STAFF_EXPERIENCE = new Set([
  "leadership",
  "motivation",
  "communication",
  "pitstop_management",
  "reliability_focus",
  "budget_management",
  "driver_development",
  "conflict_management",
  "negotiation",
]);
const STAFF_ATTRIBUTES = [
  "leadership",
  "technical",
  "strategy",
  "motivation",
  "communication",
  "pitstop_management",
  "reliability_focus",
  "data_analysis",
  "innovation",
  "budget_management",
  "driver_development",
  "conflict_management",
  "negotiation",
];

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function rounded(value, digits = 2) {
  return Number(Number(value ?? 0).toFixed(digits));
}

function profileFor(saveWorld, type, id) {
  const collection = type === "driver"
    ? [...(saveWorld.world?.drivers ?? []), ...(saveWorld.world?.futureDrivers ?? [])]
    : [...(saveWorld.world?.staff ?? []), ...(saveWorld.world?.futureStaff ?? [])];
  const idField = type === "driver" ? "driver_id" : "staff_id";
  return collection.find((row) => String(row?.[idField] ?? "") === String(id)) ?? {};
}

function ratingFor(saveWorld, type, id) {
  const collection = type === "driver" ? saveWorld.world?.driverRatings : saveWorld.world?.staffRatings;
  const idField = type === "driver" ? "driver_id" : "staff_id";
  return (collection ?? []).find((row) => String(row?.[idField] ?? "") === String(id)) ?? {};
}

function mentalityFor(saveWorld, type, id) {
  return type === "driver"
    ? saveWorld.world?.management?.people?.drivers?.[id]?.mentality ?? null
    : saveWorld.world?.management?.people?.staff?.[id]?.mentality ?? null;
}

function driverEvidenceContext(saveWorld, id, state) {
  const evidence = driverDevelopmentEvidence(saveWorld, id);
  const mentality = mentalityFor(saveWorld, "driver", id);
  const raceExposure = clamp(numeric(evidence.raceStarts, 0) / 12, 0, 1);
  const testingExposure = clamp(numeric(evidence.testingMileage, 0) / 3, 0, 1);
  const environment = clamp(numeric(evidence.averageTeamEnvironment, 1), 0.4, 1.2);
  const coaching = clamp(numeric(evidence.averageCoaching, 50) / 100, 0, 1);
  const mentoring = clamp(numeric(evidence.averageMentoring, 0) / 100, 0, 1)
    * clamp(numeric(evidence.mentoringMonths, 0) / 6, 0, 1);
  const performance = clamp(numeric(evidence.averageTeammatePerformanceDelta, 0) / 8, -1, 1);
  const qualifying = clamp(numeric(evidence.averageTeammateQualifyingDelta, 0) / 4, -1, 1);
  const injury = clamp(
    numeric(evidence.injuryBurden, 0) * 0.5 + numeric(evidence.injuryDays, 0) / 240,
    0,
    1.5,
  );
  const morale = clamp(numeric(state.morale, 50) / 100, 0, 1);
  const form = clamp(numeric(state.form, 0) / 25, -1, 1);
  const confidence = clamp(numeric(mentality?.confidence, 50) / 100, 0, 1);
  const opportunity = clamp(raceExposure * 0.72 + testingExposure * 0.28, 0, 1);
  const quality = clamp(
    0.62
      + opportunity * 0.18
      + (environment - 0.8) * 0.18
      + coaching * 0.10
      + mentoring * 0.10
      + performance * 0.06
      + qualifying * 0.03
      + (morale - 0.5) * 0.10
      + (confidence - 0.5) * 0.12
      + form * 0.04
      - injury * 0.10,
    0.42,
    1.28,
  );
  return {
    evidence,
    raceExposure,
    testingExposure,
    environment,
    coaching,
    mentoring,
    performance,
    qualifying,
    injury,
    morale,
    form,
    confidence,
    opportunity,
    quality,
  };
}

function minimumTransitionAge(stage, talent) {
  const offset = numeric(talent?.peakTiming, 0);
  const ages = {
    academy: 16,
    prospect: 18,
    rookie: 20,
    developing: 24 + offset,
    prime: 30 + offset,
    veteran: 34 + offset,
    decline: Infinity,
  };
  return ages[stage] ?? 20;
}

function nextStage(stage) {
  const index = DRIVER_CAREER_STAGES.indexOf(stage);
  return index >= 0 && index < DRIVER_CAREER_STAGES.length - 1
    ? DRIVER_CAREER_STAGES[index + 1]
    : stage;
}

function stageProgressIncrement(stage, age, talent, context) {
  const base = {
    academy: 0.28,
    prospect: 0.23,
    rookie: 0.19,
    developing: 0.15,
    prime: 0.105,
    veteran: 0.09,
    decline: 0.075,
  }[stage] ?? 0.12;
  const developmentRate = clamp(numeric(talent?.developmentRate, 1), 0.75, 1.25);
  if (stage === "veteran" || stage === "decline") {
    const agePressure = Math.max(0, numeric(age, 34) - 33) * 0.018;
    const resistance = clamp(numeric(talent?.declineResistance, 1), 0.75, 1.25);
    const activityProtection = context.opportunity * 0.025 + context.environment * 0.012;
    return Math.max(0.03, (base + agePressure + context.injury * 0.035 - activityProtection) / resistance);
  }
  return base * developmentRate * context.quality;
}

function advanceDriverStage(state, age, context, season) {
  const talent = state.talentProfile;
  let stage = DRIVER_CAREER_STAGES.includes(talent.careerStage) ? talent.careerStage : "developing";
  let progress = clamp(numeric(talent.stageProgress, 0), 0, 1);
  progress += stageProgressIncrement(stage, age, talent, context);
  let transitioned = false;

  if (stage !== "decline" && progress >= 1 && numeric(age, 99) >= minimumTransitionAge(stage, talent)) {
    stage = nextStage(stage);
    progress = Math.max(0, progress - 1);
    transitioned = true;
    talent.stageSeasons = 0;
    talent.lastTransitionSeason = Number(season);
  } else {
    progress = Math.min(progress, 0.995);
    talent.stageSeasons = Number(talent.stageSeasons ?? 0) + 1;
  }

  talent.careerStage = stage;
  talent.stageProgress = rounded(clamp(progress, 0, 1), 4);
  state.careerStage = stage;
  state.stageProgress = talent.stageProgress;
  return { stage, progress: talent.stageProgress, transitioned };
}

function targetDriverAttribute(talent, field) {
  const ceiling = numeric(talent.ceilings?.[field], 50);
  return clamp(ceiling * driverStageFactor(talent.careerStage, talent.stageProgress, field), 1, 100);
}

function evolveDriverSkills(saveWorld, id, state, context, event) {
  const talent = state.talentProfile;
  const rng = createRng(`${saveWorld.meta?.seed}|driver-curve|${event.payload?.season ?? saveWorld.clock?.season}|${id}`);
  const before = structuredClone(state.attributes ?? {});
  const declineStage = ["veteran", "decline"].includes(talent.careerStage);

  for (const field of DRIVER_SKILL_FIELDS) {
    const current = numeric(state.attributes?.[field], targetDriverAttribute(talent, field));
    const target = targetDriverAttribute(talent, field);
    const gap = target - current;
    const positive = gap >= 0;
    const learningRate = clamp(
      (0.18 + context.quality * 0.12 + context.opportunity * 0.05)
        * numeric(talent.developmentRate, 1),
      0.10,
      0.42,
    );
    const declineRate = clamp(
      (0.22 + Math.max(0, numeric(state.age, 34) - 33) * 0.012 + context.injury * 0.06)
        / clamp(numeric(talent.declineResistance, 1), 0.75, 1.25),
      0.16,
      0.48,
    );
    let rate = positive ? learningRate : declineRate;
    if (!declineStage && !positive) rate *= 0.45;
    let delta = gap * rate;

    if (["racecraft", "consistency", "tire_management", "tyre_management", "race_intelligence"].includes(field)) {
      delta += context.raceExposure * 0.22 + context.mentoring * 0.12;
    }
    if (["technical_feedback", "adaptability", "car_development_impact"].includes(field)) {
      delta += context.testingExposure * 0.18 + context.coaching * 0.08;
    }
    if (["pace", "qualifying", "start_launch"].includes(field)) {
      delta -= context.injury * (talent.careerStage === "decline" ? 0.22 : 0.10);
    }
    delta += (rng.next() - 0.5) * 0.16;
    state.attributes[field] = rounded(clamp(current + delta, 1, Math.max(1, numeric(talent.ceilings?.[field], 100))));
  }

  for (const field of DRIVER_BEHAVIOUR_FIELDS) {
    const current = numeric(state.attributes?.[field]);
    if (current === null) continue;
    let delta = 0;
    if (field === "crash_likelihood") {
      delta = -0.20 * context.raceExposure + context.injury * 0.05 + (rng.next() - 0.5) * 0.12;
    } else {
      delta = (numeric(state.age, 25) >= 30 ? -0.06 : 0.02) + (rng.next() - 0.5) * 0.14;
    }
    state.attributes[field] = rounded(clamp(current + delta, 1, 100));
  }

  return before;
}

function updateDriver(saveWorld, id, state, event) {
  if (!state || state.status === "retired") return null;
  const profile = profileFor(saveWorld, "driver", id);
  const rating = ratingFor(saveWorld, "driver", id);
  initializeDriverTalentProfile(saveWorld, id, state, profile, rating, {
    status: state.status,
    hasOpeningReference: state.status !== "junior",
  });

  const beforeAbility = numeric(state.currentAbility, deriveDriverCurrentAbility(state.attributes, 50));
  const beforeStage = state.talentProfile.careerStage;
  const context = driverEvidenceContext(saveWorld, id, state);
  const stage = advanceDriverStage(state, numeric(state.age), context, event.payload?.season ?? saveWorld.clock?.season);
  evolveDriverSkills(saveWorld, id, state, context, event);

  state.currentAbility = deriveDriverCurrentAbility(state.attributes, beforeAbility);
  state.potentialAbility = deriveDriverPotentialAbility(state.talentProfile.ceilings, state.potentialAbility);
  const actualDelta = rounded(state.currentAbility - beforeAbility);
  state.morale = rounded(clamp(50 + (numeric(state.morale, 50) - 50) * 0.7, 0, 100));
  state.form = rounded(numeric(state.form, 0) * 0.35);
  state.developmentPhase = state.talentProfile.careerStage;
  state.lastDevelopmentSeason = Number(event.payload?.season ?? saveWorld.clock?.season);
  state.lastUpdated = event.date;

  saveWorld.history ??= {};
  saveWorld.history.development ??= [];
  saveWorld.history.development.push({
    date: event.date,
    season: state.lastDevelopmentSeason,
    type: "worker_development",
    workerType: "driver",
    workerId: id,
    age: numeric(state.age),
    phase: state.developmentPhase,
    careerStageBefore: beforeStage,
    careerStageAfter: state.talentProfile.careerStage,
    stageProgress: state.talentProfile.stageProgress,
    currentAbilityBefore: rounded(beforeAbility),
    currentAbilityAfter: state.currentAbility,
    potentialAbility: state.potentialAbility,
    delta: actualDelta,
    source: "attribute_ceiling_career_curve",
  });

  return {
    type: CAREER_EVENT.DEVELOPED,
    payload: {
      worker_type: "driver",
      worker_id: id,
      age: numeric(state.age),
      phase: state.developmentPhase,
      career_stage_before: beforeStage,
      career_stage: state.talentProfile.careerStage,
      stage_progress: state.talentProfile.stageProgress,
      stage_transitioned: stage.transitioned,
      current_ability_before: rounded(beforeAbility),
      current_ability_after: state.currentAbility,
      potential_ability: state.potentialAbility,
      delta: actualDelta,
      confidence: rounded(context.confidence * 100),
      evidence: {
        race_starts: numeric(context.evidence?.raceStarts, 0),
        testing_mileage: rounded(numeric(context.evidence?.testingMileage, 0)),
        teammate_performance_delta: rounded(numeric(context.evidence?.averageTeammatePerformanceDelta, 0)),
        mentoring: rounded(numeric(context.evidence?.averageMentoring, 0)),
        coaching: rounded(numeric(context.evidence?.averageCoaching, 0)),
        injury_burden: rounded(numeric(context.evidence?.injuryBurden, 0)),
      },
    },
  };
}

function averageNumeric(source, fields) {
  const values = fields.map((field) => numeric(source?.[field])).filter((value) => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function inferredStaffCurrent(state, rating, profile) {
  const explicit = numeric(state.currentAbility ?? rating.current_ability ?? profile.current_ability);
  if (explicit !== null) return explicit;
  return averageNumeric(rating, ["technical", "strategy", "leadership", "data_analysis", "innovation"]) ?? 50;
}

function inferredStaffPotential(state, rating, profile, current, age) {
  const explicit = numeric(state.potentialAbility ?? rating.potential_ability ?? profile.potential_ability);
  if (explicit !== null) return Math.max(current, explicit);
  if (numeric(age, 40) <= 35) return Math.max(current, current + 5);
  return current;
}

function staffBaseDelta(age) {
  if (age === null) return 0;
  if (age <= 29) return 1.0;
  if (age <= 39) return 0.6;
  if (age <= 49) return 0.3;
  if (age <= 57) return 0.08;
  if (age <= 64) return -0.18;
  return -0.5 - Math.max(0, age - 65) * 0.08;
}

function staffPhase(age) {
  if (age === null) return "unknown";
  if (age <= 35) return "developing";
  if (age <= 55) return "prime";
  if (age <= 64) return "veteran";
  return "decline";
}

function staffEvidenceModifier(saveWorld, id, positiveDelta) {
  const evidence = staffDevelopmentEvidence(saveWorld, id);
  const employmentExposure = clamp(numeric(evidence.employedMonths, 0) / 12, 0, 1);
  const raceExposure = clamp(numeric(evidence.raceWeekends, 0) / 12, 0, 1);
  const testExposure = clamp(numeric(evidence.testSessions, 0) / 3, 0, 1);
  const department = clamp(numeric(evidence.averageDepartmentEffectiveness, 1), 0.4, 1.2);
  const workload = clamp(numeric(evidence.averageWorkloadFactor, 1), 0.55, 1.05);
  const peerLearning = clamp(numeric(evidence.averagePeerLearning, 0) / 100, 0, 1)
    * clamp(numeric(evidence.peerLearningMonths, 0) / 6, 0, 1);
  if (!positiveDelta) return { multiplier: clamp(1 - employmentExposure * 0.04, 0.92, 1), additive: 0, evidence };
  return {
    multiplier: clamp(
      (0.7 + employmentExposure * 0.22 + raceExposure * 0.05 + testExposure * 0.03)
        * (0.82 + department * 0.18)
        * (0.9 + workload * 0.1),
      0.62,
      1.18,
    ),
    additive: peerLearning * 0.28,
    evidence,
  };
}

function ensureStaffAttributes(state, rating, profile) {
  state.attributes ??= {};
  for (const field of STAFF_ATTRIBUTES) {
    if (numeric(state.attributes[field]) !== null) continue;
    const value = numeric(rating?.[field] ?? profile?.[field]);
    if (value !== null) state.attributes[field] = value;
  }
  return state.attributes;
}

function evolveStaffAttributes(attributes, age, abilityDelta, rng, evidence = {}) {
  for (const field of STAFF_ATTRIBUTES) {
    const before = numeric(attributes[field]);
    if (before === null) continue;
    const experienceBonus = STAFF_EXPERIENCE.has(field) && age !== null && age <= 62 ? 0.16 : 0;
    const multiplier = STAFF_EXPERIENCE.has(field) ? 0.68 : 0.9;
    const operationalLearning = clamp(
      numeric(evidence.raceWeekends, 0) / 24 + numeric(evidence.testSessions, 0) / 18,
      0,
      0.3,
    );
    const peerLearning = STAFF_EXPERIENCE.has(field)
      ? clamp(numeric(evidence.averagePeerLearning, 0) / 100, 0, 1) * 0.12
      : 0;
    const delta = abilityDelta * multiplier + experienceBonus + operationalLearning + peerLearning + (rng.next() - 0.5) * 0.16;
    attributes[field] = rounded(clamp(before + delta, 1, 100));
  }
}

function updateStaff(saveWorld, id, state, event) {
  if (!state || state.status === "retired") return null;
  const profile = profileFor(saveWorld, "staff", id);
  const rating = ratingFor(saveWorld, "staff", id);
  const age = numeric(state.age);
  const before = inferredStaffCurrent(state, rating, profile);
  const potential = inferredStaffPotential(state, rating, profile, before, age);
  const base = staffBaseDelta(age);
  const evidence = staffEvidenceModifier(saveWorld, id, base > 0);
  const rng = createRng(`${saveWorld.meta.seed}|${event.payload?.season ?? saveWorld.clock.season}|staff-development|${id}`);
  let delta = base;
  if (base > 0) {
    const gap = Math.max(0, potential - before);
    delta *= 0.25 + clamp(gap / 25, 0, 1.35) * 0.75;
    delta *= saveWorld.world?.employment?.staff?.[id]?.status === "employed" ? 1 : 0.76;
  }
  delta = delta * evidence.multiplier + evidence.additive;
  const mentality = mentalityFor(saveWorld, "staff", id);
  delta += clamp((numeric(state.morale, 50) - 50) / 100, -0.25, 0.25);
  delta += clamp((numeric(mentality?.confidence, 50) - 50) / 160, -0.22, 0.22);
  delta += (rng.next() - 0.5) * 0.5;

  const after = rounded(clamp(before + delta, 1, Math.max(before, potential)));
  const actualDelta = rounded(after - before);
  state.currentAbility = after;
  state.potentialAbility = potential;
  evolveStaffAttributes(ensureStaffAttributes(state, rating, profile), age, actualDelta, rng, evidence.evidence);
  state.morale = rounded(clamp(50 + (numeric(state.morale, 50) - 50) * 0.7, 0, 100));
  state.form = rounded(numeric(state.form, 0) * 0.35);
  state.developmentPhase = staffPhase(age);
  state.lastDevelopmentSeason = Number(event.payload?.season ?? saveWorld.clock?.season);
  state.lastUpdated = event.date;

  saveWorld.history ??= {};
  saveWorld.history.development ??= [];
  saveWorld.history.development.push({
    date: event.date,
    season: state.lastDevelopmentSeason,
    type: "worker_development",
    workerType: "staff",
    workerId: id,
    age,
    phase: state.developmentPhase,
    currentAbilityBefore: rounded(before),
    currentAbilityAfter: after,
    delta: actualDelta,
  });

  return {
    type: CAREER_EVENT.DEVELOPED,
    payload: {
      worker_type: "staff",
      worker_id: id,
      age,
      phase: state.developmentPhase,
      current_ability_before: rounded(before),
      current_ability_after: after,
      delta: actualDelta,
      evidence: {
        employed_months: numeric(evidence.evidence?.employedMonths, 0),
        race_weekends: numeric(evidence.evidence?.raceWeekends, 0),
        test_sessions: numeric(evidence.evidence?.testSessions, 0),
        department_effectiveness: rounded(numeric(evidence.evidence?.averageDepartmentEffectiveness, 1)),
        peer_learning: rounded(numeric(evidence.evidence?.averagePeerLearning, 0)),
      },
    },
  };
}

export function createCareerDevelopmentSystem() {
  return {
    id: "career.development",
    eventTypes: [SIM_EVENT.SEASON_STARTED],
    handle({ saveWorld, event }) {
      const output = [];
      const state = saveWorld.world?.careerState;
      for (const id of Object.keys(state?.drivers ?? {}).sort()) {
        const emitted = updateDriver(saveWorld, id, state.drivers[id], event);
        if (emitted) output.push(emitted);
      }
      for (const id of Object.keys(state?.staff ?? {}).sort()) {
        const emitted = updateStaff(saveWorld, id, state.staff[id], event);
        if (emitted) output.push(emitted);
      }
      return output;
    },
  };
}
