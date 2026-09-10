import { SIM_EVENT } from "../timeEngine.js";
import { RACE_EVENT } from "./raceWeekend.js";
import { SEASON_EVENT } from "./seasonRollover.js";

export const CHAMPIONSHIP_EVENT = Object.freeze({
  INITIALIZED: "championship.initialized",
  UPDATED: "championship.updated",
  ARCHIVED: "championship.archived",
});

export function parsePointsSystem(value) {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  const text = String(value ?? "").trim();
  if (!text) return [];
  return text.split(/[-,;\s/]+/).map(Number).filter(Number.isFinite);
}

function pointsForWorld(saveWorld) {
  const rules = saveWorld.world?.rules ?? {};
  return parsePointsSystem(rules.points_system ?? rules.pointsSystem ?? rules.race_points);
}

function emptyEntry(id) {
  return { id, points: 0, wins: 0, podiums: 0, finishes: 0, starts: 0 };
}

function sortStandings(entries) {
  return Object.values(entries)
    .sort((a, b) => b.points - a.points || b.wins - a.wins || b.podiums - a.podiums || String(a.id).localeCompare(String(b.id)))
    .map((entry, index) => ({ position: index + 1, ...entry }));
}

function ensureChampionship(saveWorld, season = saveWorld.clock.season) {
  if (!saveWorld.world.championship || Number(saveWorld.world.championship.season) !== Number(season)) {
    const pointsSystem = pointsForWorld(saveWorld);
    saveWorld.world.championship = {
      season: Number(season),
      scoringMode: pointsSystem.length ? "gross_points" : "unscored_missing_rules",
      standingsStatus: pointsSystem.length ? "provisional_era_rules_pending" : "rules_missing",
      constructorScoringMode: pointsSystem.length ? "sum_driver_gross_points" : "unscored_missing_rules",
      note: pointsSystem.length
        ? "Gross points are retained losslessly. Official era-specific discard/counting and constructor rules require explicit Season Database support before an official champion is declared."
        : "No race points system was supplied by the Season Database, so results are retained without inventing championship points.",
      pointsSystem,
      racesCompleted: 0,
      drivers: {},
      constructors: {},
      driverStandings: [],
      constructorStandings: [],
      lastUpdated: saveWorld.clock.date,
    };
  }
  return saveWorld.world.championship;
}

function archiveCurrent(saveWorld, date) {
  const current = saveWorld.world?.championship;
  if (!current || !current.racesCompleted) return null;
  saveWorld.history.championships ??= [];
  const archived = structuredClone({ ...current, archivedAt: date });
  saveWorld.history.championships.push(archived);
  return archived;
}

function updateFromRace(saveWorld, event) {
  const race = event.payload ?? {};
  const championship = ensureChampionship(saveWorld, race.season ?? saveWorld.clock.season);
  const pointsSystem = championship.pointsSystem;

  for (const row of race.classification ?? []) {
    const driverId = row.driverId ?? row.driver_id;
    const teamId = row.teamId ?? row.team_id;
    if (!driverId || !teamId) continue;
    championship.drivers[driverId] ??= emptyEntry(driverId);
    championship.constructors[teamId] ??= emptyEntry(teamId);
    const driver = championship.drivers[driverId];
    const constructor = championship.constructors[teamId];
    driver.starts += 1;
    constructor.starts += 1;
    if (row.status === "FINISHED") {
      driver.finishes += 1;
      constructor.finishes += 1;
      if (Number(row.position) === 1) {
        driver.wins += 1;
        constructor.wins += 1;
      }
      if (Number(row.position) <= 3) {
        driver.podiums += 1;
        constructor.podiums += 1;
      }
      const points = Number(pointsSystem[Number(row.position) - 1] ?? 0);
      if (Number.isFinite(points) && points > 0) {
        driver.points += points;
        constructor.points += points;
      }
    }
  }

  championship.racesCompleted += 1;
  championship.driverStandings = sortStandings(championship.drivers);
  championship.constructorStandings = sortStandings(championship.constructors);
  championship.lastUpdated = event.date;

  return {
    type: CHAMPIONSHIP_EVENT.UPDATED,
    payload: {
      season: championship.season,
      races_completed: championship.racesCompleted,
      gross_leader_driver_id: championship.driverStandings[0]?.id ?? null,
      gross_leader_constructor_id: championship.constructorStandings[0]?.id ?? null,
      driver_standings: championship.driverStandings,
      constructor_standings: championship.constructorStandings,
      scoring_mode: championship.scoringMode,
      standings_status: championship.standingsStatus,
    },
  };
}

export function createChampionshipSystem() {
  return {
    id: "championship.world",
    eventTypes: [SIM_EVENT.CAREER_STARTED, RACE_EVENT.COMPLETED, SEASON_EVENT.ROLLED_OVER],
    handle({ saveWorld, event }) {
      if (event.type === SIM_EVENT.CAREER_STARTED) {
        const championship = ensureChampionship(saveWorld, saveWorld.clock.season);
        return {
          type: CHAMPIONSHIP_EVENT.INITIALIZED,
          payload: { season: championship.season, points_system: championship.pointsSystem, scoring_mode: championship.scoringMode, standings_status: championship.standingsStatus },
        };
      }

      if (event.type === SEASON_EVENT.ROLLED_OVER) {
        const archived = archiveCurrent(saveWorld, event.date);
        const championship = ensureChampionship(saveWorld, event.payload?.season ?? saveWorld.clock.season);
        const events = [];
        if (archived) {
          events.push({
            type: CHAMPIONSHIP_EVENT.ARCHIVED,
            payload: {
              season: archived.season,
              gross_points_leader_driver_id: archived.driverStandings?.[0]?.id ?? null,
              gross_points_leader_constructor_id: archived.constructorStandings?.[0]?.id ?? null,
              scoring_mode: archived.scoringMode,
              standings_status: archived.standingsStatus,
            },
          });
        }
        events.push({
          type: CHAMPIONSHIP_EVENT.INITIALIZED,
          payload: { season: championship.season, points_system: championship.pointsSystem, scoring_mode: championship.scoringMode, standings_status: championship.standingsStatus },
        });
        return events;
      }

      return updateFromRace(saveWorld, event);
    },
  };
}
