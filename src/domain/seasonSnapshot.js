import { deepFreeze } from "./immutable.js";

const exactYear = (rows, year) => (rows ?? []).filter((row) => Number(row.year) === Number(year));

const effectiveYear = (rows, year) => {
  const season = Number(year);
  const eligible = (rows ?? []).filter((row) => Number.isFinite(Number(row.year)) && Number(row.year) <= season);
  if (eligible.length === 0) return null;
  return eligible.reduce((latest, row) => Number(row.year) > Number(latest.year) ? row : latest);
};

const activeInSeason = (row, season) => {
  const exact = Number(row?.year);
  if (Number.isInteger(exact)) return exact === season;
  const start = Number(row?.contract_start ?? row?.start_year ?? row?.start_season);
  const end = Number(row?.contract_until ?? row?.end_year ?? row?.end_season);
  if (Number.isFinite(start) && season < start) return false;
  if (Number.isFinite(end) && season > end) return false;
  const date = String(row?.date ?? "");
  if (/^\d{4}-\d{2}-\d{2}/.test(date)) return Number(date.slice(0, 4)) === season;
  return true;
};

const tyreActiveInSeason = (row, season) => {
  const exact = Number(row?.year ?? row?.season);
  if (Number.isInteger(exact)) return exact === season;
  const start = Number(row?.valid_from_year ?? row?.introduced_year ?? row?.from_year ?? row?.start_year);
  const end = Number(row?.valid_to_year ?? row?.retired_year ?? row?.to_year ?? row?.end_year);
  if (Number.isFinite(start) && season < start) return false;
  if (Number.isFinite(end) && season > end) return false;
  return true;
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

const activationYear = (row) => {
  const raw = row.activation_year
    ?? row.world_or_talent_activation_year
    ?? row.world_activation_year
    ?? row.talent_activation_year
    ?? row.event_year;
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
};

const entityType = (row) => String(row.entity_type ?? row.type ?? "").toLowerCase();
const entityId = (row) => row.entity_id ?? row.id ?? null;

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

  const drivers = (database.drivers ?? []).filter(
    (row) => contractedDriverIds.has(row.driver_id) || ratedDriverIds.has(row.driver_id) || inCareerWindow(row, season)
  );
  const staff = (database.staff ?? []).filter(
    (row) => contractedStaffIds.has(row.staff_id) || ratedStaffIds.has(row.staff_id)
  );
  const teams = (database.teams ?? []).filter((row) => activeTeamIds.has(row.team_id));

  const futureSource = database.futureEntities ?? database.availabilityTimeline ?? [];
  const futureEntities = futureSource.filter((row) => {
    const activation = activationYear(row);
    return activation !== null && activation >= season && entityId(row);
  });
  const currentDriverIds = new Set(drivers.map((row) => row.driver_id));
  const currentStaffIds = new Set(staff.map((row) => row.staff_id));
  const currentTeamIds = new Set(teams.map((row) => row.team_id));
  const futureDriverIds = new Set(futureEntities.filter((row) => entityType(row) === "driver").map(entityId));
  const futureStaffIds = new Set(futureEntities.filter((row) => entityType(row) === "staff").map(entityId));
  const futureTeamIds = new Set(futureEntities.filter((row) => ["team", "constructor", "organisation", "organization"].includes(entityType(row))).map(entityId));

  const teamFinancials = (database.teamFinancials ?? []).filter((row) => activeTeamIds.has(row.team_id) && activeInSeason(row, season));
  const sponsorContracts = (database.sponsorContracts ?? []).filter((row) => activeTeamIds.has(row.team_id) && activeInSeason(row, season));
  const financeLedger = (database.financeLedger ?? []).filter((row) => activeTeamIds.has(row.team_id) && activeInSeason(row, season));
  const rdProjects = (database.rdProjects ?? []).filter((row) => activeTeamIds.has(row.team_id) && activeInSeason(row, season));
  const tyreSource = database.tyres ?? database.tyreCatalog ?? database.tyresCatalog ?? database.tyersCatalog ?? [];
  const tyres = tyreSource.filter((row) => tyreActiveInSeason(row, season));

  const snapshot = {
    season,
    databaseVersion: database.manifest?.databaseVersion ?? null,
    sourceChecksum: database.manifest?.sourceSha256 ?? null,
    readinessStatus: database.manifest?.readiness?.[String(season)] ?? null,
    teams,
    teamBrands,
    drivers,
    driverRatings,
    contracts,
    staff,
    staffRatings,
    staffContracts,
    engines: (database.engines ?? []).filter((row) => activeEngineIds.has(row.engine_id)),
    teamEngines,
    carStats: exactYear(database.carStats, season).filter((row) => activeTeamIds.has(row.team_id)),
    facilities: exactYear(database.facilities, season).filter((row) => activeTeamIds.has(row.team_id)),
    teamFinancials,
    sponsorContracts,
    financeLedger,
    rdProjects,
    tyres,
    tracks: (database.tracks ?? []).filter((row) => activeTrackIds.has(row.track_id)),
    calendar,
    rules: effectiveYear(database.rules, season),
    qualifyingRules: effectiveYear(database.qualifyingRules, season),
    eraSafety: effectiveYear(database.eraSafety, season),
    accidentModel: effectiveYear(database.accidentModel, season),
    futureEntities,
    futureDrivers: (database.drivers ?? []).filter((row) => futureDriverIds.has(row.driver_id) && !currentDriverIds.has(row.driver_id)),
    futureStaff: (database.staff ?? []).filter((row) => futureStaffIds.has(row.staff_id) && !currentStaffIds.has(row.staff_id)),
    futureTeams: (database.teams ?? []).filter((row) => futureTeamIds.has(row.team_id) && !currentTeamIds.has(row.team_id)),
  };

  return deepFreeze(snapshot);
}
