import test from "node:test";
import assert from "node:assert/strict";

import {
  pointAtLapFraction,
  resolveCircuitGeometry,
  sectorAtLapFraction,
} from "../src/sim/circuitGeometry.js";

function explicitTrack() {
  return {
    track_id: "TR_TEST",
    track_name: "Test Ring",
    lap_length_km: 4.2,
    overtaking_difficulty: 55,
    incident_risk: 40,
    geometry: {
      source: "test_source_locked_geometry",
      dataStatus: "source_locked_geometry",
      centerline: [
        [0, 0],
        [4, 0],
        [4, 2],
        [0, 2],
        [0, 0],
      ],
      pitLane: [
        [0.5, -0.5],
        [3.5, -0.5],
      ],
      startFinish: { lapFraction: 0 },
      sectors: [
        { id: "S1", name: "Opening Sector", startFraction: 0, endFraction: 0.3 },
        { id: "S2", name: "Middle Sector", startFraction: 0.3, endFraction: 0.7 },
        { id: "S3", name: "Final Sector", startFraction: 0.7, endFraction: 1 },
      ],
      corners: [
        { id: "C1", number: 1, name: "Turn One", lapFraction: 1 / 3 },
        { id: "C2", number: 2, name: "Turn Two", x: 4, y: 2 },
      ],
    },
  };
}

test("circuit geometry normalizes an explicit closed centerline without inventing extra points", () => {
  const geometry = resolveCircuitGeometry(explicitTrack());

  assert.equal(geometry.available, true);
  assert.equal(geometry.trackId, "TR_TEST");
  assert.equal(geometry.trackName, "Test Ring");
  assert.equal(geometry.source, "test_source_locked_geometry");
  assert.equal(geometry.dataStatus, "source_locked_geometry");
  assert.equal(geometry.coordinateSystem, "normalized_unit_box");
  assert.equal(geometry.closed, true);
  assert.equal(geometry.centerline.length, 4, "duplicate closing point must be removed from the canonical centerline");
  assert.equal(geometry.segments.length, 4);
  assert.equal(geometry.lapLengthKm, 4.2);
  assert.equal(geometry.segments.at(-1).endFraction, 1);
});

test("circuit geometry preserves aspect ratio while fitting centerline, pit lane and markers into unit space", () => {
  const geometry = resolveCircuitGeometry(explicitTrack());

  for (const point of [...geometry.centerline, ...geometry.pitLane, ...geometry.corners]) {
    assert.ok(point.x >= 0 && point.x <= 1);
    assert.ok(point.y >= 0 && point.y <= 1);
  }

  const width = Math.max(...geometry.centerline.map((row) => row.x)) - Math.min(...geometry.centerline.map((row) => row.x));
  const height = Math.max(...geometry.centerline.map((row) => row.y)) - Math.min(...geometry.centerline.map((row) => row.y));
  assert.ok(width > height, "the 4:2 source rectangle must not be stretched into a square");
  assert.equal(geometry.pitLane.length, 2);
  assert.equal(geometry.corners.length, 2);
});

test("lap-fraction interpolation is deterministic and wraps around the closed path", () => {
  const geometry = resolveCircuitGeometry(explicitTrack());
  const start = pointAtLapFraction(geometry, 0);
  const wrapped = pointAtLapFraction(geometry, 1);
  const negative = pointAtLapFraction(geometry, -1);

  assert.deepEqual(wrapped, start);
  assert.deepEqual(negative, start);

  const firstCorner = pointAtLapFraction(geometry, 1 / 3);
  assert.ok(firstCorner);
  assert.equal(firstCorner.segmentIndex, 1);
  assert.equal(firstCorner.lapFraction, Number((1 / 3).toFixed(8)));
});

test("explicit geometry sectors resolve by lap fraction", () => {
  const geometry = resolveCircuitGeometry(explicitTrack());

  assert.equal(sectorAtLapFraction(geometry, 0.1).id, "S1");
  assert.equal(sectorAtLapFraction(geometry, 0.5).id, "S2");
  assert.equal(sectorAtLapFraction(geometry, 0.9).id, "S3");
});

test("geometry without explicit sector boundaries reuses the existing sector model only for lap fractions", () => {
  const track = explicitTrack();
  delete track.geometry.sectors;

  const geometry = resolveCircuitGeometry(track);
  assert.equal(geometry.available, true);
  assert.equal(geometry.sectors.length, 3);
  assert.equal(geometry.sectors[0].source, "sector_model_weight");
  assert.equal(geometry.sectors[0].startFraction, 0);
  assert.equal(geometry.sectors.at(-1).endFraction, 1);
});

test("tracks without explicit coordinates report unavailable geometry instead of fabricating a historical map", () => {
  const track = {
    track_id: "tr_0018",
    period_correct_track_name: "Autódromo Municipal Ciudad de Buenos Aires",
    lap_length_km: 5.968,
    overtaking_difficulty: 70,
    incident_risk: 74,
  };
  const before = structuredClone(track);
  const geometry = resolveCircuitGeometry(track);

  assert.equal(geometry.available, false);
  assert.equal(geometry.dataStatus, "geometry_unavailable");
  assert.equal(geometry.reason, "no_explicit_centerline");
  assert.deepEqual(geometry.centerline, []);
  assert.deepEqual(geometry.pitLane, []);
  assert.deepEqual(geometry.corners, []);
  assert.equal(geometry.lapLengthKm, 5.968);
  assert.deepEqual(track, before, "geometry projection must not mutate the track row");
});

test("malformed or degenerate explicit geometry fails closed without producing fake coordinates", () => {
  const tooShort = resolveCircuitGeometry({
    track_id: "BAD1",
    geometry: { centerline: [[0, 0], [1, 0]] },
  });
  assert.equal(tooShort.available, false);
  assert.equal(tooShort.reason, "invalid_centerline");

  const degenerate = resolveCircuitGeometry({
    track_id: "BAD2",
    geometry: { centerline: [[1, 1], [1, 1], [1, 1], [1, 1]] },
  });
  assert.equal(degenerate.available, false);
  assert.equal(degenerate.reason, "degenerate_centerline");
});

test("direct centerline fields are supported for future Season Database geometry payloads", () => {
  const geometry = resolveCircuitGeometry({
    track_id: "TR_DIRECT",
    centerline: JSON.stringify([[0, 0], [3, 0], [2, 2], [0, 1]]),
    geometry_source: "season_database_geometry",
    geometry_data_status: "reviewed",
  });

  assert.equal(geometry.available, true);
  assert.equal(geometry.source, "season_database_geometry");
  assert.equal(geometry.dataStatus, "reviewed");
  assert.equal(geometry.centerline.length, 4);
});
