import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import { applySeasonPackOverlay } from "../src/data/seasonPackOverlay.js";
import { loadSeasonPackRuntimePayload } from "../src/data/seasonPackRuntime.js";
import { createSaveWorld } from "../src/save/createSaveWorld.js";
import { initializeSimulation } from "../src/sim/timeEngine.js";
import { createCoreWorldSystems } from "../src/sim/systems/coreWorldSystems.js";

const BASE_URL = new URL("../data/season-packs/1980/season-pack-1980.v0.7.json", import.meta.url);
const OVERLAY_URL = new URL("../data/season-packs/1980/season-pack-1980.v0.8.overlay.json.gz", import.meta.url);

async function loadSnapshot() {
  const base = JSON.parse(await readFile(BASE_URL, "utf8"));
  const overlay = JSON.parse(gunzipSync(await readFile(OVERLAY_URL)).toString("utf8"));
  return loadSeasonPackRuntimePayload(applySeasonPackOverlay(base, overlay), {
    sourceChecksum: overlay.sourcePayloadSha256,
  });
}

test("real 1980 v0.8 initializes calibration after mutable car development state", async () => {
  const snapshot = await loadSnapshot();
  const save = createSaveWorld(snapshot, {
    seed: "1980-v08-performance-calibration",
    startDate: "1980-01-01",
  });

  const result = initializeSimulation(save, createCoreWorldSystems({ controlledTeamIds: ["TEAM0001"] }));
  const calibration = save.simulation.systemState["race.performance_calibration"];

  assert.equal(calibration.initialized, true);
  assert.equal(Object.keys(calibration.teams).length, 15);
  assert.equal(Object.keys(save.world.carState).length, 15);
  assert.ok(result.events.some((event) => event.type === "race.performance_calibration_initialized"));

  const williams = calibration.teams.TEAM0001;
  assert.equal(williams.modelStatus, "historical_identity_plus_gameplay_estimate");
  assert.equal(williams.sourceComponents.chassis_spec, 88);
  assert.equal(williams.sourceComponents.aero_spec, 85);

  const before = structuredClone(save.world.carState.TEAM0001.components);
  assert.deepEqual(before, williams.sourceComponents);
  assert.equal(save.world.carPerformanceModels.find((row) => row.team_id === "TEAM0001").race_pace, 92);
  assert.equal(save.world.engines.find((row) => row.engine_id === "eg_0001").power, 80);
  assert.equal(save.world.tyreModels.find((row) => row.supplier_id === "goodyear").wear_resistance, 82);
});
