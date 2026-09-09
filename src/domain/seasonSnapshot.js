import { deepFreeze } from "./immutable.js";

const exactYear = (rows, year) => (rows ?? []).filter((row) => Number(row.year) === Number(year));

const inCareerWindow = (driver, year) => {
  const start = Number(driver.career_start_year ?? driver.f1_rookie_season ?? -Infinity);
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
  const contractedDriverIds = new Set(contracts.map((row) => row.driver_id));

  const snapshot = {
    season,
    teams: (database.teams ?? []).filter((row) => activeTeamIds.has(row.team_id)),
    teamBrands,
    drivers: (database.drivers ?? []).filter(
      (row) => contractedDriverIds.has(row.driver_id) || inCareerWindow(row, season)
    ),
    driverRatings: exactYear(database.driverRatings, season),
    contracts,
    staff: database.staff ?? [],
    staffRatings: exactYear(database.staffRatings, season),
    staffContracts: exactYear(database.staffContracts, season).filter((row) => activeTeamIds.has(row.team_id)),
    teamEngines: exactYear(database.teamEngines, season).filter((row) => activeTeamIds.has(row.team_id)),
    carStats: exactYear(database.carStats, season).filter((row) => activeTeamIds.has(row.team_id)),
    facilities: exactYear(database.facilities, season).filter((row) => activeTeamIds.has(row.team_id)),
    calendar: exactYear(database.calendar, season),
    rules: exactYear(database.rules, season),
  };

  return deepFreeze(snapshot);
}
