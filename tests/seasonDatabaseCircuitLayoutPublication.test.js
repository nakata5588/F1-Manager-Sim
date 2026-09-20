import assert from "node:assert/strict";
import test from "node:test";

import { attachSeasonCircuitLayoutCatalog } from "../src/data/seasonDatabase.js";
import { createSaveWorld } from "../src/save/createSaveWorld.js";
import { resolveCircuitGeometry } from "../src/sim/circuitGeometry.js";

function baseSnapshot() {
  return {
    season: 1980,
    databaseVersion: "test-1980",
    sourceChecksum: "test-sha",
    tracks: [
      { track_id: "tr_test", track_name: "Historic Test Circuit", lap_length_km: 4.2 },
    ],
    calendar: [
      { year: 1980, round: 1, gp_id: "gp_test", track_id: "tr_test", race_date: "1980-03-01" },
    ],
    teams: [],
    drivers: [],
    staff: [],
    employment: { drivers: {}, staff: {} },
    historicalArchive: { throughSeason: 1979, calendar: [], raceResults: [] },
    futureStructure: { calendars: {}, tracks: [], rules: [], qualifyingRules: [], eraSafety: [], accidentModel: [] },
  };
}

function catalog() {
  return {
    layouts: [{
      layout_id: "layout_test_1978",
      track_id: "tr_test",
      layout_name: "Historic Layout",
      valid_from: 1978,
      valid_to: 1981,
      historical_status: "VERIFIED_LAYOUT_IDENTITY",
    }, {
      layout_id: "layout_future",
      track_id: "tr_future",
      valid_from: 1981,
      valid_to: 1985,
    }],
    assignments: [{
      season: 1980,
      round: 1,
      gp_id: "gp_test",
      track_id: "tr_test",
      layout_id: "layout_test_1978",
    }, {
      season: 1981,
      round: 1,
      gp_id: "gp_future",
      track_id: "tr_future",
      layout_id: "layout_future",
    }],
    geometries: [{
      layout_id: "layout_test_1978",
      geometry_status: "MATCHED_REVIEWED_SCHEMATIC",
      historical_status: "VERIFIED_LAYOUT_IDENTITY",
      geometry_source: "test_period_map",
      source_url: "https://example.test/period-map",
      license: "Public Domain",
      geometry_hash: "test-hash",
      precision: "schematic_historical_trace",
      reviewed_for: ["2d_track_presentation"],
      not_authoritative_for: ["car_performance"],
      centerline: [[0, 0], [4, 0], [4, 2], [0, 2]],
      finish_line: { centerlineIndex: 0 },
      start_grid: { centerlineIndex: 2 },
      lap_length_km: 4.2,
    }],
  };
}

test("Season Database publication attaches only the selected season circuit catalog", () => {
  const source = baseSnapshot();
  const published = attachSeasonCircuitLayoutCatalog(source, catalog());

  assert.equal(published.circuitLayouts.length, 1);
  assert.equal(published.circuitLayouts[0].layout_id, "layout_test_1978");
  assert.equal(published.seasonCircuitAssignments.length, 1);
  assert.equal(published.seasonCircuitAssignments[0].season, 1980);
  assert.equal(published.circuitLayoutGeometry.length, 1);
  assert.equal(source.circuitLayouts, undefined, "publication must not mutate the historical snapshot");
  assert.equal(Object.isFrozen(published), true);
});

test("published Season Database circuit geometry materializes into Save World and remains presentation-only", () => {
  const published = attachSeasonCircuitLayoutCatalog(baseSnapshot(), catalog());
  const save = createSaveWorld(published, { seed: "season-db-circuit-publication", createdAt: "1980-01-01T00:00:00.000Z" });

  assert.equal(save.meta.databaseOpeningState.historicalLayoutAssignments, 1);
  assert.equal(save.meta.databaseOpeningState.reviewedCircuitGeometries, 1);
  assert.equal(save.world.tracks[0].layout_id, "layout_test_1978");
  assert.equal(save.world.tracks[0].layout_geometry.provenance.precision, "schematic_historical_trace");
  assert.ok(save.world.tracks[0].layout_geometry.provenance.notAuthoritativeFor.includes("car_performance"));

  const geometry = resolveCircuitGeometry(save.world.tracks[0]);
  assert.equal(geometry.available, true);
  assert.notEqual(geometry.startGrid.pathFraction, geometry.finishLine.pathFraction);

  assert.equal(save.world.circuitLayouts, undefined);
  assert.equal(save.reference.databaseContext.circuitLayouts.length, 1);
  assert.equal(save.reference.databaseContext.circuitLayoutGeometry.length, 1);
});

test("Season Database publication refuses invalid or cross-season layout assignments", () => {
  const broken = catalog();
  broken.assignments[0].layout_id = "missing_layout";

  assert.throws(
    () => attachSeasonCircuitLayoutCatalog(baseSnapshot(), broken),
    /Season circuit layout publication failed/,
  );
});

test("Season Database publication is a no-op when the selected season has no layout assignments", () => {
  const source = baseSnapshot();
  const onlyFuture = catalog();
  onlyFuture.assignments = onlyFuture.assignments.filter((row) => row.season === 1981);

  const published = attachSeasonCircuitLayoutCatalog(source, onlyFuture);
  assert.equal(published, source);
});
