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
  // F1 rookie season is the authoritative activation boundary when available.
  // A driver's wider motorsport career may begin years before Formula One and
  // must not cause them to appear early in an F1 start database.
  const startRaw = driver.f1_rookie_season ?? driver.career_start_year;
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

function temporalYear(row) {
  for (const field of ["year", "season", "event_year", "layout_year"]) {
    const value = Number(row?.[field]);
    if (Number.isInteger(value)) return value;
  }
  for (const field of ["race_date", "date", "start_date", "end_date"]) {
    const text = String(row?.[field] ?? "");
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return Number(text.slice(0, 4));
  }
  return null;
}

function rowsBeforeSeason(rows, season) {
  return (rows ?? []).filter((row) => {
    const year = temporalYear(row);
    return year !== null && year < season;
  });
}

function rowsAfterSeason(rows, season) {
  return (rows ?? []).filter((row) => {
    const year = temporalYear(row);
    return year !== null && year > season;
  });
}

function inferredRaceYear(row, raceYearById) {
  const direct = temporalYear(row);
  if (direct !== null) return direct;
  for (const field of ["race_id", "gp_id", "race_id_arch"]) {
    const id = row?.[field];
    if (id !== null && id !== undefined && raceYearById.has(String(id))) return raceYearById.get(String(id));
  }
  return null;
}

function archiveRaceResults(database, season) {
  const raceYearById = new Map();
  for (const race of database.calendar ?? []) {
    const year = temporalYear(race);
    if (year === null) continue;
    for (const field of ["race_id", "gp_id", "race_id_arch"]) {
      const id = race?.[field];
      if (id !== null && id !== undefined && id !== "") raceYearById.set(String(id), year);
    }
  }
  return (database.raceResults ?? []).filter((row) => {
    const year = inferredRaceYear(row, raceYearById);
    return year !== null && year < season;
  });
}

const FUTURE_OUTCOME_FIELDS = new Set([
  "winner", "winner_driver_id", "winner_team_id", "pole_driver_id", "pole_position_driver_id",
  "fastest_lap_driver_id", "result", "results", "classification", "finishing_position",
  "position", "points", "champion", "championship_position", "podium", "race_winner",
]);

function stripFutureOutcomes(row) {
  return Object.fromEntries(Object.entries(row ?? {}).filter(([key]) => !FUTURE_OUTCOME_FIELDS.has(String(key).toLowerCase())));
}

function sanitizeEntityProfile(row, season, future = false) {
  const output = { ...row };
  const futureEnd = Number(output.career_end_year ?? output.retirement_year ?? output.last_f1_season);
  if (Number.isFinite(futureEnd) && futureEnd >= season) {
    delete output.career_end_year;
    delete output.retirement_year;
    delete output.last_f1_season;
  }
  const deathYear = Number(String(output.death_date ?? "").slice(0, 4));
  if (Number.isInteger(deathYear) && deathYear >= season) delete output.death_date;
  for (const field of [
    "championships", "championship_count", "wins", "career_wins", "podiums", "career_podiums",
    "poles", "career_poles", "career_points", "best_championship_finish", "last_team", "last_constructor",
  ]) delete output[field];
  if (future) {
    delete output.team_id;
    delete output.current_team_id;
  }
  return output;
}

function mergeFutureEntities(explicitRows, inferredRows) {
  const merged = new Map();
  for (const row of inferredRows) {
    const key = `${entityType(row)}:${entityId(row)}`;
    if (!entityId(row) || !entityType(row)) continue;
    merged.set(key, row);
  }
  for (const row of explicitRows) {
    const key = `${entityType(row)}:${entityId(row)}`;
    if (!entityId(row) || !entityType(row)) continue;
    merged.set(key, { ...(merged.get(key) ?? {}), ...row, source: row.source ?? "explicit_future_entity_queue" });
  }
  return [...merged.values()].sort((a, b) => {
    const yearA = activationYear(a) ?? 9999;
    const yearB = activationYear(b) ?? 9999;
    return yearA - yearB || entityType(a).localeCompare(entityType(b)) || String(entityId(a)).localeCompare(String(entityId(b)));
  });
}

function firstYearByEntity(rows, field) {
  const first = new Map();
  for (const row of rows ?? []) {
    const id = row?.[field];
    const year = temporalYear(row);
    if (!id || year === null) continue;
    if (!first.has(id) || year < first.get(id)) first.set(id, year);
  }
  return first;
}

function inferFutureEntities(database, season) {
  const inferred = [];
  for (const driver of database.drivers ?? []) {
    const year = Number(driver.f1_rookie_season ?? driver.career_start_year);
    if (!driver.driver_id || !Number.isInteger(year) || year <= season) continue;
    inferred.push({
      entity_type: "driver",
      entity_id: driver.driver_id,
      name: driver.display_name ?? driver.driver_name ?? null,
      activation_year: year,
      eligible_when_reached: true,
      source: "inferred_from_global_driver_profile",
    });
  }

  const firstTeamYear = firstYearByEntity(database.teamBrands, "team_id");
  for (const team of database.teams ?? []) {
    const year = firstTeamYear.get(team.team_id);
    if (!team.team_id || !Number.isInteger(year) || year <= season) continue;
    inferred.push({
      entity_type: "team",
      entity_id: team.team_id,
      name: team.team_name ?? null,
      activation_year: year,
      eligible_when_reached: true,
      source: "inferred_from_global_team_brand_timeline",
    });
  }

  const staffYears = firstYearByEntity([...(database.staffContracts ?? []), ...(database.staffRatings ?? [])], "staff_id");
  for (const person of database.staff ?? []) {
    const year = staffYears.get(person.staff_id);
    if (!person.staff_id || !Number.isInteger(year) || year <= season) continue;
    inferred.push({
      entity_type: "staff",
      entity_id: person.staff_id,
      name: person.staff_name ?? null,
      activation_year: year,
      eligible_when_reached: true,
      source: "inferred_from_global_staff_timeline",
    });
  }
  return inferred;
}

