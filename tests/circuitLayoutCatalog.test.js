import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyCircuitLayoutCatalog,
  isReviewedCircuitGeometry,
  resolveSeasonCircuitAssignment,
  validateCircuitLayoutCatalog,
} from "../src/data/circuitLayoutCatalog.js";
import { buildCircuitLayoutCoverage } from "../tools/circuits/audit.js";
import {
  automaticCandidateStatus,
  geoJsonPolylineLengthKm,
  importGeoJsonFeature,
  rankGeometryCandidates,
} from "../tools/circuits/geometryPipeline.js";

const ROOT = new URL("../data/circuit-layouts/", import.meta.url);

async function json(relative) {
  return JSON.parse(await readFile(new URL(relative, ROOT), "utf8"));
}

test("1980 layout registry keeps venue IDs separate from 14 stable layout IDs", async () => {
  const layouts = (await json("layouts.json")).layouts;
  const assignments = (await json("season-assignments/1980.json")).assignments;
  const validation = validateCircuitLayoutCatalog({ layouts, assignments });

  assert.deepEqual(validation, { ok: true, issues: [] });
  assert.equal(assignments.length, 14);
  assert.equal(new Set(assignments.map((row) => row.track_id)).size, 14);
  assert.equal(new Set(assignments.map((row) => row.layout_id)).size, 14);
  for (const assignment of assignments) assert.notEqual(assignment.track_id, assignment.layout_id);
});

test("season assignment resolution prefers exact GP and round over venue-only matches", () => {
  const assignments = [
    { season: 1980, round: 1, gp_id: "gp_a", track_id: "tr_a", layout_id: "layout_a" },
    { season: 1980, round: 2, gp_id: "gp_b", track_id: "tr_a", layout_id: "layout_b" },
  ];
  assert.equal(
    resolveSeasonCircuitAssignment(assignments, { season: 1980, gpId: "gp_b", round: 2, trackId: "tr_a" }).layout_id,
    "layout_b",
  );
});

test("candidate geometry never becomes runtime geometry until explicitly reviewed", () => {
  const snapshot = {
    season: 1980,
    tracks: [{ track_id: "tr_test", track_name: "Test" }],
    calendar: [{ year: 1980, round: 1, gp_id: "gp_test", track_id: "tr_test" }],
    circuitLayouts: [{ layout_id: "layout_test", track_id: "tr_test", layout_name: "Period layout", valid_from: 1979, valid_to: 1981 }],
    seasonCircuitAssignments: [{ season: 1980, round: 1, gp_id: "gp_test", track_id: "tr_test", layout_id: "layout_test" }],
    circuitLayoutGeometry: [{
      layout_id: "layout_test",
      geometry_status: "MATCHED_NEEDS_REVIEW",
      geometry_source: "candidate",
      license: "MIT",
      centerline: [[0, 0], [1, 0], [0, 1]],
    }],
  };
  const result = applyCircuitLayoutCatalog(snapshot);
  assert.equal(result.assignments, 1);
  assert.equal(result.reviewedGeometries, 0);
  assert.equal(snapshot.tracks[0].layout_id, "layout_test");
  assert.equal(snapshot.tracks[0].layout_geometry, undefined);
  assert.equal(snapshot.calendar[0].layout_geometry, undefined);
});

test("reviewed geometry requires provenance and is attached to the selected historical layout", () => {
  const geometry = {
    layout_id: "layout_test",
    geometry_status: "MATCHED_REVIEWED",
    historical_status: "VERIFIED_LAYOUT_IDENTITY",
    geometry_source: "reviewed_test",
    source_url: "https://example.test/geometry",
    license: "CC0",
    geometry_hash: "abc123",
    centerline: [[0, 0], [1, 0], [0, 1]],
  };
  assert.equal(isReviewedCircuitGeometry(geometry), true);
  const snapshot = {
    season: 1980,
    tracks: [{ track_id: "tr_test" }],
    calendar: [{ year: 1980, round: 1, gp_id: "gp_test", track_id: "tr_test" }],
    circuitLayouts: [{ layout_id: "layout_test", track_id: "tr_test", valid_from: 1970, valid_to: 1990 }],
    seasonCircuitAssignments: [{ season: 1980, round: 1, gp_id: "gp_test", track_id: "tr_test", layout_id: "layout_test" }],
    circuitLayoutGeometry: [geometry],
  };
  const result = applyCircuitLayoutCatalog(snapshot);
  assert.equal(result.reviewedGeometries, 1);
  assert.equal(snapshot.tracks[0].layout_geometry.dataStatus, "MATCHED_REVIEWED");
  assert.equal(snapshot.tracks[0].layout_geometry.provenance.license, "CC0");
});

test("GeoJSON importer calculates candidate length and never labels imported data reviewed", () => {
  const feature = {
    type: "Feature",
    properties: { id: "test-1", Location: "Test", Name: "Test Ring", length: 4000 },
    geometry: { type: "LineString", coordinates: [[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01]] },
  };
  const candidate = importGeoJsonFeature(feature, { libraryId: "test", license: "MIT" });
  assert.equal(candidate.candidate_id, "test:test-1");
  assert.equal(candidate.geometry_status, "candidate_only");
  assert.ok(candidate.computed_length_km > 4);
  assert.equal(candidate.centerline.length, 4);
  assert.equal(candidate.geometry_hash.length, 64);
  assert.ok(geoJsonPolylineLengthKm(feature.geometry.coordinates) > 4);
});

test("candidate ranking rejects same-venue modern layouts by length without inventing history", async () => {
  const layouts = (await json("layouts.json")).layouts;
  const candidates = (await json("candidate-libraries/bacinger-f1-circuits.manifest.json")).candidates;
  const interlagos = layouts.find((row) => row.track_id === "tr_0028");
  const match = rankGeometryCandidates(interlagos, candidates)[0];
  assert.equal(match.candidate.candidate_id, "bacinger:br-1940");
  assert.equal(match.lengthDifferencePercent, -45.27);
  assert.equal(automaticCandidateStatus(match), "CANDIDATE_LENGTH_MISMATCH");
});

test("1980 coverage audit resolves 14 layouts and 11 available bacinger venue candidates", async () => {
  const layouts = (await json("layouts.json")).layouts;
  const assignments = (await json("season-assignments/1980.json")).assignments;
  const candidates = (await json("candidate-libraries/bacinger-f1-circuits.manifest.json")).candidates;
  const curated = (await json("audits/1980.json")).rows;
  const report = buildCircuitLayoutCoverage({ season: 1980, layouts, assignments, candidates, curatedRows: curated });

  assert.equal(report.summary.assignments, 14);
  assert.equal(report.summary.identifiedLayouts, 14);
  assert.equal(report.summary.candidatesFound, 11);
  assert.equal(report.summary.reviewedGeometry, 0);
  assert.equal(report.summary.statusCounts.GEOMETRY_MISSING, 3);
  assert.equal(report.summary.statusCounts.MATCHED_NEEDS_REVIEW, 2);
});
