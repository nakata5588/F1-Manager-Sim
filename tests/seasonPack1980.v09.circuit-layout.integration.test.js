import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import { applySeasonPackOverlay } from "../src/data/seasonPackOverlay.js";
import { loadSeasonPackRuntimePayload, validateSeasonPackRuntimePayload } from "../src/data/seasonPackRuntime.js";
import { createSaveWorld } from "../src/save/createSaveWorld.js";
import { resolveCircuitGeometry } from "../src/sim/circuitGeometry.js";

const BASE_URL = new URL("../data/season-packs/1980/season-pack-1980.v0.7.json", import.meta.url);
const V08_URL = new URL("../data/season-packs/1980/season-pack-1980.v0.8.overlay.json.gz", import.meta.url);
const V09_URL = new URL("../data/season-packs/1980/season-pack-1980.v0.9.circuit-layout.overlay.json", import.meta.url);

async function loadV09() {
  const base = JSON.parse(await readFile(BASE_URL, "utf8"));
  const v08 = JSON.parse(gunzipSync(await readFile(V08_URL)).toString("utf8"));
  const v09 = JSON.parse(await readFile(V09_URL, "utf8"));
  const payload08 = applySeasonPackOverlay(base, v08);
  const payload09 = applySeasonPackOverlay(payload08, v09);
  return { base, v08, v09, payload: payload09 };
}

test("1980 v0.9 circuit overlay composes after v0.8 without duplicating the Season Pack", async () => {
  const { base, v08, v09, payload } = await loadV09();

  assert.equal(base.version, "0.7");
  assert.equal(v08.targetVersion, "0.8");
  assert.equal(v09.baseVersion, "0.8");
  assert.equal(v09.targetVersion, "0.9");
  assert.equal(payload.version, "0.9");
  assert.equal(payload.sheets["1980_Car_Performance_Model"].length, 16, "v0.8 systems remain present");
  assert.equal(payload.sheets["1980_Circuit_Layout_Registry"].length, 15);
  assert.equal(payload.sheets["1980_Circuit_Layout_Assignments"].length, 15);
  assert.equal(payload.sheets["1980_Circuit_Layout_Geometry"].length, 15);
});

test("1980 v0.9 validates and materializes stable layout IDs with Season Pack aliases", async () => {
  const { payload } = await loadV09();
  const validation = validateSeasonPackRuntimePayload(payload, { season: 1980 });
  const snapshot = loadSeasonPackRuntimePayload(payload);

  assert.equal(validation.ok, true);
  assert.equal(snapshot.circuitLayouts.length, 14);
  assert.equal(snapshot.seasonCircuitAssignments.length, 14);
  assert.equal(snapshot.circuitLayoutGeometry.length, 14);

  const longBeachAssignment = snapshot.seasonCircuitAssignments.find((row) => row.round === 4);
  assert.equal(longBeachAssignment.layout_id, "cl_tr_0088_gp_1978");
  assert.equal(longBeachAssignment.track_id, "tr_0088");
  assert.equal(longBeachAssignment.runtime_track_id, "CIR0043");
  assert.equal(longBeachAssignment.runtime_gp_id, "RACE198004");
});

test("1980 v0.9 Save World activates all historical circuit geometry and keeps the source catalog immutable/reference-only", async () => {
  const { payload } = await loadV09();
  const snapshot = loadSeasonPackRuntimePayload(payload);
  const save = createSaveWorld(snapshot, {
    seed: "1980-v09-long-beach",
    startDate: "1980-01-01",
  });

  assert.equal(save.meta.databaseOpeningState.historicalLayoutAssignments, 14);
  assert.equal(save.meta.databaseOpeningState.reviewedCircuitGeometries, 14);

  const longBeach = save.world.tracks.find((row) => row.track_id === "CIR0043");
  assert.ok(longBeach);
  assert.equal(longBeach.layout_id, "cl_tr_0088_gp_1978");
  assert.equal(longBeach.layout_historical_status, "VERIFIED_LAYOUT_IDENTITY");
  assert.equal(longBeach.layout_geometry.dataStatus, "MATCHED_REVIEWED_SCHEMATIC");
  assert.equal(longBeach.layout_geometry.provenance.precision, "schematic_historical_trace");
  assert.ok(longBeach.layout_geometry.provenance.reviewedFor.includes("2d_track_presentation"));
  assert.ok(longBeach.layout_geometry.provenance.notAuthoritativeFor.includes("car_performance"));

  const projected = resolveCircuitGeometry(longBeach);
  assert.equal(projected.available, true);
  assert.equal(projected.lapLengthKm, 3.251);
  assert.ok(projected.startGrid);
  assert.ok(projected.finishLine);
  assert.notEqual(projected.startGrid.pathFraction, projected.finishLine.pathFraction);

  const interlagos = save.world.tracks.find((row) => row.track_id === "CIR0018");
  assert.equal(interlagos.layout_id, "cl_tr_0028_long_1978");
  assert.equal(resolveCircuitGeometry(interlagos).available, true);
  assert.equal(resolveCircuitGeometry(interlagos).lapLengthKm, 7.873);

  const reviewedTracks = save.world.tracks.filter((row) => row.layout_id);
  assert.equal(reviewedTracks.length, 14);
  for (const track of reviewedTracks) {
    const geometry = resolveCircuitGeometry(track);
    assert.equal(geometry.available, true, track.track_id);
    assert.equal(track.layout_geometry.dataStatus, "MATCHED_REVIEWED_SCHEMATIC", track.track_id);
    assert.ok(track.layout_geometry.provenance.notAuthoritativeFor.includes("car_performance"), track.track_id);
    assert.ok(track.layout_geometry.provenance.sourceAuthor, track.track_id);
  }

  assert.equal(save.world.circuitLayouts, undefined);
  assert.equal(save.world.circuitLayoutGeometry, undefined);
  assert.equal(save.world.seasonCircuitAssignments, undefined);
  assert.equal(save.reference.databaseContext.circuitLayouts.length, 14);
  assert.equal(save.reference.databaseContext.circuitLayoutGeometry.length, 14);
  assert.equal(save.reference.databaseContext.seasonCircuitAssignments.length, 14);
});
