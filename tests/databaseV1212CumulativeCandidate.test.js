import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL(
  "../data/database-baselines/v1.2.12-1980-driver-pathways-availability-historical-enrichment-candidate/",
  import.meta.url,
);
const LATEST_URL = new URL("../data/database-baselines/LATEST_1980_CANDIDATE.json", import.meta.url);

async function json(relative) {
  return JSON.parse(await readFile(new URL(relative, ROOT), "utf8"));
}

async function text(relative) {
  return readFile(new URL(relative, ROOT), "utf8");
}

test("v1.2.12 remains a pinned cumulative 1980 candidate after v1.2.15 integration", async () => {
  const baseline = await json("baseline.json");
  const latest = JSON.parse(await readFile(LATEST_URL, "utf8"));

  assert.equal(baseline.baselineId, "v1.2.12-1980-driver-pathways-availability-historical-enrichment-candidate-2026-09-14");
  assert.equal(baseline.canonical, false);
  assert.equal(baseline.bundle.baseArtifact, "v1.2.11-1980-calendar-circuits-weather-recovery-candidate");
  assert.equal(baseline.validation.cumulativeV1211Preserved, "PASS");
  assert.notEqual(latest.latestCandidate, baseline.globalDatabase.databaseVersion);
  assert.equal(latest.latestCandidate, "v1.2.15-1980-historical-source-enrichment-candidate");
  assert.equal(latest.currentPromotedCanonical, "v1.2.5-1980-technical-source-lock-candidate");
});

test("v1.2.12 pins received bundle and synchronized Global/Season identity", async () => {
  const baseline = await json("baseline.json");
  const checksums = await json("CHECKSUMS.json");

  assert.equal(checksums.verification.status, "PASS_25_OF_25");
  assert.equal(checksums.receivedBundle.sha256, "d8cd3c8ebd4fafcdcd6d820e7c17e4c340d3977dba5b0ae5e5a27b11be5ac080");
  assert.equal(baseline.bundle.embeddedBundleHashMatchesReceived, false);
  assert.equal(baseline.globalDatabase.sourceSha256, baseline.seasonDatabases["1980"].sourceChecksum);
  assert.equal(baseline.globalDatabase.previousDatabaseVersion, "v1.2.11-1980-calendar-circuits-weather-recovery-candidate");
  assert.equal(baseline.seasonDatabases["1980"].previousDatabaseVersion, "v1.2.11-1980-calendar-circuits-weather-recovery-candidate");
});

test("v1.2.12 corrects Senna and Lauda starting availability", async () => {
  const readiness = await text("source-pack/driver_pathway_readiness_1980_v1.2.12.csv");
  const summary = await text("source-pack/summary_cards_v1.2.12.csv");
  const policy = await text("source-pack/driver_pathway_data_policy_v1.2.12.csv");

  assert.match(readiness, /senna_1980_not_free_driver,PASS,Ayrton Senna changed from f1_eligible\/free_driver to talent_visible\/scoutable_talent_not_free_driver/);
  assert.match(readiness, /lauda_1980_not_free_driver,PASS,Niki Lauda changed from free_driver to returnable_retired_inactive_not_seeking/);
  assert.match(summary, /free_drivers_after_v1212,32/);
  assert.match(summary, /talent_visible_not_free_after_v1212,5/);
  assert.match(summary, /inactive_returnable_not_seeking_after_v1212,1/);
  assert.match(policy, /DRVPATH-001,Do not derive free_driver from career_start\/career_end alone/);
  assert.match(policy, /DRVPATH-003,Temporary retirement\/hiatus prevents ordinary free-driver classification/);
});

test("external ratings remain derived gameplay baselines and future outcomes have no authority", async () => {
  const readiness = await text("source-pack/driver_pathway_readiness_1980_v1.2.12.csv");
  const gaps = await text("source-pack/driver_ratings_coverage_gaps_1980_v1.2.12.csv");
  const boundary = await text("source-pack/unknown_fields_and_save_world_boundary_v1.2.12.csv");

  assert.match(readiness, /external_driver_full_rating_rows,PASS,37 derived profiles added/);
  assert.match(gaps, /external_driver_ratings,37,0/);
  assert.match(gaps, /derived gameplay baselines with uncertainty/);
  assert.match(readiness, /no_future_outcome_authority,PASS/);
  assert.match(boundary, /weather_race.*save_world_simulation/);
});

test("v1.2.12 preserves cumulative technical, finance, regulation and calendar layers", async () => {
  const integrity = await text("source-pack/v1212_cumulative_integrity_checks.csv");
  for (const expected of [
    "global_has_technicalComponentBaselineByYear,PASS,90",
    "global_has_financeSourceLockAudit1980,PASS,79",
    "global_has_regulationsSourceManifestV127,PASS,6",
    "global_has_calendarSourceLockAudit1980,PASS,14",
    "season_has_technicalComponentBaselines,PASS,90",
    "season_has_financeSourceLockAudit1980,PASS,79",
    "season_has_regulationsSourceManifestV127,PASS,6",
    "season_has_calendarSourceLockAudit1980,PASS,14",
    "cumulative_v1.2.11_preserved,PASS",
    "no_future_outcome_authority,PASS",
  ]) assert.ok(integrity.includes(expected), expected);
});

test("old migration backlog is reconciled instead of remaining stale", async () => {
  const backlog = await text("source-pack/migration_backlog_review_v1.2.12.csv");
  assert.match(backlog, /DB-001.*DONE/);
  assert.match(backlog, /DB-004.*PARTIALLY_COMPLETE/);
  assert.match(backlog, /DB-009.*PARTIALLY_COMPLETE/);
  assert.match(backlog, /DB-010.*SUPERSEDED/);
});
