import { createSaveWorld } from "../../save/createSaveWorld.js";
import { advanceDays, initializeSimulation } from "../timeEngine.js";
import { createCoreWorldSystems } from "../systems/coreWorldSystems.js";

function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function daysBetween(start, end) {
  const startMs = Date.parse(`${String(start).slice(0, 10)}T00:00:00Z`);
  const endMs = Date.parse(`${String(end).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    throw new RangeError(`Invalid date range ${start} -> ${end}.`);
  }
  return Math.round((endMs - startMs) / 86_400_000);
}

function groupBySeason(rows = []) {
  const grouped = new Map();
  for (const row of rows) {
    const season = Number(row?.season ?? row?.year);
    if (!Number.isInteger(season)) continue;
    if (!grouped.has(season)) grouped.set(season, []);
    grouped.get(season).push(row);
  }
  return grouped;
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function checkFiniteObject(source, prefix, errors) {
  if (!source || typeof source !== "object") return;
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "number" && !Number.isFinite(value)) {
      errors.push(`${prefix}.${key} is not finite.`);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      checkFiniteObject(value, `${prefix}.${key}`, errors);
    }
  }
}

function raceHealth(saveWorld, errors, warnings) {
  const driverIds = new Set((saveWorld.world?.drivers ?? []).map((row) => row.driver_id));
  const teamIds = new Set((saveWorld.world?.teams ?? []).map((row) => row.team_id));
  const races = saveWorld.history?.races ?? [];

  for (const race of races) {
    const label = `${race.season ?? "?"}:${race.gpId ?? race.gp_id ?? race.round ?? "?"}`;
    const classification = race.classification ?? [];
    if (!classification.length) {
      errors.push(`Race ${label} has no classification.`);
      continue;
    }

    const duplicateDrivers = duplicateValues(classification.map((row) => row.driverId ?? row.driver_id).filter(Boolean));
    if (duplicateDrivers.length) errors.push(`Race ${label} contains duplicate drivers: ${duplicateDrivers.join(", ")}.`);

    classification.forEach((row, index) => {
      const driverId = row.driverId ?? row.driver_id;
      const teamId = row.teamId ?? row.team_id;
      if (!driverIds.has(driverId)) errors.push(`Race ${label} references unknown driver ${driverId}.`);
      if (!teamIds.has(teamId)) errors.push(`Race ${label} references unknown team ${teamId}.`);
      if (Number(row.position) !== index + 1) errors.push(`Race ${label} classification positions are not contiguous.`);
      if (row.status === "FINISHED" && row.completedLaps !== null && row.completedLaps !== undefined) {
        warnings.push(`Race ${label} finisher ${driverId} retained completedLaps=${row.completedLaps}.`);
      }
      if (numeric(row.performanceIndex) === null) errors.push(`Race ${label} driver ${driverId} has invalid performanceIndex.`);
    });

    if (race.timelineApplied && race.timeline) {
      if (numeric(race.timeline.lapsSimulated) === null || race.timeline.lapsSimulated <= 0) {
        errors.push(`Race ${label} has an invalid temporal lap count.`);
      }
      if (!Array.isArray(race.timeline.snapshots) || !race.timeline.snapshots.length) {
        warnings.push(`Race ${label} has no temporal snapshots.`);
      }
    }
  }
}

function championshipHealth(saveWorld, expectedSeasons, errors, warnings) {
  const archived = saveWorld.history?.championships ?? [];
  const bySeason = groupBySeason(archived);
  const duplicates = [...bySeason.entries()].filter(([, rows]) => rows.length > 1).map(([season]) => season);
  if (duplicates.length) errors.push(`Championship history contains duplicate seasons: ${duplicates.join(", ")}.`);

  for (const season of expectedSeasons) {
    const rows = bySeason.get(season) ?? [];
    if (!rows.length) errors.push(`Season ${season} has no archived championship state.`);
    const championship = rows[0];
    if (!championship) continue;
    if (!Array.isArray(championship.driverStandings) || !championship.driverStandings.length) {
      errors.push(`Season ${season} has no driver standings.`);
    }
    if (!Array.isArray(championship.constructorStandings) || !championship.constructorStandings.length) {
      errors.push(`Season ${season} has no constructor standings.`);
    }
    if (championship.scoringMode === "unscored_missing_rules") {
      warnings.push(`Season ${season} is unscored because no championship rule contract was available.`);
    }
  }
}

function raceEntryHealth(saveWorld, errors) {
  const state = saveWorld.world?.raceEntryState;
  if (!state) {
    errors.push("Race entry state is missing.");
    return;
  }
  const entries = state.current ?? [];
  const duplicateDrivers = duplicateValues(entries.map((row) => row.driverId).filter(Boolean));
  if (duplicateDrivers.length) errors.push(`Current race entries contain duplicate drivers: ${duplicateDrivers.join(", ")}.`);

  const driverIds = new Set((saveWorld.world?.drivers ?? []).map((row) => row.driver_id));
  const teamIds = new Set((saveWorld.world?.teams ?? []).map((row) => row.team_id));
  for (const entry of entries) {
    if (!driverIds.has(entry.driverId)) errors.push(`Current race entry references unknown driver ${entry.driverId}.`);
    if (!teamIds.has(entry.teamId)) errors.push(`Current race entry references unknown team ${entry.teamId}.`);
    if (saveWorld.world?.careerState?.drivers?.[entry.driverId]?.status === "retired") {
      errors.push(`Retired driver ${entry.driverId} remains in current race entries.`);
    }
  }
}

function employmentHealth(saveWorld, errors) {
  const driverIds = new Set((saveWorld.world?.drivers ?? []).map((row) => row.driver_id));
  const staffIds = new Set((saveWorld.world?.staff ?? []).map((row) => row.staff_id));
  const teamIds = new Set((saveWorld.world?.teams ?? []).map((row) => row.team_id));

  for (const [driverId, assignment] of Object.entries(saveWorld.world?.employment?.drivers ?? {})) {
    if (!driverIds.has(driverId)) errors.push(`Employment references unknown driver ${driverId}.`);
    if (assignment?.teamId && !teamIds.has(assignment.teamId)) errors.push(`Driver ${driverId} is employed by unknown team ${assignment.teamId}.`);
  }
  for (const [staffId, assignment] of Object.entries(saveWorld.world?.employment?.staff ?? {})) {
    if (!staffIds.has(staffId)) errors.push(`Employment references unknown staff ${staffId}.`);
    if (assignment?.teamId && !teamIds.has(assignment.teamId)) errors.push(`Staff ${staffId} is employed by unknown team ${assignment.teamId}.`);
  }
}

function raceCountsForSeasons(saveWorld, expectedSeasons) {
  const grouped = groupBySeason(saveWorld.history?.races ?? []);
  return Object.fromEntries(expectedSeasons.map((season) => [season, (grouped.get(season) ?? []).length]));
}

export function validateLongRunWorld(saveWorld, options = {}) {
  const startSeason = Number(options.startSeason ?? saveWorld.meta?.sourceSeason ?? saveWorld.world?.season);
  const seasons = Math.max(1, Math.round(Number(options.seasons ?? 10)));
  const expectedSeasons = Array.from({ length: seasons }, (_, index) => startSeason + index);
  const expectedRacesPerSeason = numeric(options.expectedRacesPerSeason);
  const errors = [];
  const warnings = [];

  if (Number(saveWorld.clock?.season) !== startSeason + seasons) {
    errors.push(`Final world season is ${saveWorld.clock?.season}; expected ${startSeason + seasons}.`);
  }

  const raceCounts = raceCountsForSeasons(saveWorld, expectedSeasons);
  for (const season of expectedSeasons) {
    const count = raceCounts[season] ?? 0;
    if (count === 0) errors.push(`Season ${season} completed with no races.`);
    if (expectedRacesPerSeason !== null && count !== expectedRacesPerSeason) {
      errors.push(`Season ${season} completed ${count} races; expected ${expectedRacesPerSeason}.`);
    }
  }

  raceHealth(saveWorld, errors, warnings);
  championshipHealth(saveWorld, expectedSeasons, errors, warnings);
  raceEntryHealth(saveWorld, errors);
  employmentHealth(saveWorld, errors);

  checkFiniteObject(saveWorld.world?.teamState, "world.teamState", errors);
  checkFiniteObject(saveWorld.world?.carState, "world.carState", errors);
  checkFiniteObject(saveWorld.world?.careerState, "world.careerState", errors);

  const championshipSeasons = (saveWorld.history?.championships ?? []).map((row) => Number(row.season)).filter(Number.isInteger);
  const transfers = saveWorld.history?.transfers?.length ?? 0;
  const retirements = saveWorld.history?.retirements?.length ?? 0;
  const currentEntries = saveWorld.world?.raceEntryState?.current?.length ?? 0;

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    metrics: {
      startSeason,
      seasonsSimulated: seasons,
      finalSeason: Number(saveWorld.clock?.season),
      races: saveWorld.history?.races?.length ?? 0,
      raceCounts,
      archivedChampionships: championshipSeasons.length,
      championshipSeasons,
      transfers,
      retirements,
      currentRaceEntries: currentEntries,
      employedDrivers: Object.keys(saveWorld.world?.employment?.drivers ?? {}).length,
      employedStaff: Object.keys(saveWorld.world?.employment?.staff ?? {}).length,
      freeDrivers: saveWorld.world?.employment?.freeAgents?.drivers?.length ?? 0,
      freeStaff: saveWorld.world?.employment?.freeAgents?.staff?.length ?? 0,
      openVacancies: (saveWorld.world?.employment?.vacancies ?? []).filter((row) => row.status === "open").length,
    },
  };
}

export function runLongRunValidation(historicalSnapshot, options = {}) {
  if (!historicalSnapshot?.season) throw new TypeError("A historical season snapshot is required.");
  const startSeason = Number(historicalSnapshot.season);
  const seasons = Math.max(1, Math.round(Number(options.seasons ?? 10)));
  const saveWorld = createSaveWorld(historicalSnapshot, {
    seed: options.seed ?? `long-run-${startSeason}`,
    startDate: options.startDate ?? `${startSeason}-01-01`,
    createdAt: options.createdAt ?? `${startSeason}-01-01T00:00:00.000Z`,
  });
  const systems = options.systems ?? createCoreWorldSystems({
    controlledTeamIds: options.controlledTeamIds ?? [],
    defaultContractYears: options.defaultContractYears ?? 2,
    minimumCashReserve: options.minimumCashReserve,
    projectDurationMonths: options.projectDurationMonths,
  });

  initializeSimulation(saveWorld, systems);
  const checkpoints = [];
  for (let year = startSeason; year < startSeason + seasons; year += 1) {
    const target = `${year + 1}-01-01`;
    const days = daysBetween(saveWorld.clock.date, target);
    advanceDays(saveWorld, days, systems);
    const completedSeason = year;
    const races = (saveWorld.history?.races ?? []).filter((row) => Number(row.season) === completedSeason).length;
    const championship = (saveWorld.history?.championships ?? []).find((row) => Number(row.season) === completedSeason) ?? null;
    checkpoints.push({
      season: completedSeason,
      date: saveWorld.clock.date,
      races,
      driverLeaderId: championship?.driverStandings?.[0]?.id ?? null,
      constructorLeaderId: championship?.constructorStandings?.[0]?.id ?? null,
      scoringMode: championship?.scoringMode ?? null,
      raceEntries: saveWorld.world?.raceEntryState?.current?.length ?? 0,
      transfers: saveWorld.history?.transfers?.length ?? 0,
      retirements: saveWorld.history?.retirements?.length ?? 0,
    });
  }

  const report = validateLongRunWorld(saveWorld, {
    startSeason,
    seasons,
    expectedRacesPerSeason: options.expectedRacesPerSeason ?? historicalSnapshot.calendar?.length ?? null,
  });

  return { saveWorld, checkpoints, report };
}
