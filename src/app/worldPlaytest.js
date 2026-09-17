import {
  listWorldHistory,
  listWorldNews,
  worldRecordsSummary,
} from "../game/worldNarrative.js";
import { developerChampionship } from "./championshipPlaytest.js";

function requireSession(session) {
  if (!session || typeof session.requireCareer !== "function") throw new TypeError("A DeveloperPlaytestSession is required.");
  return session.requireCareer();
}

function visibleActiveDrivers(saveWorld) {
  return (saveWorld.world?.drivers ?? []).map((row) => ({
    driverId: row.driver_id ?? row.id,
    name: row.display_name ?? row.driver_name ?? row.name ?? row.driver_id ?? row.id,
    nationality: row.nationality ?? null,
    birthDate: row.birth_date ?? null,
  }));
}

function activeTeams(saveWorld) {
  return (saveWorld.world?.teams ?? []).map((row) => ({
    teamId: row.team_id ?? row.id,
    name: row.team_name ?? row.display_name ?? row.name ?? row.team_id ?? row.id,
  }));
}

function currentStandings(saveWorld) {
  const championship = saveWorld.world?.championship ?? {};
  const driverRows = Object.values(championship.driverStandings ?? championship.drivers ?? {});
  const constructorRows = Object.values(championship.constructorStandings ?? championship.constructors ?? {});
  return {
    drivers: structuredClone(driverRows),
    constructors: structuredClone(constructorRows),
  };
}

export function developerWorld(session, options = {}) {
  const saveWorld = requireSession(session);
  const records = worldRecordsSummary(saveWorld);
  const newsLimit = Number(options.newsLimit ?? 24);
  const historyLimit = Number(options.historyLimit ?? 40);
  return {
    date: saveWorld.clock?.date ?? null,
    season: Number(saveWorld.clock?.season),
    activeDrivers: visibleActiveDrivers(saveWorld),
    activeTeams: activeTeams(saveWorld),
    standings: currentStandings(saveWorld),
    championship: developerChampionship(session),
    news: listWorldNews(saveWorld, {
      category: options.category,
      minImportance: options.minImportance,
      limit: Number.isInteger(newsLimit) && newsLimit > 0 ? newsLimit : 24,
    }),
    history: listWorldHistory(saveWorld, {
      category: options.category,
      season: options.season,
      limit: Number.isInteger(historyLimit) && historyLimit > 0 ? historyLimit : 40,
    }),
    records,
    summary: {
      newsStories: saveWorld.world?.media?.news?.stories?.length ?? 0,
      historyEvents: saveWorld.history?.events?.length ?? 0,
      milestones: saveWorld.history?.records?.length ?? 0,
      racesArchived: saveWorld.history?.races?.length ?? 0,
      championshipsArchived: saveWorld.history?.championships?.length ?? 0,
      activeDrivers: saveWorld.world?.drivers?.length ?? 0,
      activeTeams: saveWorld.world?.teams?.length ?? 0,
    },
  };
}