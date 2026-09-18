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

function driverId(row = {}) {
  return row.driver_id ?? row.driverId ?? row.id ?? null;
}

function driverName(row = {}) {
  return row.display_name ?? row.driver_name ?? row.name ?? driverId(row);
}

function teamId(row = {}) {
  return row.team_id ?? row.teamId ?? row.id ?? null;
}

function teamName(row = {}) {
  return row.team_name ?? row.display_name ?? row.name ?? teamId(row);
}

function activeDirectory(saveWorld, championship) {
  const teamRows = saveWorld.world?.teams ?? [];
  const driverRows = saveWorld.world?.drivers ?? [];
  const teamsById = new Map(teamRows.map((row) => [String(teamId(row)), row]));
  const driverStandings = new Map((championship.standings?.drivers ?? []).map((row) => [String(row.id), row]));
  const constructorStandings = new Map((championship.standings?.constructors ?? []).map((row) => [String(row.id), row]));
  const assignments = saveWorld.world?.employment?.drivers ?? {};

  const drivers = driverRows.map((row) => {
    const id = String(driverId(row));
    const assignment = assignments[id] ?? null;
    const currentTeamId = assignment?.status === "employed" ? assignment.teamId ?? null : null;
    const currentTeam = currentTeamId ? teamsById.get(String(currentTeamId)) : null;
    const standing = driverStandings.get(id) ?? null;
    return {
      driverId: id,
      name: driverName(row),
      nationality: row.nationality ?? null,
      birthDate: row.birth_date ?? null,
      teamId: currentTeamId,
      teamName: currentTeam ? teamName(currentTeam) : null,
      role: assignment?.role ?? null,
      employmentStatus: assignment?.status ?? (currentTeamId ? "employed" : "available"),
      championshipPosition: standing?.position ?? null,
      championshipPoints: Number(standing?.points ?? 0),
      championshipWins: Number(standing?.wins ?? 0),
    };
  });

  const driverCounts = new Map();
  for (const row of drivers) {
    if (!row.teamId) continue;
    driverCounts.set(String(row.teamId), (driverCounts.get(String(row.teamId)) ?? 0) + 1);
  }

  const teams = teamRows.map((row) => {
    const id = String(teamId(row));
    const standing = constructorStandings.get(id) ?? null;
    return {
      teamId: id,
      name: teamName(row),
      nationality: row.nationality ?? row.country ?? null,
      activeDriverCount: driverCounts.get(id) ?? 0,
      championshipPosition: standing?.position ?? null,
      championshipPoints: Number(standing?.points ?? 0),
      championshipWins: Number(standing?.wins ?? 0),
    };
  });

  drivers.sort((a, b) => {
    const aPos = Number.isFinite(Number(a.championshipPosition)) ? Number(a.championshipPosition) : 999;
    const bPos = Number.isFinite(Number(b.championshipPosition)) ? Number(b.championshipPosition) : 999;
    return aPos - bPos || b.championshipPoints - a.championshipPoints || a.name.localeCompare(b.name);
  });
  teams.sort((a, b) => {
    const aPos = Number.isFinite(Number(a.championshipPosition)) ? Number(a.championshipPosition) : 999;
    const bPos = Number.isFinite(Number(b.championshipPosition)) ? Number(b.championshipPosition) : 999;
    return aPos - bPos || b.championshipPoints - a.championshipPoints || a.name.localeCompare(b.name);
  });

  return { drivers, teams };
}

export function developerWorld(session, options = {}) {
  const saveWorld = requireSession(session);
  const records = worldRecordsSummary(saveWorld);
  const championship = developerChampionship(session);
  const directory = activeDirectory(saveWorld, championship);
  const newsLimit = Number(options.newsLimit ?? 24);
  const historyLimit = Number(options.historyLimit ?? 40);
  return {
    date: saveWorld.clock?.date ?? null,
    season: Number(saveWorld.clock?.season),
    activeDrivers: directory.drivers,
    activeTeams: directory.teams,
    standings: {
      drivers: structuredClone(championship.standings?.drivers ?? []),
      constructors: structuredClone(championship.standings?.constructors ?? []),
    },
    championship,
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
      activeDrivers: directory.drivers.length,
      activeTeams: directory.teams.length,
    },
  };
}
