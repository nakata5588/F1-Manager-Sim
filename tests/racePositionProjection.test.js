import test from "node:test";
import assert from "node:assert/strict";

import { resolveCircuitGeometry } from "../src/sim/circuitGeometry.js";
import { projectRacePositions } from "../src/presentation/racePositionProjection.js";

function geometry() {
  return resolveCircuitGeometry({
    track_id: "TR_POS",
    track_name: "Projection Ring",
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
        points: [[0.5, -0.4], [3.5, -0.4]],
        entryFraction: 0.8,
        exitFraction: 0.2,
      },
    },
  });
}

function session(overrides = {}) {
  return {
    status: "paused",
    currentLap: 4,
    totalLaps: 20,
    weekend: {
      grid: [
        { driverId: "A", teamId: "T1" },
        { driverId: "B", teamId: "T2" },
        { driverId: "C", teamId: "T3" },
      ],
    },
    resumeState: {
      order: ["A", "B", "C"],
      states: {
        A: { driverId: "A", teamId: "T1", status: "RUNNING", completedLaps: 4, elapsedIndex: 10 },
        B: { driverId: "B", teamId: "T2", status: "RUNNING", completedLaps: 4, elapsedIndex: 50 },
        C: { driverId: "C", teamId: "T3", status: "DNF", completedLaps: 3, retirementSectorId: "S3", elapsedIndex: 90 },
      },
      ...overrides.resumeState,
    },
    ...overrides,
  };
}

test("lap-boundary projection does not convert abstract raceIndex or elapsedIndex into physical track distance", () => {
  const source = session();
  const before = structuredClone(source);
  const projection = projectRacePositions({ geometry: geometry(), session: source });

  const a = projection.cars.find((row) => row.driverId === "A");
  const b = projection.cars.find((row) => row.driverId === "B");

  assert.equal(projection.telemetryMode, "lap_boundary_only");
  assert.equal(a.source, "lap_boundary");
  assert.equal(b.source, "lap_boundary");
  assert.equal(a.precision, "lap_boundary_only");
  assert.equal(b.precision, "lap_boundary_only");
  assert.equal(a.lapFraction, 0);
  assert.equal(b.lapFraction, 0);
  assert.equal(a.x, b.x);
  assert.equal(a.y, b.y);
  assert.equal(a.approximate, true);
  assert.equal(b.approximate, true);
  assert.deepEqual(source, before, "position projection must not mutate live race state");
});

test("explicit lap fraction and sector progress project deterministically onto circuit geometry", () => {
  const projection = projectRacePositions({
    geometry: geometry(),
    session: session(),
    telemetry: {
      A: { lapFraction: 0.25 },
      B: { sectorId: "S2", sectorProgress: 0.5 },
    },
  });

  const a = projection.cars.find((row) => row.driverId === "A");
  const b = projection.cars.find((row) => row.driverId === "B");

  assert.equal(projection.telemetryMode, "mixed");
  assert.equal(a.source, "explicit_lap_fraction");
  assert.equal(a.precision, "explicit");
  assert.equal(a.approximate, false);
  assert.equal(a.lapFraction, 0.25);
  assert.equal(a.mapPositionAvailable, true);

  assert.equal(b.source, "explicit_sector_progress");
  assert.equal(b.precision, "sector_progress");
  assert.equal(b.approximate, false);
  assert.equal(b.sectorId, "S2");
  assert.equal(b.sectorProgress, 0.5);
  assert.equal(b.lapFraction, 0.5);
  assert.equal(b.mapPositionAvailable, true);
});

test("explicit pit-lane progress follows pit-lane geometry and wraps entry/exit lap fractions", () => {
  const projection = projectRacePositions({
    geometry: geometry(),
    session: session(),
    telemetry: {
      A: { inPitLane: true, pitLaneProgress: 0.5 },
    },
  });
  const a = projection.cars.find((row) => row.driverId === "A");

  assert.equal(a.source, "explicit_pit_lane_progress");
  assert.equal(a.route, "pit_lane");
  assert.equal(a.precision, "explicit");
  assert.equal(a.pitLaneProgress, 0.5);
  assert.equal(a.lapFraction, 0, "halfway between 0.8 entry and 0.2 exit wraps across start/finish");
  assert.equal(a.mapPositionAvailable, true);
  assert.notEqual(a.y, projection.cars.find((row) => row.driverId === "B").y);
});

test("retired cars with only a known sector use a clearly labelled sector-midpoint approximation", () => {
  const projection = projectRacePositions({ geometry: geometry(), session: session() });
  const retired = projection.cars.find((row) => row.driverId === "C");

  assert.equal(retired.source, "retirement_sector_midpoint");
  assert.equal(retired.precision, "sector_only");
  assert.equal(retired.approximate, true);
  assert.equal(retired.sectorId, "S3");
  assert.equal(retired.lapFraction, Number(((2 / 3 + 1) / 2).toFixed(8)));
  assert.equal(retired.mapPositionAvailable, true);
});

test("explicit lap telemetry survives when circuit coordinates are unavailable", () => {
  const unavailable = resolveCircuitGeometry({
    track_id: "TR_NONE",
    track_name: "No Coordinates",
  });
  const projection = projectRacePositions({
    geometry: unavailable,
    session: session(),
    telemetry: { A: { lapFraction: 0.42 } },
  });
  const a = projection.cars.find((row) => row.driverId === "A");

  assert.equal(projection.geometryAvailable, false);
  assert.equal(a.source, "explicit_lap_fraction");
  assert.equal(a.lapFraction, 0.42);
  assert.equal(a.x, null);
  assert.equal(a.y, null);
  assert.equal(a.mapPositionAvailable, false);
});

test("pre-race grid state is anchored at start finish but labelled as grid-only approximation", () => {
  const source = session({
    currentLap: 0,
    resumeState: {
      order: ["A", "B"],
      states: {
        A: { driverId: "A", teamId: "T1", status: "RUNNING", completedLaps: 0 },
        B: { driverId: "B", teamId: "T2", status: "RUNNING", completedLaps: 0 },
      },
    },
  });
  const projection = projectRacePositions({ geometry: geometry(), session: source });

  assert.equal(projection.telemetryMode, "lap_boundary_only");
  assert.equal(projection.cars.length, 2);
  assert.ok(projection.cars.every((row) => row.source === "start_grid_anchor"));
  assert.ok(projection.cars.every((row) => row.precision === "start_grid_anchor"));
  assert.ok(projection.cars.every((row) => row.lapFraction === 0));
});

test("all explicit telemetry produces explicit mode", () => {
  const source = session({
    resumeState: {
      order: ["A", "B"],
      states: {
        A: { driverId: "A", teamId: "T1", status: "RUNNING", completedLaps: 4 },
        B: { driverId: "B", teamId: "T2", status: "RUNNING", completedLaps: 4 },
      },
    },
  });
  const projection = projectRacePositions({
    geometry: geometry(),
    session: source,
    telemetry: {
      A: { lapFraction: 0.1 },
      B: { sectorId: "S3", sectorProgress: 0.25 },
    },
  });

  assert.equal(projection.telemetryMode, "explicit");
  assert.equal(projection.summary.exactOrSectorProgress, 2);
  assert.equal(projection.summary.approximate, 0);
  assert.equal(projection.summary.mapPositionsAvailable, 2);
});
