import { decideLiveRaceControl, resolveRaceControlPolicy } from "./raceControl.js";
import { createRng } from "./random.js";
import { resolveSectorModel, sectorPaceModifier } from "./sectorModel.js";
import { evaluateAiLiveStrategyDecision, isAiManagedStrategy } from "./aiLiveStrategy.js";
import { reviseRaceStrategy } from "./liveStrategy.js";
import { activeDamagePaceLoss, repairDamageAtPit, resolveIncidentDamage } from "./damageModel.js";

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

function normalizedRating(value, fallback = 50) {
  const parsed = numeric(value);
  if (parsed === null) return fallback;
  if (parsed >= 0 && parsed <= 1) return parsed * 100;
  if (parsed >= 1 && parsed <= 10) return parsed * 10;
  return clamp(parsed, 0, 100);
}

function driverRating(saveWorld, driverId, names, fallback = 50) {
  const state = saveWorld.world?.careerState?.drivers?.[driverId] ?? {};
  const dynamic = state.attributes ?? {};
  const rating = (saveWorld.world?.driverRatings ?? []).find((row) => row.driver_id === driverId) ?? {};
  const profile = (saveWorld.world?.drivers ?? []).find((row) => row.driver_id === driverId) ?? {};
  for (const name of names) {
    const value = dynamic[name] ?? rating[name] ?? profile[name];
    if (numeric(value) !== null) return normalizedRating(value, fallback);
  }
  return fallback;
}

function currentRace(saveWorld, weekend) {
  return (saveWorld.world?.calendar ?? []).find((row) => row.gp_id === weekend.gpId)
    ?? (saveWorld.world?.calendar ?? []).find((row) => Number(row.round) === Number(weekend.round))
    ?? {};
}

function currentTrack(saveWorld, weekend, race) {
  const id = weekend.trackId ?? race.track_id ?? race.circuit_id;
  return (saveWorld.world?.tracks ?? []).find((row) => row.track_id === id || row.circuit_id === id) ?? {};
}

function raceLaps(weekend, race) {
  return Math.max(1, Math.round(numeric(race.laps ?? race.race_laps ?? race.total_laps ?? weekend.totalLaps, 60)));
}

function conditionName(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (text.includes("storm") || text.includes("heavy rain") || text.includes("heavy_rain")) return "wet";
  if (text.includes("rain") || text.includes("wet")) return "wet";
  if (text.includes("intermediate") || text.includes("damp")) return "damp";
  if (text.includes("dry") || text.includes("clear") || text.includes("sun") || text.includes("cloud")) return "dry";
  return null;
}

