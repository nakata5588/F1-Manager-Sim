import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyCanonicalFactCorrections,
  materializeDatabaseManagementBlocks,
  mergeDatabaseOwnedSeasonFields,
  normalizeSeasonDatabaseSnapshot,
} from "../src/data/databaseManagementMaterializer.js";
import { validateSeasonDatabaseAgainstGlobal } from "../src/data/careerBootstrap.js";
import { createSaveWorld } from "../src/save/createSaveWorld.js";

const BASELINE_URL = new URL(
  "../data/database-baselines/v1.2.2-relationships-source-pack-candidate/baseline.json",
  import.meta.url,
);

async function loadBaseline() {
  return JSON.parse(await readFile(BASELINE_URL, "utf8"));
}

function candidateFixture() {
  return {
    drivers: [
      { driver_id: "d_1", driver_name: "Eligible Driver" },
      { driver_id: "d_2", driver_name: "Scout Driver" },
      { driver_id: "d_3", driver_name: "World Only" },
      { driver_id: "d_4", driver_name: "Hidden Driver" },
    ],
    staff: [{ staff_id: "st_1", staff_name: "Engineer" }],
    teams: [{ team_id: "t_1", team_name: "Team One" }],
    driverMarketProfileByYear: [
      { season: 1980, driver_id: "d_1", driver_name: "Eligible Driver", visibility_state: "f1_eligible", contract_status: "under_contract_current_f1", current_team_id: "t_1" },
      { season: 1980, driver_id: "d_2", driver_name: "Scout Driver", visibility_state: "talent_visible", contract_status: "external_market" },
      { season: 1980, driver_id: "d_3", driver_name: "World Only", visibility_state: "world_visible" },
      { season: 1980, driver_id: "d_4", driver_name: "Hidden Driver", visibility_state: "hidden" },
    ],
    contractTerms: [
      { season: 1980, contract_term_id: "ct_driver", worker_type: "driver", driver_id: "d_1", team_id: "t_1", role: "race_driver", salary_index: 100, salary_source_status: "derived_gameplay_baseline" },
      { season: 1980, contract_term_id: "ct_staff", worker_type: "staff", staff_id: "st_1", team_id: "t_1", role: "engineer", salary_index: 90, salary_source_status: "derived_gameplay_baseline" },
      { season: 1981, contract_term_id: "ct_future", worker_type: "driver", driver_id: "d_2", team_id: "t_1", role: "race_driver" },
    ],
    driverExperienceByYear: [{ season: 1980, driver_id: "d_1", starts_reference: 10 }],
    driverReputationByYear: [{ season: 1980, driver_id: "d_1", reputation_estimate: 70 }],
    initialInboxEventsBySeason: [
      { season: 1980, event_id: "inbox_1980", event_type: "contract_context" },
      { season: 1981, event_id: "inbox_1981", event_type: "contract_context" },
    ],
    scoutingBaselineRules: [{ rule_id: "visibility_boundary" }],
    decisionSupportTemplates: [{ template_id: "decision_1" }],
    driverPersonalityProfileByYear: [{
      season: 1980,
      driver_id: "d_1",
      professionalism: 55,
      data_status: "derived_gameplay_baseline_not_historical_fact",
      source_lock_status: "derived_not_source_locked",
      source_lock_action: "DERIVE",
    }],
    staffPersonalityProfileByYear: [{ season: 1980, staff_id: "st_1", data_status: "derived_gameplay_baseline_not_historical_fact" }],
    entityRelationshipSeeds: [{ season: 1980, relationship_id: "rel_1", entity_a_id: "d_1", entity_b_id: "st_1" }],
    relationshipSourcePack1980: [{
      season: 1980,
      fact_id: "relfact_hidden",
      source_lock_status: "historical_reference_hidden_for_1980_start",
      storage_decision: "KEEP_AS_HIDDEN_REFERENCE",
    }],
    sourceLockedFactRegister: [
      { season: 1980, fact_id: "fact_correct", related_entities: "d_old;t_1", start_1980_policy: "active_start_context" },
      { season: 1980, fact_id: "fact_future", related_entities: "d_2;t_1", start_1980_policy: "future_outcome_suppressed" },
    ],
    canonicalIdCorrectionsV122: [{ fact_id: "fact_correct", old_related_entities: "d_old;t_1", corrected_related_entities: "d_1;t_1" }],
    peopleDataPolicy: [{ policy_id: "derived_is_not_fact" }],
    peopleReadiness1980: { status: "READY" },
    sourceManifestV122: [{ source_id: "src_1" }],
  };
}

function seasonPayload(sourceChecksum = "source-sha") {
  return {
    format: "f1-manager-sim-season-database",
    schemaVersion: 1,
    season: 1980,
    databaseVersion: "v1.2.2-relationships-source-pack-candidate",
    sourceChecksum,
    snapshot: {
      season: 1980,
      databaseVersion: "v1.2.2-relationships-source-pack-candidate",
      sourceChecksum,
      historicalArchive: { throughSeason: 1979 },
    },
  };
}

function globalIdentityFixture() {
  return {
    databaseVersion: "v1.2.2-relationships-source-pack-candidate",
    manifest: {
      databaseVersion: "stale-embedded-release-id",
      sourceSha256: "source-sha",
      supportedSeasons: [1980],
      readiness: { "1980": "READY" },
    },
  };
}

