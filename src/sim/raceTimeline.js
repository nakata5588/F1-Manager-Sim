import { createRng } from "./random.js";

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
  return Math.max(1, Math.round(numeric(
    race.laps ?? race.race_laps ?? race.total_laps ?? weekend.totalLaps,
    60,
  )));
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

function weatherPlan(saveWorld, weekend, race, track, laps) {
  const explicit = parseTimeline(
    race.weather_timeline
      ?? race.weatherTimeline
      ?? race.condition_timeline
      ?? race.conditions_timeline,
  )
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

  const transitionLap = numeric(
    race.weather_change_lap
      ?? race.rain_start_lap
      ?? race.wet_from_lap
      ?? race.condition_change_lap,
  );
  if (transitionLap !== null && transitionLap >= 1 && transitionLap <= laps) {
    const initial = conditionName(race.start_weather ?? race.weather_start ?? race.weather_condition ?? race.weather) ?? "dry";
    const next = conditionName(race.end_weather ?? race.weather_end ?? race.weather_after_change) ?? (initial === "dry" ? "wet" : "dry");
    return {
      source: "explicit_transition",
      changes: [
        { lap: 1, condition: initial },
        { lap: Math.round(transitionLap), condition: next },
      ],
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

function overtakingDifficulty(track) {
  for (const name of ["overtaking_difficulty", "passing_difficulty"]) {
    const value = numeric(track?.[name]);
    if (value === null) continue;
    return clamp(value <= 1 ? value : value / 100, 0, 1);
  }
  return 0.5;
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
  const strategyCondition = String(strategy.condition ?? "dry").toLowerCase();
  const wetTrack = condition === "wet" || condition === "damp";
  const wetTyre = strategyCondition === "wet";
  const mismatch = wetTrack !== wetTyre;
  if (mismatch) pace += condition === "wet" ? 3.8 : 2.3;
  return { pace, wear, mismatch };
}

function fuelEffect(fuel, lap, model) {
  if (!model.enabled) return { pace: 0, fuelKg: null, retired: false };
  const fuelKg = model.startingFuelKg - model.burnPerLapKg * (lap - 1);
  if (fuelKg <= 0) return { pace: 0, fuelKg: 0, retired: true };
  const fraction = clamp(fuelKg / model.startingFuelKg, 0, 1);
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
    fuelKg: null,
    tyreWear: null,
    maxTyreWear: 0,
    pitStopsCompleted: 0,
    trafficLoss: 0,
  };
}

function lapCost(saveWorld, weekend, state, lap, condition, fuel, strategy) {
  const rng = createRng(`${saveWorld.meta.seed}|${weekend.key}|timeline|lap-pace|${lap}|${state.driverId}`);
  const consistencyNoise = (rng.next() - 0.5) * (0.7 - state.consistency * 0.0048);
  const base = 100 - state.baseline;
  const stint = stintAt(strategy, lap);
  const tyre = tyreEffect(strategy, stint, condition);
  const fuelState = fuelEffect(fuel, lap, fuel);
  const wetAdjustment = condition === "wet" ? -(state.wetSkill - 50) * 0.025 : condition === "damp" ? -(state.wetSkill - 50) * 0.012 : 0;
  return {
    cost: Math.max(0.05, base + tyre.pace + fuelState.pace + wetAdjustment + consistencyNoise),
    tyre,
    fuel: fuelState,
    stint,
  };
}

function pitPenalty(stop) {
  const seconds = numeric(stop?.timeLossSeconds);
  if (seconds !== null) return seconds / 3.2;
  const execution = normalizedRating(stop?.executionScore, 50);
  return 4.5 + (100 - execution) * 0.035;
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

function attemptPasses(saveWorld, weekend, lap, order, states, track, pitters, events) {
  const difficulty = overtakingDifficulty(track);
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

      if (pitters.has(leaderId) || pitters.has(followerId)) {
        [order[index - 1], order[index]] = [followerId, leaderId];
        changed = true;
        events.push({ lap, type: "position_change", driverId: followerId, passedDriverId: leaderId, reason: "pit_cycle" });
        continue;
      }

      const theoreticalAdvantage = clamp(leader.elapsedIndex - follower.elapsedIndex, 0, 4);
      const skill = (follower.racecraft - leader.racecraft) / 100;
      const probability = clamp(0.16 + theoreticalAdvantage * 0.16 + skill * 0.24 + (1 - difficulty) * 0.34, 0.03, 0.92);
      const rng = createRng(`${saveWorld.meta.seed}|${weekend.key}|timeline|pass|${lap}|${followerId}|${leaderId}`);
      if (rng.next() < probability) {
        [order[index - 1], order[index]] = [followerId, leaderId];
        changed = true;
        events.push({ lap, type: "overtake", driverId: followerId, passedDriverId: leaderId, probability: round(probability, 4) });
      } else {
        const traffic = 0.08 + difficulty * 0.12;
        follower.elapsedIndex = Math.max(follower.elapsedIndex + traffic, leader.elapsedIndex + 0.001);
        follower.trafficLoss += traffic;
      }
    }
  }
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
    return {
      ...baseline,
      position: index + 1,
      driverId: state.driverId,
      teamId: state.teamId,
      grid: state.grid,
      status: finished ? "FINISHED" : "DNF",
      reason: finished ? null : state.reason,
      completedLaps: finished ? null : state.completedLaps,
      performanceIndex: round(state.baseline - state.trafficLoss * 0.08, 4),
      reliability: round(state.reliability, 2),
      raceIndex: round(state.elapsedIndex, 4),
      pitStopsCompleted: state.pitStopsCompleted,
    };
  });
}

