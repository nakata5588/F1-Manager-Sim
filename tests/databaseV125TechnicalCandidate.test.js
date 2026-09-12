import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  initializeTechnicalStartingState,
  materializeDatabaseTechnicalBlocks,
  mergeDatabaseTechnicalFields,
} from "../src/data/databaseTechnicalMaterializer.js";
import { validateSeasonDatabaseAgainstGlobal } from "../src/data/careerBootstrap.js";
import { createSaveWorld } from "../src/save/createSaveWorld.js";

const BASELINE_URL = new URL(
  "../data/database-baselines/v1.2.5-1980-technical-source-lock-candidate/baseline.json",
  import.meta.url,
);

async function loadBaseline() {
  return JSON.parse(await readFile(BASELINE_URL, "utf8"));
}

function technicalDatabaseFixture() {
  return {
    technicalComponentDefinitions: [
      { component_id: "aero", component_name: "Aero", source_field: "aero_spec" },
      { component_id: "chassis", component_name: "Chassis", source_field: "chassis_spec" },
    ],
    technicalFacilityConceptDefinitions: [
      { facility_id: "simulator", facility_name: "Simulator", source_field: "simulator_level" },
      { facility_id: "manufacturing", facility_name: "Manufacturing", source_field: "manufacturing_level" },
    ],
    technicalComponentBaselineByYear: [
      {
        baseline_id: "techbase-1980-T1-aero",
        season: 1980,
        team_id: "T1",
        team_name: "Technical GP",
        component_id: "aero",
        component_name: "Aero",
        source_field: "aero_spec",
        performance_value: 72,
        reliability_reference: 0.82,
        weight_reference: 590,
        cost_reference: 10000000,
        data_status: "historical_start_input_from_carStats",
        source_lock_status: "source_locked_existing_database_row",
        save_world_state: false,
      },
      {
        baseline_id: "techbase-1980-T1-chassis",
        season: 1980,
        team_id: "T1",
        team_name: "Technical GP",
        component_id: "chassis",
        component_name: "Chassis",
        source_field: "chassis_spec",
        performance_value: 75,
        reliability_reference: 0.82,
        weight_reference: 590,
        cost_reference: 10000000,
        data_status: "historical_start_input_from_carStats",
        source_lock_status: "source_locked_existing_database_row",
        save_world_state: false,
      },
    ],
    technicalFacilityBaselineByYear: [
      {
        facility_baseline_id: "facbase-1980-T1-simulator",
        season: 1980,
        team_id: "T1",
        team_name: "Technical GP",
        facility_id: "simulator",
        facility_name: "Simulator",
        source_field: "absent_in_1980_facilities",
        level: 0,
        maintenance_cost_reference: 1000000,
        data_status: "derived_gameplay_baseline_absent_source_field",
        source_lock_status: "derived_not_source_locked",
        save_world_state: false,
      },
      {
        facility_baseline_id: "facbase-1980-T1-manufacturing",
        season: 1980,
        team_id: "T1",
        team_name: "Technical GP",
        facility_id: "manufacturing",
        facility_name: "Manufacturing",
        source_field: "manufacturing_level",
        level: 6,
        maintenance_cost_reference: 1000000,
        data_status: "historical_start_input_from_facilities",
        source_lock_status: "source_locked_existing_database_row",
        save_world_state: false,
      },
    ],
    manufacturingCapacityBaselineByYear: [{
      manufacturing_baseline_id: "mfgbase-1980-T1",
      season: 1980,
      team_id: "T1",
      team_name: "Technical GP",
      manufacturing_level: 6,
      nominal_parallel_capacity_index: 6,
      starting_inventory_policy: "no_spare_stock_created_at_career_creation",
      emergency_production_policy: "allowed_by_simulation_if_finances_permit",
      data_status: "historical_start_input_from_facilities",
      source_lock_status: "source_locked_existing_database_row",
      save_world_state: false,
    }],
    technicalDataPolicy: [{ policy_id: "TECH-DB-003", scope: "inventory", rule: "zero unless sourced" }],
    technicalMaterializerDeltaSpec: [{ delta_id: "TECH-MAT-001" }],
    technicalReadiness1980: [{ check_id: "TECH-READY-001", status: "PASS" }],
    technicalSourceManifest: [{ source_id: "SRC-V124" }],
    technicalSourceLockAudit1980: [{
      audit_id: "TECH-SL-0001",
      season: 1980,
      surface: "technicalComponentBaselineByYear",
      source_lock_classification: "database_source_locked_starting_input",
    }],
    technicalUnknownFields1980: [{ gap_id: "TECH-UNK-001", season: 1980, field_or_area: "spare_parts_inventory" }],
    technicalSuppressedDynamicStateRules: [{ rule_id: "TECH-SUP-001", area: "inventory" }],
    technicalSourceLockPolicy: [{ policy_id: "TECH-SL-POL-001" }],
    technicalMaterializerDeltaSpecV125: [{ delta_id: "TECH-SL-MAT-001" }],
    technicalSourceManifestV125: [{ source_id: "SRC-V125" }],
    technicalSourceLockReadiness1980: [{ check_id: "TECH-SL-READY-001", status: "PASS" }],
  };
}

