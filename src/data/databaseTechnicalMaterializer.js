const COMPONENT_FIELD_BY_ID = Object.freeze({
  chassis: "chassis_spec",
  aero: "aero_spec",
  gearbox: "gearbox_spec",
  suspension: "suspension_spec",
  brakes: "brakes_spec",
  cooling: "cooling_spec",
});

const FACILITY_RUNTIME_ID = Object.freeze({
  wind_tunnel: "windTunnel",
  simulator: "simulator",
  aero_department: "aeroDepartment",
  chassis_shop: "chassisShop",
  manufacturing: "manufacturing",
});

export const TECHNICAL_DATABASE_REFERENCE_FIELDS = Object.freeze([
  "technicalComponentDefinitions",
  "technicalFacilityConceptDefinitions",
  "technicalComponentBaselines",
  "technicalStartingSpecificationSeeds",
  "technicalFacilityBaselines",
  "manufacturingCapacityBaseline",
  "technicalDataPolicy",
  "technicalMaterializerDeltaSpecV124",
  "technicalReadiness1980",
  "technicalSourceManifestV124",
  "technicalSourceLockAudit1980",
  "technicalUnknownFields1980",
  "technicalSuppressedDynamicStateRules",
  "technicalSourceLockPolicy",
  "technicalMaterializerDeltaSpecV125",
  "technicalSourceManifestV125",
  "technicalSourceLockReadiness1980",
]);

export const TECHNICAL_DATABASE_OWNED_SEASON_FIELDS = TECHNICAL_DATABASE_REFERENCE_FIELDS;

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function seasonValue(row) {
  const value = Number(row?.season ?? row?.year ?? row?.season_context);
  return Number.isInteger(value) ? value : null;
}

function rowsForSeason(rows, season, { allowUndated = false } = {}) {
  return (rows ?? []).filter((row) => {
    const value = seasonValue(row);
    return value === season || (allowUndated && value === null);
  }).map((row) => structuredClone(row));
}

function copy(value, fallback = []) {
  if (value === undefined) return structuredClone(fallback);
  return structuredClone(value);
}

function startingSpecificationSeeds(componentBaselines, season) {
  return componentBaselines.map((row) => ({
    spec_seed_id: `startspec-${season}-${row.team_id}-${row.component_id}`,
    season,
    team_id: row.team_id,
    team_name: row.team_name ?? null,
    component_id: row.component_id,
    component_name: row.component_name ?? null,
    starting_specification_role: "fitted_on_both_cars_at_career_creation",
    initial_inventory_units: 0,
    data_status: "historical_start_input",
    source_lock_status: "derived_from_source_locked_carStats",
    save_world_state: false,
    notes: "Materializer may create Save World fitted specs from this seed; spare stock remains zero unless a sourced row later says otherwise.",
  }));
}

export function hasTechnicalDatabaseContext(database) {
  return Boolean(
    database?.technicalComponentBaselineByYear
    || database?.technicalFacilityBaselineByYear
    || database?.manufacturingCapacityBaselineByYear
    || database?.technicalSourceLockAudit1980,
  );
}

export function materializeDatabaseTechnicalBlocks(database, seasonInput) {
  const season = Number(seasonInput);
  if (!Number.isInteger(season)) throw new TypeError("Season year must be an integer.");

  const components = rowsForSeason(database.technicalComponentBaselineByYear, season);
  return {
    technicalComponentDefinitions: copy(database.technicalComponentDefinitions),
    technicalFacilityConceptDefinitions: copy(database.technicalFacilityConceptDefinitions),
    technicalComponentBaselines: components,
    technicalStartingSpecificationSeeds: startingSpecificationSeeds(components, season),
    technicalFacilityBaselines: rowsForSeason(database.technicalFacilityBaselineByYear, season),
    manufacturingCapacityBaseline: rowsForSeason(database.manufacturingCapacityBaselineByYear, season),
    technicalDataPolicy: copy(database.technicalDataPolicy),
    technicalMaterializerDeltaSpecV124: copy(database.technicalMaterializerDeltaSpec),
    technicalReadiness1980: copy(database.technicalReadiness1980),
    technicalSourceManifestV124: copy(database.technicalSourceManifest),
    technicalSourceLockAudit1980: rowsForSeason(database.technicalSourceLockAudit1980, season),
    technicalUnknownFields1980: rowsForSeason(database.technicalUnknownFields1980, season, { allowUndated: true }),
    technicalSuppressedDynamicStateRules: copy(database.technicalSuppressedDynamicStateRules),
    technicalSourceLockPolicy: copy(database.technicalSourceLockPolicy),
    technicalMaterializerDeltaSpecV125: copy(database.technicalMaterializerDeltaSpecV125),
    technicalSourceManifestV125: copy(database.technicalSourceManifestV125),
    technicalSourceLockReadiness1980: copy(database.technicalSourceLockReadiness1980),
  };
}

export function mergeDatabaseTechnicalFields(activeSnapshot, globalSnapshot) {
  const merged = { ...structuredClone(activeSnapshot) };
  for (const field of TECHNICAL_DATABASE_OWNED_SEASON_FIELDS) {
    if (globalSnapshot?.[field] !== undefined) merged[field] = structuredClone(globalSnapshot[field]);
  }
  return merged;
}

export function extractTechnicalReferenceContext(snapshot) {
  const reference = {};
  for (const field of TECHNICAL_DATABASE_REFERENCE_FIELDS) {
    if (!Object.hasOwn(snapshot, field)) continue;
    reference[field] = structuredClone(snapshot[field]);
    delete snapshot[field];
  }
  return reference;
}