function groupFutureCalendar(calendar, season) {
  const grouped = {};
  for (const row of rowsAfterSeason(calendar, season)) {
    const year = temporalYear(row);
    if (year === null) continue;
    (grouped[String(year)] ??= []).push(stripFutureOutcomes(row));
  }
  for (const rows of Object.values(grouped)) rows.sort((a, b) => Number(a.round ?? 999) - Number(b.round ?? 999));
  return grouped;
}

function createHistoricalArchive(database, season) {
  return {
    throughSeason: season - 1,
    cutoff: `${season}-01-01`,
    calendar: rowsBeforeSeason(database.calendar, season),
    raceResults: archiveRaceResults(database, season),
    driverRatings: rowsBeforeSeason(database.driverRatings, season),
    driverCareer: rowsBeforeSeason(database.driverCareer, season),
    teamBrands: rowsBeforeSeason(database.teamBrands, season),
    contracts: rowsBeforeSeason(database.contracts, season),
    staffRatings: rowsBeforeSeason(database.staffRatings, season),
    staffContracts: rowsBeforeSeason(database.staffContracts, season),
    teamEngines: rowsBeforeSeason(database.teamEngines, season),
    carStats: rowsBeforeSeason(database.carStats, season),
    facilities: rowsBeforeSeason(database.facilities, season),
    teamFinancials: rowsBeforeSeason(database.teamFinancials, season),
    sponsorContracts: rowsBeforeSeason(database.sponsorContracts, season),
    financeLedger: rowsBeforeSeason(database.financeLedger, season),
    rdProjects: rowsBeforeSeason(database.rdProjects, season),
    rules: rowsBeforeSeason(database.rules, season),
    qualifyingRules: rowsBeforeSeason(database.qualifyingRules, season),
    eraSafety: rowsBeforeSeason(database.eraSafety, season),
    accidentModel: rowsBeforeSeason(database.accidentModel, season),
    events: rowsBeforeSeason(database.events, season),
    achievements: rowsBeforeSeason(database.achievements, season),
  };
}

function createFutureStructure(database, season) {
  const calendars = groupFutureCalendar(database.calendar, season);
  const futureTrackIds = new Set(Object.values(calendars).flat().map((row) => row.track_id).filter(Boolean));
  return {
    policy: "hidden_structural_reference_only_no_future_results",
    calendars,
    tracks: (database.tracks ?? []).filter((row) => futureTrackIds.has(row.track_id)),
    rules: rowsAfterSeason(database.rules, season).map(stripFutureOutcomes),
    qualifyingRules: rowsAfterSeason(database.qualifyingRules, season).map(stripFutureOutcomes),
    eraSafety: rowsAfterSeason(database.eraSafety, season).map(stripFutureOutcomes),
    accidentModel: rowsAfterSeason(database.accidentModel, season).map(stripFutureOutcomes),
  };
}

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
  ).map((row) => sanitizeEntityProfile(row, season));
  const staff = (database.staff ?? []).filter(
    (row) => contractedStaffIds.has(row.staff_id) || ratedStaffIds.has(row.staff_id)
  ).map((row) => sanitizeEntityProfile(row, season));
  const teams = (database.teams ?? []).filter((row) => activeTeamIds.has(row.team_id)).map((row) => sanitizeEntityProfile(row, season));

  const explicitFuture = (database.futureEntities ?? database.availabilityTimeline ?? []).filter((row) => {
    const activation = activationYear(row);
    return activation !== null && activation >= season && entityId(row);
  });
  const futureEntities = mergeFutureEntities(explicitFuture, inferFutureEntities(database, season));

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
    databasePolicy: {
      source: "global_master_database",
      startBoundary: `${season}-01-01`,
      past: "materialized_into_historical_archive",
      present: "materialized_into_active_world",
      futureOutcomes: "excluded",
      futureEntities: "retained_as_eligibility_pool",
      futureStructure: "retained_hidden_non_authoritative_reference",
    },
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
    historicalArchive: createHistoricalArchive(database, season),
    futureStructure: createFutureStructure(database, season),
    futureEntities,
    futureDrivers: (database.drivers ?? []).filter((row) => futureDriverIds.has(row.driver_id) && !currentDriverIds.has(row.driver_id)).map((row) => sanitizeEntityProfile(row, season, true)),
    futureStaff: (database.staff ?? []).filter((row) => futureStaffIds.has(row.staff_id) && !currentStaffIds.has(row.staff_id)).map((row) => sanitizeEntityProfile(row, season, true)),
    // A future team profile's team_id is its identity, not a scripted employer assignment.
    futureTeams: (database.teams ?? []).filter((row) => futureTeamIds.has(row.team_id) && !currentTeamIds.has(row.team_id)).map((row) => sanitizeEntityProfile(row, season, false)),
  };

  return deepFreeze(snapshot);
}
