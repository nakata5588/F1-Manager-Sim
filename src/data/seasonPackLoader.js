import { deepFreeze } from "../domain/immutable.js";

const REQUIRED_SUFFIXES = [
  "Teams", "Team_Brands", "Drivers", "Driver_Ratings", "Driver_Contracts",
  "Staff", "Staff_Loadout", "Staff_Ratings", "Staff_Contracts", "Team_Engines",
  "Engine_Catalog", "Car_Performance", "Team_Facilities", "Calendar", "Circuit_Layouts",
  "Circuit_Gameplay_Traits", "Rules", "Qualifying_Rules", "Race_Model_Params",
  "Tyre_Packages", "Full_Entrants",
];
const NUMBER_FIELDS = new Set([
  "year", "round", "season", "number", "driver_number", "car_number", "salary",
  "contract_start", "contract_until", "current_ability", "potential_ability", "pace",
  "qualifying", "start_launch", "racecraft", "wet_skill", "consistency", "tire_management",
  "technical_feedback", "adaptability", "mentality", "aggression", "crash_likelihood",
  "pressure_handling", "leadership", "team_player", "car_development_impact", "reputation",
  "market_value", "starting_budget", "manufacturing_level", "engine_power", "engine_reliability",
  "engine_supply_cost", "chassis_spec", "aero_spec", "gearbox_spec", "suspension_spec",
  "brakes_spec", "cooling_spec", "electronics_spec", "turbo_spec", "reliability", "weight",
  "cost", "wind_tunnel_level", "simulator_level", "aero_dept_level", "chassis_shop_level",
  "facility_manufacturing_level", "pitcrew_training_level", "maintenance_cost", "lap_length_km",
  "default_laps", "scheduled_laps", "scheduled_distance_km", "crash_risk", "overtaking_difficulty",
  "tyre_wear", "pit_lane_loss", "pit_lane_loss_seconds", "power_sensitivity", "aero_sensitivity",
  "brake_stress", "incident_risk", "dry_grip", "wet_grip", "durability", "warmup",
  "development_support", "power_rating", "reliability_rating", "fuel_efficiency", "driveability",
  "innovation", "integration_ease", "mechanical_reliability_multiplier", "supply_cost",
  "contract_years_left", "reliability_override", "overall", "power", "availability",
  "fastest_lap_points", "teams_supplied_count", "capacity_cc", "loader_priority",
]);
const ALIASES = {
  teamname: "team_name", sposor_name: "sponsor_name", anual_income: "annual_income",
  manufacturing_leve: "manufacturing_level", agression: "aggression", compund_id: "compound_id",
};
const TRUE_VALUES = new Set(["true", "yes", "y", "1", "sim", "s"]);
const FALSE_VALUES = new Set(["false", "no", "n", "0", "não", "nao"]);

export class SeasonPackValidationError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = "SeasonPackValidationError";
    this.issues = [...issues];
  }
}

