import { deepFreeze } from "./immutable.js";

const exactYear = (rows, year) => (rows ?? []).filter((row) => Number(row.year) === Number(year));

const effectiveYear = (rows, year) => {
  const season = Number(year);
  const eligible = (rows ?? []).filter((row) => Number.isFinite(Number(row.year)) && Number(row.year) <= season);
  if (eligible.length === 0) return null;
  return eligible.reduce((latest, row) => Number(row.year) > Number(latest.year) ? row : latest);
};

const inCareerWindow = (driver, year) => {
  const startRaw = driver.career_start_year ?? driver.f1_rookie_season;
  if (startRaw === null || startRaw === undefined || startRaw === "") return false;
  const start = Number(startRaw);
  if (!Number.isFinite(start)) return false;
  const endRaw = driver.career_end_year;
  const end = endRaw === null || endRaw === undefined || endRaw === "" ? Infinity : Number(endRaw);
  return Number(year) >= start && Number(year) <= end;
};

export function createSeasonSnapshot(database, year) {
  const season = Number(year);
  if (!Number.isInteger(season)) throw new TypeError("Season year must be an integer.");

  const teamBrands = exactYear(database.teamBrands, season);
  const activeTeamIds = new Set(teamBrands.map((row) => row.team_id));
  const contracts = exactYear(database.contracts, season).filter((row) => activeTeamIds.has(row.team_id));
  const driverRatings = exactYear(database.driverRatings, season);
  const contractedDriverIds = new Set(contracts.map((row) => row.driver_id));
  const ratedDriverIds = new Set(driverRatings.map((row) => row.driver_id));

  const staffContracts = exactYear(database.staffContracts, season).filter((row) => activeTeamIds.has(row.team_id));
  const contractedStaffIds = new Set(staffContracts.map((row) => row.staff_id));
  const staffRatings = exactYear(database.staffRatings, season);
  const ratedStaffIds = new Set(staffRatings.map((row) => row.staff_id));

  const teamEngines = exactYear(database.teamEngines, season).filter((row) => activeTeamIds.has(row.team_id));
  const activeEngineIds = new Set(teamEngines.map((row) => row.engine_id));
  const calendar = exactYear(database.calendar, season);
  const activeTrackIds = new Set(calendar.map((row) => row.track_id));

  const snapshot = {
    season,
    databaseVersion: database.manifest?.databaseVersion ?? null,
    sourceChecksum: database.manifest?.sourceSha256 ?? null,
    readinessStatus: database.manifest?.readiness?.[String(season)] ?? null,
    teams: (database.teams ?? []).filter((row) => activeTeamIds.has(row.team_id)),
    teamBrands,
    drivers: (database.drivers ?? []).filter(
      (row) => contractedDriverIds.has(row.driver_id) || ratedDriverIds.has(row.driver_id) || inCareerWindow(row, season)
    ),
    driverRatings,
    contracts,
    staff: (database.staff ?? []).filter(
      (row) => contractedStaffIds.has(row.staff_id) || ratedStaffIds.has(row.staff_id)
    ),
    staffRatings,
    staffContracts,
    engines: (database.engines ?? []).filter((row) => activeEngineIds.has(row.engine_id)),
    teamEngines,
    carStats: exactYear(database.carStats, season).filter((row) => activeTeamIds.has(row.team_id)),
    facilities: exactYear(database.facilities, season).filter((row) => activeTeamIds.has(row.team_id)),
    tracks: (database.tracks ?? []).filter((row) => activeTrackIds.has(row.track_id)),
    calendar,
    rules: effectiveYear(database.rules, season),
    qualifyingRules: effectiveYear(database.qualifyingRules, season),
    eraSafety: effectiveYear(database.eraSafety, season),
    accidentModel: effectiveYear(database.accidentModel, season),
  };

  return deepFreeze(snapshot);
}