function runtimeFacilitySource(row) {
  return row?.source_lock_status === "derived_not_source_locked"
    || String(row?.data_status ?? "").startsWith("derived_gameplay_baseline")
    ? "derived_gameplay_baseline"
    : "historical_start_input";
}

function technicalRowsForTeam(snapshot, field, teamId) {
  return (snapshot?.[field] ?? []).filter((row) => row?.team_id === teamId);
}

function seedByComponent(snapshot, teamId) {
  return new Map(technicalRowsForTeam(snapshot, "technicalStartingSpecificationSeeds", teamId)
    .filter((row) => row?.component_id)
    .map((row) => [row.component_id, row]));
}

function facilityState(snapshot, teamId) {
  const facilities = {};
  for (const row of technicalRowsForTeam(snapshot, "technicalFacilityBaselines", teamId)) {
    const runtimeId = FACILITY_RUNTIME_ID[row.facility_id];
    if (!runtimeId) continue;
    const level = numeric(row.level);
    if (level === null) continue;
    facilities[runtimeId] = {
      id: runtimeId,
      label: row.facility_name ?? row.facility_id,
      level: clamp(level, 0, 10),
      source: runtimeFacilitySource(row),
      sourceField: row.source_field ?? null,
      sourceBaselineId: row.facility_baseline_id ?? null,
      dataStatus: row.data_status ?? null,
      sourceLockStatus: row.source_lock_status ?? null,
      maintenanceCostReference: numeric(row.maintenance_cost_reference),
      maintenanceDeltaAnnual: 0,
    };
  }
  return facilities;
}

function manufacturingBaseline(snapshot, teamId) {
  const row = technicalRowsForTeam(snapshot, "manufacturingCapacityBaseline", teamId)[0];
  if (!row) return null;
  return {
    baselineId: row.manufacturing_baseline_id ?? null,
    manufacturingLevel: numeric(row.manufacturing_level),
    nominalParallelCapacityIndex: numeric(row.nominal_parallel_capacity_index),
    startingInventoryPolicy: row.starting_inventory_policy ?? null,
    emergencyProductionPolicy: row.emergency_production_policy ?? null,
    dataStatus: row.data_status ?? null,
    sourceLockStatus: row.source_lock_status ?? null,
  };
}

export function initializeTechnicalStartingState(snapshot, date = null) {
  const season = Number(snapshot?.season);
  const componentRows = snapshot?.technicalComponentBaselines ?? [];
  if (!Number.isInteger(season) || !componentRows.length) return 0;

  snapshot.technical ??= { teams: {} };
  snapshot.technical.teams ??= {};
  snapshot.carState ??= {};
  let initialized = 0;

  for (const teamRow of snapshot.teams ?? []) {
    const teamId = teamRow?.team_id;
    if (!teamId || snapshot.technical.teams[teamId]) continue;
    const rows = technicalRowsForTeam(snapshot, "technicalComponentBaselines", teamId);
    if (!rows.length) continue;

    const seeds = seedByComponent(snapshot, teamId);
    const baseComponents = {};
    const specs = {};
    const inventory = {};
    const fittedCars = { car1: { components: {} }, car2: { components: {} } };

    for (const row of rows) {
      const component = row.source_field ?? COMPONENT_FIELD_BY_ID[row.component_id];
      const rating = numeric(row.performance_value);
      if (!component || rating === null) continue;
      baseComponents[component] = clamp(rating, 1, 100);

      const seed = seeds.get(row.component_id) ?? null;
      const specId = `initial:${teamId}:${component}`;
      specs[specId] = {
        specId,
        teamId,
        component,
        rating: clamp(rating, 1, 100),
        gain: 0,
        targetSeason: season,
        status: "active",
        source: runtimeFacilitySource(row),
        createdAt: date,
        sourceBaselineId: row.baseline_id ?? null,
        sourceSeedId: seed?.spec_seed_id ?? null,
        dataStatus: row.data_status ?? null,
        sourceLockStatus: row.source_lock_status ?? null,
        reliabilityReference: numeric(row.reliability_reference),
        weightReference: numeric(row.weight_reference),
        costReference: numeric(row.cost_reference),
      };

      const fittedBoth = !seed || seed.starting_specification_role === "fitted_on_both_cars_at_career_creation";
      if (fittedBoth) {
        fittedCars.car1.components[component] = specId;
        fittedCars.car2.components[component] = specId;
      }
      const startingInventory = Math.max(0, Math.floor(numeric(seed?.initial_inventory_units, 0)));
      if (startingInventory > 0) inventory[specId] = { specId, available: startingInventory, source: "database_starting_inventory" };
    }

    const facilities = facilityState(snapshot, teamId);
    const capacity = manufacturingBaseline(snapshot, teamId);
    snapshot.technical.teams[teamId] = {
      teamId,
      initializedAt: date,
      sequence: 0,
      source: "database_technical_starting_baseline",
      baseComponents: structuredClone(baseComponents),
      specs,
      inventory,
      fittedCars,
      designProjects: [],
      manufacturingJobs: [],
      facilities,
      facilityUpgrades: [],
      manufacturingCapacityBaseline: capacity,
    };
    snapshot.carState[teamId] = {
      teamId,
      components: structuredClone(baseComponents),
      initializedAt: date,
      lastUpdated: date,
      source: "database_technical_starting_baseline",
    };
    initialized += 1;
  }

  return initialized;
}
