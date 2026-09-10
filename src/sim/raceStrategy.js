import { createRng } from "./random.js";

function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function normalizedRating(value, fallback = 50) {
  const parsed = numeric(value);
  if (parsed === null) return fallback;
  if (parsed >= 0 && parsed <= 1) return parsed * 100;
  if (parsed >= 1 && parsed <= 10) return parsed * 10;
  return clamp(parsed, 0, 100);
}

function compoundId(row) {
  return row?.compound_id ?? row?.compund_id ?? row?.tyre_id ?? row?.tire_id ?? row?.id ?? null;
}

function compoundName(row) {
  return String(row?.compound_name ?? row?.name ?? row?.tyre_name ?? row?.tire_name ?? compoundId(row) ?? "").trim();
}

function compoundCondition(row) {
  const text = `${row?.condition ?? ""} ${row?.type ?? ""} ${row?.category ?? ""} ${compoundName(row)}`.toLowerCase();
  if (text.includes("intermediate")) return "wet";
  if (text.includes("wet") || text.includes("rain")) return "wet";
  return "dry";
}

function durabilityLaps(row) {
  const direct = numeric(
    row?.durability_laps
      ?? row?.expected_stint_laps
      ?? row?.stint_laps
      ?? row?.life_laps
      ?? row?.max_laps,
  );
  return direct !== null && direct > 0 ? direct : null;
}

function normalizeCompound(row) {
  const id = compoundId(row);
  if (!id) return null;
  const dryGrip = normalizedRating(row?.dry_grip ?? row?.grip ?? row?.performance, 50);
  const wetGrip = normalizedRating(row?.wet_grip ?? row?.rain_grip, compoundCondition(row) === "wet" ? dryGrip : 30);
  return {
    compoundId: id,
    name: compoundName(row),
    condition: compoundCondition(row),
    dryGrip,
    wetGrip,
    durabilityLaps: durabilityLaps(row),
    raw: row,
  };
}

export function availableTyreCompounds(saveWorld, wet = false) {
  const rows = saveWorld.world?.tyres ?? [];
  const normalized = rows.map(normalizeCompound).filter(Boolean);
  const condition = wet ? "wet" : "dry";
  const matching = normalized.filter((row) => row.condition === condition);
  return matching.length ? matching : normalized;
}

function driverTyreManagement(saveWorld, driverId) {
  const state = saveWorld.world?.careerState?.drivers?.[driverId] ?? {};
  const dynamic = state.attributes ?? {};
  const rating = (saveWorld.world?.driverRatings ?? []).find((row) => row.driver_id === driverId) ?? {};
  return normalizedRating(dynamic.tire_management ?? dynamic.tyre_management ?? rating.tire_management ?? rating.tyre_management, 50);
}

