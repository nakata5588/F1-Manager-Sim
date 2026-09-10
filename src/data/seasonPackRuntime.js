import { deepFreeze } from "../domain/immutable.js";
import {
  loadSeasonPackPayload,
  SeasonPackValidationError,
  seasonPackSheetRows,
  validateSeasonPackPayload,
} from "./seasonPackLoader.js";

const V08_REQUIRED_SUFFIXES = Object.freeze([
  "Car_Performance_Model",
  "Chassis_Performance_Detail",
  "Engine_Model",
  "Tyre_Model",
  "Finance_Model",
  "Sponsor_Model",
  "Board_Objectives",
  "Team_Balance_Profile",
  "External_Driver_Market",
  "Race_Weekend_Data_Status",
  "Technical_Regulations",
]);

const MODEL_NUMBER_FIELDS = new Set([
  "constructor_1980_rank_reference",
  "constructor_1980_points_reference",
  "qualifying_pace",
  "race_pace",
  "aero_efficiency",
  "mechanical_grip",
  "straight_line_speed",
  "low_speed_performance",
  "high_speed_performance",
  "tyre_wear_control",
  "cooling_margin",
  "reliability",
  "development_potential",
  "setup_sensitivity",
  "performance_variance",
  "power_rating",
  "driveability",
  "fuel_efficiency",
  "cooling_demand",
  "supply_cost_units",
  "development_ceiling",
  "dry_peak_grip",
  "warmup",
  "wear_resistance",
  "wet_performance",
  "operating_window_width",
  "starting_budget_units_m",
  "estimated_sponsor_income_m",
  "estimated_engine_supply_cost_m",
  "estimated_driver_staff_payroll_m",
  "estimated_monthly_operating_burn_m",
  "cash_on_hand_start_m",
  "cost_control_aggression",
  "estimated_annual_value_m",
  "board_patience",
  "reputation_pressure",
  "age_1980",
  "historical_reference_entry_year",
  "next_reference_f1_entry_year",
  "potential_estimate",
  "reputation_estimate",
]);

function versionAtLeast(payload, requiredMajor, requiredMinor) {
  const [majorText = "0", minorText = "0"] = String(payload?.version ?? "0").split(".");
  const major = Number(majorText);
  const minor = Number(minorText);
  if (!Number.isInteger(major) || !Number.isInteger(minor)) return false;
  return major > requiredMajor || (major === requiredMajor && minor >= requiredMinor);
}