function historicalSnapshot() {
  const technical = materializeDatabaseTechnicalBlocks(technicalDatabaseFixture(), 1980);
  return {
    season: 1980,
    databaseVersion: "v1.2.5-1980-technical-source-lock-candidate",
    sourceChecksum: "source-sha",
    teams: [{ team_id: "T1", team_name: "Technical GP" }],
    drivers: [],
    staff: [],
    carStats: [{ year: 1980, team_id: "T1", aero_spec: 10, chassis_spec: 10 }],
    facilities: [{ year: 1980, team_id: "T1", manufacturing_level: 2 }],
    historicalArchive: { throughSeason: 1979 },
    ...technical,
  };
}

test("v1.2.5 cumulative technical candidate is pinned as the promoted canonical baseline", async () => {
  const baseline = await loadBaseline();
  assert.equal(baseline.baselineId, "v1.2.5-1980-technical-source-lock-candidate-2026-09-12");
  assert.equal(baseline.canonical, true);
  assert.equal(baseline.candidateStatus, "PROMOTED_CANONICAL");
  assert.equal(baseline.bundle.appliedSequentially, false);
  assert.equal(baseline.globalDatabase.jsonSha256, "315fdd58ef24b02bc6aeb073876d8fa1966839c134751979d8800393b83a36cd");
  assert.equal(baseline.seasonDatabases["1980"].jsonSha256, "e22b89da311991fad300d873973513cba438ebac38b450e8bf5248f61dfc9303");
  assert.equal(baseline.seasonDatabases["1980"].technicalSourceLockAudit1980, 285);
  assert.equal(baseline.technicalSourceLock.initialSpareInventoryUnits, 0);
  assert.equal(baseline.promotionBlockers.length, 0);
});

test("technical materializer exposes v1.2.5 starting baselines and zero-inventory specification seeds", () => {
  const blocks = materializeDatabaseTechnicalBlocks(technicalDatabaseFixture(), 1980);
  assert.equal(blocks.technicalComponentBaselines.length, 2);
  assert.equal(blocks.technicalStartingSpecificationSeeds.length, 2);
  assert.equal(blocks.technicalStartingSpecificationSeeds.every((row) => row.initial_inventory_units === 0), true);
  assert.equal(blocks.technicalFacilityBaselines.length, 2);
  assert.equal(blocks.manufacturingCapacityBaseline.length, 1);
  assert.equal(blocks.technicalSourceLockAudit1980.length, 1);
  assert.equal(blocks.technicalUnknownFields1980.length, 1);
});

