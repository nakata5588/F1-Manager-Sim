import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import {
  applySeasonPackOverlay,
  createSaveWorld,
  loadSeasonPackRuntimePayload,
  overlaySourceChecksum,
  validateSeasonPackRuntimePayload,
} from "../src/index.js";

const BASE_URL = new URL("../data/season-packs/1980/season-pack-1980.v0.7.json", import.meta.url);
const OVERLAY_URL = new URL("../data/season-packs/1980/season-pack-1980.v0.8.overlay.json.gz", import.meta.url);
const SOURCE_SHA256 = "8dc142e55926cf384c408e128c99946d324a35be679e2292212caee91565573c";

async function loadV08() {
  const base = JSON.parse(await readFile(BASE_URL, "utf8"));
  const overlay = JSON.parse(gunzipSync(await readFile(OVERLAY_URL)).toString("utf8"));
  const payload = applySeasonPackOverlay(base, overlay);
  return { base, overlay, payload };
}

test("1980 v0.8 overlay reproduces the versioned Season Pack without mutating v0.7", async () => {
  const { base, overlay, payload } = await loadV08();
  assert.equal(base.version, "0.7");
  assert.equal(payload.version, "0.8");
  assert.equal(base.sheets["1980_Car_Performance_Model"], undefined);
  assert.ok(Array.isArray(payload.sheets["1980_Car_Performance_Model"]));
  assert.equal(overlay.base.version, "0.7");
  assert.equal(overlay.target.version, "0.8");
  assert.equal(overlaySourceChecksum(overlay), SOURCE_SHA256);
});

test("1980 v0.8 validates its technical, financial and market model coverage", async () => {
  const { payload } = await loadV08();
  const report = validateSeasonPackRuntimePayload(payload);
  assert.equal(report.ok, true, report.issues.join("\n"));
  assert.equal(report.counts.carPerformanceModels, 15);
  assert.equal(report.counts.chassisPerformanceDetails, 24);
  assert.equal(report.counts.engineModels, 4);
  assert.equal(report.counts.tyreModels, 2);
  assert.equal(report.counts.financeModels, 15);
  assert.equal(report.counts.sponsorModels, 17);
  assert.equal(report.counts.boardObjectives, 15);
  assert.equal(report.counts.teamBalanceProfiles, 15);
  assert.equal(report.counts.externalDriverMarket, 93);
});

test("1980 v0.8 materializes calibration models while keeping estimates labelled as estimates", async () => {
  const { payload } = await loadV08();
  const snapshot = loadSeasonPackRuntimePayload(payload, { sourceChecksum: SOURCE_SHA256 });

  assert.equal(snapshot.databaseVersion, "season-pack-0.8");
  assert.equal(snapshot.sourceChecksum, SOURCE_SHA256);
  assert.equal(snapshot.seasonPack.version, "0.8");
  assert.equal(snapshot.carPerformanceModels.length, 15);
  assert.equal(snapshot.chassisPerformanceDetails.length, 24);
  assert.equal(snapshot.engineModels.length, 4);
  assert.equal(snapshot.tyreModels.length, 2);
  assert.equal(snapshot.teamFinanceModels.length, 15);
  assert.equal(snapshot.sponsorModels.length, 17);
  assert.equal(snapshot.sponsorContracts.length, 24);
  assert.equal(snapshot.externalDriverMarket.length, 93);
  assert.ok(snapshot.externalDriverMarket.some((row) => row.driver_name === "Héctor Rebaque" && !row.driver_id));
  assert.equal(snapshot.technicalRegulations.length, 5);
  assert.equal(snapshot.raceWeekendDataStatus.length, 14);
  assert.equal(Object.isFrozen(snapshot), true);
});

test("1980 v0.8 contextual later entrants and external market remain reference-only in the career", async () => {
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

  assert.equal(save.world.externalDriverMarket, undefined, "raw external market context must not be player-facing world state");
  assert.equal(save.reference.hiddenExternalDriverMarket.length, 93);

  const originalName = snapshot.externalDriverMarket[0].driver_name;
  save.reference.hiddenExternalDriverMarket[0].driver_name = "Diverged Save World";
  assert.equal(snapshot.externalDriverMarket[0].driver_name, originalName);
});
