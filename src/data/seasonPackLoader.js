import { deepFreeze } from "../domain/immutable.js";

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
  "contract_years_left", "reliability_override", "overall", "power", "availability"
]);

const KEY_ALIASES = Object.freeze({
  Year: "year",
  Sessions: "sessions",
  Length: "length",
  "team name": "team_name",
  Ovrl: "overall",
  Innovation: "innovation",
  Availability: "availability",
  _chassis_shop_level: "chassis_shop_level",
  manufacturing_leve: "manufacturing_level",
});

function scalar(key, value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  if (NUMBER_FIELDS.has(key) && trimmed !== "" && Number.isFinite(Number(trimmed))) return Number(trimmed);
  return value;
}

function normalizeRow(row) {
  const result = {};
  for (const [rawKey, value] of Object.entries(row ?? {})) {
    const key = KEY_ALIASES[rawKey] ?? rawKey;
    result[key] = scalar(key, value);
  }
  return result;
}

export function seasonPackSheetRows(payload, sheetName) {
  const matrix = payload?.sheets?.[sheetName];
  if (!Array.isArray(matrix) || matrix.length === 0) return [];
  const headers = matrix[0].map((value) => String(value ?? "").trim());
  return matrix.slice(1)
    .filter((row) => Array.isArray(row) && row.some((value) => value !== null && value !== undefined && value !== ""))
    .map((row) => normalizeRow(Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null]))));
}

function assertSeasonPack(payload) {
  if (!payload || payload.type !== "season_pack") throw new TypeError("Expected a season_pack payload.");
  const season = Number(payload.season);
  if (!Number.isInteger(season)) throw new TypeError("Season Pack must declare an integer season.");
  if (!payload.sheets || typeof payload.sheets !== "object") throw new TypeError("Season Pack sheets are required.");
  return season;
}

function sheet(payload, season, suffix) {
  return seasonPackSheetRows(payload, `${season}_${suffix}`);
}

function parseParameterValue(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (["enabled", "true", "yes"].includes(lower)) return true;
  if (["disabled", "false", "no"].includes(lower)) return false;
  if (trimmed !== "" && Number.isFinite(Number(trimmed))) return Number(trimmed);
  return value;
}

function raceModelParams(payload, season) {
  const rows = sheet(payload, season, "Race_Model_Params").filter((row) => row.load_into_save !== false);
  const result = { year: season, parameters: {} };
  for (const row of rows) {
    if (!row.parameter_name) continue;
    const value = parseParameterValue(row.value);
    result[row.parameter_name] = value;
    result.parameters[row.parameter_name] = {
      value,
      category: row.category ?? null,
      unit: row.unit ?? null,
      confidence: row.source_confidence ?? null,
      notes: row.notes ?? null,
    };
  }
  return result;
}

function normalizePointsSystem(value) {
  if (Array.isArray(value)) return value.join("-");
  return String(value ?? "").trim().replace(/\s*,\s*/g, "-");
}

function materializeRules(payload, season, params) {
  const source = sheet(payload, season, "Rules")[0] ?? {};
  return {
    ...source,
    year: season,
    points_system: normalizePointsSystem(params.points_system ?? source.points_system),
    qualifying_sessions: Number(params.qualifying_sessions ?? source.qualifying_sessions ?? 1),
    race_refuelling: params.race_refuelling ?? source.refueling_allowed ?? null,
    modern_safety_car: params.modern_safety_car ?? null,
    force_historical_substitutions: params.force_historical_substitutions ?? false,
  };
}

function materializeQualifyingRules(payload, season, params) {
  const source = sheet(payload, season, "Qualifying_Rules")[0] ?? {};
  return {
    ...source,
    year: season,
    sessions: Number(params.qualifying_sessions ?? source.sessions ?? 1),
    session_count: Number(params.qualifying_sessions ?? source.sessions ?? 1),
    start_grid_basis: params.start_grid_basis ?? source.format_code ?? null,
  };
}

