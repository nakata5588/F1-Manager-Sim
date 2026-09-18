import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { resolveCircuitGeometry, pointAtLapFraction } from "../src/sim/circuitGeometry.js";
import { liveRaceMapState, renderLiveRaceMap } from "../playtest/live-race-map.js";

function geometry() {
  return resolveCircuitGeometry({
    track_id: "TR_MAP",
    track_name: "Map Test Circuit",
    geometry: {
      source: "test_geometry",
      dataStatus: "reviewed",
      centerline: [[0, 0], [4, 0], [4, 2], [0, 2]],
      startFinish: { centerlineIndex: 0 },
      sectors: [
        { id: "S1", name: "Sector 1", startFraction: 0, endFraction: 1 / 3 },
        { id: "S2", name: "Sector 2", startFraction: 1 / 3, endFraction: 2 / 3 },
        { id: "S3", name: "Sector 3", startFraction: 2 / 3, endFraction: 1 },
      ],
      pitLane: {
        points: [[0.4, -0.3], [3.6, -0.3]],
        entryFraction: 0.82,
        exitFraction: 0.12,
      },
    },
  });
}

function positions(rows, mode = "explicit") {
  return {
    schemaVersion: 1,
    geometryAvailable: true,
    geometryDataStatus: "reviewed",
    telemetryMode: mode,
    currentLap: 3,
    totalLaps: 20,
    cars: rows,
    summary: {
      cars: rows.length,
      exactOrSectorProgress: rows.filter((row) => !row.approximate).length,
      approximate: rows.filter((row) => row.approximate).length,
      mapPositionsAvailable: rows.filter((row) => row.mapPositionAvailable).length,
    },
  };
}

test("Live Race 2D refuses to draw a synthetic circuit when geometry is unavailable", () => {
  const unavailable = resolveCircuitGeometry({
    track_id: "TR_NONE",
    track_name: "Coordinate-Free Circuit",
  });
  const markup = renderLiveRaceMap({
    geometry: unavailable,
    positions: {
      telemetryMode: "lap_boundary_only",
      cars: [],
    },
    trackName: "Coordinate-Free Circuit",
  });

  assert.match(markup, /No circuit drawing shown/);
  assert.match(markup, /reviewed coordinate geometry is not available/);
  assert.doesNotMatch(markup, /<svg/);
  assert.doesNotMatch(markup, /<path/);
  assert.equal(liveRaceMapState({ geometry: unavailable }).status, "geometry_unavailable");
});

test("Live Race 2D draws reviewed geometry but withholds fake car markers at lap-boundary-only precision", () => {
  const track = geometry();
  const start = pointAtLapFraction(track, 0);
  const rows = [
    {
      position: 1,
      driverId: "D1",
      teamId: "T1",
      driverName: "Driver One",
      teamName: "Team One",
      controlled: true,
      precision: "lap_boundary_only",
      approximate: true,
      x: start.x,
      y: start.y,
      mapPositionAvailable: true,
    },
    {
      position: 2,
      driverId: "D2",
      teamId: "T2",
      driverName: "Driver Two",
      teamName: "Team Two",
      controlled: false,
      precision: "lap_boundary_only",
      approximate: true,
      x: start.x,
      y: start.y,
      mapPositionAvailable: true,
    },
  ];
  const projection = positions(rows, "lap_boundary_only");
  const markup = renderLiveRaceMap({ geometry: track, positions: projection });

  assert.match(markup, /<svg/);
  assert.match(markup, /live-race-map-track/);
  assert.match(markup, /Track positions withheld/);
  assert.match(markup, /whole-lap boundaries/);
  assert.doesNotMatch(markup, /data-driver=/);
  assert.equal(liveRaceMapState({ geometry: track, positions: projection }).drawableCars, 0);
});

test("Live Race 2D renders explicit and sector-level markers from Race Position Projection only", () => {
  const track = geometry();
  const exactPoint = pointAtLapFraction(track, 0.25);
  const approximatePoint = pointAtLapFraction(track, 0.75);
  const projection = positions([
    {
      position: 1,
      driverId: "D1",
      teamId: "T1",
      driverName: "Driver One",
      teamName: "Team One",
      controlled: true,
      precision: "explicit",
      approximate: false,
      x: exactPoint.x,
      y: exactPoint.y,
      mapPositionAvailable: true,
    },
    {
      position: 2,
      driverId: "D2",
      teamId: "T2",
      driverName: "Driver Two",
      teamName: "Team Two",
      controlled: false,
      precision: "sector_only",
      approximate: true,
      x: approximatePoint.x,
      y: approximatePoint.y,
      mapPositionAvailable: true,
    },
  ], "mixed");

  const markup = renderLiveRaceMap({
    geometry: track,
    positions: projection,
    trackName: "Map Test Circuit",
  });
  const status = liveRaceMapState({ geometry: track, positions: projection });

  assert.match(markup, /data-driver="D1"/);
  assert.match(markup, /data-driver="D2"/);
  assert.match(markup, /live-race-map-car controlled/);
  assert.match(markup, /live-race-map-car approximate/);
  assert.match(markup, /Driver One · Team One · explicit/);
  assert.match(markup, /Driver Two · Team Two · sector_only/);
  assert.match(markup, /live-race-map-pit/);
  assert.match(markup, />S\/F</);
  assert.equal(status.status, "mixed_precision");
  assert.equal(status.drawableCars, 2);
  assert.equal(status.approximateCars, 1);
});

test("Live Race 2D explicit markers are presentation-only and never derive position from race indexes", () => {
  const source = readFileSync("playtest/live-race-map.js", "utf8");
  assert.doesNotMatch(source, /elapsedIndex|raceIndex|gapIndex/);
  assert.doesNotMatch(source, /generate.*oval|synthetic.*track|fallback.*path/i);
  assert.match(source, /row\.x/);
  assert.match(source, /row\.y/);
});

test("Live Race 2D escapes player-facing circuit and entity text", () => {
  const unavailable = resolveCircuitGeometry({ track_id: "TR_NONE" });
  const markup = renderLiveRaceMap({
    geometry: unavailable,
    positions: { telemetryMode: "unavailable", cars: [] },
    trackName: '<img src=x onerror="boom">',
  });

  assert.doesNotMatch(markup, /<img/);
  assert.match(markup, /&lt;img/);
});
