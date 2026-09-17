import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DATABASE_REFERENCE_ONLY_FIELDS } from "../src/data/databaseManagementMaterializer.js";

const ROOT = new URL(
  "../data/database-baselines/v1.2.15-1980-historical-source-enrichment-candidate/",
  import.meta.url,
);
const LATEST_URL = new URL("../data/database-baselines/LATEST_1980_CANDIDATE.json", import.meta.url);

async function json(relative) {
  return JSON.parse(await readFile(new URL(relative, ROOT), "utf8"));
}

async function text(relative) {
  return readFile(new URL(relative, ROOT), "utf8");
}

test("v1.2.15 corrective r3 remains pinned after v1.2.16 integration", async () => {
  const baseline = await json("baseline.json");
  const latest = JSON.parse(await readFile(LATEST_URL, "utf8"));

  assert.equal(baseline.candidateRevision, "historical_source_enrichment_corrective_r3_temporal_opening_audit");
  assert.equal(baseline.canonical, false);
  assert.equal(baseline.promotion.readyForDevelopmentCandidateIntegration, true);
  assert.equal(baseline.promotion.promotedCanonicalInThisRelease, false);
  assert.notEqual(latest.latestCandidate, baseline.databaseVersion);
  assert.equal(latest.latestCandidate, "v1.2.16-1980-canonical-closure-audit-consistency-candidate");
  assert.equal(latest.currentPromotedCanonical, "v1.2.5-1980-technical-source-lock-candidate");
  assert.equal(latest.canonical, false);
});

test("v1.2.15 corrective r3 pins the independently verified external bundle", async () => {
  const checksums = await json("CHECKSUMS.json");

  assert.equal(checksums.receivedBundle.sha256, "ecf96e7d253dd759b6995cdf144202d596a8fd4e87a3b05a7ea2d8895d4b1aa5");
  assert.equal(checksums.verification.status, "PASS_33_OF_33");
  assert.equal(checksums.verification.materializedPromotionEvidence, "PASS_137_OF_137");
  assert.equal(checksums.majorArtifacts.globalSqlite.integrity, "ok");
  assert.equal(checksums.majorArtifacts.season1980Sqlite.integrity, "ok");
  assert.equal(checksums.majorArtifacts.globalSqlite.foreignKeyViolations, 0);
  assert.equal(checksums.majorArtifacts.season1980Sqlite.foreignKeyViolations, 0);
});

test("corrective r3 fixes active-team count and regenerates the current opening-employment audit", async () => {
  const baseline = await json("baseline.json");
  const report = await text("source-pack/REPORT.md");
  const corrective = await text("source-pack/corrective_diff_v1.2.15_r2_to_corrective.csv");

  assert.equal(baseline.season1980Counts.activeTeams, 15);
  assert.equal(baseline.enrichment.openingEmploymentAuditRowsV1215, 66);
  assert.equal(baseline.validation.activeTeamsCount, "PASS_15_OF_15");
  assert.equal(baseline.validation.openingEmploymentAudit, "PASS_66_OF_66_V1215_REGENERATED");
  assert.match(report, /openingEmploymentAudit1980V1215.*66 rows/);
  assert.match(corrective, /V1215-CORR-001.*activeTeams=15/);
  assert.match(corrective, /V1215-CORR-002.*66 rows regenerated/);
});

test("opening availability remains conservative after the temporal gate", async () => {
  const baseline = await json("baseline.json");
  const report = await text("source-pack/REPORT.md");
  const corrective = await text("source-pack/corrective_diff_v1.2.15_r2_to_corrective.csv");

  assert.equal(baseline.enrichment.externalAvailabilityUnverified, 23);
  assert.equal(baseline.enrichment.ordinarySourceSafeFreeDrivers, 0);
  assert.equal(baseline.validation.gabbianiF1SpecificSeeking, "UNVERIFIED_NOT_FREE_DRIVER");
  assert.equal(baseline.validation.temporalOpeningGate, "PASS_7_REVERTED_WITHOUT_RETROACTIVE_AUTHORITY");
  assert.match(corrective, /Beppe Gabbiani.*external_candidate_availability_unverified/);
  assert.match(corrective, /Andrea de Cesaris \/ Chico Serra \/ Manfred Winkelhock \/ Mike Thackwell.*external_candidate_availability_unverified/);
  assert.match(corrective, /Eliseo Salazar \/ Emilio de Villota.*external_candidate_availability_unverified/);
  assert.match(report, /Derek Warwick \/ Stephen South.*before Christmas 1979/);
  assert.match(report, /ordinary source-safe free drivers: \*\*0\*\*/);
});

test("v1.2.15 closes staff/sponsor review queues but remains non-canonical with safe regulation uncertainty", async () => {
  const baseline = await json("baseline.json");
  const readiness = await text("source-pack/canonical_readiness_matrix_v1.2.15.csv");

  assert.equal(baseline.enrichment.staffRoleTeamOpen, 0);
  assert.equal(baseline.enrichment.sponsorOpen, 0);
  assert.equal(baseline.enrichment.regulationsOpenPartial, 4);
  assert.match(readiness, /staff_source_lock,PASS_ROLE_TEAM,0 role\/team review rows open/);
  assert.match(readiness, /sponsors_source_lock,PASS_REVIEW_CLOSED,0 sponsor review rows open/);
  assert.match(readiness, /regulations_source_lock,PARTIAL,4 regulation areas remain open\/partial/);
  assert.match(readiness, /canonical_promotion,NOT_READY/);
});

test("legacy non-versioned staff/sponsor source-lock surfaces stay reference-only in Development", () => {
  assert.ok(DATABASE_REFERENCE_ONLY_FIELDS.includes("staffSourceLock1980"));
  assert.ok(DATABASE_REFERENCE_ONLY_FIELDS.includes("sponsorSourceLock1980"));
});
