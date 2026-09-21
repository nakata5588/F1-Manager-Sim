import { createRng } from "../random.js";
import { SIM_EVENT } from "../timeEngine.js";
import { CAREER_EVENT } from "./careerLifecycle.js";
import {
  driverDevelopmentEvidence,
  staffDevelopmentEvidence,
} from "../../game/management/development.js";

const DRIVER_RAW_PACE = new Set(["pace", "qualifying", "start_launch"]);
const DRIVER_EXPERIENCE = new Set([
  "racecraft",
  "race_intelligence",
  "consistency",
  "tire_management",
  "tyre_management",
  "technical_feedback",
  "pressure_handling",
  "leadership",
  "team_player",
  "car_development_impact",
]);
const DRIVER_SPECIAL = new Set(["agression", "aggression", "crash_likelihood"]);
const DRIVER_ATTRIBUTES = [
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
  "agression",
  "aggression",
  "crash_likelihood",
  "pressure_handling",
  "leadership",
  "team_player",
  "car_development_impact",
];
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
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function rounded(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function profileFor(saveWorld, type, id) {
  const collection = type === "driver" ? saveWorld.world?.drivers : saveWorld.world?.staff;
  const idField = type === "driver" ? "driver_id" : "staff_id";
  return (collection ?? []).find((row) => row?.[idField] === id) ?? {};
}

function ratingFor(saveWorld, type, id) {
  const collection = type === "driver" ? saveWorld.world?.driverRatings : saveWorld.world?.staffRatings;
  const idField = type === "driver" ? "driver_id" : "staff_id";
  return (collection ?? []).find((row) => row?.[idField] === id) ?? {};
}

function averageNumeric(source, fields) {
  const values = fields.map((field) => numeric(source?.[field])).filter((value) => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function inferredCurrentAbility(type, state, rating, profile) {
  const explicit = numeric(state.currentAbility ?? rating.current_ability ?? profile.current_ability);
  if (explicit !== null) return explicit;
  if (type === "driver") {
    return averageNumeric(rating, ["pace", "qualifying", "racecraft", "wet_skill", "consistency"]) ?? 50;
  }
  return averageNumeric(rating, ["technical", "strategy", "leadership", "data_analysis", "innovation"]) ?? 50;
}

function inferredPotentialAbility(type, state, rating, profile, current, age) {
  const explicit = numeric(state.potentialAbility ?? rating.potential_ability ?? profile.potential_ability);
  if (explicit !== null) return Math.max(current, explicit);
  if (type === "driver" && numeric(age, 30) <= 25) return Math.max(current, current + 8);
  if (type === "staff" && numeric(age, 40) <= 35) return Math.max(current, current + 5);
  return current;
}

function driverBaseDelta(age) {
  if (age === null) return 0;
  if (age <= 20) return 2.4;
  if (age <= 23) return 1.8;
  if (age <= 26) return 1.05;
  if (age <= 29) return 0.35;
  if (age <= 32) return 0.05;
  if (age <= 35) return -0.55;
  if (age <= 38) return -1.15;
  return -1.8 - Math.max(0, age - 39) * 0.22;
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

function phaseFor(type, age) {
  if (age === null) return "unknown";
  if (type === "driver") {
    if (age <= 23) return "rapid-development";
    if (age <= 28) return "development";
    if (age <= 32) return "prime";
    if (age <= 36) return "experience-offset";
    return "decline";
  }
  if (age <= 35) return "development";
  if (age <= 55) return "prime";
  if (age <= 64) return "experience-offset";
  return "decline";
}

function employmentFactor(saveWorld, type, id, positiveDelta) {
  if (!positiveDelta) return 1;
  const assignments = type === "driver" ? saveWorld.world?.employment?.drivers : saveWorld.world?.employment?.staff;
  return assignments?.[id]?.status === "employed" ? 1 : 0.76;
}

function driverEvidenceModifier(saveWorld, id, age, positiveDelta) {
  const evidence = driverDevelopmentEvidence(saveWorld, id);
  const raceExposure = clamp(numeric(evidence.raceStarts, 0) / 12, 0, 1);
  const testingExposure = clamp(numeric(evidence.testingMileage, 0) / 3, 0, 1);
  const environment = clamp(numeric(evidence.averageTeamEnvironment, 1), 0.4, 1.2);
  const coaching = clamp((numeric(evidence.averageCoaching, 50) - 50) / 50, -0.5, 1);
  const performance = clamp(numeric(evidence.averageTeammatePerformanceDelta, 0) / 8, -1, 1);
  const qualifying = clamp(numeric(evidence.averageTeammateQualifyingDelta, 0) / 4, -1, 1);
  const mentoring = age !== null && age <= 27
    ? clamp(numeric(evidence.averageMentoring, 0) / 100, 0, 1)
      * clamp(numeric(evidence.mentoringMonths, 0) / 6, 0, 1)
    : 0;
  const injuryPenalty = clamp(
    numeric(evidence.injuryBurden, 0) * 0.28 + numeric(evidence.injuryDays, 0) / 360,
    0,
    1.4,
  );

  let multiplier = 1;
  let additive = 0;
  if (positiveDelta) {
    const opportunity = 0.72 + raceExposure * 0.2 + testingExposure * 0.08;
    const environmentFactor = clamp(0.78 + environment * 0.22 + coaching * 0.08, 0.72, 1.16);
    multiplier = opportunity * environmentFactor;
    additive += performance * 0.22 + qualifying * 0.12 + mentoring * 0.38;
  } else {
    // Activity and good environments can soften decline but never reverse the
    // physical age curve by themselves.
    multiplier = clamp(1 - raceExposure * 0.08 - testingExposure * 0.03, 0.86, 1);
    additive += performance * 0.06;
  }
  additive -= injuryPenalty * (positiveDelta ? 0.42 : 0.28);
  return { multiplier, additive, evidence };
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

  if (!positiveDelta) {
    return {
      multiplier: clamp(1 - employmentExposure * 0.04, 0.92, 1),
      additive: 0,
      evidence,
    };
  }

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

function calculateAbilityDelta(saveWorld, type, id, state, current, potential, age, event) {
  const base = type === "driver" ? driverBaseDelta(age) : staffBaseDelta(age);
  const rng = createRng(`${saveWorld.meta.seed}|${event.payload?.season ?? saveWorld.clock.season}|career-development|${type}|${id}`);
  let delta = base;

  if (base > 0) {
    const gap = Math.max(0, potential - current);
    const gapFactor = clamp(gap / 25, 0, 1.35);
    delta *= 0.25 + gapFactor * 0.75;
    delta *= employmentFactor(saveWorld, type, id, true);
  }

  const evidence = type === "driver"
    ? driverEvidenceModifier(saveWorld, id, age, base > 0)
    : staffEvidenceModifier(saveWorld, id, base > 0);
  delta = delta * evidence.multiplier + evidence.additive;

  const morale = numeric(state.morale, 50);
  const form = numeric(state.form, 0);
  const mentality = type === "driver"
    ? saveWorld.world?.management?.people?.drivers?.[id]?.mentality
    : saveWorld.world?.management?.people?.staff?.[id]?.mentality;
  const confidence = numeric(mentality?.confidence, 50);
  delta += clamp((morale - 50) / 100, -0.25, 0.25);
  delta += clamp(form / 100, -0.15, 0.15);
  // Confidence influences how effectively existing potential is realised, but
  // it cannot create talent beyond PA and remains a secondary signal.
  delta += clamp((confidence - 50) / 160, -0.22, 0.22);
  delta += (rng.next() - 0.5) * 0.5;
  return { delta, rng, evidence: evidence.evidence, confidence };
}

function ensureAttributes(state, type, rating, profile) {
  state.attributes ??= {};
  const fields = type === "driver" ? DRIVER_ATTRIBUTES : STAFF_ATTRIBUTES;
  for (const field of fields) {
    if (numeric(state.attributes[field]) !== null) continue;
    const value = numeric(rating?.[field] ?? profile?.[field]);
    if (value !== null) state.attributes[field] = value;
  }
  return state.attributes;
}

function evolveDriverAttributes(attributes, age, abilityDelta, rng, evidence = {}) {
  for (const field of DRIVER_ATTRIBUTES) {
    const before = numeric(attributes[field]);
    if (before === null) continue;
    let delta;
    if (field === "crash_likelihood") {
      const experienceEffect = age !== null && age <= 35 ? -0.22 : age !== null && age >= 40 ? 0.12 : -0.05;
      delta = experienceEffect + (rng.next() - 0.5) * 0.12;
    } else if (field === "agression" || field === "aggression") {
      const maturity = age !== null && age >= 30 ? -0.08 : 0;
      delta = maturity + abilityDelta * 0.12 + (rng.next() - 0.5) * 0.18;
    } else if (DRIVER_RAW_PACE.has(field)) {
      const agePenalty = age !== null && age >= 34 ? -0.12 : 0;
      const injuryPenalty = clamp(numeric(evidence.injuryBurden, 0) * 0.08, 0, 0.28);
      delta = abilityDelta * 1.08 + agePenalty - injuryPenalty + (rng.next() - 0.5) * 0.22;
    } else if (DRIVER_EXPERIENCE.has(field)) {
      const experienceBonus = age !== null && age <= 35 ? 0.28 : age !== null && age <= 40 ? 0.08 : -0.08;
      const raceLearning = clamp(numeric(evidence.raceStarts, 0) / 20, 0, 0.35);
      const mentoring = ["leadership", "team_player", "technical_feedback"].includes(field)
        ? clamp(numeric(evidence.averageMentoring, 0) / 100, 0, 1) * 0.18
        : 0;
      delta = abilityDelta * 0.46 + experienceBonus + raceLearning + mentoring + (rng.next() - 0.5) * 0.2;
    } else {
      const testing = ["technical_feedback", "adaptability", "car_development_impact"].includes(field)
        ? clamp(numeric(evidence.testingMileage, 0) / 4, 0, 0.28)
        : 0;
      delta = abilityDelta * 0.72 + testing + (rng.next() - 0.5) * 0.2;
    }
    attributes[field] = rounded(clamp(before + delta, 1, 100));
  }
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

function updateWorker(saveWorld, type, id, state, event) {
  if (!state || state.status === "retired") return null;
  const profile = profileFor(saveWorld, type, id);
  const rating = ratingFor(saveWorld, type, id);
  const age = numeric(state.age);
  const before = inferredCurrentAbility(type, state, rating, profile);
  const potential = inferredPotentialAbility(type, state, rating, profile, before, age);
  const { delta: rawDelta, rng, evidence, confidence } = calculateAbilityDelta(saveWorld, type, id, state, before, potential, age, event);
  const upperBound = Math.max(before, potential);
  const after = rounded(clamp(before + rawDelta, 1, upperBound));
  const actualDelta = rounded(after - before);

  state.currentAbility = after;
  state.potentialAbility = potential;
  const attributes = ensureAttributes(state, type, rating, profile);
  if (type === "driver") evolveDriverAttributes(attributes, age, actualDelta, rng, evidence);
  else evolveStaffAttributes(attributes, age, actualDelta, rng, evidence);

  const morale = numeric(state.morale, 50);
  const form = numeric(state.form, 0);
  state.morale = rounded(clamp(50 + (morale - 50) * 0.7, 0, 100));
  state.form = rounded(form * 0.35);
  state.developmentPhase = phaseFor(type, age);
  state.lastDevelopmentSeason = Number(event.payload?.season ?? saveWorld.clock.season);
  state.lastUpdated = event.date;

  saveWorld.history ??= {};
  saveWorld.history.development ??= [];
  const developmentRecord = {
    date: event.date,
    season: state.lastDevelopmentSeason,
    type: "worker_development",
    workerType: type,
    workerId: id,
    age,
    phase: state.developmentPhase,
    currentAbilityBefore: rounded(before),
    currentAbilityAfter: after,
    delta: actualDelta,
  };
  saveWorld.history.development.push(developmentRecord);

  return {
    type: CAREER_EVENT.DEVELOPED,
    payload: {
      worker_type: type,
      worker_id: id,
      age,
      phase: state.developmentPhase,
      current_ability_before: rounded(before),
      current_ability_after: after,
      delta: actualDelta,
      confidence: rounded(numeric(confidence, 50)),
      evidence: type === "driver" ? {
        race_starts: numeric(evidence?.raceStarts, 0),
        testing_mileage: rounded(numeric(evidence?.testingMileage, 0)),
        teammate_performance_delta: rounded(numeric(evidence?.averageTeammatePerformanceDelta, 0)),
        mentoring: rounded(numeric(evidence?.averageMentoring, 0)),
        coaching: rounded(numeric(evidence?.averageCoaching, 0)),
        injury_burden: rounded(numeric(evidence?.injuryBurden, 0)),
      } : {
        employed_months: numeric(evidence?.employedMonths, 0),
        race_weekends: numeric(evidence?.raceWeekends, 0),
        test_sessions: numeric(evidence?.testSessions, 0),
        department_effectiveness: rounded(numeric(evidence?.averageDepartmentEffectiveness, 1)),
        peer_learning: rounded(numeric(evidence?.averagePeerLearning, 0)),
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
      for (const type of ["driver", "staff"]) {
        const collection = type === "driver" ? state?.drivers : state?.staff;
        for (const id of Object.keys(collection ?? {}).sort()) {
          const emitted = updateWorker(saveWorld, type, id, collection[id], event);
          if (emitted) output.push(emitted);
        }
      }
      return output;
    },
  };
}
