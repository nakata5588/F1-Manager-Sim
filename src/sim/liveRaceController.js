import { currentStrategyStint, reviseRaceStrategy, reviseStartingTyreCompound, selectLiveTyreCompound } from "./liveStrategy.js";
import { simulateTemporalRace } from "./raceTimeline.js";

function ensureState(saveWorld) {
  saveWorld.world.liveRaceState ??= {
    active: null,
    completed: [],
  };
  saveWorld.world.liveRaceState.completed ??= [];
  return saveWorld.world.liveRaceState;
}

function activeSession(saveWorld) {
  return ensureState(saveWorld).active;
}

function requireActive(saveWorld) {
  const session = activeSession(saveWorld);
  if (!session) throw new Error("No live race session is active.");
  return session;
}

function clone(value) {
  return structuredClone(value);
}

function strategyCondition(saveWorld, teamId, plan, lap) {
  const active = currentStrategyStint(plan, lap);
  if (!active) return plan?.condition ?? null;
  const compoundId = active.stint?.compoundId ?? active.compoundId;
  const all = [
    ...selectableCompounds(saveWorld, teamId, false),
    ...selectableCompounds(saveWorld, teamId, true),
  ];
  const compound = all.find((row) => String(row.compoundId) === String(compoundId));
  return active.stint?.condition ?? active.condition ?? compound?.condition ?? plan?.condition ?? null;
}

function selectableCompounds(saveWorld, teamId, wet) {
  const selected = selectLiveTyreCompound(saveWorld, teamId, wet ? "wet" : "dry");
  if (!selected) return [];
  const rows = saveWorld.world?.tyres ?? [];
  return rows.length ? [selected] : [];
}

function baselineForRuntime(weekend, options) {
  const supplied = options.raceStartBaseline ?? weekend.raceStartBaseline ?? null;
  if (Array.isArray(supplied) && supplied.length) return clone(supplied);
  if (Array.isArray(weekend.classification) && weekend.classification.length) return clone(weekend.classification);
  return null;
}

function attentionEvents(events) {
  const important = new Set([
    "incident",
    "damage",
    "retirement",
    "race_control",
    "race_restart",
    "race_control_clear",
    "weather_change",
    "strategy_revision",
  ]);
  return (events ?? []).filter((row) => important.has(row?.type));
}

export function startLiveRaceSession(saveWorld, weekend, options = {}) {
  if (!weekend?.key) throw new TypeError("A race weekend with a stable key is required.");
  const state = ensureState(saveWorld);
  if (state.active && state.active.status !== "completed") {
    throw new Error(`Live race ${state.active.weekendKey} is already active.`);
  }

  const runtimeWeekend = clone(weekend);
  const raceStartBaseline = baselineForRuntime(runtimeWeekend, options);
  if (!raceStartBaseline) {
    throw new Error("A raceStartBaseline or legacy completed classification is required to start a live race.");
  }

  // raceTimeline still consumes a classification-shaped baseline internally.
  // This adapter exists only inside the cloned runtime weekend; it is never
  // written back to the authoritative race weekend or archived as a result.
  runtimeWeekend.raceStartBaseline = clone(raceStartBaseline);
  runtimeWeekend.classification = clone(raceStartBaseline);
  runtimeWeekend.classificationAdapter = "race_start_baseline";

  const initial = simulateTemporalRace(saveWorld, runtimeWeekend, { stopAfterLap: 0 });
  state.active = {
    version: 2,
    weekendKey: runtimeWeekend.key,
    gpId: runtimeWeekend.gpId ?? null,
    season: Number(runtimeWeekend.season ?? saveWorld.clock?.season),
    status: "paused",
    currentLap: 0,
    totalLaps: initial.timeline.totalLaps,
    weekend: runtimeWeekend,
    raceStartBaseline: clone(raceStartBaseline),
    resumeState: initial.resumeState,
    strategyRevisions: [],
    latestEvents: [],
    latestAttentionEvents: [],
    startedAtWorldDate: saveWorld.clock?.date ?? null,
  };
  return clone(state.active);
}

export function getLiveRaceSession(saveWorld) {
  const session = activeSession(saveWorld);
  return session ? clone(session) : null;
}

export function applyPreRaceStartingTyre(saveWorld, driverId, compoundId, options = {}) {
  const session = requireActive(saveWorld);
  if (session.status !== "paused" || session.currentLap !== 0) {
    throw new Error("Starting tyre can only be changed before the race begins.");
  }
  const currentPlan = session.weekend?.strategies?.[driverId];
  if (!currentPlan) throw new Error(`Driver ${driverId} has no locked race strategy.`);

  const revised = reviseStartingTyreCompound(
    saveWorld,
    session.weekend,
    driverId,
    currentPlan,
    compoundId,
    {
      source: options.source ?? "player_prerace",
      reason: options.reason ?? "starting_tyre_change",
      entropyKey: `${session.weekendKey}|starting-tyre|${driverId}|${compoundId}|${session.strategyRevisions.length + 1}`,
    },
  );
  session.weekend.strategies[driverId] = revised;
  const record = {
    revision: session.strategyRevisions.length + 1,
    kind: "starting_tyre",
    lapBoundary: 0,
    driverId,
    teamId: (session.weekend.grid ?? []).find((row) => row.driverId === driverId)?.teamId ?? null,
    pitAfterLap: null,
    compoundId: revised.preRaceRevision?.startingCompoundId ?? compoundId,
    reason: revised.preRaceRevision?.reason ?? "starting_tyre_change",
    source: revised.preRaceRevision?.source ?? options.source ?? "player_prerace",
  };
  session.strategyRevisions.push(record);
  return { plan: clone(revised), revision: clone(record) };
}

