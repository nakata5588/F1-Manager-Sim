import { SIM_EVENT } from "../timeEngine.js";
import { parsePointsSystem, resolveChampionshipRuleSet } from "../championshipRules.js";
import { RACE_EVENT } from "./raceWeekend.js";
import { SEASON_EVENT } from "./seasonRollover.js";

export { parsePointsSystem } from "../championshipRules.js";

export const CHAMPIONSHIP_EVENT = Object.freeze({
  INITIALIZED: "championship.initialized",
  UPDATED: "championship.updated",
  ARCHIVED: "championship.archived",
});

function emptyEntry(id) {
  return {
    id,
    points: 0,
    grossPoints: 0,
    countedPoints: 0,
    droppedPoints: 0,
    wins: 0,
    podiums: 0,
    finishes: 0,
    starts: 0,
    results: [],
    countedResults: [],
    droppedResults: [],
  };
}

function sortStandings(entries) {
  return Object.values(entries)
    .sort((a, b) => b.points - a.points || b.wins - a.wins || b.podiums - a.podiums || String(a.id).localeCompare(String(b.id)))
    .map((entry, index) => ({ position: index + 1, ...entry }));
}

function grossLeaderId(entries) {
  return Object.values(entries)
    .sort((a, b) => b.grossPoints - a.grossPoints || b.wins - a.wins || b.podiums - a.podiums || String(a.id).localeCompare(String(b.id)))[0]?.id ?? null;
}

function pointsForPosition(pointsSystem, row) {
  if (row?.status !== "FINISHED") return 0;
  const points = Number(pointsSystem[Number(row.position) - 1] ?? 0);
  return Number.isFinite(points) && points > 0 ? points : 0;
}

function resultRecord({ event, race, row, round, raceKey, points }) {
  return {
    raceKey,
    round,
    gpId: race.gpId ?? race.gp_id ?? null,
    date: event.date,
    position: Number(row.position) || null,
    status: row.status ?? null,
    points,
    counted: false,
  };
}

function recomputeSplitBestResults(entry, segments) {
  const selected = new Set();
  for (const segment of segments) {
    const candidates = entry.results
      .map((result, index) => ({ result, index }))
      .filter(({ result }) => Number(result.round) >= segment.roundStart && Number(result.round) <= segment.roundEnd)
      .sort((a, b) => b.result.points - a.result.points || Number(a.result.round) - Number(b.result.round) || a.index - b.index);
    for (const candidate of candidates.slice(0, segment.bestResults)) selected.add(candidate.index);
  }

  entry.grossPoints = entry.results.reduce((sum, result) => sum + Number(result.points || 0), 0);
  entry.countedPoints = 0;
  entry.countedResults = [];
  entry.droppedResults = [];
  entry.results.forEach((result, index) => {
    result.counted = selected.has(index);
    if (result.counted) {
      entry.countedPoints += Number(result.points || 0);
      entry.countedResults.push({ ...result });
    } else if (Number(result.points || 0) > 0) {
      entry.droppedResults.push({ ...result });
    }
  });
  entry.droppedPoints = entry.grossPoints - entry.countedPoints;
  entry.points = entry.countedPoints;
}

function recomputeGross(entry) {
  entry.grossPoints = entry.results.reduce((sum, result) => sum + Number(result.points || 0), 0);
  entry.countedPoints = entry.grossPoints;
  entry.droppedPoints = 0;
  entry.points = entry.grossPoints;
  entry.results.forEach((result) => { result.counted = true; });
  entry.countedResults = entry.results.map((result) => ({ ...result }));
  entry.droppedResults = [];
}

function recomputeEntry(entry, mode, ruleSet) {
  if (mode === "split_best_results" && ruleSet.driver.segments.length) recomputeSplitBestResults(entry, ruleSet.driver.segments);
  else recomputeGross(entry);
}

function uniquePointsLeader(standings) {
  if (!standings.length) return null;
  if (standings.length > 1 && Number(standings[0].points) === Number(standings[1].points)) return null;
  return standings[0].id;
}

function refreshChampionshipStatus(championship, date) {
  const hasPoints = championship.pointsSystem.length > 0;
  const completeRules = championship.ruleSet?.complete === true;
  const expectedRounds = Number(championship.expectedRounds ?? 0);
  championship.seasonComplete = expectedRounds > 0 && championship.racesCompleted >= expectedRounds;
  championship.driverChampionId = null;
  championship.constructorChampionId = null;
  championship.driverChampionStatus = championship.seasonComplete ? "rules_incomplete" : "pending";
  championship.constructorChampionStatus = championship.seasonComplete ? "rules_incomplete" : "pending";

  if (!hasPoints) {
    championship.standingsStatus = "rules_missing";
    return;
  }
  if (!completeRules) {
    championship.standingsStatus = "provisional_era_rules_pending";
    return;
  }
  if (!championship.seasonComplete) {
    championship.standingsStatus = "official_era_rules_applied_provisional";
    return;
  }

  championship.driverChampionId = uniquePointsLeader(championship.driverStandings);
  championship.constructorChampionId = uniquePointsLeader(championship.constructorStandings);
  championship.driverChampionStatus = championship.driverChampionId ? "resolved_unique_points" : "tiebreak_required";
  championship.constructorChampionStatus = championship.constructorChampionId ? "resolved_unique_points" : "tiebreak_required";
  championship.standingsStatus = championship.driverChampionId && championship.constructorChampionId
    ? "official_final"
    : "final_tiebreak_unresolved";
  if (championship.standingsStatus === "official_final") championship.championDeclaredAt = date;
}

