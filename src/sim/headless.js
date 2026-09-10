import { loadHistoricalSeason } from "../domain/historicalWorld.js";
import { createSaveWorld } from "../save/createSaveWorld.js";
import { advanceDays, initializeSimulation, SIM_EVENT } from "./timeEngine.js";
import { createCoreWorldSystems } from "./systems/coreWorldSystems.js";

function countEligibleEntities(saveWorld) {
  return Object.values(saveWorld.world?.entityAvailability ?? {}).reduce(
    (total, collection) => total + Object.values(collection ?? {}).filter((entry) => entry?.status === "eligible").length,
    0,
  );
}

function employmentSummary(saveWorld) {
  const employment = saveWorld.world?.employment ?? {};
  return {
    employedDrivers: Object.keys(employment.drivers ?? {}).length,
    employedStaff: Object.keys(employment.staff ?? {}).length,
    freeDrivers: employment.freeAgents?.drivers?.length ?? 0,
    freeStaff: employment.freeAgents?.staff?.length ?? 0,
    openVacancies: (employment.vacancies ?? []).filter((row) => row.status === "open").length,
  };
}

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
  const systems = options.systems ?? createCoreWorldSystems({
    controlledTeamIds: options.controlledTeamIds ?? [],
    defaultContractYears: options.defaultContractYears ?? 2,
  });
  const initialization = initializeSimulation(saveWorld, systems);
  const result = advanceDays(saveWorld, days, systems);
  const events = [...initialization.events, ...result.events];
  const raceDays = events.filter((item) => item.type === SIM_EVENT.RACE_DAY);

  return {
    saveWorld,
    events,
    summary: {
      season,
      daysAdvanced: days,
      finalDate: saveWorld.clock.date,
      databaseVersion: saveWorld.meta.historicalDatabase.databaseVersion,
      teams: saveWorld.world.teams?.length ?? 0,
      drivers: saveWorld.world.drivers?.length ?? 0,
      futureEntities: saveWorld.world.futureEntities?.length ?? 0,
      eligibleEntities: countEligibleEntities(saveWorld),
      transfers: saveWorld.history.transfers.length,
      ...employmentSummary(saveWorld),
      scheduledRaceDaysReached: raceDays.length,
      raceDays: raceDays.map((item) => ({ date: item.date, ...item.payload })),
    },
  };
}
