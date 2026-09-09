import { loadHistoricalSeason } from "../domain/historicalWorld.js";
import { createSaveWorld } from "../save/createSaveWorld.js";
import { advanceDays, SIM_EVENT } from "./timeEngine.js";

export function runHeadlessSimulation(database, options = {}) {
  const season = Number(options.season ?? 1980);
  const days = Number(options.days ?? 0);
  if (!Number.isInteger(days) || days < 0) throw new RangeError("days must be a non-negative integer.");

  const snapshot = loadHistoricalSeason(database, season, { allowWarnings: options.allowWarnings ?? true });
  const saveWorld = createSaveWorld(snapshot, {
    seed: options.seed ?? `headless-${season}`,
    startDate: options.startDate ?? `${season}-01-01`,
    createdAt: options.createdAt,
  });
  const result = advanceDays(saveWorld, days, options.systems ?? []);
  const raceDays = result.events.filter((item) => item.type === SIM_EVENT.RACE_DAY);

  return {
    saveWorld,
    events: result.events,
    summary: {
      season,
      daysAdvanced: days,
      finalDate: saveWorld.clock.date,
      databaseVersion: saveWorld.meta.historicalDatabase.databaseVersion,
      teams: saveWorld.world.teams?.length ?? 0,
      drivers: saveWorld.world.drivers?.length ?? 0,
      scheduledRaceDaysReached: raceDays.length,
      raceDays: raceDays.map((item) => ({ date: item.date, ...item.payload })),
    },
  };
}
