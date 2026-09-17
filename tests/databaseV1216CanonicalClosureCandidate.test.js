import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL(
  "../data/database-baselines/v1.2.16-1980-canonical-closure-audit-consistency-candidate/",
  import.meta.url,
);
const LATEST_URL = new URL("../data/database-baselines/LATEST_1980_CANDIDATE.json", import.meta.url);

async function json(relative) {
  return JSON.parse(await readFile(new URL(relative, ROOT), "utf8"));
}

async function text(relative) {
  return readFile(new URL(relative, ROOT), "utf8");
}

test("v1.2.16 is latest cumulative 1980 candidate without canonical promotion", async () => {
  const baseline = await json("baseline.json");
  const latest = JSON.parse(await readFile(LATEST_URL, "utf8"));

  assert.equal(baseline.databaseVersion, "v1.2.16-1980-canonical-closure-audit-consistency-candidate");
  assert.equal(baseline.previousDatabaseVersion, "v1.2.15-1980-historical-source-enrichment-candidate");
  assert.equal(baseline.candidateRevision, "canonical_closure_audit_consistency_r1");
  assert.equal(baseline.canonical, false);
  assert.equal(baseline.promotion.readyForDevelopmentCandidateIntegration, true);
  assert.equal(baseline.promotion.readyForCanonicalPromotion, true);
  assert.equal(baseline.promotion.promotedCanonicalInThisRelease, false);
  assert.equal(latest.latestCandidate, baseline.databaseVersion);
  assert.equal(latest.currentPromotedCanonical, "v1.2.5-1980-technical-source-lock-candidate");
  assert.equal(latest.canonical, false);
});

test("v1.2.16 pins the independently verified external bundle", async () => {
  const checksums = await json("CHECKSUMS.json");

  assert.equal(checksums.receivedBundle.sha256, "81866f02b6aa26e89c99af8431061ef956d2fc602cd0d60c09db92d40c179f3b");
  assert.equal(checksums.verification.status, "PASS_22_OF_22");
  assert.equal(checksums.verification.materializedPromotionEvidence, "PASS_46_OF_46");
  assert.equal(checksums.majorArtifacts.globalSqlite.integrity, "ok");
  assert.equal(checksums.majorArtifacts.season1980Sqlite.integrity, "ok");
  assert.equal(checksums.majorArtifacts.globalSqlite.foreignKeyViolations, 0);
  assert.equal(checksums.majorArtifacts.season1980Sqlite.foreignKeyViolations, 0);
});

test("v1.2.16 closes the 1980 opening world without inventing certainty", async () => {
  const baseline = await json("baseline.json");
  const readiness = await text("source-pack/canonical_readiness_matrix_v1.2.16.csv");
  const report = await text("source-pack/REPORT.md");

  assert.equal(baseline.season1980Counts.activeTeams, 15);
  assert.equal(baseline.season1980Counts.staffContracts, 53);
  assert.equal(baseline.season1980Counts.calendarRaces, 14);
  assert.equal(baseline.closure.staffCanonicalBlockers, 0);
  assert.equal(baseline.closure.externalAvailabilityUnverified, 23);
  assert.equal(baseline.closure.ordinarySourceSafeFreeDrivers, 0);
  assert.equal(baseline.closure.regulationCanonicalBlockers, 0);
  assert.equal(baseline.closure.regulationPrimaryTextResearchDebt, 2);
  assert.match(readiness, /external_driver_availability,PASS_SAFE_UNCERTAINTY,23 cases remain explicit research-exhausted unknowns/);
  assert.match(readiness, /canonical_promotion,READY_FOR_SEPARATE_PROMOTION/);
  assert.match(report, /Tony Southgate/);
  assert.match(report, /Alan Rees/);
  assert.match(report, /Peter Warr/);
  assert.match(report, /Steve Nichols/);
  assert.match(report, /RESEARCH_EXHAUSTED_SAFE_UNCERTAINTY/);
});

test("v1.2.16 publication evidence is internally clean", async () => {
  const baseline = await json("baseline.json");
  const evidence = await text("source-pack/promotion_evidence_checks_v1.2.16.csv");

  assert.equal(baseline.validation.materialized, "PASS_46_OF_46");
  assert.equal(baseline.validation.staffClosure, "PASS_57_OF_57");
  assert.equal(baseline.validation.externalAvailabilityUnverified, "PASS_23");
  assert.equal(baseline.validation.ordinarySourceSafeFreeDrivers, "PASS_0");
  assert.doesNotMatch(evidence, /,FAIL,/);
  assert.match(evidence, /SOUTHGATE_ARROWS,PASS/);
  assert.match(evidence, /WARR_MATERIALIZED,PASS/);
  assert.match(evidence, /ORDINARY_FREE_DRIVER_ZERO,PASS/);
  assert.match(evidence, /CANONICAL_READY_NOT_PROMOTED,PASS/);
});
