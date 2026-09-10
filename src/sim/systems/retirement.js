import { createRng } from "../random.js";
import { SIM_EVENT } from "../timeEngine.js";
import { CAREER_EVENT } from "./careerLifecycle.js";

function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function retirementProbability(type, state = {}) {
  const age = numeric(state.age);
  if (age === null) return 0;

  if (type === "driver") {
    if (age < 33) return 0;
    if (age >= 55) return 1;

    let base;
    if (age <= 35) base = 0.01 + (age - 33) * 0.012;
    else if (age <= 38) base = 0.04 + (age - 36) * 0.03;
    else if (age <= 41) base = 0.13 + (age - 39) * 0.07;
    else if (age <= 44) base = 0.34 + (age - 42) * 0.12;
    else base = 0.60 + (age - 45) * 0.06;

    const reputation = numeric(state.reputation, 50);
    const ability = numeric(state.currentAbility, 50);
    const statusMultiplier = state.status === "available" ? 1.28 : 0.88;
    const reputationMultiplier = reputation >= 85 ? 0.72 : reputation >= 70 ? 0.86 : reputation < 40 ? 1.12 : 1;
    const abilityMultiplier = ability >= 85 ? 0.82 : ability >= 70 ? 0.92 : ability < 45 ? 1.18 : 1;
    return clamp(base * statusMultiplier * reputationMultiplier * abilityMultiplier, 0, 0.98);
  }

  if (age < 58) return 0;
  if (age >= 85) return 1;

  let base;
  if (age <= 61) base = 0.008 + (age - 58) * 0.006;
  else if (age <= 65) base = 0.035 + (age - 62) * 0.012;
  else if (age <= 70) base = 0.09 + (age - 66) * 0.025;
  else if (age <= 75) base = 0.22 + (age - 71) * 0.055;
  else base = 0.52 + (age - 76) * 0.055;

  const reputation = numeric(state.reputation, 50);
  const statusMultiplier = state.status === "available" ? 1.2 : 0.9;
  const reputationMultiplier = reputation >= 85 ? 0.78 : reputation >= 70 ? 0.9 : 1;
  return clamp(base * statusMultiplier * reputationMultiplier, 0, 0.98);
}

function retireWorker(saveWorld, type, id, state, event, probability) {
  state.status = "retired";
  state.retirementDate = event.date;
  state.retirementSeason = Number(event.payload?.season ?? saveWorld.clock.season);
  state.lastUpdated = event.date;

  saveWorld.history.retirements ??= [];
  saveWorld.history.retirements.push({
    date: event.date,
    season: state.retirementSeason,
    type,
    workerId: id,
    age: state.age ?? null,
    probability: Number(probability.toFixed(4)),
  });

  return {
    type: CAREER_EVENT.RETIRED,
    payload: {
      worker_type: type,
      worker_id: id,
      age: state.age ?? null,
      retirement_probability: Number(probability.toFixed(4)),
    },
  };
}

export function createRetirementSystem() {
  return {
    id: "career.retirement",
    eventTypes: [SIM_EVENT.SEASON_STARTED],
    handle({ saveWorld, event }) {
      const output = [];
      const state = saveWorld.world?.careerState;
      for (const type of ["driver", "staff"]) {
        const collection = type === "driver" ? state?.drivers : state?.staff;
        for (const id of Object.keys(collection ?? {}).sort()) {
          const worker = collection[id];
          if (!worker || worker.status === "retired") continue;
          const probability = retirementProbability(type, worker);
          if (probability <= 0) continue;
          const rng = createRng(`${saveWorld.meta.seed}|${event.payload?.season ?? saveWorld.clock.season}|retirement|${type}|${id}`);
          if (rng.next() < probability) {
            output.push(retireWorker(saveWorld, type, id, worker, event, probability));
          }
        }
      }
      return output;
    },
  };
}
