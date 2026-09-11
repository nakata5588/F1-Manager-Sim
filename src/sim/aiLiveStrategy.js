import { availableTyreCompounds } from "./raceStrategy.js";
import { currentStrategyStint, selectLiveTyreCompound } from "./liveStrategy.js";

function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

const AI_MANAGED_SOURCES = new Set([
  "ai_generated",
  "ai_unspecified",
  "ai_live",
  "delegated",
  "delegated_unspecified",
]);

export function isAiManagedStrategy(plan) {
  return AI_MANAGED_SOURCES.has(String(plan?.source ?? "").toLowerCase());
}

function entrantFor(weekend, driverId) {
  const row = (weekend.grid ?? []).find((entry) => entry.driverId === driverId)
    ?? (weekend.classification ?? []).find((entry) => entry.driverId === driverId);
  return row ? { driverId, teamId: row.teamId } : null;
}

function compoundMap(saveWorld, teamId) {
  return new Map([
    ...availableTyreCompounds(saveWorld, false, teamId),
    ...availableTyreCompounds(saveWorld, true, teamId),
  ].map((row) => [String(row.compoundId), row]));
}

function normalizedCondition(condition) {
  return condition === "wet" || condition === "damp" ? "wet" : "dry";
}

function currentCompound(saveWorld, weekend, driverId, lap) {
  const entrant = entrantFor(weekend, driverId);
  const plan = weekend.strategies?.[driverId];
  if (!entrant || !plan) return null;
  const active = currentStrategyStint(plan, Math.max(1, lap));
  const compoundId = active?.stint?.compoundId ?? active?.compoundId ?? null;
  if (compoundId === null || compoundId === undefined) return null;
  return compoundMap(saveWorld, entrant.teamId).get(String(compoundId)) ?? null;
}

function nextPlannedPitLap(plan, currentLap) {
  let boundary = 0;
  const stints = plan?.stints ?? [];
  for (let index = 0; index < stints.length - 1; index += 1) {
    boundary += Math.max(1, Math.round(numeric(stints[index]?.targetLaps, 1)));
    if (boundary > currentLap) return boundary;
  }
  return null;
}

function suitableCompound(saveWorld, teamId, condition) {
  const target = normalizedCondition(condition);
  const chosen = selectLiveTyreCompound(saveWorld, teamId, target);
  if (!chosen || normalizedCondition(chosen.condition) !== target) return null;
  return chosen;
}

function alreadyScheduledSoon(plan, currentLap, tolerance = 2) {
  const next = nextPlannedPitLap(plan, currentLap);
  return next !== null && next <= currentLap + tolerance;
}

function repeatedLiveRequest(plan, compoundId, currentLap) {
  const revision = plan?.liveRevision;
  if (!revision) return false;
  const pitLap = numeric(revision.pitAfterLap);
  return String(revision.requestedCompoundId ?? "") === String(compoundId)
    && pitLap !== null
    && pitLap >= currentLap + 1;
}

function remainingLaps(context) {
  return Math.max(0, Math.round(numeric(context.totalLaps, 0)) - Math.round(numeric(context.currentLap, 0)));
}

export function evaluateAiLiveStrategyDecision(saveWorld, weekend, driverId, context = {}) {
  const plan = weekend?.strategies?.[driverId];
  if (!plan || !isAiManagedStrategy(plan)) return null;
  const entrant = entrantFor(weekend, driverId);
  if (!entrant) return null;

  const currentLap = Math.max(0, Math.round(numeric(context.currentLap, 0)));
  const totalLaps = Math.max(currentLap, Math.round(numeric(context.totalLaps, currentLap)));
  const remaining = remainingLaps({ currentLap, totalLaps });
  if (remaining <= 1) return null;

  const trackCondition = normalizedCondition(context.condition);
  const compound = currentCompound(saveWorld, weekend, driverId, currentLap + 1);
  const compoundCondition = compound ? normalizedCondition(compound.condition) : normalizedCondition(plan.condition);
  const targetCompound = suitableCompound(saveWorld, entrant.teamId, trackCondition);

  if (targetCompound && compoundCondition !== trackCondition) {
    if (!repeatedLiveRequest(plan, targetCompound.compoundId, currentLap)) {
      return {
        action: "box",
        compoundId: targetCompound.compoundId,
        pitAfterLap: currentLap + 1,
        reason: `ai_weather_${trackCondition}`,
        source: "ai_live",
        priority: 100,
        trigger: "weather_mismatch",
      };
    }
    return null;
  }

  const wear = numeric(context.tyreWear);
  const control = context.activeControl ?? null;
  const neutralised = control && ["safety_car", "virtual_safety_car"].includes(control.type);
  const wearThreshold = neutralised ? 0.72 : 0.94;
  if (wear !== null && wear >= wearThreshold && remaining >= 3 && targetCompound) {
    if (!alreadyScheduledSoon(plan, currentLap, neutralised ? 3 : 2)
      && !repeatedLiveRequest(plan, targetCompound.compoundId, currentLap)) {
      return {
        action: "box",
        compoundId: targetCompound.compoundId,
        pitAfterLap: currentLap + 1,
        reason: neutralised ? `ai_${control.type}_tyre_window` : "ai_tyre_wear",
        source: "ai_live",
        priority: neutralised ? 80 : 60,
        trigger: neutralised ? "race_control_window" : "tyre_wear",
        observedWear: clamp(wear, 0, 5),
      };
    }
  }

  return null;
}

export function listAiLiveStrategyDecisions(saveWorld, weekend, context = {}) {
  const decisions = [];
  for (const gridRow of weekend?.grid ?? []) {
    const driverId = gridRow.driverId;
    const state = context.driverStates?.[driverId] ?? {};
    const decision = evaluateAiLiveStrategyDecision(saveWorld, weekend, driverId, {
      ...context,
      tyreWear: state.tyreWear ?? context.tyreWear,
    });
    if (decision) decisions.push({ driverId, teamId: gridRow.teamId, ...decision });
  }
  return decisions.sort((a, b) => b.priority - a.priority || String(a.driverId).localeCompare(String(b.driverId)));
}