function ensureChampionship(saveWorld, season = saveWorld.clock.season) {
  if (!saveWorld.world.championship || Number(saveWorld.world.championship.season) !== Number(season)) {
    const ruleSet = resolveChampionshipRuleSet(saveWorld, season);
    const pointsSystem = parsePointsSystem(ruleSet.pointsSystem);
    saveWorld.world.championship = {
      season: Number(season),
      scoringMode: pointsSystem.length ? ruleSet.driver.mode : "unscored_missing_rules",
      standingsStatus: pointsSystem.length
        ? (ruleSet.complete ? "official_era_rules_applied_provisional" : "provisional_era_rules_pending")
        : "rules_missing",
      constructorScoringMode: pointsSystem.length ? ruleSet.constructors.mode : "unscored_missing_rules",
      note: ruleSet.complete
        ? "Era-specific championship scoring is active. Gross, counted and dropped scores are retained separately. A final champion is declared only when the season is complete and no unresolved tie-break is required."
        : pointsSystem.length
          ? "Gross points are retained losslessly. Era-specific counting rules are incomplete, so standings remain provisional and no official champion is declared."
          : "No race points system was supplied by the Season Database, so results are retained without inventing championship points.",
      ruleSet,
      pointsSystem,
      expectedRounds: ruleSet.expectedRounds ?? null,
      racesCompleted: 0,
      processedRaces: [],
      drivers: {},
      constructors: {},
      driverStandings: [],
      constructorStandings: [],
      driverChampionId: null,
      constructorChampionId: null,
      driverChampionStatus: "pending",
      constructorChampionStatus: "pending",
      seasonComplete: false,
      championDeclaredAt: null,
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
  const round = Number(race.round ?? championship.racesCompleted + 1);
  const gpId = race.gpId ?? race.gp_id ?? `round-${round}`;
  const raceKey = `${championship.season}:${round}:${gpId}`;
  if (championship.processedRaces.includes(raceKey)) return null;

  const pointsSystem = championship.pointsSystem;
  for (const row of race.classification ?? []) {
    const driverId = row.driverId ?? row.driver_id;
    const teamId = row.teamId ?? row.team_id;
    if (!driverId || !teamId) continue;
    championship.drivers[driverId] ??= emptyEntry(driverId);
    championship.constructors[teamId] ??= emptyEntry(teamId);
    const driver = championship.drivers[driverId];
    const constructor = championship.constructors[teamId];
    const points = pointsForPosition(pointsSystem, row);
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
    }
    driver.results.push(resultRecord({ event, race, row, round, raceKey, points }));
    constructor.results.push({ ...resultRecord({ event, race, row, round, raceKey, points }), driverId });
  }

  for (const driver of Object.values(championship.drivers)) recomputeEntry(driver, championship.scoringMode, championship.ruleSet);
  for (const constructor of Object.values(championship.constructors)) recomputeGross(constructor);

  championship.processedRaces.push(raceKey);
  championship.racesCompleted += 1;
  championship.driverStandings = sortStandings(championship.drivers);
  championship.constructorStandings = sortStandings(championship.constructors);
  championship.lastUpdated = event.date;
  refreshChampionshipStatus(championship, event.date);

  return {
    type: CHAMPIONSHIP_EVENT.UPDATED,
    payload: {
      season: championship.season,
      races_completed: championship.racesCompleted,
      leader_driver_id: championship.driverStandings[0]?.id ?? null,
      leader_constructor_id: championship.constructorStandings[0]?.id ?? null,
      gross_leader_driver_id: grossLeaderId(championship.drivers),
      gross_leader_constructor_id: grossLeaderId(championship.constructors),
      driver_standings: championship.driverStandings,
      constructor_standings: championship.constructorStandings,
      scoring_mode: championship.scoringMode,
      constructor_scoring_mode: championship.constructorScoringMode,
      standings_status: championship.standingsStatus,
      driver_champion_id: championship.driverChampionId,
      constructor_champion_id: championship.constructorChampionId,
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
          payload: {
            season: championship.season,
            points_system: championship.pointsSystem,
            scoring_mode: championship.scoringMode,
            constructor_scoring_mode: championship.constructorScoringMode,
            standings_status: championship.standingsStatus,
            expected_rounds: championship.expectedRounds,
          },
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
              leader_driver_id: archived.driverStandings?.[0]?.id ?? null,
              leader_constructor_id: archived.constructorStandings?.[0]?.id ?? null,
              driver_champion_id: archived.driverChampionId ?? null,
              constructor_champion_id: archived.constructorChampionId ?? null,
              scoring_mode: archived.scoringMode,
              standings_status: archived.standingsStatus,
            },
          });
        }
        events.push({
          type: CHAMPIONSHIP_EVENT.INITIALIZED,
          payload: {
            season: championship.season,
            points_system: championship.pointsSystem,
            scoring_mode: championship.scoringMode,
            constructor_scoring_mode: championship.constructorScoringMode,
            standings_status: championship.standingsStatus,
            expected_rounds: championship.expectedRounds,
          },
        });
        return events;
      }

      return updateFromRace(saveWorld, event);
    },
  };
}