function byRoundOrTrack(rows) {
  const byRound = new Map();
  const byTrack = new Map();
  for (const row of rows) {
    if (Number.isFinite(Number(row.round))) byRound.set(Number(row.round), row);
    const id = row.circuit_id ?? row.track_id;
    if (id) byTrack.set(String(id), row);
  }
  return { byRound, byTrack };
}

function matching(index, row) {
  return index.byRound.get(Number(row.round)) ?? index.byTrack.get(String(row.circuit_id ?? row.track_id ?? "")) ?? {};
}

function materializeCalendarAndTracks(payload, season) {
  const calendarRows = sheet(payload, season, "Calendar");
  const layouts = byRoundOrTrack(sheet(payload, season, "Circuit_Layouts"));
  const traits = byRoundOrTrack(sheet(payload, season, "Circuit_Gameplay_Traits"));
  const calendar = [];
  const tracks = [];

  for (const source of calendarRows) {
    const layout = matching(layouts, source);
    const trait = matching(traits, source);
    const trackId = source.circuit_id ?? source.track_id;
    const laps = Number(layout.scheduled_laps ?? trait.scheduled_laps ?? source.default_laps ?? 0) || null;
    const lapLength = Number(layout.lap_length_km ?? trait.lap_length_km ?? source.lap_length_km ?? 0) || null;
    const merged = {
      ...source,
      year: season,
      gp_id: source.race_id ?? source.gp_id ?? null,
      track_id: trackId,
      laps,
      default_laps: laps,
      scheduled_laps: laps,
      lap_length_km: lapLength,
      scheduled_distance_km: Number(layout.scheduled_distance_km ?? (laps && lapLength ? laps * lapLength : 0)) || null,
      overtaking_difficulty: trait.overtaking_difficulty ?? source.overtaking_difficulty ?? null,
      tyre_wear: trait.tyre_wear ?? source.tyre_wear ?? null,
      power_sensitivity: trait.power_sensitivity ?? null,
      aero_sensitivity: trait.aero_sensitivity ?? null,
      brake_stress: trait.brake_stress ?? null,
      incident_risk: trait.incident_risk ?? source.crash_risk ?? null,
      rain_likelihood: trait.rain_likelihood ?? null,
      pit_lane_loss_seconds: source.pit_lane_loss_seconds ?? source.pit_lane_loss ?? null,
      historical_layout_name: layout.historical_layout_name ?? layout.layout ?? trait.layout ?? null,
      layout_status: layout.layout_status ?? trait.source_confidence ?? null,
    };
    calendar.push(merged);
    tracks.push({
      ...merged,
      track_name: layout.circuit_name ?? trait.circuit_name ?? source.circuit_name ?? source.track_name ?? null,
      circuit_name: layout.circuit_name ?? trait.circuit_name ?? source.circuit_name ?? null,
    });
  }
  return { calendar, tracks };
}

function staffLoadoutIds(payload, season) {
  const flag = `import_on_new_${season}_save`;
  return new Set(sheet(payload, season, "Staff_Loadout")
    .filter((row) => row[flag] === true || row.import_on_new_save === true || row.load_into_save_default === true)
    .map((row) => row.staff_id)
    .filter(Boolean));
}

function normalizeTeamFinancials(teams, facilities) {
  const facilityByTeam = new Map(facilities.map((row) => [row.team_id, row]));
  return teams.map((team) => ({
    year: team.year,
    team_id: team.team_id,
    starting_budget: team.starting_budget ?? 0,
    maintenance_cost: facilityByTeam.get(team.team_id)?.maintenance_cost ?? 0,
  }));
}

function teamTyreSuppliers(payload, season) {
  const source = sheet(payload, season, "Full_Entrants")
    .filter((row) => row.load_into_save_default === true || row.load_into_save_default === "true")
    .filter((row) => row.team_id && row.tyre_manufacturer);
  const grouped = new Map();
  for (const row of source) {
    grouped.set(row.team_id, String(row.tyre_manufacturer).trim().toLowerCase());
  }
  return Object.fromEntries([...grouped.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))));
}

