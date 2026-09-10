import { createRaceStrategyPlan, evaluateRaceStrategy } from "../raceStrategy.js";
import { RACE_EVENT } from "./raceWeekend.js";

export const STRATEGY_EVENT = Object.freeze({
  LOCKED: "race.strategy_locked",
  APPLIED: "race.strategy_applied",
});

function activeWeekend(saveWorld, key) {
  return saveWorld.world?.raceWeekendState?.active?.[key] ?? null;
}

function wetWeekend(weekend) {
  const text = String(weekend?.race?.weather_condition ?? weekend?.race?.weather ?? "").toLowerCase();
  return text.includes("wet") || text.includes("rain") || text.includes("storm");
}

function lockStrategies(saveWorld, event, controlledTeamIds) {
  const key = event.payload?.weekend_key ?? null;
  const weekend = key ? activeWeekend(saveWorld, key) : null;
  if (!weekend || weekend.strategiesLocked) return null;
  const entrantsById = new Map((weekend.entrants ?? []).map((row) => [row.driverId, row]));
  const wet = wetWeekend(weekend);
  weekend.strategies ??= {};

  for (const gridRow of weekend.grid ?? event.payload?.grid ?? []) {
    const entrant = entrantsById.get(gridRow.driverId);
    if (!entrant) continue;
    const plan = createRaceStrategyPlan(saveWorld, weekend, entrant, { wet, controlledTeamIds });
    weekend.strategies[entrant.driverId] = evaluateRaceStrategy(
      saveWorld,
      weekend,
      entrant,
      plan,
      `${weekend.key}|${entrant.driverId}`,
    );
  }
  weekend.strategiesLocked = true;

  return {
    type: STRATEGY_EVENT.LOCKED,
    payload: {
      weekend_key: key,
      gp_id: weekend.gpId,
      strategies: Object.entries(weekend.strategies).map(([driverId, strategy]) => ({
        driver_id: driverId,
        source: strategy.source,
        planned_stops: strategy.plannedStops,
        data_status: strategy.dataStatus,
        performance_modifier: strategy.performanceModifier,
      })),
    },
  };
}

function sortClassification(rows) {
  const finishers = rows
    .filter((row) => row.status === "FINISHED")
    .sort((a, b) => b.performanceIndex - a.performanceIndex || a.grid - b.grid || String(a.driverId).localeCompare(String(b.driverId)));
  const nonFinishers = rows
    .filter((row) => row.status !== "FINISHED")
    .sort((a, b) => (b.completedLaps ?? -1) - (a.completedLaps ?? -1) || b.performanceIndex - a.performanceIndex);
  return [...finishers, ...nonFinishers].map((row, index) => ({ ...row, position: index + 1 }));
}

function updateStoredHistory(saveWorld, payload) {
  const races = saveWorld.history?.races ?? [];
  const index = races.findIndex((row) => row.key === payload.key);
  if (index >= 0) races[index] = structuredClone(payload);
}

function applyStrategies(saveWorld, event) {
  const payload = event.payload ?? {};
  const strategies = payload.strategies ?? {};
  if (!Object.keys(strategies).length || payload.strategyApplied) return null;

  const adjusted = (payload.classification ?? []).map((row) => {
    const strategy = strategies[row.driverId];
    if (!strategy) return row;
    return {
      ...row,
      performanceIndex: Number((Number(row.performanceIndex ?? 0) + Number(strategy.performanceModifier ?? 0)).toFixed(4)),
      strategy: {
        source: strategy.source,
        condition: strategy.condition,
        dataStatus: strategy.dataStatus,
        stints: strategy.stints,
        pitStops: strategy.pitStops,
        performanceModifier: strategy.performanceModifier,
      },
    };
  });

  payload.classification = sortClassification(adjusted);
  payload.strategyApplied = true;
  updateStoredHistory(saveWorld, payload);

  return {
    type: STRATEGY_EVENT.APPLIED,
    payload: {
      weekend_key: payload.key ?? null,
      gp_id: payload.gpId ?? null,
      winner_driver_id: payload.classification[0]?.driverId ?? null,
      pit_stops: payload.classification.reduce((sum, row) => sum + (row.strategy?.pitStops?.length ?? 0), 0),
    },
  };
}

export function createRaceStrategySystem(options = {}) {
  const controlledTeamIds = options.controlledTeamIds ?? [];
  return {
    id: "race.strategy",
    eventTypes: [RACE_EVENT.GRID_SET, RACE_EVENT.COMPLETED],
    handle({ saveWorld, event }) {
      if (event.type === RACE_EVENT.GRID_SET) return lockStrategies(saveWorld, event, controlledTeamIds);
      return applyStrategies(saveWorld, event);
    },
  };
}
