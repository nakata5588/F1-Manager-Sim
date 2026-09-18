import assert from "node:assert/strict";
import test from "node:test";

import {
  applyDatabaseOpeningState,
  extractDatabaseAuditReferenceContext,
} from "../src/data/databaseOpeningState.js";
import { resolveCircuitGeometry } from "../src/sim/circuitGeometry.js";

function snapshotWithGeometry(status) {
  return {
    season: 1980,
    tracks: [{ track_id: "tr_test", track_name: "Test Ring", lap_length_km: 4 }],
    calendar: [{ year: 1980, round: 1, gp_id: "gp_test", track_id: "tr_test" }],
    circuitLayouts: [{
      layout_id: "layout_test_1980",
      track_id: "tr_test",
      layout_name: "Test 1980",
      valid_from: 1980,
      valid_to: 1980,
      historical_status: "VERIFIED_LAYOUT_IDENTITY",
    }],
    seasonCircuitAssignments: [{
      season: 1980,
      round: 1,
      gp_id: "gp_test",
      track_id: "tr_test",
      layout_id: "layout_test_1980",
    }],
    circuitLayoutGeometry: [{
      layout_id: "layout_test_1980",
      geometry_status: status,
      historical_status: "VERIFIED_LAYOUT_IDENTITY",
      geometry_source: "test_geometry",
      source_url: "https://example.test/geometry",
      license: "CC0",
      geometry_hash: "test-hash",
      centerline: [[0, 0], [4, 0], [4, 2], [0, 2]],
    }],
  };
}

test("opening state exposes reviewed historical layout geometry to Circuit Geometry", () => {
  const snapshot = snapshotWithGeometry("MATCHED_REVIEWED");
  const opening = applyDatabaseOpeningState(snapshot);

  assert.equal(opening.historicalLayoutAssignments, 1);
  assert.equal(opening.reviewedCircuitGeometries, 1);
  assert.equal(snapshot.tracks[0].layout_id, "layout_test_1980");

  const geometry = resolveCircuitGeometry(snapshot.tracks[0]);
  assert.equal(geometry.available, true);
  assert.equal(geometry.source, "test_geometry");
  assert.equal(geometry.dataStatus, "MATCHED_REVIEWED");
});

test("opening state keeps unreviewed candidate geometry unavailable", () => {
  const snapshot = snapshotWithGeometry("MATCHED_NEEDS_REVIEW");
  const opening = applyDatabaseOpeningState(snapshot);

  assert.equal(opening.historicalLayoutAssignments, 1);
  assert.equal(opening.reviewedCircuitGeometries, 0);
  assert.equal(snapshot.tracks[0].layout_id, "layout_test_1980");
  assert.equal(resolveCircuitGeometry(snapshot.tracks[0]).dataStatus, "geometry_unavailable");
});

test("circuit layout source catalogs are moved out of mutable world after opening state", () => {
  const snapshot = snapshotWithGeometry("MATCHED_REVIEWED");
  applyDatabaseOpeningState(snapshot);
  const reference = extractDatabaseAuditReferenceContext(snapshot);

  assert.equal(reference.circuitLayouts.length, 1);
  assert.equal(reference.circuitLayoutGeometry.length, 1);
  assert.equal(reference.seasonCircuitAssignments.length, 1);
  assert.equal(snapshot.circuitLayouts, undefined);
  assert.equal(snapshot.circuitLayoutGeometry, undefined);
  assert.equal(snapshot.seasonCircuitAssignments, undefined);
  assert.ok(snapshot.tracks[0].layout_geometry, "materialized reviewed geometry must remain in active track state");
});