function normalizedTyres(payload, season) {
  return sheet(payload, season, "Tyre_Packages").map((row) => ({
    ...row,
    year: season,
    supplier_id: String(row.tyre_id ?? row.tyre_name ?? "").trim().toLowerCase(),
    compound_id: row.compound_id ?? row.tyre_id ?? null,
    compound_name: row.compound_name ?? row.tyre_name ?? null,
    condition: "dry",
    durability_rating: row.durability ?? null,
    durability_laps: row.durability_laps ?? null,
  }));
}

function materializeEngines(payload, season, teams) {
  const references = seasonPackSheetRows(payload, "Reference_Engines");
  const catalog = sheet(payload, season, "Engine_Catalog");
  const entrants = sheet(payload, season, "Full_Entrants").filter((row) => row.load_into_save_default === true || row.load_into_save_default === "true");
  const sourceByTeam = new Map(entrants.map((row) => [row.team_id, row.engine_source_id]));
  const catalogBySource = new Map(catalog.map((row) => [row.engine_source_id, row]));
  const referenceById = new Map(references.map((row) => [row.engine_id, row]));
  const result = new Map();

  for (const team of teams) {
    const engineId = team.engine_id;
    if (!engineId || result.has(engineId)) continue;
    const legacy = referenceById.get(engineId) ?? {};
    const modern = catalogBySource.get(sourceByTeam.get(team.team_id)) ?? {};
    result.set(engineId, {
      ...legacy,
      engine_id: engineId,
      engine_name: modern.engine_name ?? legacy.engine_name ?? team.engine_name ?? null,
      manufacturer: modern.manufacturer ?? team.power_unit ?? null,
      aspiration: modern.aspiration ?? legacy.aspiration ?? null,
      power: modern.power_rating ?? legacy.power ?? team.engine_power ?? null,
      reliability: modern.reliability_rating ?? legacy.reliability ?? team.engine_reliability ?? null,
      fuel_efficiency: modern.fuel_efficiency ?? legacy.fuel_efficiency ?? null,
      driveability: modern.driveability ?? null,
      innovation: modern.innovation ?? legacy.innovation ?? null,
      integration_ease: modern.integration_ease ?? null,
      mechanical_reliability_multiplier: modern.mechanical_reliability_multiplier ?? null,
      source_engine_id: modern.engine_source_id ?? null,
      year: season,
    });
  }
  return [...result.values()];
}

function startingRaceEntries(payload, season) {
  return sheet(payload, season, "Full_Entrants")
    .filter((row) => row.load_into_save_default === true || row.load_into_save_default === "true")
    .filter((row) => row.season_start_role === "round_1_starter")
    .map((row) => ({
      driver_id: row.driver_id,
      team_id: row.team_id,
      entrant_id: row.entrant_id,
      car_number: row.car_number,
      tyre_supplier: row.tyre_manufacturer ?? null,
      source_role: row.season_start_role,
    }))
    .filter((row) => row.driver_id && row.team_id);
}

function futureEntities(payload, season, currentDrivers, currentTeams) {
  const currentDriverIds = new Set(currentDrivers.map((row) => row.driver_id));
  const currentTeamIds = new Set(currentTeams.map((row) => row.team_id));
  return seasonPackSheetRows(payload, `Future_Entity_Queue_${season}`).filter((row) => {
    if (!row.entity_id || row.eligible_when_reached === false) return false;
    if (row.entity_type === "driver") return !currentDriverIds.has(row.entity_id);
    if (row.entity_type === "team") return !currentTeamIds.has(row.entity_id);
    return true;
  });
}