test("v1.2.2 candidate is pinned but deliberately not promoted canonical", async () => {
  const baseline = await loadBaseline();
  assert.equal(baseline.baselineId, "v1.2.2-relationships-source-pack-candidate-2026-09-12");
  assert.equal(baseline.canonical, false);
  assert.equal(baseline.candidateStatus, "VALIDATED_WITH_PROMOTION_BLOCKERS");
  assert.equal(baseline.globalDatabase.jsonSha256, "79d85678db968243c6b34fd9e1d0109ab7fee4b25b0d8f03f5802692e0ea5895");
  assert.equal(baseline.seasonDatabases["1980"].jsonSha256, "3a0147451b6f31ee45af72b1e4413a397ee9ae0541fac7b8bbbd09a0691e989f");
  assert.equal(baseline.seasonDatabases["1980"].seasonRecruitmentPool, 66);
  assert.equal(baseline.seasonDatabases["1980"].contractNegotiationBaseline, 79);
  assert.equal(baseline.seasonDatabases["1980"].initialInboxEvents, 90);
  assert.equal(baseline.promotionBlockers.length, 3);
});

test("management materializer exposes only talent-visible or F1-eligible recruitment rows", () => {
  const blocks = materializeDatabaseManagementBlocks(candidateFixture(), 1980, {
    teams: [{ team_id: "t_1" }],
    staff: [{ staff_id: "st_1" }],
  });
  assert.deepEqual(blocks.seasonRecruitmentPool.map((row) => row.entity_id), ["d_1", "d_2"]);
  assert.equal(blocks.contractNegotiationBaseline.length, 2);
  assert.deepEqual(blocks.initialInboxEvents.map((row) => row.event_id), ["inbox_1980"]);
  assert.equal(blocks.driverPersonalityProfiles[0].data_status, "derived_gameplay_baseline_not_historical_fact");
  assert.equal(blocks.driverPersonalityProfiles[0].source_lock_status, "derived_not_source_locked");
});

test("source-lock correction is applied and suppressed future outcomes never become active-start facts", () => {
  const database = candidateFixture();
  const corrected = applyCanonicalFactCorrections(database.sourceLockedFactRegister, database.canonicalIdCorrectionsV122);
  assert.equal(corrected[0].related_entities, "d_1;t_1");

  const blocks = materializeDatabaseManagementBlocks(database, 1980, {
    teams: [{ team_id: "t_1" }],
    staff: [{ staff_id: "st_1" }],
  });
  assert.deepEqual(blocks.activeStartSourceLockedFacts.map((row) => row.fact_id), ["fact_correct"]);
  assert.equal(blocks.activeStartSourceLockedFacts[0].related_entities, "d_1;t_1");
});

test("database-owned management blocks replace pre-materialized copies instead of being duplicated", () => {
  const globalSnapshot = {
    seasonRecruitmentPool: [{ entity_id: "d_1" }, { entity_id: "d_2" }],
    initialInboxEvents: [{ event_id: "canonical" }],
  };
  const activeSnapshot = {
    seasonRecruitmentPool: [{ entity_id: "d_1" }, { entity_id: "d_1" }],
    initialInboxEvents: [{ event_id: "stale" }],
    customSeasonPackState: [{ id: "keep" }],
  };
  const merged = mergeDatabaseOwnedSeasonFields(activeSnapshot, globalSnapshot);
  assert.deepEqual(merged.seasonRecruitmentPool.map((row) => row.entity_id), ["d_1", "d_2"]);
  assert.deepEqual(merged.initialInboxEvents.map((row) => row.event_id), ["canonical"]);
  assert.deepEqual(merged.customSeasonPackState, [{ id: "keep" }]);
});

test("pre-materialized Season Definition fact rows are repaired during load normalization", () => {
  const normalized = normalizeSeasonDatabaseSnapshot({
    activeStartSourceLockedFacts: [{ fact_id: "fact_1", related_entities: "old" }],
    canonicalIdCorrectionsV122: [{ fact_id: "fact_1", old_related_entities: "old", corrected_related_entities: "new" }],
  });
  assert.equal(normalized.activeStartSourceLockedFacts[0].related_entities, "new");
});

test("historical_reference_hidden and source-lock audit packs stay outside mutable Save World", () => {
  const snapshot = {
    season: 1980,
    databaseVersion: "v1.2.2-relationships-source-pack-candidate",
    sourceChecksum: "source-sha",
    historicalArchive: { throughSeason: 1979 },
    relationshipSourcePack1980: [{
      fact_id: "late_1980_reference",
      source_lock_status: "historical_reference_hidden_for_1980_start",
      storage_decision: "KEEP_AS_HIDDEN_REFERENCE",
    }],
    sourceManifestV122: [{ source_id: "source" }],
    driverPersonalityProfiles: [{
      driver_id: "d_1",
      data_status: "derived_gameplay_baseline_not_historical_fact",
      source_lock_status: "derived_not_source_locked",
    }],
  };
  const save = createSaveWorld(snapshot, { createdAt: "1980-01-01T00:00:00Z" });
  assert.equal(Object.hasOwn(save.world, "relationshipSourcePack1980"), false);
  assert.equal(Object.hasOwn(save.world, "sourceManifestV122"), false);
  assert.equal(save.reference.databaseContext.relationshipSourcePack1980[0].storage_decision, "KEEP_AS_HIDDEN_REFERENCE");
  assert.equal(save.world.driverPersonalityProfiles[0].source_lock_status, "derived_not_source_locked");
});

test("candidate compatibility accepts explicit release identity but still rejects an unexplained Season checksum", () => {
  const global = globalIdentityFixture();
  assert.throws(
    () => validateSeasonDatabaseAgainstGlobal(seasonPayload("unexplained-season-sha"), global),
    /sourceChecksum|source identity/,
  );
  const result = validateSeasonDatabaseAgainstGlobal(seasonPayload("source-sha"), global);
  assert.equal(result.ok, true);
  assert.equal(result.databaseVersion, "v1.2.2-relationships-source-pack-candidate");
});
