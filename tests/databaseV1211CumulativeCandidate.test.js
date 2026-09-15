import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL(
  "../data/database-baselines/v1.2.11-1980-calendar-circuits-weather-recovery-candidate/",
  import.meta.url,
);
const LATEST_URL = new URL("../data/database-baselines/LATEST_1980_CANDIDATE.json", import.meta.url);

async function json(relative) {
  return JSON.parse(await readFile(new URL(relative, ROOT), "utf8"));
}

async function text(relative) {
  return readFile(new URL(relative, ROOT), "utf8");
}

function dataLines(csvText) {
  return csvText.trim().split(/\r?\n/).slice(1).filter(Boolean);
}

test("v1.2.11 remains a pinned cumulative 1980 candidate after a newer candidate is integrated", async () => {
  const baseline = await json("baseline.json");
  const latest = JSON.parse(await readFile(LATEST_URL, "utf8"));

  assert.equal(baseline.baselineId, "v1.2.11-1980-calendar-circuits-weather-recovery-candidate-2026-09-13");
  assert.equal(baseline.canonical, false);
  assert.equal(baseline.integrationStatus, "INTEGRATED_AS_LATEST_1980_CANDIDATE");
  assert.equal(baseline.bundle.cumulative, true);
  assert.equal(baseline.bundle.baseArtifact, "v1.2.10-1980-driver-availability-free-driver-candidate");
  assert.deepEqual(baseline.bundle.doNotIntegrateSeparately, ["v1.2.8"]);
  assert.equal(baseline.bundle.appliedSequentially, false);
  assert.notEqual(latest.latestCandidate, baseline.globalDatabase.databaseVersion);
  assert.equal(latest.latestCandidate, "v1.2.14-1980-canonical-readiness-source-lock-corrective-candidate");
  assert.equal(latest.currentPromotedCanonical, "v1.2.5-1980-technical-source-lock-candidate");
  assert.equal(latest.canonical, false);
});

test("v1.2.11 pins the audited Global and Season identities and hashes", async () => {
  const baseline = await json("baseline.json");
  const checksums = await json("CHECKSUMS.json");

  assert.equal(checksums.checksums.length, 21);
  assert.equal(
    baseline.globalDatabase.jsonSha256,
    "843befe2dc4a0be7684ca3b3a9d84d3241746c315165837ee6d953869500c352",
  );
  assert.equal(
    baseline.seasonDatabases["1980"].jsonSha256,
    "ce2af269291a9c3e150a5773362deba472d67b2f9f626346b5744b147a4ea9d3",
  );
  assert.equal(
    baseline.globalDatabase.sourceSha256,
    baseline.seasonDatabases["1980"].sourceChecksum,
  );
  assert.equal(baseline.validation.bundleChecksums, "PASS_21_OF_21");
  assert.equal(baseline.validation.globalSqliteIntegrity, "PASS");
  assert.equal(baseline.validation.seasonSqliteIntegrity, "PASS");
  assert.equal(baseline.validation.globalSeasonCompatibility, "PASS");
});

test("v1.2.11 cumulative integrity preserves all real layers and recovers v1.2.8 scope", async () => {
  const csv = await text("source-pack/v1211_cumulative_integrity_checks.csv");
  const rows = dataLines(csv);

  assert.equal(rows.length, 10);
  assert.equal(rows.every((row) => row.includes(",PASS,")), true);
  assert.match(csv, /v1\.2\.4 technical data present in Global,PASS/);
  assert.match(csv, /v1\.2\.5 technical source-lock present,PASS/);
  assert.match(csv, /v1\.2\.6 finance\/contracts\/sponsors present,PASS/);
  assert.match(csv, /v1\.2\.7 regulations\/tyres present,PASS/);
  assert.match(csv, /v1\.2\.8 planned scope recovered in v1\.2\.11,PASS/);
  assert.match(csv, /v1\.2\.9 drivers\/ratings\/career present,PASS/);
  assert.match(csv, /v1\.2\.10 free-driver availability present,PASS/);
  assert.match(csv, /Dynamic weather\/race outcome authority not stored as starting fact,PASS,0/);
});

test("1980 Calendar Circuits Weather recovery has complete 14-round coverage", async () => {
  const readiness = await text("source-pack/calendar_circuit_weather_readiness_1980.csv");
  const calendarAudit = await text("source-pack/calendar_source_lock_audit_1980.csv");
  const circuitAudit = await text("source-pack/circuit_source_lock_audit_1980.csv");
  const layouts = await text("source-pack/circuit_layout_baseline_1980.csv");
  const weather = await text("source-pack/weather_profile_baseline_1980.csv");
  const evolution = await text("source-pack/track_evolution_baseline_1980.csv");

  assert.equal(dataLines(readiness).length, 8);
  assert.equal(dataLines(readiness).every((row) => row.endsWith(",PASS")), true);
  assert.equal(dataLines(calendarAudit).length, 14);
  assert.equal(dataLines(circuitAudit).length, 14);
  assert.equal(dataLines(layouts).length, 14);
  assert.equal(dataLines(weather).length, 14);
  assert.equal(dataLines(evolution).length, 14);

  assert.equal(dataLines(calendarAudit).every((row) => row.includes("pre_start_fixture_only_no_result_authority")), true);
  assert.equal(dataLines(weather).every((row) => row.includes("derived_gameplay_baseline")), true);
  assert.equal(dataLines(evolution).every((row) => row.includes("derived_gameplay_baseline")), true);
});

test("weather and track evolution remain simulation baselines rather than scripted outcomes", async () => {
  const policy = await text("source-pack/calendar_circuit_weather_data_policy.csv");
  const unknown = await text("source-pack/calendar_circuit_weather_unknown_fields_1980.csv");
  const weather = await text("source-pack/weather_profile_baseline_1980.csv");
  const evolution = await text("source-pack/track_evolution_baseline_1980.csv");

  assert.match(policy, /Weather profiles are probability baselines, not real session weather\."?,derived_gameplay_baseline,generate_actual_weather/);
  assert.match(policy, /Track grip\/rubbering starts from a model seed and evolves inside each session\.,derived_gameplay_baseline,own_live_track_state/);
  assert.match(unknown, /actual_session_weather_1980,do_not_source_lock/);
  assert.match(unknown, /actual_flags_and_interruptions,reference_only_if_results_archive/);
  assert.equal(dataLines(weather).every((row) => row.includes("seed_weather_probability_not_actual_session_weather")), true);
  assert.equal(dataLines(evolution).every((row) => row.includes("seed_track_state_model_only")), true);
});

test("v1.2.11 keeps Spanish GP 1980 outside the championship calendar by default", async () => {
  const readiness = await text("source-pack/calendar_circuit_weather_readiness_1980.csv");
  assert.match(
    readiness,
    /Spanish GP 1980 championship inclusion,excluded\/reference-only,excluded\/reference-only,PASS/,
  );
});
