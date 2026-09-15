import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL(
  "../data/database-baselines/v1.2.14-1980-canonical-readiness-source-lock-corrective-candidate/",
  import.meta.url,
);
const LATEST_URL = new URL("../data/database-baselines/LATEST_1980_CANDIDATE.json", import.meta.url);

async function json(relative) {
  return JSON.parse(await readFile(new URL(relative, ROOT), "utf8"));
}

async function text(relative) {
  return readFile(new URL(relative, ROOT), "utf8");
}

test("v1.2.14 r3 remains a pinned cumulative 1980 candidate after v1.2.15 integration", async () => {
  const baseline = await json("baseline.json");
  const latest = JSON.parse(await readFile(LATEST_URL, "utf8"));
  assert.equal(baseline.candidateRevision, "final_corrective_freeze_r3");
  assert.equal(baseline.canonical, false);
  assert.equal(baseline.promotionDecision, "READY_FOR_DEVELOPMENT_INTEGRATION_AS_LATEST_CANDIDATE_NOT_CANONICAL");
  assert.notEqual(latest.latestCandidate, baseline.databaseVersion);
  assert.equal(latest.latestCandidate, "v1.2.15-1980-historical-source-enrichment-candidate");
  assert.equal(latest.currentPromotedCanonical, "v1.2.5-1980-technical-source-lock-candidate");
});

test("v1.2.14 r3 pins independently audited external bundle identity", async () => {
  const checksums = await json("CHECKSUMS.json");
  assert.equal(checksums.receivedBundle.sha256, "a7f21e6f5577257e062351dc7a03b215aeaf98f715bff24ec238467aa120f2c6");
  assert.equal(checksums.verification.status, "PASS_43_OF_43");
  assert.equal(checksums.verification.materializedPromotionEvidence, "PASS_80_OF_80");
  assert.equal(checksums.majorArtifacts.globalSqlite.integrity, "ok");
  assert.equal(checksums.majorArtifacts.season1980Sqlite.integrity, "ok");
  assert.equal(checksums.majorArtifacts.globalSqlite.foreignKeyViolations, 0);
  assert.equal(checksums.majorArtifacts.season1980Sqlite.foreignKeyViolations, 0);
});

test("v1.2.14 r3 has no stale semantic-orphan failure and no hard canonical orphans", async () => {
  const baseline = await json("baseline.json");
  const readiness = await text("source-pack/canonical_readiness_matrix_v1.2.14.csv");
  const semantic = await text("source-pack/semantic_reference_integrity_v1.2.14.csv");
  assert.equal(baseline.validation.semanticHardOrphans, "PASS_ZERO");
  assert.match(readiness, /semantic_orphan_references,PASS,Hard canonical reference orphans=0/);
  assert.doesNotMatch(readiness, /FAIL.*879|879.*FAIL/);
  assert.match(semantic, /canonical_reference_fields,PASS,0,17,0,0/);
});

test("Kennedy identity is canonicalized and r3 corrective gates are recorded", async () => {
  const baseline = await json("baseline.json");
  const audit = await text("source-pack/FINAL_AUDIT_R3.md");
  assert.equal(baseline.identityCorrections.d_0862.canonicalDriverId, "d_0225");
  assert.equal(baseline.identityCorrections.d_0862.contractTermCanonicalId, "ct_driver_1980_t_0015_d_0225_0023");
  assert.equal(baseline.identityCorrections.d_0862.careerIntervalCanonicalId, "d_0225_career_interval_1980_context");
  assert.match(audit, /retired duplicate d_0862 only in explicit alias\/audit\/reference fields/);
  assert.match(audit, /opening current-F1 contract cross-surface: 28\/28/);
});

test("opening availability preserves uncertainty and canonical blockers remain explicit", async () => {
  const baseline = await json("baseline.json");
  assert.equal(baseline.driverAvailabilityDistribution1980.external_candidate_availability_unverified, 30);
  assert.equal(baseline.driverAvailabilityDistribution1980.scoutable_talent_not_free_driver, 5);
  assert.equal(baseline.driverAvailabilityDistribution1980.returnable_retired_inactive_not_seeking, 1);
  assert.equal(baseline.historicalSourceCoverage.staff.open, 7);
  assert.equal(baseline.historicalSourceCoverage.sponsors.open, 5);
  assert.equal(baseline.historicalSourceCoverage.regulations.openOrPartial, 5);
});
