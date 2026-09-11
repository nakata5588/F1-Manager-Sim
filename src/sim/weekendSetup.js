const SETUP_FIELDS = Object.freeze([
  "aeroBalance",
  "mechanicalGrip",
  "gearing",
  "cooling",
]);

function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 2) {
  return Number(Number(value).toFixed(digits));
}

function quality(actual, ideal) {
  const meanError = SETUP_FIELDS.reduce((sum, field) => {
    const current = numeric(actual?.[field], numeric(ideal?.[field], 50));
    const target = numeric(ideal?.[field], 50);
    return sum + Math.abs(current - target);
  }, 0) / SETUP_FIELDS.length;
  return round(clamp(100 - meanError * 2.35, 25, 100));
}

function activeWeekend(saveWorld, weekendKey) {
  return saveWorld.world?.raceWeekendState?.active?.[weekendKey] ?? null;
}

/**
 * Applies a player setup adjustment after Practice and before Qualifying.
 * The ideal setup remains engine-side; callers receive only the updated setup
 * and resulting quality/knowledge, never the hidden target values.
 */
export function adjustWeekendSetup(saveWorld, weekendKey, driverId, patch = {}) {
  const weekend = activeWeekend(saveWorld, weekendKey);
  if (!weekend) throw new Error(`Race weekend '${weekendKey}' is not active.`);
  if (weekend.phase !== "practice_completed") {
    throw new Error("Car setup can only be adjusted after Practice and before Qualifying.");
  }

  const result = weekend.practice?.results?.find((row) => row.driverId === driverId);
  if (!result) throw new Error(`Driver ${driverId} has no Practice setup result.`);

  const next = { ...result.setup };
  for (const field of SETUP_FIELDS) {
    if (patch[field] === undefined) continue;
    const value = numeric(patch[field]);
    if (value === null) throw new Error(`Setup field ${field} must be numeric.`);
    next[field] = round(clamp(value));
  }

  result.setup = next;
  result.setupQuality = quality(next, result.idealSetup ?? {});
  result.playerAdjusted = true;

  return {
    driverId,
    setup: structuredClone(result.setup),
    setupQuality: result.setupQuality,
    setupKnowledge: result.setupKnowledge ?? null,
    playerAdjusted: true,
  };
}

export function setupFields() {
  return [...SETUP_FIELDS];
}
