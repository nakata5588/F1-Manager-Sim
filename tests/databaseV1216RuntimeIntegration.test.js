import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { applyDatabaseOpeningState } from "../src/data/databaseOpeningState.js";
import { createSaveWorld } from "../src/save/createSaveWorld.js";
import { applyOpeningDriverAvailability } from "../src/sim/systems/openingAvailabilityGuard.js";

const BASELINE_URL = new URL(
  "../data/database-baselines/v1.2.16-1980-canonical-closure-audit-consistency-candidate/baseline.json",
  import.meta.url,
);
const LATEST_URL = new URL("../data/database-baselines/LATEST_1980_CANDIDATE.json", import.meta.url);

function openingSnapshot() {
  return {
    season: 1980,
    databaseVersion: "v1.2.16-1980-canonical-closure-audit-consistency-candidate",
    sourceChecksum: "source-lineage",
    historicalArchive: { throughSeason: 1979 },
    teams: [{ team_id: "t_0007", team_name: "Arrows" }],
    drivers: [
      { driver_id: "senna", driver_name: "Ayrton Senna" },
      { driver_id: "gabbiani", driver_name: "Beppe Gabbiani" },
      { driver_id: "explicit-free", driver_name: "Synthetic Free Driver" },
    ],
    staff: [],
    contracts: [],
    staffContracts: [],
    tracks: [{
      track_id: "tr_0028",
      track_name: "Autódromo José Carlos Pace",
      lap_length_km: 4.309,
      laps_default: 71,
      layout_year: 1990,
      track_evolution_rate: null,
      rubbering_rate: null,
    }],
    calendar: [{ year: 1980, round: 2, gp_id: "gp_146", track_id: "tr_0028", race_date: "1980-01-27" }],
    teamFinancials: [],
    teamFinanceBaseline1980: [{
      season: 1980,
      team_id: "t_0007",
      opening_budget_index: 10000000,
      opening_income_index: 10000000,
      opening_expense_index: 1250000,
      currency_mode: "abstract_index",
      source_lock_status: "derived_not_source_locked",
      data_status: "legacy_gameplay_finance_baseline",
    }],
    circuitLayoutBaseline1980: [{
      season: 1980,
      round: 2,
      gp_id: "gp_146",
      track_id: "tr_0028",
      period_correct_track_name: "Interlagos / Autódromo José Carlos Pace",
      layout_lap_length_km: 7.874,
      scheduled_laps: 40,
      scheduled_distance_km: 314.952,
      layout_year_reference: 1980,
      layout_data_status: "historical_1980_event_geometry",
      power_sensitivity_index: 82,
      aero_sensitivity_index: 85,
      tyre_wear_index: 84,
    }],
    trackEvolutionBaseline1980: [{
      season: 1980,
      round: 2,
      gp_id: "gp_146",
      track_id: "tr_0028",
      rubbering_rate_index: 58,
      green_track_penalty_index: 11,
      qualifying_evolution_effect_index: 36,
      race_grip_stability_index: 83,
      offline_marble_risk_index: 63,
      source_lock_status: "derived_gameplay_baseline",
    }],
    weatherProfileBaseline1980: [{
      season: 1980,
      round: 2,
      gp_id: "gp_146",
      track_id: "tr_0028",
      weather_profile_id: "weather_1980_r02_tr_0028",
      climate_band: "summer_warm_variable",
      avg_air_temp_c_baseline: 25,
      rain_chance_percent_baseline: 28,
      storm_chance_percent_baseline: 5,
      wind_profile_baseline: "standard",
      source_lock_status: "derived_gameplay_baseline",
      exact_1980_weekend_weather_known: false,
    }],
    driverAvailabilitySnapshot1980: [
      { season: 1980, driver_id: "senna", talent_visible: true, f1_eligible: false, employment_status: "scoutable_talent_not_free_driver", free_driver_1980: false },
      { season: 1980, driver_id: "gabbiani", talent_visible: true, f1_eligible: true, employment_status: "external_candidate_availability_unverified", free_driver_1980: false },
      { season: 1980, driver_id: "explicit-free", talent_visible: true, f1_eligible: true, employment_status: "available", free_driver_1980: true },
    ],
    canonicalReadinessMatrix1980V1216: [{ area: "staff", status: "PASS" }],
    auditSupersessionRegistryV1216: [{ surface: "legacy", status: "SUPERSEDED" }],
    operationalRegulationFallbacks1980V1216: [{ area: "classification", status: "operational" }],
  };
}