export function applyLiveStrategyInstruction(saveWorld, driverId, instruction, options = {}) {
  const session = requireActive(saveWorld);
  if (session.status !== "paused") throw new Error("Live strategy can only be changed at a paused lap boundary.");
  if (session.currentLap >= session.totalLaps) throw new Error("The live race has already reached the finish.");

  const currentPlan = session.weekend?.strategies?.[driverId];
  if (!currentPlan) throw new Error(`Driver ${driverId} has no locked race strategy.`);
  const revised = reviseRaceStrategy(
    saveWorld,
    session.weekend,
    driverId,
    currentPlan,
    instruction,
    {
      currentLap: session.currentLap,
      source: options.source ?? instruction?.source ?? "player_live",
      entropyKey: `${session.weekendKey}|revision|${session.strategyRevisions.length + 1}`,
    },
  );

  session.weekend.strategies[driverId] = revised;
  const record = {
    revision: session.strategyRevisions.length + 1,
    kind: "live_box",
    lapBoundary: session.currentLap,
    driverId,
    teamId: (session.weekend.grid ?? []).find((row) => row.driverId === driverId)?.teamId ?? null,
    pitAfterLap: revised.liveRevision?.pitAfterLap ?? null,
    compoundId: revised.liveRevision?.requestedCompoundId ?? null,
    reason: revised.liveRevision?.reason ?? instruction?.reason ?? "live_strategy_change",
    source: revised.liveRevision?.source ?? options.source ?? "player_live",
  };
  session.strategyRevisions.push(record);
  return { plan: clone(revised), revision: clone(record) };
}

export function recommendLiveStrategyInstruction(saveWorld, driverId, condition) {
  const session = requireActive(saveWorld);
  const grid = (session.weekend.grid ?? []).find((row) => row.driverId === driverId);
  if (!grid) return null;
  const plan = session.weekend?.strategies?.[driverId];
  if (!plan) return null;

  const targetCondition = condition === "wet" || condition === "damp" ? "wet" : "dry";
  const currentCondition = strategyCondition(saveWorld, grid.teamId, plan, session.currentLap + 1);
  if (currentCondition === targetCondition) return null;

  const compound = selectLiveTyreCompound(saveWorld, grid.teamId, targetCondition);
  if (!compound) return null;
  return {
    action: "box",
    compoundId: compound.compoundId,
    pitAfterLap: session.currentLap + 1,
    reason: `conditions_${targetCondition}`,
  };
}

export function advanceLiveRaceSession(saveWorld, options = {}) {
  const state = ensureState(saveWorld);
  const session = requireActive(saveWorld);
  if (session.status === "completed") {
    return { completed: true, session: clone(session), result: clone(session.result) };
  }

  const laps = Math.max(1, Math.round(Number(options.laps ?? 1)));
  const requestedTarget = options.toLap === undefined
    ? session.currentLap + laps
    : Math.round(Number(options.toLap));
  const targetLap = Math.min(session.totalLaps, Math.max(session.currentLap + 1, requestedTarget));
  const previousEventCount = Number(session.resumeState?.events?.length ?? 0);
  session.status = "running";

  const result = simulateTemporalRace(saveWorld, session.weekend, {
    resumeState: session.resumeState,
    stopAfterLap: targetLap,
  });
  session.currentLap = result.timeline.lapsSimulated;
  session.resumeState = result.resumeState;
  session.latestEvents = clone((result.timeline.events ?? []).slice(previousEventCount));
  session.latestAttentionEvents = clone(attentionEvents(session.latestEvents));

  if (result.timeline.completed) {
    session.status = "completed";
    session.result = {
      classification: clone(result.classification),
      timeline: clone({
        ...result.timeline,
        strategyRevisions: session.strategyRevisions,
      }),
    };
    state.completed.push({
      weekendKey: session.weekendKey,
      gpId: session.gpId,
      season: session.season,
      completedAtWorldDate: saveWorld.clock?.date ?? null,
      winnerDriverId: result.classification?.[0]?.driverId ?? null,
      laps: session.totalLaps,
      strategyRevisions: clone(session.strategyRevisions),
    });
  } else {
    session.status = "paused";
  }

  return {
    completed: session.status === "completed",
    session: clone(session),
    result: session.status === "completed" ? clone(session.result) : null,
  };
}

export function clearCompletedLiveRaceSession(saveWorld) {
  const state = ensureState(saveWorld);
  if (!state.active || state.active.status !== "completed") return false;
  state.active = null;
  return true;
}