function header(value) {
  const key = String(value ?? "").trim().replace(/[\s\-]+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
  return ALIASES[key] ?? key;
}
function scalar(key, value) {
  if (typeof value !== "string") return value;
  const text = value.trim();
  const lower = text.toLowerCase();
  if (TRUE_VALUES.has(lower)) return true;
  if (FALSE_VALUES.has(lower)) return false;
  return NUMBER_FIELDS.has(key) && text !== "" && Number.isFinite(Number(text)) ? Number(text) : value;
}
function isTrue(value) {
  return value === true || TRUE_VALUES.has(String(value ?? "").trim().toLowerCase());
}
function assertPack(payload) {
  if (!payload || payload.type !== "season_pack") throw new TypeError("Expected a season_pack payload.");
  const season = Number(payload.season);
  if (!Number.isInteger(season)) throw new TypeError("Season Pack must declare an integer season.");
  if (!payload.sheets || typeof payload.sheets !== "object") throw new TypeError("Season Pack sheets are required.");
  return season;
}

export function seasonPackSheetRows(payload, sheetName) {
  const matrix = payload?.sheets?.[sheetName];
  if (!Array.isArray(matrix) || !matrix.length) return [];
  const headers = matrix[0].map(header);
  return matrix.slice(1)
    .filter((row) => Array.isArray(row) && row.some((value) => value !== null && value !== undefined && value !== ""))
    .map((row) => Object.fromEntries(headers.filter(Boolean).map((key, index) => [key, scalar(key, row[index] ?? null)])));
}
export function parseSeasonPackPayload(payload) {
  assertPack(payload);
  return Object.fromEntries(Object.keys(payload.sheets).map((name) => [name, seasonPackSheetRows(payload, name)]));
}
function sheet(payload, season, suffix) {
  return seasonPackSheetRows(payload, `${season}_${suffix}`);
}
function staffKey(row) {
  return `${row?.staff_id ?? ""}::${row?.team_id ?? ""}::${row?.role ?? ""}`;
}
function staffLoadout(payload, season) {
  const flag = `import_on_new_${season}_save`;
  return sheet(payload, season, "Staff_Loadout")
    .filter((row) => isTrue(row[flag]) || isTrue(row.import_on_new_save) || isTrue(row.load_into_save_default));
}
function staffMatches(assignment, row) {
  return assignment?.staff_id === row?.staff_id && assignment?.team_id === row?.team_id
    && (!assignment?.role || assignment.role === row?.role);
}
function loaderStaffRows(payload, season, suffix) {
  const assignments = staffLoadout(payload, season);
  return sheet(payload, season, suffix).filter((row) => assignments.some((assignment) => staffMatches(assignment, row)));
}
function roundIncludes(value, round) {
  return String(value ?? "").split(",").some((token) => {
    const part = token.trim();
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    return range ? Number(range[1]) <= round && round <= Number(range[2]) : Number(part) === round;
  });
}
function startEntrants(payload, season) {
  return sheet(payload, season, "Full_Entrants").filter((row) => isTrue(row.load_into_save_default))
    .filter((row) => row.rounds ? roundIncludes(row.rounds, 1) : row.season_start_role === "round_1_starter");
}

function requiredSheet(payload, name, issues) {
  if (!Array.isArray(payload?.sheets?.[name]) || payload.sheets[name].length < 2) issues.push(`Missing or empty required table '${name}'.`);
}
function requiredColumns(name, rows, columns, issues) {
  const keys = new Set(Object.keys(rows[0] ?? {}));
  for (const column of columns) if (!keys.has(column)) issues.push(`${name} is missing required column '${column}'.`);
}
function unique(rows, keyFn, name, issues) {
  const seen = new Set();
  for (const [index, row] of rows.entries()) {
    const key = keyFn(row);
    if (key === null || key === undefined || key === "") issues.push(`${name} row ${index + 2} has no key.`);
    else if (seen.has(key)) issues.push(`${name} contains duplicate key '${key}'.`);
    else seen.add(key);
  }
}
function refs(rows, field, validIds, name, issues) {
  for (const [index, row] of rows.entries()) {
    const id = row[field];
    if (!id || !validIds.has(id)) issues.push(`${name} row ${index + 2} references missing ${field} '${id ?? ""}'.`);
  }
}
function contextCounts(payload, season) {
  return {
    teams: sheet(payload, season, "Teams").length,
    drivers: sheet(payload, season, "Drivers").length,
    driverContracts: sheet(payload, season, "Driver_Contracts").length,
    staff: sheet(payload, season, "Staff").length,
    loaderSafeStaff: staffLoadout(payload, season).length,
    calendarRounds: sheet(payload, season, "Calendar").length,
    fullEntrants: sheet(payload, season, "Full_Entrants").length,
    startingRaceEntries: startEntrants(payload, season).length,
    roundEntryReference: sheet(payload, season, "Round_Entry_Reference").length,
    futureEntities: seasonPackSheetRows(payload, `Future_Entity_Queue_${season}`).length,
  };
}

export function validateSeasonPackPayload(payload, options = {}) {
  let season;
  try { season = assertPack(payload); }
  catch (error) { throw new SeasonPackValidationError("Season Pack failed structural validation.", [error.message]); }
  const issues = [];
  if (options.season !== undefined && Number(options.season) !== season) issues.push(`Expected season ${Number(options.season)}, received ${season}.`);
  for (const suffix of options.requiredSuffixes ?? REQUIRED_SUFFIXES) requiredSheet(payload, `${season}_${suffix}`, issues);
  requiredSheet(payload, `Future_Entity_Queue_${season}`, issues);
  if (issues.length) throw new SeasonPackValidationError("Season Pack failed structural validation.", issues);

  const teams = sheet(payload, season, "Teams");
  const brands = sheet(payload, season, "Team_Brands");
  const drivers = sheet(payload, season, "Drivers");
  const ratings = sheet(payload, season, "Driver_Ratings");
  const contracts = sheet(payload, season, "Driver_Contracts");
  const staff = sheet(payload, season, "Staff");
  const staffRatings = sheet(payload, season, "Staff_Ratings");
  const staffContracts = sheet(payload, season, "Staff_Contracts");
  const loadout = staffLoadout(payload, season);
  const calendar = sheet(payload, season, "Calendar");
  const layouts = sheet(payload, season, "Circuit_Layouts");
  const teamEngines = sheet(payload, season, "Team_Engines");
  const cars = sheet(payload, season, "Car_Performance");
  const facilities = sheet(payload, season, "Team_Facilities");
  const entrants = startEntrants(payload, season);

  requiredColumns(`${season}_Teams`, teams, ["team_id", "team_name"], issues);
  requiredColumns(`${season}_Drivers`, drivers, ["driver_id", "driver_name", "team_id"], issues);
  requiredColumns(`${season}_Driver_Contracts`, contracts, ["team_id", "driver_id", "role"], issues);
  requiredColumns(`${season}_Staff_Loadout`, loadout, ["team_id", "staff_id"], issues);
  requiredColumns(`${season}_Calendar`, calendar, ["round", "race_id", "gp_name", "circuit_id"], issues);
  if (!loadout.length) issues.push(`${season}_Staff_Loadout has no loader-safe assignments.`);
  unique(teams, (row) => row.team_id, `${season}_Teams`, issues);
  unique(drivers, (row) => row.driver_id, `${season}_Drivers`, issues);
  unique(loadout, staffKey, `${season}_Staff_Loadout(loader-safe)`, issues);
  unique(calendar, (row) => row.round, `${season}_Calendar round`, issues);
  unique(calendar, (row) => row.race_id, `${season}_Calendar race_id`, issues);

  const teamIds = new Set(teams.map((row) => row.team_id));
  const driverIds = new Set(drivers.map((row) => row.driver_id));
  const staffIds = new Set(staff.map((row) => row.staff_id));
  const futureDriverIds = new Set(seasonPackSheetRows(payload, `Future_Entity_Queue_${season}`)
    .filter((row) => row.entity_type === "driver").map((row) => row.entity_id));
  const knownDriverIds = new Set([...driverIds, ...futureDriverIds]);
  refs(brands, "team_id", teamIds, `${season}_Team_Brands`, issues);
  refs(contracts, "team_id", teamIds, `${season}_Driver_Contracts`, issues);
  refs(contracts, "driver_id", driverIds, `${season}_Driver_Contracts`, issues);
  refs(ratings, "driver_id", knownDriverIds, `${season}_Driver_Ratings`, issues);
  refs(loadout, "team_id", teamIds, `${season}_Staff_Loadout`, issues);
  refs(loadout, "staff_id", staffIds, `${season}_Staff_Loadout`, issues);
  refs(teamEngines, "team_id", teamIds, `${season}_Team_Engines`, issues);
  refs(cars, "team_id", teamIds, `${season}_Car_Performance`, issues);
  refs(facilities, "team_id", teamIds, `${season}_Team_Facilities`, issues);
  refs(entrants, "team_id", teamIds, `${season}_Full_Entrants(round 1)`, issues);
  refs(entrants, "driver_id", driverIds, `${season}_Full_Entrants(round 1)`, issues);

  for (const assignment of loadout) {
    for (const [label, rows] of [["Staff", staff], ["Staff_Contracts", staffContracts], ["Staff_Ratings", staffRatings]]) {
      const count = rows.filter((row) => staffMatches(assignment, row)).length;
      if (count !== 1) issues.push(`${season}_${label} must contain exactly one loader-safe row for '${staffKey(assignment)}'; found ${count}.`);
    }
  }
  const layoutRounds = new Set(layouts.map((row) => Number(row.round)));
  for (const race of calendar) if (!layoutRounds.has(Number(race.round))) issues.push(`Calendar round ${race.round} has no period circuit layout.`);
  const entrantDriverIds = new Set(entrants.map((row) => row.driver_id));
  for (const id of driverIds) if (!entrantDriverIds.has(id)) issues.push(`Initial driver '${id}' has no round-one entrant row.`);
  for (const id of entrantDriverIds) if (!driverIds.has(id)) issues.push(`Round-one entrant '${id}' is absent from ${season}_Drivers.`);
  if (issues.length) throw new SeasonPackValidationError("Season Pack failed relational validation.", issues);
  return { ok: true, season, counts: contextCounts(payload, season) };
}

function parseParameter(value) {
  if (typeof value !== "string") return value;
  const text = value.trim();
  const lower = text.toLowerCase();
  if (["enabled", "true", "yes"].includes(lower)) return true;
  if (["disabled", "false", "no"].includes(lower)) return false;
  return text !== "" && Number.isFinite(Number(text)) ? Number(text) : value;
}
function raceParams(payload, season) {
  const result = { year: season, parameters: {} };
  for (const row of sheet(payload, season, "Race_Model_Params").filter((item) => item.load_into_save !== false)) {
    if (!row.parameter_name) continue;
    const value = parseParameter(row.value);
    result[row.parameter_name] = value;
    result.parameters[row.parameter_name] = { value, category: row.category ?? null, unit: row.unit ?? null, confidence: row.source_confidence ?? null, notes: row.notes ?? null };
  }
  return result;
}
function rules(payload, season, params) {
  const row = sheet(payload, season, "Rules")[0] ?? {};
  const points = params.points_system ?? row.points_system;
  return { ...row, year: season, points_system: Array.isArray(points) ? points.join("-") : String(points ?? "").trim().replace(/\s*,\s*/g, "-"), qualifying_sessions: Number(params.qualifying_sessions ?? row.qualifying_sessions ?? 1), race_refuelling: params.race_refuelling ?? row.refueling_allowed ?? null, modern_safety_car: params.modern_safety_car ?? null, force_historical_substitutions: params.force_historical_substitutions ?? false };
}
function qualifyingRules(payload, season, params) {
  const row = sheet(payload, season, "Qualifying_Rules")[0] ?? {};
  const sessions = Number(params.qualifying_sessions ?? row.sessions ?? 1);
  return { ...row, year: season, sessions, session_count: sessions, start_grid_basis: params.start_grid_basis ?? row.format_code ?? null };
}
function indexes(rows) {
  const byRound = new Map(), byTrack = new Map();
  for (const row of rows) {
    if (Number.isFinite(Number(row.round))) byRound.set(Number(row.round), row);
    const id = row.circuit_id ?? row.track_id;
    if (id) byTrack.set(String(id), row);
  }
  return { byRound, byTrack };
}
function match(index, row) {
  return index.byRound.get(Number(row.round)) ?? index.byTrack.get(String(row.circuit_id ?? row.track_id ?? "")) ?? {};
}
function calendarAndTracks(payload, season) {
  const layoutIndex = indexes(sheet(payload, season, "Circuit_Layouts"));
  const traitIndex = indexes(sheet(payload, season, "Circuit_Gameplay_Traits"));
  const calendar = [], tracks = [];
  for (const source of sheet(payload, season, "Calendar")) {
    const layout = match(layoutIndex, source), trait = match(traitIndex, source);
    const trackId = source.circuit_id ?? source.track_id;
    const laps = Number(layout.scheduled_laps ?? trait.scheduled_laps ?? source.default_laps ?? 0) || null;
    const length = Number(layout.lap_length_km ?? trait.lap_length_km ?? source.lap_length_km ?? 0) || null;
    const row = { ...source, year: season, gp_id: source.race_id ?? source.gp_id ?? null, track_id: trackId, laps, default_laps: laps, scheduled_laps: laps, lap_length_km: length, scheduled_distance_km: Number(layout.scheduled_distance_km ?? (laps && length ? laps * length : 0)) || null, overtaking_difficulty: trait.overtaking_difficulty ?? source.overtaking_difficulty ?? null, tyre_wear: trait.tyre_wear ?? source.tyre_wear ?? null, power_sensitivity: trait.power_sensitivity ?? null, aero_sensitivity: trait.aero_sensitivity ?? null, brake_stress: trait.brake_stress ?? null, incident_risk: trait.incident_risk ?? source.crash_risk ?? null, rain_likelihood: trait.rain_likelihood ?? null, pit_lane_loss_seconds: source.pit_lane_loss_seconds ?? source.pit_lane_loss ?? null, historical_layout_name: layout.historical_layout_name ?? layout.layout ?? trait.layout ?? null, layout_status: layout.layout_status ?? trait.source_confidence ?? null };
    calendar.push(row);
    tracks.push({ ...row, track_name: layout.circuit_name ?? trait.circuit_name ?? source.circuit_name ?? source.track_name ?? null, circuit_name: layout.circuit_name ?? trait.circuit_name ?? source.circuit_name ?? null });
  }
  return { calendar, tracks };
}
function tyres(payload, season) {
  return sheet(payload, season, "Tyre_Packages").map((row) => ({ ...row, year: season, supplier_id: String(row.tyre_id ?? row.tyre_name ?? "").trim().toLowerCase(), compound_id: row.compound_id ?? row.tyre_id ?? null, compound_name: row.compound_name ?? row.tyre_name ?? null, condition: "dry", durability_rating: row.durability ?? null, durability_laps: row.durability_laps ?? null }));
}
function startEntries(rows) {
  return rows.map((row) => ({ driver_id: row.driver_id, team_id: row.team_id, entrant_id: row.entrant_id, car_number: row.car_number, tyre_supplier: row.tyre_manufacturer ?? null, source_role: row.season_start_role })).filter((row) => row.driver_id && row.team_id);
}
function tyreSuppliers(rows) {
  const map = new Map();
  for (const row of rows) if (row.team_id && row.tyre_manufacturer) map.set(row.team_id, String(row.tyre_manufacturer).trim().toLowerCase());
  return Object.fromEntries([...map].sort(([a], [b]) => String(a).localeCompare(String(b))));
}
function engines(payload, season, teams, entrants) {
  const references = new Map(seasonPackSheetRows(payload, "Reference_Engines").map((row) => [row.engine_id, row]));
  const catalog = new Map(sheet(payload, season, "Engine_Catalog").map((row) => [row.engine_source_id, row]));
  const sourceByTeam = new Map(entrants.map((row) => [row.team_id, row.engine_source_id]));
  const result = new Map();
  for (const team of teams) {
    if (!team.engine_id || result.has(team.engine_id)) continue;
    const legacy = references.get(team.engine_id) ?? {}, modern = catalog.get(sourceByTeam.get(team.team_id)) ?? {};
    result.set(team.engine_id, { ...legacy, engine_id: team.engine_id, engine_name: modern.engine_name ?? legacy.engine_name ?? team.engine_name ?? null, manufacturer: modern.manufacturer ?? team.power_unit ?? null, aspiration: modern.aspiration ?? legacy.aspiration ?? null, power: modern.power_rating ?? legacy.power ?? team.engine_power ?? null, reliability: modern.reliability_rating ?? legacy.reliability ?? team.engine_reliability ?? null, fuel_efficiency: modern.fuel_efficiency ?? legacy.fuel_efficiency ?? null, driveability: modern.driveability ?? null, innovation: modern.innovation ?? legacy.innovation ?? null, integration_ease: modern.integration_ease ?? null, mechanical_reliability_multiplier: modern.mechanical_reliability_multiplier ?? null, source_engine_id: modern.engine_source_id ?? null, year: season });
  }
  return [...result.values()];
}
function futureEntities(payload, season, drivers, teams) {
  const activeDrivers = new Set(drivers.map((row) => row.driver_id)), activeTeams = new Set(teams.map((row) => row.team_id));
  return seasonPackSheetRows(payload, `Future_Entity_Queue_${season}`).filter((row) => row.entity_id && row.eligible_when_reached !== false)
    .filter((row) => row.entity_type === "driver" ? !activeDrivers.has(row.entity_id) : row.entity_type === "team" ? !activeTeams.has(row.entity_id) : true);
}
function context(payload, season) {
  const get = (suffix) => sheet(payload, season, suffix);
  return { version: payload.version ?? null, season, counts: contextCounts(payload, season), validation: get("Validation"), sourceLock: get("Source_Lock"), masterCrosswalk: get("Master_Crosswalk"), numberAudit: get("Number_Audit"), correctionsLog: get("Corrections_Log"), availabilityPool: get("Availability_Pool"), preSeasonDriverForm: get("PreSeason_Driver_Form"), teamOperatingModel: get("Team_Operating_Model"), circuitLayouts: get("Circuit_Layouts"), circuitGameplayTraits: get("Circuit_Gameplay_Traits"), fullEntrants: get("Full_Entrants"), entrantOrganizations: get("Entrant_Organizations"), roundEntryReference: get("Round_Entry_Reference"), entryMatrix: get("Entry_Matrix"), chassisCatalog: get("Chassis_Catalog"), engineCatalog: get("Engine_Catalog"), tyrePackages: get("Tyre_Packages"), raceModelParams: get("Race_Model_Params"), rulesDetail: get("Rules_Detail"), pitcrew: get("Pitcrew"), weatherProfiles: get("Weather_Profiles"), sponsors: get("Sponsors"), historicalEventsReference: get("Historical_Events_Reference"), staffAuditSummary: get("Staff_Audit_Summary"), staffVerification: get("Staff_Verification"), staffSourceLock: get("Staff_Source_Lock"), staffLoadout: get("Staff_Loadout"), staffRoleCoverage: get("Staff_Role_Coverage") };
}

export function loadSeasonPackPayload(payload, options = {}) {
  const season = assertPack(payload);
  if (options.validate !== false) validateSeasonPackPayload(payload, { season });
  const params = raceParams(payload, season);
  const teams = sheet(payload, season, "Teams").map((row) => ({ ...row, year: season }));
  const drivers = sheet(payload, season, "Drivers").map((row) => ({ ...row, year: season }));
  const staff = loaderStaffRows(payload, season, "Staff").map((row) => ({ ...row, year: season }));
  const staffRatings = loaderStaffRows(payload, season, "Staff_Ratings").map((row) => ({ ...row, year: season }));
  const staffContracts = loaderStaffRows(payload, season, "Staff_Contracts").map((row) => ({ ...row, year: season }));
  const facilities = sheet(payload, season, "Team_Facilities").map((row) => ({ ...row, year: season }));
  const entrantRows = startEntrants(payload, season);
  const { calendar, tracks } = calendarAndTracks(payload, season);
  const future = futureEntities(payload, season, drivers, teams);
  const availability = new Map(sheet(payload, season, "Availability_Pool").filter((row) => row.driver_id).map((row) => [row.driver_id, row]));
  const futureDriverIds = new Set(future.filter((row) => row.entity_type === "driver").map((row) => row.entity_id));
  const futureTeamIds = new Set(future.filter((row) => row.entity_type === "team").map((row) => row.entity_id));
  const databaseVersion = `season-pack-${payload.version}`;
  const sourceChecksum = options.sourceChecksum ?? payload.sourceChecksum ?? payload.source_checksum ?? null;
  const sourcePath = options.sourcePath ?? null;
  const facilityMap = new Map(facilities.map((row) => [row.team_id, row]));

  return deepFreeze({
    season, databaseVersion, sourceChecksum, readinessStatus: "season_pack_materialized",
    teams,
    teamBrands: sheet(payload, season, "Team_Brands").map((row) => ({ ...row, year: season })),
    drivers,
    driverRatings: sheet(payload, season, "Driver_Ratings").map((row) => ({ ...row, year: season })),
    contracts: sheet(payload, season, "Driver_Contracts").map((row) => ({ ...row, year: season })),
    staff, staffRatings, staffContracts,
    engines: engines(payload, season, teams, entrantRows),
    teamEngines: sheet(payload, season, "Team_Engines").map((row) => ({ ...row, year: season })),
    carStats: sheet(payload, season, "Car_Performance").map((row) => ({ ...row, year: season })),
    facilities,
    teamFinancials: teams.map((team) => ({ year: season, team_id: team.team_id, starting_budget: team.starting_budget ?? 0, maintenance_cost: facilityMap.get(team.team_id)?.maintenance_cost ?? 0 })),
    sponsorContracts: sheet(payload, season, "Sponsor_Contracts").map((row) => ({ ...row, year: season })),
    financeLedger: sheet(payload, season, "Finance_Ledger").map((row) => ({ ...row, year: season })),
    rdProjects: [],
    tyres: tyres(payload, season), teamTyreSuppliers: tyreSuppliers(entrantRows), tracks, calendar,
    rules: rules(payload, season, params), qualifyingRules: qualifyingRules(payload, season, params), raceModelParams: params,
    eraSafety: { year: season, modern_safety_car: params.modern_safety_car ?? false, yellow_flags: true, red_flags: true, source: "race_model_params" },
    accidentModel: { year: season, mechanical_dnf_multiplier: params.mechanical_dnf_multiplier ?? 1, turbo_reliability_penalty: params.turbo_reliability_penalty ?? 1, source: "race_model_params" },
    startingRaceEntries: startEntries(entrantRows),
    entrantOrganizations: sheet(payload, season, "Entrant_Organizations"),
    futureEntities: future,
    futureDrivers: [...futureDriverIds].map((id) => ({ driver_id: id, ...(availability.get(id) ?? {}) })),
    futureStaff: [], futureTeams: [...futureTeamIds].map((id) => ({ team_id: id })),
    sourcePackage: { databaseVersion, packageVersion: payload.version ?? null, packageType: payload.type, season, created: payload.created ?? null, notes: payload.notes ?? null, sourcePath, sourceSha256: sourceChecksum, readiness: { [String(season)]: "season_pack_materialized" } },
    seasonPack: context(payload, season),
  });
}