test("v1.2.16 is the latest integrated 1980 candidate but is not silently promoted canonical", async () => {
  const baseline = JSON.parse(await readFile(BASELINE_URL, "utf8"));
  const latest = JSON.parse(await readFile(LATEST_URL, "utf8"));
  assert.equal(latest.latestCandidate, baseline.databaseVersion);
  assert.equal(baseline.season1980Counts.staffContracts, 53);
  assert.equal(baseline.closure.externalAvailabilityUnverified, 23);
  assert.equal(baseline.closure.ordinarySourceSafeFreeDrivers, 0);
  assert.equal(baseline.promotion.readyForCanonicalPromotion, true);
  assert.equal(latest.canonical, false);
  assert.equal(latest.currentPromotedCanonical, "v1.2.5-1980-technical-source-lock-candidate");
});

test("database opening state materializes finance, 1980 circuit geometry and track/weather baselines", () => {
  const snapshot = openingSnapshot();
  const original = structuredClone(snapshot);
  const result = applyDatabaseOpeningState(snapshot);

  assert.equal(result.financeTeams, 1);
  assert.equal(snapshot.teamFinancials[0].cash_balance, 10000000);
  assert.equal(snapshot.teamFinancials[0].currency_mode, "abstract_index");
  assert.equal(snapshot.tracks[0].lap_length_km, 7.874);
  assert.equal(snapshot.tracks[0].laps_default, 40);
  assert.equal(snapshot.tracks[0].season_layout_year, 1980);
  assert.equal(snapshot.tracks[0].rubbering_rate, 58);
  assert.equal(snapshot.tracks[0].track_evolution_rate, 58);
  assert.equal(snapshot.calendar[0].scheduled_laps, 40);
  assert.equal(snapshot.calendar[0].weather_probability_baseline.rainChancePercent, 28);
  assert.equal(original.tracks[0].lap_length_km, 4.309);
  assert.equal(original.teamFinancials.length, 0);
});

test("source-locked opening availability prevents uncertain and scout-only drivers becoming free agents", () => {
  const save = createSaveWorld(openingSnapshot(), { startDate: "1980-01-13", seed: "v1216-market" });
  save.world.employment = {
    drivers: {},
    staff: {},
    futureAssignments: { drivers: {}, staff: {} },
    freeAgents: { drivers: ["senna", "gabbiani", "explicit-free"], staff: [] },
    vacancies: [],
  };
  save.world.careerState = {
    drivers: {
      senna: { status: "available" },
      gabbiani: { status: "available" },
      "explicit-free": { status: "available" },
    },
    staff: {},
  };

  const result = applyOpeningDriverAvailability(save);
  assert.equal(result.applied, true);
  assert.deepEqual(save.world.employment.freeAgents.drivers, ["explicit-free"]);
  assert.equal(save.world.careerState.drivers.senna.status, "talent");
  assert.equal(save.world.careerState.drivers.gabbiani.status, "external");
});

test("legacy databases without an opening availability surface retain generic market behaviour", () => {
  const save = { clock: { season: 1980 }, world: { employment: { freeAgents: { drivers: ["legacy"], staff: [] } } } };
  const result = applyOpeningDriverAvailability(save);
  assert.equal(result.applied, false);
  assert.deepEqual(save.world.employment.freeAgents.drivers, ["legacy"]);
});

test("v1.2.16 audit/readiness surfaces are quarantined from mutable Save World while operational baselines remain", () => {
  const save = createSaveWorld(openingSnapshot(), { startDate: "1980-01-13" });
  assert.equal(Object.hasOwn(save.world, "canonicalReadinessMatrix1980V1216"), false);
  assert.equal(Object.hasOwn(save.world, "auditSupersessionRegistryV1216"), false);
  assert.ok(save.reference.databaseContext.canonicalReadinessMatrix1980V1216);
  assert.ok(save.reference.databaseContext.auditSupersessionRegistryV1216);
  assert.ok(Array.isArray(save.world.driverAvailabilitySnapshot1980));
  assert.ok(Array.isArray(save.world.operationalRegulationFallbacks1980V1216));
  assert.equal(save.meta.databaseOpeningState.circuitLayouts, 1);
});