function sheet(payload, season, suffix) {
  return seasonPackSheetRows(payload, `${season}_${suffix}`);
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") return value ?? null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

function normalizeModelRow(row, season) {
  const normalized = { ...row, year: season };
  for (const field of MODEL_NUMBER_FIELDS) {
    if (Object.hasOwn(normalized, field)) normalized[field] = normalizeNumber(normalized[field]);
  }
  return normalized;
}

function modelRows(payload, season, suffix) {
  return sheet(payload, season, suffix).map((row) => normalizeModelRow(row, season));
}

function missingRequiredSheet(payload, season, suffix) {
  const matrix = payload?.sheets?.[`${season}_${suffix}`];
  return !Array.isArray(matrix) || matrix.length < 2;
}

function uniqueBy(rows, field, label, issues, { allowBlank = false } = {}) {
  const seen = new Set();
  for (const [index, row] of rows.entries()) {
    const value = row?.[field];
    if (value === null || value === undefined || value === "") {
      if (!allowBlank) issues.push(`${label} row ${index + 2} has no ${field}.`);
      continue;
    }
    if (seen.has(value)) issues.push(`${label} contains duplicate ${field} '${value}'.`);
    seen.add(value);
  }
}

function validateTeamCoverage(rows, teamIds, label, issues) {
  uniqueBy(rows, "team_id", label, issues);
  const covered = new Set();
  for (const [index, row] of rows.entries()) {
    if (!teamIds.has(row.team_id)) issues.push(`${label} row ${index + 2} references unknown team_id '${row.team_id ?? ""}'.`);
    else covered.add(row.team_id);
  }
  for (const teamId of teamIds) if (!covered.has(teamId)) issues.push(`${label} is missing team_id '${teamId}'.`);
}

function normalizedSupplier(value) {
  return String(value ?? "").trim().toLowerCase();
}

function runtimeCounts(payload, season, baseCounts) {
  return {
    ...baseCounts,
    carPerformanceModels: sheet(payload, season, "Car_Performance_Model").length,
    chassisPerformanceDetails: sheet(payload, season, "Chassis_Performance_Detail").length,
    engineModels: sheet(payload, season, "Engine_Model").length,
    tyreModels: sheet(payload, season, "Tyre_Model").length,
    financeModels: sheet(payload, season, "Finance_Model").length,
    sponsorModels: sheet(payload, season, "Sponsor_Model").length,
    boardObjectives: sheet(payload, season, "Board_Objectives").length,
    teamBalanceProfiles: sheet(payload, season, "Team_Balance_Profile").length,
    externalDriverMarket: sheet(payload, season, "External_Driver_Market").length,
    raceWeekendDataStatus: sheet(payload, season, "Race_Weekend_Data_Status").length,
    technicalRegulations: sheet(payload, season, "Technical_Regulations").length,
  };
}

export function validateSeasonPackRuntimePayload(payload, options = {}) {
  const base = validateSeasonPackPayload(payload, options);
  if (!versionAtLeast(payload, 0, 8)) return base;

  const season = base.season;
  const issues = [];
  for (const suffix of V08_REQUIRED_SUFFIXES) {
    if (missingRequiredSheet(payload, season, suffix)) issues.push(`Missing or empty v0.8 table '${season}_${suffix}'.`);
  }
  if (issues.length) throw new SeasonPackValidationError("Season Pack v0.8 failed structural validation.", issues);

  const teams = sheet(payload, season, "Teams");
  const teamIds = new Set(teams.map((row) => row.team_id));
  const carModels = modelRows(payload, season, "Car_Performance_Model");
  const financeModels = modelRows(payload, season, "Finance_Model");
  const board = modelRows(payload, season, "Board_Objectives");
  const balance = modelRows(payload, season, "Team_Balance_Profile");
  const engineModels = modelRows(payload, season, "Engine_Model");
  const tyreModels = modelRows(payload, season, "Tyre_Model");
  const teamEngines = sheet(payload, season, "Team_Engines");
  const startEntrants = sheet(payload, season, "Full_Entrants").filter((row) => row.load_into_save_default === true);

  validateTeamCoverage(carModels, teamIds, `${season}_Car_Performance_Model`, issues);
  validateTeamCoverage(financeModels, teamIds, `${season}_Finance_Model`, issues);
  validateTeamCoverage(board, teamIds, `${season}_Board_Objectives`, issues);
  validateTeamCoverage(balance, teamIds, `${season}_Team_Balance_Profile`, issues);

  uniqueBy(engineModels, "engine_package_id", `${season}_Engine_Model`, issues);
  const engineIds = new Set(engineModels.map((row) => row.engine_package_id).filter(Boolean));
  for (const row of teamEngines) {
    if (row.engine_id && !engineIds.has(row.engine_id)) issues.push(`${season}_Team_Engines references engine_id '${row.engine_id}' missing from ${season}_Engine_Model.`);
  }

  uniqueBy(tyreModels, "tyre_supplier", `${season}_Tyre_Model`, issues);
  const tyreSuppliers = new Set(tyreModels.map((row) => normalizedSupplier(row.tyre_supplier)).filter(Boolean));
  for (const row of startEntrants) {
    const supplier = normalizedSupplier(row.tyre_manufacturer);
    if (supplier && !tyreSuppliers.has(supplier)) issues.push(`${season}_Full_Entrants references tyre supplier '${row.tyre_manufacturer}' missing from ${season}_Tyre_Model.`);
  }

  const externalMarket = modelRows(payload, season, "External_Driver_Market");
  for (const [index, row] of externalMarket.entries()) {
    if (!String(row.driver_name ?? "").trim()) issues.push(`${season}_External_Driver_Market row ${index + 2} has no driver_name.`);
  }

  if (issues.length) throw new SeasonPackValidationError("Season Pack v0.8 failed relational validation.", issues);
  return { ...base, counts: runtimeCounts(payload, season, base.counts) };
}

function mergeByTeam(baseRows, modelRowsToMerge, transform = (row) => row) {
  const models = new Map(modelRowsToMerge.filter((row) => row.team_id).map((row) => [row.team_id, transform(row)]));
  return baseRows.map((row) => ({ ...row, ...(models.get(row.team_id) ?? {}) }));
}

function engineModelRows(payload, season) {
  return modelRows(payload, season, "Engine_Model").map((row) => ({
    ...row,
    engine_id: row.engine_package_id,
    power: row.power_rating,
    reliability: row.reliability,
    gameplay_model_status: row.data_status ?? null,
  }));
}

function mergeEngines(baseEngines, modelEngines) {
  const models = new Map(modelEngines.map((row) => [row.engine_id, row]));
  const output = baseEngines.map((row) => {
    const model = models.get(row.engine_id);
    return model ? { ...row, ...model, source_engine_id: row.source_engine_id ?? null } : { ...row };
  });
  const existing = new Set(output.map((row) => row.engine_id));
  for (const model of modelEngines) if (!existing.has(model.engine_id)) output.push({ ...model });
  return output;
}

function tyreModelRows(payload, season) {
  return modelRows(payload, season, "Tyre_Model").map((row) => ({
    ...row,
    supplier_id: normalizedSupplier(row.tyre_supplier),
    gameplay_model_status: row.data_status ?? null,
  }));
}

function mergeTyres(baseTyres, models) {
  const bySupplier = new Map(models.map((row) => [row.supplier_id, row]));
  return baseTyres.map((row) => {
    const model = bySupplier.get(normalizedSupplier(row.supplier_id ?? row.tyre_name));
    if (!model) return { ...row };
    return {
      ...row,
      dry_peak_grip: model.dry_peak_grip,
      model_warmup: model.warmup,
      wear_resistance: model.wear_resistance,
      wet_performance: model.wet_performance,
      operating_window_width: model.operating_window_width,
      works_priority: model.works_priority ?? null,
      strategic_note: model.strategic_note ?? null,
      model_data_status: model.data_status ?? null,
      model_source_urls: model.source_urls ?? null,
    };
  });
}

function financeModelRows(payload, season) {
  return modelRows(payload, season, "Finance_Model").map((row) => ({
    ...row,
    unit_scale: 1_000_000,
    cash_on_hand_start_units: Number(row.cash_on_hand_start_m ?? 0) * 1_000_000,
    starting_budget_units: Number(row.starting_budget_units_m ?? 0) * 1_000_000,
    estimated_sponsor_income_units: Number(row.estimated_sponsor_income_m ?? 0) * 1_000_000,
    estimated_engine_supply_cost_units: Number(row.estimated_engine_supply_cost_m ?? 0) * 1_000_000,
    estimated_driver_staff_payroll_units: Number(row.estimated_driver_staff_payroll_m ?? 0) * 1_000_000,
    estimated_monthly_operating_burn_units: Number(row.estimated_monthly_operating_burn_m ?? 0) * 1_000_000,
  }));
}

function mergeTeamFinancials(baseRows, financeModels) {
  const byTeam = new Map(financeModels.map((row) => [row.team_id, row]));
  return baseRows.map((row) => {
    const model = byTeam.get(row.team_id);
    if (!model) return { ...row };
    return {
      ...row,
      cash_balance: model.cash_on_hand_start_units,
      gameplay_starting_budget: model.starting_budget_units,
      currency_model: model.currency_model ?? null,
      financial_risk: model.financial_risk ?? null,
      board_financial_pressure: model.board_financial_pressure ?? null,
      cost_control_aggression: model.cost_control_aggression ?? null,
      estimated_monthly_operating_burn: model.estimated_monthly_operating_burn_units,
      model_data_status: model.data_status ?? null,
    };
  });
}

function v08Context(payload, season) {
  return {
    completenessAudit: modelRows(payload, season, "Completeness_Audit"),
    completenessRoadmap: modelRows(payload, season, "Completeness_Roadmap"),
    loaderReadiness: modelRows(payload, season, "Loader_Readiness"),
    loaderFlagsAudit: modelRows(payload, season, "Loader_Flags_Audit"),
    dataModelNotes: modelRows(payload, season, "Data_Model_Notes"),
    chassisPerformanceDetail: modelRows(payload, season, "Chassis_Performance_Detail"),
    raceWeekendDataStatus: modelRows(payload, season, "Race_Weekend_Data_Status"),
    technicalRegulations: modelRows(payload, season, "Technical_Regulations"),
  };
}

export function loadSeasonPackRuntimePayload(payload, options = {}) {
  const validation = options.validate === false
    ? { season: Number(payload?.season), counts: null }
    : validateSeasonPackRuntimePayload(payload, { season: options.season ?? payload?.season });
  const base = loadSeasonPackPayload(payload, { ...options, validate: false });
  if (!versionAtLeast(payload, 0, 8)) return base;

  const season = base.season;
  const carPerformanceModels = modelRows(payload, season, "Car_Performance_Model");
  const chassisPerformanceDetails = modelRows(payload, season, "Chassis_Performance_Detail");
  const engineModels = engineModelRows(payload, season);
  const tyreModels = tyreModelRows(payload, season);
  const financeModels = financeModelRows(payload, season);
  const sponsorModels = modelRows(payload, season, "Sponsor_Model");
  const boardObjectives = modelRows(payload, season, "Board_Objectives");
  const teamBalanceProfiles = modelRows(payload, season, "Team_Balance_Profile");
  const externalDriverMarket = modelRows(payload, season, "External_Driver_Market");
  const extendedContext = v08Context(payload, season);

  const snapshot = {
    ...base,
    engines: mergeEngines(base.engines ?? [], engineModels),
    carStats: mergeByTeam(base.carStats ?? [], carPerformanceModels, (row) => ({
      qualifying_pace: row.qualifying_pace,
      race_pace: row.race_pace,
      aero_efficiency: row.aero_efficiency,
      mechanical_grip: row.mechanical_grip,
      straight_line_speed: row.straight_line_speed,
      low_speed_performance: row.low_speed_performance,
      high_speed_performance: row.high_speed_performance,
      tyre_wear_control: row.tyre_wear_control,
      cooling_margin: row.cooling_margin,
      performance_model_reliability: row.reliability,
      development_potential: row.development_potential,
      setup_sensitivity: row.setup_sensitivity,
      performance_variance: row.performance_variance,
      car_concept: row.concept ?? null,
      competitive_tier: row.competitive_tier ?? null,
      model_data_status: row.data_status ?? null,
    })),
    tyres: mergeTyres(base.tyres ?? [], tyreModels),
    teamFinancials: mergeTeamFinancials(base.teamFinancials ?? [], financeModels),
    carPerformanceModels,
    chassisPerformanceDetails,
    engineModels,
    tyreModels,
    financeModels,
    sponsorModels,
    boardObjectives,
    teamBalanceProfiles,
    externalDriverMarket,
    technicalRegulations: extendedContext.technicalRegulations,
    raceWeekendDataStatus: extendedContext.raceWeekendDataStatus,
    seasonPack: {
      ...base.seasonPack,
      counts: validation.counts ?? runtimeCounts(payload, season, base.seasonPack?.counts ?? {}),
      ...extendedContext,
      carPerformanceModels,
      engineModels,
      tyreModels,
      financeModels,
      sponsorModels,
      boardObjectives,
      teamBalanceProfiles,
      externalDriverMarket,
    },
  };

  return deepFreeze(snapshot);
}
