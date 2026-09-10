import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import { createSaveWorld } from "../src/save/createSaveWorld.js";
import { applySeasonPackOverlay, overlaySourceChecksum } from "../src/data/seasonPackOverlay.js";
import { loadSeasonPackRuntimePayload, validateSeasonPackRuntimePayload } from "../src/data/seasonPackRuntime.js";

const BASE_URL = new URL("../data/season-packs/1980/season-pack-1980.v0.7.json", import.meta.url);
const OVERLAY_URL = new URL("../data/season-packs/1980/season-pack-1980.v0.8.overlay.json.gz", import.meta.url);
const SOURCE_SHA256 = "6c3055674fa16e473c790241555a6837e1cfdc5062e43e2be2edfe5e6d571211";

async function loadV08() {
  const base = JSON.parse(await readFile(BASE_URL, "utf8"));
  const overlayRaw = await readFile(OVERLAY_URL);
  const overlay = JSON.parse(gunzipSync(overlayRaw).toString("utf8"));
  return { base, overlay, payload: applySeasonPackOverlay(base, overlay) };
}

test("1980 v0.8 overlay reproduces the versioned Season Pack without mutating v0.7", async () => {
  const { base, overlay, payload } = await loadV08();

  assert.equal(base.version, "0.7");
  assert.equal(payload.version, "0.8");
  assert.equal(payload.season, 1980);
  assert.equal(overlay.baseVersion, "0.7");
  assert.equal(overlay.targetVersion, "0.8");
  assert.equal(overlaySourceChecksum(overlay), SOURCE_SHA256);
  assert.equal(base.sheets["1980_Car_Performance_Model"], undefined);
  assert.equal(payload.sheets["1980_Car_Performance_Model"].length, 16);
});

test("1980 v0.8 validates its technical, financial and market model coverage", async () => {
  const { payload } = await loadV08();
  const result = validateSeasonPackRuntimePayload(payload, { season: 1980 });

  assert.equal(result.ok, true);
  assert.deepEqual(result.counts, {
    teams: 15,
    drivers: 28,
    driverContracts: 28,
    staff: 60,
    loaderSafeStaff: 51,
    calendarRounds: 14,
    fullEntrants: 46,
    startingRaceEntries: 28,
    roundEntryReference: 383,
    futureEntities: 305,
    carPerformanceModels: 15,
    chassisPerformanceDetails: 24,
    engineModels: 4,
    tyreModels: 2,
    financeModels: 15,
    sponsorModels: 17,
    boardObjectives: 15,
    teamBalanceProfiles: 15,
    externalDriverMarket: 93,
    raceWeekendDataStatus: 14,
    technicalRegulations: 5,
  });
});

test("1980 v0.8 materializes calibration models while keeping estimates labelled as estimates", async () => {
  const { payload } = await loadV08();
  const snapshot = loadSeasonPackRuntimePayload(payload, {
    sourceChecksum: SOURCE_SHA256,
    sourcePath: "season-pack-1980.v0.7.json + season-pack-1980.v0.8.overlay.json.gz",
  });

  assert.equal(snapshot.databaseVersion, "season-pack-0.8");
  assert.equal(snapshot.sourceChecksum, SOURCE_SHA256);
  assert.equal(snapshot.teams.length, 15);
  assert.equal(snapshot.drivers.length, 28);
  assert.equal(snapshot.staff.length, 51);
  assert.equal(snapshot.calendar.length, 14);
  assert.equal(snapshot.startingRaceEntries.length, 28);

  const williamsCar = snapshot.carPerformanceModels.find((row) => row.team_id === "TEAM0001");
  assert.equal(williamsCar.race_pace, 92);
  assert.equal(williamsCar.qualifying_pace, 88);
  assert.equal(williamsCar.data_status, "historical_identity_plus_gameplay_estimate");
  assert.equal(snapshot.carStats.find((row) => row.team_id === "TEAM0001").race_pace, 92);

  const renaultEngine = snapshot.engines.find((row) => row.engine_id === "eg_0004");
  assert.equal(renaultEngine.power, 94);
  assert.equal(renaultEngine.reliability, 68);
  assert.equal(renaultEngine.cooling_demand, 91);
  assert.equal(renaultEngine.gameplay_model_status, "identity_confirmed_gameplay_estimate");

  const michelin = snapshot.tyreModels.find((row) => row.supplier_id === "michelin");
  assert.equal(michelin.dry_peak_grip, 86);
  assert.equal(michelin.wet_performance, 80);

  const williamsFinance = snapshot.financeModels.find((row) => row.team_id === "TEAM0001");
  const williamsFinancialState = snapshot.teamFinancials.find((row) => row.team_id === "TEAM0001");
  assert.equal(williamsFinance.data_status, "gameplay_estimate_not_historical_currency");
  assert.equal(williamsFinance.currency_model, "F1MS_1980_budget_units_millions");
  assert.equal(williamsFinancialState.cash_balance, 3_960_000);
  assert.equal(williamsFinancialState.gameplay_starting_budget, 18_000_000);

  const williamsBoard = snapshot.boardObjectives.find((row) => row.team_id === "TEAM0001");
  assert.equal(williamsBoard.board_primary_objective, "win_constructors_title");
  assert.equal(williamsBoard.source_status, "gameplay_design_estimate");

  assert.equal(snapshot.sponsorModels.length, 17);
  assert.equal(snapshot.sponsorContracts.length, 24);
  assert.equal(snapshot.externalDriverMarket.length, 93);
  assert.ok(snapshot.externalDriverMarket.some((row) => row.driver_name === "Héctor Rebaque" && !row.driver_id));
  assert.equal(snapshot.technicalRegulations.length, 5);
  assert.equal(snapshot.raceWeekendDataStatus.length, 14);
  assert.equal(Object.isFrozen(snapshot), true);
});

test("1980 v0.8 contextual later entrants and external market do not auto-load into the career", async () => {
  const { payload } = await loadV08();
  const snapshot = loadSeasonPackRuntimePayload(payload, { sourceChecksum: SOURCE_SHA256 });
  const save = createSaveWorld(snapshot, { seed: "1980-v08-isolation", startDate: "1980-01-01" });

  const startingDriverIds = new Set(save.world.startingRaceEntries.map((row) => row.driver_id));
  assert.equal(save.world.drivers.length, 28);
  assert.equal(save.world.startingRaceEntries.length, 28);
  assert.equal(startingDriverIds.has("DRV0095"), false, "Nigel Mansell must remain a later-season historical reference");
  assert.equal(startingDriverIds.has("DRV0211"), false, "Rupert Keegan must remain a later-season historical reference");
  assert.equal(startingDriverIds.has("DRV0191"), false, "Mike Thackwell must remain a later-season historical reference");
  assert.equal(startingDriverIds.has("DRVX0001"), true, "David Kennedy is a genuine round-one starter");
  assert.equal(save.world.externalDriverMarket.length, 93);

  const originalName = snapshot.externalDriverMarket[0].driver_name;
  save.world.externalDriverMarket[0].driver_name = "Diverged Save World";
  assert.equal(snapshot.externalDriverMarket[0].driver_name, originalName);
});
