import { availableTyreCompounds, evaluateRaceStrategy } from "./raceStrategy.js";

function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function currentRace(saveWorld, weekend) {
  return (saveWorld.world?.calendar ?? []).find((row) => row.gp_id === weekend.gpId)
    ?? (saveWorld.world?.calendar ?? []).find((row) => Number(row.round) === Number(weekend.round))
    ?? {};
}

function currentTrack(saveWorld, weekend) {
  const race = currentRace(saveWorld, weekend);
  const id = weekend.trackId ?? race.track_id ?? race.circuit_id;
  return (saveWorld.world?.tracks ?? []).find((row) => row.track_id === id || row.circuit_id === id) ?? {};
}

function totalLaps(saveWorld, weekend) {
  const race = currentRace(saveWorld, weekend);
  return Math.max(1, Math.round(numeric(race.laps ?? race.race_laps ?? race.total_laps ?? weekend.totalLaps, 60)));
}

function entrantFor(weekend, driverId) {
  const row = (weekend.grid ?? []).find((entry) => entry.driverId === driverId)
    ?? (weekend.classification ?? []).find((entry) => entry.driverId === driverId);
  return row ? { driverId, teamId: row.teamId } : null;
}

function stintBoundaries(plan) {
  let end = 0;
  return (plan?.stints ?? []).map((stint, index) => {
    const start = end + 1;
    end += Math.max(1, Math.round(numeric(stint.targetLaps, 1)));
    return { index, start, end, stint };
  });
}

function compoundMap(saveWorld, teamId) {
  const dry = availableTyreCompounds(saveWorld, false, teamId);
  const wet = availableTyreCompounds(saveWorld, true, teamId);
  return new Map([...dry, ...wet].map((row) => [String(row.compoundId), row]));
}

function annotateEvaluatedPlan(saveWorld, teamId, plan) {
  const compounds = compoundMap(saveWorld, teamId);
  return {
    ...plan,
    stints: (plan.stints ?? []).map((stint) => {
      const compound = compounds.get(String(stint.compoundId));
      if (!compound) return { ...stint, condition: stint.condition ?? plan.condition ?? "dry" };
      const condition = compound.condition ?? plan.condition ?? "dry";
      return {
        ...stint,
        condition,
        grip: condition === "wet" ? compound.wetGrip : compound.dryGrip,
      };
    }),
  };
}

export function selectLiveTyreCompound(saveWorld, teamId, condition) {
  const wet = condition === "wet" || condition === "damp";
  const candidates = availableTyreCompounds(saveWorld, wet, teamId);
  if (!candidates.length) return null;
  return [...candidates]
    .sort((a, b) => {
      const gripA = wet ? numeric(a.wetGrip, 50) : numeric(a.dryGrip, 50);
      const gripB = wet ? numeric(b.wetGrip, 50) : numeric(b.dryGrip, 50);
      const durabilityA = numeric(a.durabilityLaps, 0);
      const durabilityB = numeric(b.durabilityLaps, 0);
      return gripB - gripA || durabilityB - durabilityA || String(a.compoundId).localeCompare(String(b.compoundId));
    })[0];
}

export function currentStrategyStint(plan, lap) {
  const targetLap = Math.max(1, Math.round(Number(lap ?? 1)));
  const boundaries = stintBoundaries(plan);
  return boundaries.find((row) => targetLap >= row.start && targetLap <= row.end)
    ?? boundaries[boundaries.length - 1]
    ?? null;
}

export function reviseRaceStrategy(saveWorld, weekend, driverId, currentPlan, instruction, options = {}) {
  if (!driverId || !currentPlan) throw new TypeError("A driver and current strategy plan are required.");
  const entrant = entrantFor(weekend, driverId);
  if (!entrant) throw new Error(`Driver ${driverId} is not on the current race grid.`);

  const laps = totalLaps(saveWorld, weekend);
  const completedLap = clamp(Math.round(numeric(options.currentLap, 0)), 0, laps);
  if (completedLap >= laps) throw new Error("Race strategy cannot be revised after the final lap.");

  const action = String(instruction?.action ?? "box").toLowerCase();
  if (action !== "box") throw new Error(`Unsupported live strategy action ${JSON.stringify(action)}.`);
  const compoundId = instruction?.compoundId ?? instruction?.compound_id ?? null;
  if (!compoundId) throw new Error("Live box instruction requires a compoundId.");

  const compounds = compoundMap(saveWorld, entrant.teamId);
  const requestedCompound = compounds.get(String(compoundId));
  if (!requestedCompound) throw new Error(`Tyre compound ${compoundId} is not available to team ${entrant.teamId}.`);

  const earliestPitLap = completedLap + 1;
  const requestedPitLap = Math.round(numeric(instruction?.pitAfterLap ?? instruction?.pit_after_lap, earliestPitLap));
  const pitAfterLap = clamp(requestedPitLap, earliestPitLap, Math.max(earliestPitLap, laps - 1));
  if (pitAfterLap >= laps) throw new Error("A live tyre change must leave at least one racing lap after the stop.");

  const boundaries = stintBoundaries(currentPlan);
  const nextLap = completedLap + 1;
  const active = boundaries.find((row) => nextLap >= row.start && nextLap <= row.end)
    ?? boundaries[boundaries.length - 1];
  if (!active) throw new Error("Current strategy has no usable stint.");

  const rawStints = boundaries
    .filter((row) => row.index < active.index)
    .map((row) => ({ stint: row.index + 1, compoundId: row.stint.compoundId, targetLaps: row.end - row.start + 1 }));
  const completedBeforeActive = active.start - 1;
  rawStints.push({
    stint: rawStints.length + 1,
    compoundId: active.stint.compoundId,
    targetLaps: pitAfterLap - completedBeforeActive,
  });
  rawStints.push({
    stint: rawStints.length + 1,
    compoundId: requestedCompound.compoundId,
    targetLaps: laps - pitAfterLap,
  });

  const race = currentRace(saveWorld, weekend);
  const track = currentTrack(saveWorld, weekend);
  const source = options.source ?? instruction?.source ?? "player_live";
  const entropyKey = options.entropyKey ?? `${weekend.key}|live-strategy|${driverId}|${completedLap}|${pitAfterLap}|${compoundId}`;
  const evaluated = evaluateRaceStrategy(
    saveWorld,
    { ...weekend, race, track },
    entrant,
    {
      source,
      condition: requestedCompound.condition ?? currentPlan.condition ?? "dry",
      dataStatus: "tyre_data_available",
      stints: rawStints,
      plannedStops: rawStints.length - 1,
    },
    entropyKey,
  );

  return annotateEvaluatedPlan(saveWorld, entrant.teamId, {
    ...evaluated,
    source,
    liveRevision: {
      afterLap: completedLap,
      pitAfterLap,
      requestedCompoundId: requestedCompound.compoundId,
      reason: instruction?.reason ?? "live_strategy_change",
      source,
    },
  });
}