export function loadSeasonPackPayload(payload) {
  const season = assertSeasonPack(payload);
  const params = raceModelParams(payload, season);
  const teams = sheet(payload, season, "Teams").map((row) => ({ ...row, year: season }));
  const drivers = sheet(payload, season, "Drivers").map((row) => ({ ...row, year: season }));
  const staffIds = staffLoadoutIds(payload, season);
  const staff = sheet(payload, season, "Staff").filter((row) => staffIds.has(row.staff_id)).map((row) => ({ ...row, year: season }));
  const staffRatings = sheet(payload, season, "Staff_Ratings").filter((row) => staffIds.has(row.staff_id)).map((row) => ({ ...row, year: season }));
  const staffContracts = sheet(payload, season, "Staff_Contracts").filter((row) => staffIds.has(row.staff_id)).map((row) => ({ ...row, year: season }));
  const facilities = sheet(payload, season, "Team_Facilities").map((row) => ({ ...row, year: season }));
  const { calendar, tracks } = materializeCalendarAndTracks(payload, season);
  const future = futureEntities(payload, season, drivers, teams);
  const futureDriverIds = new Set(future.filter((row) => row.entity_type === "driver").map((row) => row.entity_id));
  const futureTeamIds = new Set(future.filter((row) => row.entity_type === "team").map((row) => row.entity_id));
  const availability = sheet(payload, season, "Availability_Pool");
  const availabilityById = new Map(availability.filter((row) => row.driver_id).map((row) => [row.driver_id, row]));

  const snapshot = {
    season,
    databaseVersion: `season-pack-${payload.version}`,
    sourceChecksum: payload.sourceChecksum ?? payload.source_checksum ?? null,
    readinessStatus: "season_pack_materialized",
    teams,
    teamBrands: sheet(payload, season, "Team_Brands").map((row) => ({ ...row, year: season })),
    drivers,
    driverRatings: sheet(payload, season, "Driver_Ratings").map((row) => ({ ...row, year: season })),
    contracts: sheet(payload, season, "Driver_Contracts").map((row) => ({ ...row, year: season })),
    staff,
    staffRatings,
    staffContracts,
    engines: materializeEngines(payload, season, teams),
    teamEngines: sheet(payload, season, "Team_Engines").map((row) => ({ ...row, year: season })),
    carStats: sheet(payload, season, "Car_Performance").map((row) => ({ ...row, year: season })),
    facilities,
    teamFinancials: normalizeTeamFinancials(teams, facilities),
    sponsorContracts: sheet(payload, season, "Sponsor_Contracts").map((row) => ({ ...row, year: season })),
    financeLedger: sheet(payload, season, "Finance_Ledger").map((row) => ({ ...row, year: season })),
    rdProjects: [],
    tyres: normalizedTyres(payload, season),
    teamTyreSuppliers: teamTyreSuppliers(payload, season),
    tracks,
    calendar,
    rules: materializeRules(payload, season, params),
    qualifyingRules: materializeQualifyingRules(payload, season, params),
    raceModelParams: params,
    eraSafety: {
      year: season,
      modern_safety_car: params.modern_safety_car ?? false,
      yellow_flags: true,
      red_flags: true,
      source: "race_model_params",
    },
    accidentModel: {
      year: season,
      mechanical_dnf_multiplier: params.mechanical_dnf_multiplier ?? 1,
      turbo_reliability_penalty: params.turbo_reliability_penalty ?? 1,
      source: "race_model_params",
    },
    startingRaceEntries: startingRaceEntries(payload, season),
    entrantOrganizations: sheet(payload, season, "Entrant_Organizations"),
    futureEntities: future,
    futureDrivers: [...futureDriverIds].map((id) => ({ driver_id: id, ...(availabilityById.get(id) ?? {}) })),
    futureStaff: [],
    futureTeams: [...futureTeamIds].map((id) => ({ team_id: id })),
    sourcePackage: {
      type: payload.type,
      version: payload.version,
      created: payload.created ?? null,
      notes: payload.notes ?? null,
    },
  };

  return deepFreeze(snapshot);
}