export function simulateTemporalRace(saveWorld, weekend) {
  if (!weekend?.key || !Array.isArray(weekend.classification) || !Array.isArray(weekend.grid)) {
    throw new TypeError("A completed race weekend with grid and classification is required.");
  }

  const race = currentRace(saveWorld, weekend);
  const track = currentTrack(saveWorld, weekend, race);
  const laps = raceLaps(weekend, race);
  const weather = weatherPlan(saveWorld, weekend, race, track, laps);
  const fuel = fuelModel(race, laps);
  const baselineRows = weekend.classification.filter((row) => (weekend.grid ?? []).some((grid) => grid.driverId === row.driverId));
  const strategyWasAlreadyApplied = Boolean(weekend.strategyApplied);
  const states = new Map(baselineRows.map((row) => [row.driverId, initialDriverState(saveWorld, weekend, row, laps, strategyWasAlreadyApplied)]));
  const order = (weekend.grid ?? []).map((row) => row.driverId).filter((id) => states.has(id));
  const events = [];
  const snapshots = [];
  const leaderByLap = [];
  const weatherChanges = weather.changes.map((row) => ({ ...row }));
  const fuelSummary = {};
  let lastCondition = conditionAt(weather, 1);

  for (let lap = 1; lap <= laps; lap += 1) {
    const condition = conditionAt(weather, lap);
    if (lap > 1 && condition !== lastCondition) events.push({ lap, type: "weather_change", from: lastCondition, to: condition });
    lastCondition = condition;
    const pitters = new Set();

    for (const id of [...order]) {
      const state = states.get(id);
      if (!state || state.status !== "RUNNING") continue;
      const strategy = strategyFor(weekend, id);
      const lapState = lapCost(saveWorld, weekend, state, lap, condition, fuel, strategy);
      state.lastLapCost = lapState.cost;
      state.tyreWear = lapState.tyre.wear;
      if (lapState.tyre.wear !== null) state.maxTyreWear = Math.max(state.maxTyreWear, lapState.tyre.wear);
      state.fuelKg = lapState.fuel.fuelKg;

      if (lapState.fuel.retired) {
        state.status = "DNF";
        state.reason = "fuel";
        events.push({ lap, type: "retirement", driverId: id, reason: "fuel" });
        continue;
      }

      const mechanicalRng = createRng(`${saveWorld.meta.seed}|${weekend.key}|timeline|mechanical|${lap}|${id}`);
      const incidentRng = createRng(`${saveWorld.meta.seed}|${weekend.key}|timeline|incident|${lap}|${id}`);
      if (mechanicalRng.next() < state.failure.mechanical) {
        state.status = "DNF";
        state.reason = "mechanical";
        events.push({ lap, type: "retirement", driverId: id, reason: "mechanical" });
        continue;
      }
      if (incidentRng.next() < state.failure.incident) {
        state.status = "DNF";
        state.reason = "incident";
        events.push({ lap, type: "retirement", driverId: id, reason: "incident" });
        continue;
      }

      state.elapsedIndex += lapState.cost;
      state.completedLaps = lap;

      const stop = pitStopAt(strategy, lap);
      if (stop) {
        const loss = pitPenalty(stop);
        state.elapsedIndex += loss;
        state.pitStopsCompleted += 1;
        pitters.add(id);
        events.push({
          lap,
          type: "pit_stop",
          driverId: id,
          stop: state.pitStopsCompleted,
          lossIndex: round(loss, 4),
          timeLossSeconds: numeric(stop.timeLossSeconds),
        });
      }
    }

    const running = order.filter((id) => states.get(id)?.status === "RUNNING");
    const retired = order.filter((id) => states.get(id)?.status !== "RUNNING");
    order.splice(0, order.length, ...running, ...retired);
    attemptPasses(saveWorld, weekend, lap, order, states, track, pitters, events);
    leaderByLap.push(order.find((id) => states.get(id)?.status === "RUNNING") ?? null);

    const interval = Math.max(1, Math.round(laps / 6));
    const changedWeather = weatherChanges.some((row) => row.lap === lap && lap !== 1);
    if (lap === 1 || lap === laps || lap % interval === 0 || changedWeather || pitters.size > 0) {
      recordSnapshot(snapshots, lap, order, states, changedWeather ? "weather_change" : pitters.size ? "pit_cycle" : lap === laps ? "finish" : "interval");
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

  const classification = classify(order, states, baselineRows, laps);
  const tyreSummary = {};
  for (const state of states.values()) {
    tyreSummary[state.driverId] = {
      maxWearRatio: state.maxTyreWear > 0 ? round(state.maxTyreWear, 4) : null,
      pitStopsCompleted: state.pitStopsCompleted,
      trafficLossIndex: round(state.trafficLoss, 4),
    };
  }

  return {
    classification,
    timeline: {
      version: 1,
      model: "lap_index_v1",
      lapsSimulated: laps,
      weather: { source: weather.source, changes: weatherChanges },
      fuel: { ...fuel, drivers: fuelSummary },
      events,
      leaderByLap,
      snapshots,
      tyreSummary,
    },
  };
}