function pitCrewScore(saveWorld, teamId) {
  const assignments = saveWorld.world?.employment?.staff ?? {};
  const staffIds = Object.entries(assignments)
    .filter(([, row]) => row?.teamId === teamId && row?.status === "employed")
    .map(([id]) => id);
  if (!staffIds.length) return 50;

  const scores = staffIds.map((id) => {
    const state = saveWorld.world?.careerState?.staff?.[id] ?? {};
    const dynamic = state.attributes ?? {};
    const rating = (saveWorld.world?.staffRatings ?? []).find((row) => row.staff_id === id) ?? {};
    return normalizedRating(dynamic.pitstop_management ?? rating.pitstop_management, 50);
  });
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function raceLaps(weekend) {
  return Math.max(1, Math.round(numeric(weekend?.race?.laps ?? weekend?.race?.race_laps ?? weekend?.race?.total_laps, 60)));
}

function effectiveDurability(compound, tyreManagement) {
  if (compound.durabilityLaps === null) return null;
  const managementMultiplier = 0.88 + (tyreManagement / 100) * 0.24;
  return Math.max(1, compound.durabilityLaps * managementMultiplier);
}

function planForCompound(compound, laps, tyreManagement, wet) {
  const durability = effectiveDurability(compound, tyreManagement);
  const stints = durability === null ? 1 : Math.max(1, Math.ceil(laps / durability));
  const stops = stints - 1;
  const grip = wet ? compound.wetGrip : compound.dryGrip;
  const stintLength = Math.ceil(laps / stints);
  const score = grip - stops * 2.2;
  return {
    compound,
    score,
    stints: Array.from({ length: stints }, (_, index) => ({
      stint: index + 1,
      compoundId: compound.compoundId,
      targetLaps: index === stints - 1 ? laps - stintLength * index : stintLength,
    })),
  };
}

function explicitPlan(saveWorld, weekend, entrant) {
  return saveWorld.world?.raceStrategyPlans?.[weekend.key]?.[entrant.driverId] ?? null;
}

function normalizeExplicitPlan(plan, compounds, laps) {
  if (!plan || !Array.isArray(plan.stints) || !plan.stints.length) return null;
  const byId = new Map(compounds.map((row) => [String(row.compoundId), row]));
  const stints = [];
  let assigned = 0;
  for (let index = 0; index < plan.stints.length; index += 1) {
    const source = plan.stints[index] ?? {};
    const compound = byId.get(String(source.compoundId ?? source.compound_id ?? ""));
    if (!compound) return null;
    const remaining = Math.max(0, laps - assigned);
    if (remaining <= 0) break;
    const requested = Math.round(numeric(source.targetLaps ?? source.target_laps, remaining));
    const targetLaps = index === plan.stints.length - 1 ? remaining : clamp(requested, 1, remaining);
    stints.push({ stint: stints.length + 1, compoundId: compound.compoundId, targetLaps });
    assigned += targetLaps;
  }
  if (!stints.length) return null;
  if (assigned < laps) stints[stints.length - 1].targetLaps += laps - assigned;
  return stints;
}

export function createRaceStrategyPlan(saveWorld, weekend, entrant, options = {}) {
  const wet = Boolean(options.wet);
  const controlledTeams = new Set(options.controlledTeamIds ?? []);
  const laps = raceLaps(weekend);
  const compounds = availableTyreCompounds(saveWorld, wet);
  const explicit = explicitPlan(saveWorld, weekend, entrant);
  const explicitStints = normalizeExplicitPlan(explicit, compounds, laps);

  if (explicitStints) {
    return {
      source: controlledTeams.has(entrant.teamId) ? "player" : "external",
      condition: wet ? "wet" : "dry",
      dataStatus: "tyre_data_available",
      stints: explicitStints,
      plannedStops: Math.max(0, explicitStints.length - 1),
    };
  }

  if (!compounds.length) {
    return {
      source: controlledTeams.has(entrant.teamId) ? "delegated_unspecified" : "ai_unspecified",
      condition: wet ? "wet" : "dry",
      dataStatus: "no_tyre_data",
      stints: [{ stint: 1, compoundId: null, targetLaps: laps }],
      plannedStops: 0,
    };
  }

  const tyreManagement = driverTyreManagement(saveWorld, entrant.driverId);
  const candidates = compounds
    .map((compound) => planForCompound(compound, laps, tyreManagement, wet))
    .sort((a, b) => b.score - a.score || String(a.compound.compoundId).localeCompare(String(b.compound.compoundId)));
  const chosen = candidates[0];
  return {
    source: controlledTeams.has(entrant.teamId) ? "delegated" : "ai_generated",
    condition: wet ? "wet" : "dry",
    dataStatus: "tyre_data_available",
    stints: chosen.stints,
    plannedStops: Math.max(0, chosen.stints.length - 1),
  };
}

function compoundById(saveWorld, id) {
  if (id === null || id === undefined) return null;
  return (saveWorld.world?.tyres ?? []).map(normalizeCompound).find((row) => String(row?.compoundId) === String(id)) ?? null;
}

function pitLaneLossSeconds(weekend) {
  return numeric(
    weekend?.race?.pit_lane_loss_seconds
      ?? weekend?.race?.pit_loss_seconds
      ?? weekend?.track?.pit_lane_loss_seconds,
  );
}

export function evaluateRaceStrategy(saveWorld, weekend, entrant, plan, entropyKey) {
  const tyreManagement = driverTyreManagement(saveWorld, entrant.driverId);
  const pitSkill = pitCrewScore(saveWorld, entrant.teamId);
  const laps = raceLaps(weekend);
  const pitLoss = pitLaneLossSeconds(weekend);
  let tyreScoreTotal = 0;
  let tyreLaps = 0;
  let overrunPenalty = 0;
  const stints = [];

  for (const stint of plan.stints ?? []) {
    const compound = compoundById(saveWorld, stint.compoundId);
    const targetLaps = Math.max(1, Math.round(numeric(stint.targetLaps, laps)));
    const grip = compound ? (plan.condition === "wet" ? compound.wetGrip : compound.dryGrip) : 50;
    tyreScoreTotal += grip * targetLaps;
    tyreLaps += targetLaps;
    const durability = compound ? effectiveDurability(compound, tyreManagement) : null;
    if (durability !== null && targetLaps > durability) {
      overrunPenalty += (targetLaps - durability) / Math.max(1, durability) * 4;
    }
    stints.push({ ...stint, grip: round(grip, 2), effectiveDurabilityLaps: durability === null ? null : round(durability, 2) });
  }

  const pitStops = [];
  for (let index = 0; index < Math.max(0, stints.length - 1); index += 1) {
    const rng = createRng(`${saveWorld.meta.seed}|${entropyKey}|pit-stop|${entrant.driverId}|${index + 1}`);
    const execution = clamp(pitSkill + (rng.next() - 0.5) * 10, 0, 100);
    pitStops.push({
      stop: index + 1,
      afterStint: index + 1,
      executionScore: round(execution, 2),
      timeLossSeconds: pitLoss === null ? null : round(pitLoss + (100 - execution) * 0.025, 3),
      lossSource: pitLoss === null ? "abstract_no_track_time" : "track_data",
    });
  }

  const averageGrip = tyreLaps > 0 ? tyreScoreTotal / tyreLaps : 50;
  const gripModifier = (averageGrip - 50) * 0.035;
  const abstractPitPenalty = pitLoss === null
    ? pitStops.reduce((sum, stop) => sum + 0.55 + (100 - stop.executionScore) * 0.008, 0)
    : pitStops.reduce((sum, stop) => sum + (stop.timeLossSeconds ?? 0) / 35, 0);
  const modifier = clamp(gripModifier - abstractPitPenalty - overrunPenalty, -8, 6);

  return {
    ...plan,
    stints,
    pitStops,
    tyreManagement: round(tyreManagement, 2),
    pitCrewScore: round(pitSkill, 2),
    performanceModifier: round(modifier, 4),
  };
}