test("database-owned technical blocks replace stale Season Definition copies instead of duplicating them", () => {
  const globalSnapshot = materializeDatabaseTechnicalBlocks(technicalDatabaseFixture(), 1980);
  const activeSnapshot = {
    technicalComponentBaselines: [
      { baseline_id: "stale", team_id: "T1" },
      { baseline_id: "stale", team_id: "T1" },
    ],
    technicalSourceLockAudit1980: [{ audit_id: "stale" }],
    customSeasonState: [{ id: "keep" }],
  };
  const merged = mergeDatabaseTechnicalFields(activeSnapshot, globalSnapshot);
  assert.equal(merged.technicalComponentBaselines.length, 2);
  assert.equal(merged.technicalSourceLockAudit1980[0].audit_id, "TECH-SL-0001");
  assert.deepEqual(merged.customSeasonState, [{ id: "keep" }]);
});

test("Save World is initialized from technical database baselines while source rows remain reference-only", () => {
  const save = createSaveWorld(historicalSnapshot(), {
    seed: "v125-technical-test",
    startDate: "1980-01-01",
    createdAt: "1980-01-01T00:00:00Z",
  });
  const technical = save.world.technical.teams.T1;
  assert.equal(technical.source, "database_technical_starting_baseline");
  assert.equal(technical.baseComponents.aero_spec, 72);
  assert.equal(technical.specs["initial:T1:aero_spec"].rating, 72);
  assert.equal(technical.fittedCars.car1.components.aero_spec, "initial:T1:aero_spec");
  assert.equal(technical.fittedCars.car2.components.aero_spec, "initial:T1:aero_spec");
  assert.deepEqual(technical.inventory, {});
  assert.equal(technical.facilities.simulator.level, 0);
  assert.equal(technical.facilities.simulator.source, "derived_gameplay_baseline");
  assert.equal(technical.facilities.simulator.sourceLockStatus, "derived_not_source_locked");
  assert.equal(technical.facilities.manufacturing.level, 6);
  assert.equal(technical.manufacturingCapacityBaseline.nominalParallelCapacityIndex, 6);
  assert.equal(save.world.carState.T1.components.aero_spec, 72);

  assert.equal(Object.hasOwn(save.world, "technicalComponentBaselines"), false);
  assert.equal(Object.hasOwn(save.world, "technicalSourceLockAudit1980"), false);
  assert.equal(save.reference.databaseContext.technicalComponentBaselines.length, 2);
  assert.equal(save.reference.databaseContext.technicalSourceLockAudit1980.length, 1);
  assert.equal(save.reference.databaseContext.technicalUnknownFields1980[0].field_or_area, "spare_parts_inventory");
});

test("technical initializer is idempotent and never duplicates starting fitted specifications", () => {
  const snapshot = historicalSnapshot();
  const first = initializeTechnicalStartingState(snapshot, "1980-01-01");
  const second = initializeTechnicalStartingState(snapshot, "1980-01-01");
  assert.equal(first, 1);
  assert.equal(second, 0);
  assert.equal(Object.keys(snapshot.technical.teams.T1.specs).length, 2);
});

test("v1.2.5 Global and Season identities remain compatible", () => {
  const global = {
    databaseVersion: "v1.2.5-1980-technical-source-lock-candidate",
    sourceChecksum: "source-sha",
    manifest: {
      databaseVersion: "v1.2.5-1980-technical-source-lock-candidate",
      sourceSha256: "source-sha",
      supportedSeasons: [1980],
      readiness: { "1980": "READY" },
    },
  };
  const payload = {
    format: "f1-manager-sim-season-database",
    schemaVersion: 1,
    season: 1980,
    databaseVersion: "v1.2.5-1980-technical-source-lock-candidate",
    sourceChecksum: "source-sha",
    snapshot: {
      season: 1980,
      databaseVersion: "v1.2.5-1980-technical-source-lock-candidate",
      sourceChecksum: "source-sha",
      historicalArchive: { throughSeason: 1979 },
    },
  };
  const result = validateSeasonDatabaseAgainstGlobal(payload, global);
  assert.equal(result.ok, true);
  assert.equal(result.databaseVersion, "v1.2.5-1980-technical-source-lock-candidate");
});
