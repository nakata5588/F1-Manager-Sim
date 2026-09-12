import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  materializeDatabaseManagementBlocks,
  normalizeSeasonDatabaseSnapshot,
} from "../src/data/databaseManagementMaterializer.js";
import { validateSeasonDatabaseAgainstGlobal } from "../src/data/careerBootstrap.js";
import { createSaveWorld } from "../src/save/createSaveWorld.js";

const BASELINE_URL = new URL(
  "../data/database-baselines/v1.2.3-canonical-candidate/baseline.json",
  import.meta.url,
);

async function loadBaseline() {
  return JSON.parse(await readFile(BASELINE_URL, "utf8"));
}

function globalFixture() {
  return {
    databaseVersion: "v1.2.3-canonical-candidate",
    manifest: {
      databaseVersion: "v1.2.3-canonical-candidate",
      releaseName: "F1_Manager_Sim_Global_Database_v1.2.3_canonical_candidate",
      releaseVersion: "1.2.3-canonical-candidate",
      sourceSha256: "source-sha",
      supportedSeasons: [1980],
      readiness: { "1980": "READY" },
    },
  };
}

function seasonPayload(sourceChecksum = "source-sha") {
  return {
    format: "f1-manager-sim-season-database",
    schemaVersion: 1,
    releaseName: "F1_Manager_Sim_SeasonDefinition_1980_v1.2.3_canonical_candidate",
    season: 1980,
    databaseVersion: "v1.2.3-canonical-candidate",
    sourceChecksum,
    snapshot: {
      season: 1980,
      databaseVersion: "v1.2.3-canonical-candidate",
      sourceChecksum,
      historicalArchive: { throughSeason: 1979 },
      futureStructure: { policy: "hidden_structural_reference_only_no_future_results", calendars: {} },
    },
  };
}

test("v1.2.3 candidate is promoted as the canonical database baseline", async () => {
  const baseline = await loadBaseline();
  const season = baseline.seasonDatabases["1980"];

  assert.equal(baseline.baselineId, "v1.2.3-canonical-candidate-2026-09-12");
  assert.equal(baseline.canonical, true);
  assert.equal(baseline.candidateStatus, "CANONICAL_CANDIDATE");
  assert.equal(baseline.promotionBlockers.length, 0);
  assert.equal(baseline.globalDatabase.databaseVersion, "v1.2.3-canonical-candidate");
  assert.equal(baseline.globalDatabase.manifestDatabaseVersion, baseline.globalDatabase.databaseVersion);
  assert.equal(season.databaseVersion, baseline.globalDatabase.databaseVersion);
  assert.equal(season.sourceChecksum, baseline.globalDatabase.sourceSha256);
  assert.equal(baseline.globalDatabase.jsonSha256, "e247978c04d3ed88d1ade9e354892666e1f24bbfcc3e39e34fc4444e91c3d95f");
  assert.equal(season.jsonSha256, "136d662040427f9ce1e12597c6b52fd11985c2c34e0e40a4ce2d088103ce75d5");
  assert.equal(season.activeTeams, 15);
  assert.equal(season.activeDrivers, 50);
  assert.equal(season.activeStaff, 55);
  assert.equal(season.calendarRaces, 14);
  assert.equal(season.seasonRecruitmentPool, 66);
  assert.equal(season.contractNegotiationBaseline, 79);
  assert.equal(season.initialInboxEvents, 90);
  assert.deepEqual(baseline.resolvedFromV122.map((row) => row.status), ["FIXED", "FIXED", "FIXED"]);
});

test("canonical v1.2.3 Season Database validates against its synchronized Global identity", () => {
  const result = validateSeasonDatabaseAgainstGlobal(seasonPayload(), globalFixture());
  assert.equal(result.ok, true);
  assert.equal(result.databaseVersion, "v1.2.3-canonical-candidate");
  assert.equal(result.sourceChecksum, "source-sha");

  assert.throws(
    () => validateSeasonDatabaseAgainstGlobal(seasonPayload("wrong-source"), globalFixture()),
    /sourceChecksum|source identity/,
  );
});

test("v1.2.3 canonical fact corrections are preferred without requiring the legacy V122 copy", () => {
  const snapshot = normalizeSeasonDatabaseSnapshot({
    activeStartSourceLockedFacts: [{ fact_id: "fact_1", related_entities: "old" }],
    canonicalIdCorrectionsV123: [{
      fact_id: "fact_1",
      old_related_entities: "old",
      corrected_related_entities: "new",
      applied_in_database_version: "v1.2.3-canonical-candidate",
    }],
  });

  assert.equal(snapshot.activeStartSourceLockedFacts[0].related_entities, "new");
  assert.equal(snapshot.activeStartSourceLockedFacts[0].source_lock_revision, "v1.2.3-canonical-candidate");
});

test("v1.2.3 audit packs materialize but remain reference-only in Save World", () => {
  const database = {
    drivers: [{ driver_id: "d_1", driver_name: "Driver" }],
    staff: [{ staff_id: "st_1", staff_name: "Engineer" }],
    teams: [{ team_id: "t_1", team_name: "Team" }],
    driverMarketProfileByYear: [{ season: 1980, driver_id: "d_1", visibility_state: "f1_eligible" }],
    contractTerms: [],
    driverExperienceByYear: [],
    driverReputationByYear: [],
    initialInboxEventsBySeason: [],
    scoutingBaselineRules: [],
    decisionSupportTemplates: [],
    driverPersonalityProfileByYear: [],
    staffPersonalityProfileByYear: [],
    entityRelationshipSeeds: [],
    sourceLockedFactRegister: [{ season: 1980, fact_id: "fact_1", related_entities: "old", start_1980_policy: "active_start_context" }],
    canonicalIdCorrectionsV123: [{ fact_id: "fact_1", old_related_entities: "old", corrected_related_entities: "new" }],
    sourceManifestV123: [{ source_id: "src_1" }],
    phase33DatabaseReadinessMatrixV123: [{ area: "people", status: "READY" }],
    relationshipsMaterializerDeltaSpecV123: [{ delta_id: "delta_1" }],
    historicalResearchBacklog1980V123: [{ item_id: "research_1" }],
  };

  const blocks = materializeDatabaseManagementBlocks(database, 1980, {
    staff: [{ staff_id: "st_1" }],
    teams: [{ team_id: "t_1" }],
  });

  assert.equal(blocks.activeStartSourceLockedFacts[0].related_entities, "new");
  assert.deepEqual(blocks.sourceManifestV123, [{ source_id: "src_1" }]);
  assert.deepEqual(blocks.phase33DatabaseReadinessMatrixV123, [{ area: "people", status: "READY" }]);

  const save = createSaveWorld({
    season: 1980,
    databaseVersion: "v1.2.3-canonical-candidate",
    sourceChecksum: "source-sha",
    historicalArchive: { throughSeason: 1979 },
    futureStructure: { calendars: {} },
    ...blocks,
  }, { createdAt: "1980-01-01T00:00:00Z" });

  for (const field of [
    "sourceManifestV123",
    "canonicalIdCorrectionsV123",
    "phase33DatabaseReadinessMatrixV123",
    "relationshipsMaterializerDeltaSpecV123",
    "historicalResearchBacklog1980V123",
  ]) {
    assert.equal(Object.hasOwn(save.world, field), false, `${field} must not enter mutable world state`);
    assert.equal(Object.hasOwn(save.reference.databaseContext, field), true, `${field} must remain auditable reference context`);
  }
});