function parseTimeline(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function weatherPlan(weekend, race, track, laps) {
  const explicit = parseTimeline(race.weather_timeline ?? race.weatherTimeline ?? race.condition_timeline ?? race.conditions_timeline)
    .map((row) => ({
      lap: Math.max(1, Math.round(numeric(row?.lap ?? row?.from_lap ?? row?.start_lap, 1))),
      condition: conditionName(row?.condition ?? row?.weather ?? row?.state),
    }))
    .filter((row) => row.condition)
    .sort((a, b) => a.lap - b.lap);

  if (explicit.length) {
    if (explicit[0].lap !== 1) {
      const initial = conditionName(race.weather_condition ?? race.weather ?? track.weather_condition) ?? "dry";
      explicit.unshift({ lap: 1, condition: initial });
    }
    return { source: "explicit_timeline", changes: explicit.filter((row) => row.lap <= laps) };
  }

  const transitionLap = numeric(race.weather_change_lap ?? race.rain_start_lap ?? race.wet_from_lap ?? race.condition_change_lap);
  if (transitionLap !== null && transitionLap >= 1 && transitionLap <= laps) {
    const initial = conditionName(race.start_weather ?? race.weather_start ?? race.weather_condition ?? race.weather) ?? "dry";
    const next = conditionName(race.end_weather ?? race.weather_end ?? race.weather_after_change) ?? (initial === "dry" ? "wet" : "dry");
    return {
      source: "explicit_transition",
      changes: [{ lap: 1, condition: initial }, { lap: Math.round(transitionLap), condition: next }],
    };
  }

  const constant = conditionName(race.weather_condition ?? race.weather ?? track.weather_condition);
  return {
    source: constant ? "race_condition" : "unspecified_default",
    changes: [{ lap: 1, condition: constant ?? "dry" }],
  };
}

function conditionAt(plan, lap) {
  let condition = plan.changes[0]?.condition ?? "dry";
  for (const change of plan.changes) {
    if (change.lap > lap) break;
    condition = change.condition;
  }
  return condition;
}

function fuelModel(race, laps) {
  const startFuel = numeric(race.starting_fuel_kg ?? race.start_fuel_kg ?? race.fuel_start_kg);
  const burn = numeric(race.fuel_burn_per_lap_kg ?? race.fuel_per_lap_kg ?? race.fuel_consumption_per_lap_kg);
  if (startFuel === null || startFuel <= 0 || burn === null || burn <= 0) {
    return { enabled: false, dataStatus: "no_explicit_fuel_data", startingFuelKg: null, burnPerLapKg: null };
  }
  return {
    enabled: true,
    dataStatus: "explicit_fuel_data",
    startingFuelKg: startFuel,
    burnPerLapKg: burn,
    expectedFinishFuelKg: round(startFuel - burn * laps, 3),
  };
}

function strategyFor(weekend, driverId) {
  return weekend.strategies?.[driverId] ?? null;
}

function stintAt(strategy, lap) {
  const stints = strategy?.stints ?? [];
  if (!stints.length) return { stint: 1, compoundId: null, targetLaps: Infinity, grip: 50, effectiveDurabilityLaps: null, stintLap: lap };
  let start = 1;
  for (const stint of stints) {
    const length = Math.max(1, Math.round(numeric(stint.targetLaps, 1)));
    const end = start + length - 1;
    if (lap <= end) return { ...stint, stintLap: lap - start + 1, startLap: start, endLap: end };
    start = end + 1;
  }
  const final = stints[stints.length - 1];
  return { ...final, stintLap: Math.max(1, lap - start + 1), startLap: start, endLap: Infinity };
}

function pitStopAt(strategy, lap) {
  const stints = strategy?.stints ?? [];
  if (stints.length <= 1) return null;
  let cumulative = 0;
  for (let index = 0; index < stints.length - 1; index += 1) {
    cumulative += Math.max(1, Math.round(numeric(stints[index].targetLaps, 1)));
    if (lap === cumulative) return strategy.pitStops?.[index] ?? { stop: index + 1, afterStint: index + 1, timeLossSeconds: null, executionScore: 50 };
  }
  return null;
}

function tyreEffect(strategy, stint, condition) {
  if (!strategy || strategy.dataStatus === "no_tyre_data" || stint.compoundId === null || stint.compoundId === undefined) {
    return { pace: 0, wear: null, mismatch: false };
  }
  const durability = numeric(stint.effectiveDurabilityLaps);
  const wear = durability === null || durability <= 0 ? null : stint.stintLap / durability;
  let pace = -(normalizedRating(stint.grip, 50) - 50) * 0.018;
  if (wear !== null) {
    pace += Math.max(0, wear - 0.62) * 1.15;
    pace += Math.max(0, wear - 1) * 3.2;
  }
  const strategyCondition = String(stint.condition ?? strategy.condition ?? "dry").toLowerCase();
  const wetTrack = condition === "wet" || condition === "damp";
  const wetTyre = strategyCondition === "wet";
  const mismatch = wetTrack !== wetTyre;
  if (mismatch) pace += condition === "wet" ? 3.8 : 2.3;
  return { pace, wear, mismatch };
}

function fuelEffect(fuel, lap) {
  if (!fuel.enabled) return { pace: 0, fuelKg: null, retired: false };
  const fuelKg = fuel.startingFuelKg - fuel.burnPerLapKg * (lap - 1);
  if (fuelKg <= 0) return { pace: 0, fuelKg: 0, retired: true };
  const fraction = clamp(fuelKg / fuel.startingFuelKg, 0, 1);
  return { pace: fraction * 0.72, fuelKg: round(fuelKg, 3), retired: false };
}

function raceFailureProbability(reliability, crashLikelihood, laps) {
  const mechanicalRace = clamp(0.015 + (100 - reliability) * 0.0032, 0.01, 0.42);
  const incidentRace = clamp(0.008 + crashLikelihood * 0.0011, 0.008, 0.16);
  return {
    mechanical: 1 - Math.pow(1 - mechanicalRace, 1 / laps),
    incident: 1 - Math.pow(1 - incidentRace, 1 / laps),
  };
}

function initialDriverState(saveWorld, weekend, row, laps, strategyWasAlreadyApplied) {
  const strategy = strategyFor(weekend, row.driverId);
  const priorModifier = strategyWasAlreadyApplied ? numeric(strategy?.performanceModifier, 0) : 0;
  const baseline = numeric(row.performanceIndex, 50) - priorModifier;
  const reliability = clamp(numeric(row.reliability, 65), 0, 100);
  const crash = driverRating(saveWorld, row.driverId, ["crash_likelihood"], 20);
  const failure = raceFailureProbability(reliability, crash, laps);
  return {
    driverId: row.driverId,
    teamId: row.teamId,
    grid: row.grid,
    baseline,
    reliability,
    racecraft: driverRating(saveWorld, row.driverId, ["racecraft", "race_intelligence"], 50),
    wetSkill: driverRating(saveWorld, row.driverId, ["wet_skill", "wet_ability"], 50),
    consistency: driverRating(saveWorld, row.driverId, ["consistency"], 50),
    elapsedIndex: 0,
    completedLaps: 0,
    status: "RUNNING",
    reason: null,
    failure,
    lastLapCost: null,
    lastSectorCosts: {},
    retirementSectorId: null,
    fuelKg: null,
    tyreWear: null,
    maxTyreWear: 0,
    pitStopsCompleted: 0,
    trafficLoss: 0,
    damage: [],
    damagePaceLoss: 0,
    damageIncidents: 0,
    repairsCompleted: 0,
  };
}

function lapCost(saveWorld, weekend, state, lap, condition, fuel, strategy) {
  const rng = createRng(`${saveWorld.meta.seed}|${weekend.key}|timeline|lap-pace|${lap}|${state.driverId}`);
  const consistencyNoise = (rng.next() - 0.5) * (0.7 - state.consistency * 0.0048);
  const base = 100 - state.baseline;
  const stint = stintAt(strategy, lap);
  const tyre = tyreEffect(strategy, stint, condition);
  const fuelState = fuelEffect(fuel, lap);
  const wetAdjustment = condition === "wet" ? -(state.wetSkill - 50) * 0.025 : condition === "damp" ? -(state.wetSkill - 50) * 0.012 : 0;
  return {
    cost: Math.max(0.05, base + tyre.pace + fuelState.pace + wetAdjustment + consistencyNoise),
    tyre,
    fuel: fuelState,
    stint,
  };
}

function neutralisationPitFactor(control, lap) {
  if (!control || lap < control.startLap || lap > control.endLap) return 1;
  if (control.type === "safety_car") return 0.62;
  if (control.type === "virtual_safety_car") return 0.78;
  return 1;
}

function pitPenalty(stop, control = null, lap = 0) {
  const seconds = numeric(stop?.timeLossSeconds);
  const raw = seconds !== null
    ? seconds / 3.2
    : 4.5 + (100 - normalizedRating(stop?.executionScore, 50)) * 0.035;
  return {
    loss: raw * neutralisationPitFactor(control, lap),
    neutralisationFactor: neutralisationPitFactor(control, lap),
  };
}

function recordSnapshot(snapshots, lap, order, states, reason = "interval") {
  snapshots.push({
    lap,
    reason,
    order: order.map((id, index) => ({
      position: index + 1,
      driverId: id,
      status: states.get(id)?.status ?? "UNKNOWN",
      completedLaps: states.get(id)?.completedLaps ?? 0,
    })),
  });
}

function compactOrder(order, states) {
  const running = order.filter((id) => states.get(id)?.status === "RUNNING");
  const retired = order.filter((id) => states.get(id)?.status !== "RUNNING");
  order.splice(0, order.length, ...running, ...retired);
}

function controlAppliesToSector(control, lap, sectorId) {
  if (!control || lap < control.startLap || lap > control.endLap) return false;
  if (control.type !== "local_yellow") return true;
  return control.scope !== "sector" || !control.sectorId || control.sectorId === sectorId;
}

function attemptSectorPasses(saveWorld, weekend, lap, sector, order, states, events, activeControl) {
  if (controlAppliesToSector(activeControl, lap, sector.id) && activeControl?.overtakingAllowed === false) return;
  const difficulty = clamp(numeric(sector.overtakingDifficulty, 0.5), 0, 1);
  let changed = true;
  let guard = 0;
  while (changed && guard < order.length) {
    changed = false;
    guard += 1;
    for (let index = 1; index < order.length; index += 1) {
      const leaderId = order[index - 1];
      const followerId = order[index];
      const leader = states.get(leaderId);
      const follower = states.get(followerId);
      if (!leader || !follower || leader.status !== "RUNNING" || follower.status !== "RUNNING") continue;
      if (follower.elapsedIndex >= leader.elapsedIndex) continue;

      const theoreticalAdvantage = clamp((leader.elapsedIndex - follower.elapsedIndex) / Math.max(0.2, sector.weight), 0, 4);
      const skill = (follower.racecraft - leader.racecraft) / 100;
      const brakingOpportunity = clamp(numeric(sector.brakeStress, 0.5), 0, 1);
      const probability = clamp(0.08 + theoreticalAdvantage * 0.13 + skill * 0.24 + (1 - difficulty) * 0.38 + brakingOpportunity * 0.06, 0.02, 0.9);
      const rng = createRng(`${saveWorld.meta.seed}|${weekend.key}|timeline|sector-pass|${lap}|${sector.id}|${followerId}|${leaderId}`);
      if (rng.next() < probability) {
        [order[index - 1], order[index]] = [followerId, leaderId];
        changed = true;
        events.push({
          lap,
          sectorId: sector.id,
          sectorName: sector.name,
          type: "overtake",
          driverId: followerId,
          passedDriverId: leaderId,
          probability: round(probability, 4),
        });
      } else {
        const traffic = (0.025 + difficulty * 0.055) * Math.max(0.2, sector.weight * 3);
        follower.elapsedIndex = Math.max(follower.elapsedIndex + traffic, leader.elapsedIndex + 0.001);
        follower.trafficLoss += traffic;
      }
    }
  }
}

function applyPitCycle(order, states, pitters, lap, events) {
  if (!pitters.size) return;
  let changed = true;
  let guard = 0;
  while (changed && guard < order.length) {
    changed = false;
    guard += 1;
    for (let index = 1; index < order.length; index += 1) {
      const leaderId = order[index - 1];
      const followerId = order[index];
      const leader = states.get(leaderId);
      const follower = states.get(followerId);
      if (!leader || !follower || leader.status !== "RUNNING" || follower.status !== "RUNNING") continue;
      if (!pitters.has(leaderId) && !pitters.has(followerId)) continue;
      if (follower.elapsedIndex >= leader.elapsedIndex) continue;
      [order[index - 1], order[index]] = [followerId, leaderId];
      changed = true;
      events.push({ lap, sectorId: "PIT", type: "position_change", driverId: followerId, passedDriverId: leaderId, reason: "pit_cycle" });
    }
  }
}

function compressRunningField(order, states, factor) {
  const leaderId = order.find((id) => states.get(id)?.status === "RUNNING");
  const leader = leaderId ? states.get(leaderId) : null;
  if (!leader) return;
  for (const id of order) {
    const state = states.get(id);
    if (!state || state.status !== "RUNNING" || id === leaderId) continue;
    const gap = Math.max(0, state.elapsedIndex - leader.elapsedIndex);
    state.elapsedIndex = leader.elapsedIndex + gap * factor;
  }
}

function controlPenalty(control) {
  if (!control) return 0;
  if (control.type === "safety_car") return 2.5;
  if (control.type === "virtual_safety_car") return 1.55;
  if (control.type === "local_yellow") return 0.35;
  if (control.type === "red_flag") return 2.8;
  return 0;
}

function strongerControl(current, candidate) {
  const weight = { red_flag: 4, safety_car: 3, virtual_safety_car: 2, local_yellow: 1 };
  if (!current) return candidate;
  if (!candidate) return current;
  return (weight[candidate.type] ?? 0) > (weight[current.type] ?? 0) ? candidate : current;
}

function hazardShares(sectors, field = null) {
  const values = sectors.map((sector) => {
    const factor = field ? 0.35 + clamp(numeric(sector[field], 0.5), 0, 1) * 0.65 : 1;
    return Math.max(0.001, sector.weight * factor);
  });
  const total = values.reduce((sum, value) => sum + value, 0);
  return values.map((value) => value / total);
}

function distributedHazardProbability(lapProbability, share) {
  return 1 - Math.pow(1 - clamp(lapProbability, 0, 0.999999), clamp(share, 0, 1));
}

function classify(order, states, baselineRows, laps) {
  const baselineById = new Map(baselineRows.map((row) => [row.driverId, row]));
  const runningOrder = order.filter((id) => states.get(id)?.status === "RUNNING");
  const retirees = [...states.values()]
    .filter((state) => state.status !== "RUNNING")
    .sort((a, b) => b.completedLaps - a.completedLaps || a.elapsedIndex - b.elapsedIndex || a.grid - b.grid);
  const ids = [...runningOrder, ...retirees.map((row) => row.driverId)];
  return ids.map((id, index) => {
    const state = states.get(id);
    const baseline = baselineById.get(id) ?? {};
    const finished = state.status === "RUNNING" && state.completedLaps >= laps;
    const activeDamage = (state.damage ?? []).filter((item) => item.status !== "repaired" && !item.terminal);
    return {
      ...baseline,
      position: index + 1,
      driverId: state.driverId,
      teamId: state.teamId,
      grid: state.grid,
      status: finished ? "FINISHED" : "DNF",
      reason: finished ? null : state.reason,
      completedLaps: finished ? null : state.completedLaps,
      retirementSectorId: finished ? null : state.retirementSectorId,
      performanceIndex: round(state.baseline - state.trafficLoss * 0.08 - activeDamagePaceLoss(activeDamage), 4),
      reliability: round(state.reliability, 2),
      raceIndex: round(state.elapsedIndex, 4),
      pitStopsCompleted: state.pitStopsCompleted,
      repairsCompleted: state.repairsCompleted ?? 0,
      damagePaceLoss: activeDamagePaceLoss(activeDamage),
      damageAtFinish: structuredClone(activeDamage),
    };
  });
}

function serializeStates(states) {
  return Object.fromEntries([...states.entries()].map(([id, state]) => [id, structuredClone(state)]));
}

function restoreStates(raw) {
  const states = new Map(Object.entries(raw ?? {}).map(([id, state]) => [id, structuredClone(state)]));
  for (const state of states.values()) {
    state.damage ??= [];
    state.damagePaceLoss = activeDamagePaceLoss(state.damage);
    state.damageIncidents ??= state.damage.length;
    state.repairsCompleted ??= state.damage.filter((item) => item.status === "repaired").length;
  }
  return states;
}

function aiManagedStrategies(weekend) {
  return Object.fromEntries(Object.entries(weekend.strategies ?? {})
    .filter(([, plan]) => isAiManagedStrategy(plan))
    .map(([driverId, plan]) => [driverId, structuredClone(plan)]));
}

function restoreAiStrategies(weekend, resumeState) {
  if (!resumeState?.aiStrategies) return;
  weekend.strategies ??= {};
  for (const [driverId, stored] of Object.entries(resumeState.aiStrategies)) {
    const current = weekend.strategies[driverId];
    if (!current || isAiManagedStrategy(current)) weekend.strategies[driverId] = structuredClone(stored);
  }
}

function buildResumeState(weekend, lap, order, states, events, snapshots, leaderByLap, controlPeriods, lastCondition, activeControl) {
  return {
    version: 4,
    model: "sector_lap_v3_damage_resumable",
    weekendKey: weekend.key,
    lap,
    order: [...order],
    states: serializeStates(states),
    events: structuredClone(events),
    snapshots: structuredClone(snapshots),
    leaderByLap: [...leaderByLap],
    controlPeriods: structuredClone(controlPeriods),
    lastCondition,
    activeControl: activeControl ? structuredClone(activeControl) : null,
    aiStrategies: aiManagedStrategies(weekend),
  };
}

function validateResumeState(weekend, resumeState) {
  if (!resumeState) return;
  if (![1, 2, 3, 4].includes(Number(resumeState.version)) || resumeState.weekendKey !== weekend.key) {
    throw new Error("Resume state does not belong to this race weekend.");
  }
  if (!Number.isInteger(Number(resumeState.lap)) || !Array.isArray(resumeState.order) || !resumeState.states) {
    throw new Error("Resume state is incomplete.");
  }
}

function summarizeSectors(sectorModel, events) {
  return sectorModel.sectors.map((sector) => ({
    sectorId: sector.id,
    sectorName: sector.name,
    overtakes: events.filter((row) => row.type === "overtake" && row.sectorId === sector.id).length,
    incidents: events.filter((row) => row.type === "incident" && row.sectorId === sector.id).length,
    mechanicalRetirements: events.filter((row) => row.type === "retirement" && row.reason === "mechanical" && row.sectorId === sector.id).length,
    localYellows: events.filter((row) => row.type === "race_control" && row.control === "local_yellow" && row.sectorId === sector.id).length,
  }));
}

function summarizeDamage(states, events) {
  return Object.fromEntries([...states.entries()].map(([driverId, state]) => [driverId, {
    incidents: state.damageIncidents ?? 0,
    repairsCompleted: state.repairsCompleted ?? 0,
    remainingPaceLossIndex: activeDamagePaceLoss(state.damage ?? []),
    remainingDamage: structuredClone((state.damage ?? []).filter((item) => item.status !== "repaired" && !item.terminal)),
    peakSeverity: Math.max(0, ...(state.damage ?? []).map((item) => Number(item.severity ?? 0))),
    repairEvents: events.filter((row) => row.type === "repair" && row.driverId === driverId).length,
  }]));
}

function applyAiStrategyDecisions(saveWorld, weekend, states, lap, laps, condition, activeControl, events) {
  for (const gridRow of weekend.grid ?? []) {
    const driverId = gridRow.driverId;
    const state = states.get(driverId);
    if (!state || state.status !== "RUNNING") continue;
    const currentPlan = weekend.strategies?.[driverId];
    if (!currentPlan || !isAiManagedStrategy(currentPlan)) continue;
    const repairableDamage = (state.damage ?? []).some((item) => item.repairable && item.status !== "repaired");
    const decision = evaluateAiLiveStrategyDecision(saveWorld, weekend, driverId, {
      currentLap: lap - 1,
      totalLaps: laps,
      condition,
      tyreWear: state.tyreWear,
      activeControl,
      damagePaceLoss: state.damagePaceLoss,
      repairableDamage,
    });
    if (!decision) continue;

    const revised = reviseRaceStrategy(saveWorld, weekend, driverId, currentPlan, decision, {
      currentLap: lap - 1,
      source: "ai_live",
      entropyKey: `${weekend.key}|ai-live|${driverId}|${lap}|${decision.trigger}`,
    });
    weekend.strategies[driverId] = revised;
    events.push({
      lap,
      sectorId: "PIT_WALL",
      type: "strategy_revision",
      driverId,
      teamId: gridRow.teamId,
      source: "ai_live",
      trigger: decision.trigger,
      reason: decision.reason,
      compoundId: decision.compoundId,
      pitAfterLap: revised.liveRevision?.pitAfterLap ?? decision.pitAfterLap,
      observedWear: decision.observedWear ?? null,
      observedDamageLoss: decision.observedDamageLoss ?? null,
      activeControl: activeControl?.type ?? null,
    });
  }
}

function updateDamageAfterRepair(state, repair) {
  if (!repair.repaired.length) return;
  const byId = new Map(repair.repaired.map((item) => [item.id, item]));
  state.damage = (state.damage ?? []).map((item) => byId.get(item.id) ?? item);
  state.damagePaceLoss = activeDamagePaceLoss(state.damage);
  state.repairsCompleted = Number(state.repairsCompleted ?? 0) + repair.repaired.length;
}

export function simulateTemporalRace(saveWorld, weekend, options = {}) {
  if (!weekend?.key || !Array.isArray(weekend.classification) || !Array.isArray(weekend.grid)) {
    throw new TypeError("A completed race weekend with grid and classification is required.");
  }

  const race = currentRace(saveWorld, weekend);
  const track = currentTrack(saveWorld, weekend, race);
  const laps = raceLaps(weekend, race);
  const weather = weatherPlan(weekend, race, track, laps);
  const fuel = fuelModel(race, laps);
  const sectorModel = resolveSectorModel(track);
  const sectors = sectorModel.sectors;
  const mechanicalShares = hazardShares(sectors);
  const incidentShares = hazardShares(sectors, "incidentRisk");
  const baselineRows = weekend.classification.filter((row) => (weekend.grid ?? []).some((grid) => grid.driverId === row.driverId));
  const resumeState = options.resumeState ?? null;
  validateResumeState(weekend, resumeState);
  restoreAiStrategies(weekend, resumeState);

  const strategyWasAlreadyApplied = Boolean(weekend.strategyApplied);
  const states = resumeState
    ? restoreStates(resumeState.states)
    : new Map(baselineRows.map((row) => [row.driverId, initialDriverState(saveWorld, weekend, row, laps, strategyWasAlreadyApplied)]));
  const order = resumeState
    ? [...resumeState.order]
    : (weekend.grid ?? []).map((row) => row.driverId).filter((id) => states.has(id));
  const events = resumeState ? structuredClone(resumeState.events ?? []) : [];
  const snapshots = resumeState ? structuredClone(resumeState.snapshots ?? []) : [];
  const leaderByLap = resumeState ? [...(resumeState.leaderByLap ?? [])] : [];
  const controlPeriods = resumeState ? structuredClone(resumeState.controlPeriods ?? []) : [];
  const weatherChanges = weather.changes.map((row) => ({ ...row }));
  const fuelSummary = {};
  const policy = resolveRaceControlPolicy(saveWorld);
  let activeControl = resumeState?.activeControl ? structuredClone(resumeState.activeControl) : null;
  let lastCondition = resumeState?.lastCondition ?? conditionAt(weather, Math.max(1, Number(resumeState?.lap ?? 1)));
  const startLap = Number(resumeState?.lap ?? 0) + 1;
  const requestedStop = Number(options.stopAfterLap ?? laps);
  const endLap = Math.min(laps, Math.max(startLap - 1, Number.isFinite(requestedStop) ? Math.round(requestedStop) : laps));

  for (let lap = startLap; lap <= endLap; lap += 1) {
    if (activeControl && lap > activeControl.endLap) {
      events.push({
        lap,
        type: activeControl.type === "red_flag" ? "race_restart" : "race_control_clear",
        control: activeControl.type,
        sectorId: activeControl.sectorId ?? null,
      });
      activeControl = null;
    }

    const condition = conditionAt(weather, lap);
    if (lap > 1 && condition !== lastCondition) events.push({ lap, type: "weather_change", from: lastCondition, to: condition });
    lastCondition = condition;
    applyAiStrategyDecisions(saveWorld, weekend, states, lap, laps, condition, activeControl, events);

    const pitters = new Set();
    const lapStates = new Map();
    let controlChanged = false;
    let latestControl = null;

    for (const id of order) {
      const state = states.get(id);
      if (!state || state.status !== "RUNNING") continue;
      const strategy = strategyFor(weekend, id);
      const currentLapState = lapCost(saveWorld, weekend, state, lap, condition, fuel, strategy);
      state.lastLapCost = 0;
      state.lastSectorCosts = {};
      state.tyreWear = currentLapState.tyre.wear;
      if (currentLapState.tyre.wear !== null) state.maxTyreWear = Math.max(state.maxTyreWear, currentLapState.tyre.wear);
      state.fuelKg = currentLapState.fuel.fuelKg;
      lapStates.set(id, currentLapState);

      if (currentLapState.fuel.retired) {
        state.status = "DNF";
        state.reason = "fuel";
        state.retirementSectorId = null;
        events.push({ lap, sectorId: null, type: "retirement", driverId: id, reason: "fuel" });
      }
    }
    compactOrder(order, states);

    for (let sectorIndex = 0; sectorIndex < sectors.length; sectorIndex += 1) {
      const sector = sectors[sectorIndex];
      let newControl = null;

      for (const id of [...order]) {
        const state = states.get(id);
        const currentLapState = lapStates.get(id);
        if (!state || state.status !== "RUNNING" || !currentLapState) continue;

        const mechanicalProbability = distributedHazardProbability(state.failure.mechanical, mechanicalShares[sectorIndex]);
        const incidentProbability = distributedHazardProbability(state.failure.incident, incidentShares[sectorIndex]);
        const mechanicalRng = createRng(`${saveWorld.meta.seed}|${weekend.key}|timeline|mechanical|${lap}|${sector.id}|${id}`);
        const incidentRng = createRng(`${saveWorld.meta.seed}|${weekend.key}|timeline|incident|${lap}|${sector.id}|${id}`);

        if (mechanicalRng.next() < mechanicalProbability) {
          state.status = "DNF";
          state.reason = "mechanical";
          state.retirementSectorId = sector.id;
          events.push({ lap, sectorId: sector.id, sectorName: sector.name, type: "retirement", driverId: id, reason: "mechanical" });
          continue;
        }
        if (incidentRng.next() < incidentProbability) {
          const incidentBase = { lap, sectorId: sector.id, sectorName: sector.name, type: "incident", driverId: id, reason: "incident" };
          const damage = resolveIncidentDamage(saveWorld, weekend, incidentBase, sector);
          const incident = {
            ...incidentBase,
            severity: damage.severity,
            damageType: damage.type,
            terminal: damage.terminal,
            repairable: damage.repairable,
          };
          events.push(incident);
          state.damage ??= [];
          state.damage.push(damage);
          state.damageIncidents = Number(state.damageIncidents ?? 0) + 1;
          const decision = decideLiveRaceControl(saveWorld, weekend, incident, policy);
          newControl = strongerControl(newControl, decision);

          if (damage.terminal) {
            state.status = "DNF";
            state.reason = "incident";
            state.retirementSectorId = sector.id;
            events.push({
              lap,
              sectorId: sector.id,
              sectorName: sector.name,
              type: "retirement",
              driverId: id,
              reason: "incident",
              severity: damage.severity,
              damageType: damage.type,
            });
            continue;
          }

          state.damagePaceLoss = activeDamagePaceLoss(state.damage);
          events.push({
            lap,
            sectorId: sector.id,
            sectorName: sector.name,
            type: "damage",
            driverId: id,
            damageId: damage.id,
            damageType: damage.type,
            severity: damage.severity,
            repairable: damage.repairable,
            paceLossIndex: damage.paceLossIndex,
          });
        }
      }

      if (newControl) {
        activeControl = strongerControl(activeControl, newControl);
        controlPeriods.push(structuredClone(newControl));
        controlChanged = true;
        latestControl = newControl;
        events.push({
          lap,
          sectorId: newControl.sectorId ?? newControl.originSectorId ?? sector.id,
          type: "race_control",
          control: newControl.type,
          driverId: newControl.driverId,
          severity: newControl.severity,
          startLap: newControl.startLap,
          endLap: newControl.endLap,
          restartLap: newControl.restartLap ?? null,
        });
      }

      compactOrder(order, states);
      for (const id of order) {
        const state = states.get(id);
        const currentLapState = lapStates.get(id);
        if (!state || state.status !== "RUNNING" || !currentLapState) continue;
        const sectorControlPenalty = controlAppliesToSector(activeControl, lap, sector.id)
          ? controlPenalty(activeControl) * sector.weight
          : 0;
        const damagePenalty = activeDamagePaceLoss(state.damage ?? []) * sector.weight;
        const sectorCost = Math.max(
          0.01,
          currentLapState.cost * sector.weight + sectorPaceModifier(state, sector, condition) + sectorControlPenalty + damagePenalty,
        );
        state.elapsedIndex += sectorCost;
        state.lastLapCost += sectorCost;
        state.lastSectorCosts[sector.id] = round(sectorCost, 4);
      }

      attemptSectorPasses(saveWorld, weekend, lap, sector, order, states, events, activeControl);
    }

    const globalControlApplies = activeControl
      && activeControl.type !== "local_yellow"
      && lap >= activeControl.startLap
      && lap <= activeControl.endLap;
    if (globalControlApplies && numeric(activeControl.fieldCompression) !== null) {
      compressRunningField(order, states, clamp(Number(activeControl.fieldCompression), 0, 1));
    }

    for (const id of order) {
      const state = states.get(id);
      if (!state || state.status !== "RUNNING") continue;
      state.completedLaps = lap;
      const strategy = strategyFor(weekend, id);
      const stop = pitStopAt(strategy, lap);
      if (!stop) continue;

      const pit = pitPenalty(stop, activeControl, lap);
      const repair = repairDamageAtPit(saveWorld, state.teamId, state.damage ?? [], `${weekend.key}|repair|${lap}|${id}`);
      updateDamageAfterRepair(state, repair);
      const totalLoss = pit.loss + repair.lossIndex;
      state.elapsedIndex += totalLoss;
      state.pitStopsCompleted += 1;
      pitters.add(id);

      if (repair.repaired.length) {
        events.push({
          lap,
          sectorId: "PIT",
          type: "repair",
          driverId: id,
          repairedDamageIds: repair.repaired.map((item) => item.id),
          repairedTypes: repair.repaired.map((item) => item.type),
          repairLossIndex: repair.lossIndex,
          capability: repair.capability,
          paceLossRecovered: repair.paceLossRecovered,
        });
      }

      events.push({
        lap,
        sectorId: "PIT",
        type: "pit_stop",
        driverId: id,
        stop: state.pitStopsCompleted,
        lossIndex: round(totalLoss, 4),
        basePitLossIndex: round(pit.loss, 4),
        repairLossIndex: repair.lossIndex,
        timeLossSeconds: numeric(stop.timeLossSeconds),
        neutralisationFactor: pit.neutralisationFactor,
        lossModel: pit.neutralisationFactor < 1 ? "neutralisation_simulation_tuning" : "normal_running",
      });
    }

    compactOrder(order, states);
    applyPitCycle(order, states, pitters, lap, events);
    leaderByLap.push(order.find((id) => states.get(id)?.status === "RUNNING") ?? null);

    const interval = Math.max(1, Math.round(laps / 6));
    const changedWeather = weatherChanges.some((row) => row.lap === lap && lap !== 1);
    if (lap === 1 || lap === laps || lap % interval === 0 || changedWeather || pitters.size > 0 || controlChanged) {
      recordSnapshot(
        snapshots,
        lap,
        order,
        states,
        controlChanged ? latestControl.type : changedWeather ? "weather_change" : pitters.size ? "pit_cycle" : lap === laps ? "finish" : "interval",
      );
    }
  }

  for (const state of states.values()) {
    if (fuel.enabled) {
      fuelSummary[state.driverId] = {
        startingFuelKg: round(fuel.startingFuelKg, 3),
        finishingFuelKg: state.fuelKg,
      };
    }
  }

  const completed = endLap >= laps;
  const classification = completed ? classify(order, states, baselineRows, laps) : null;
  const tyreSummary = {};
  for (const state of states.values()) {
    tyreSummary[state.driverId] = {
      maxWearRatio: state.maxTyreWear > 0 ? round(state.maxTyreWear, 4) : null,
      pitStopsCompleted: state.pitStopsCompleted,
      trafficLossIndex: round(state.trafficLoss, 4),
    };
  }

  const nextResumeState = completed
    ? null
    : buildResumeState(weekend, endLap, order, states, events, snapshots, leaderByLap, controlPeriods, lastCondition, activeControl);

  return {
    classification,
    resumeState: nextResumeState,
    timeline: {
      version: 5,
      model: "sector_lap_v3_damage_resumable",
      completed,
      lapsSimulated: endLap,
      totalLaps: laps,
      weather: { source: weather.source, changes: weatherChanges },
      fuel: { ...fuel, drivers: fuelSummary },
      events,
      leaderByLap,
      snapshots,
      tyreSummary,
      damageSummary: summarizeDamage(states, events),
      sectorModel,
      sectorSummary: summarizeSectors(sectorModel, events),
      raceControlLive: true,
      raceControlPolicy: policy,
      controlPeriods,
      aiStrategyRevisions: events.filter((row) => row.type === "strategy_revision" && row.source === "ai_live"),
    },
  };
}
