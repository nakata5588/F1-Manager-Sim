import { pointAtLapFraction } from "../sim/circuitGeometry.js";

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 8) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(digits)) : null;
}

function wrapFraction(value) {
  return ((numeric(value, 0) % 1) + 1) % 1;
}

function stateRows(session = {}) {
  if (session.status === "completed") {
    return Object.fromEntries((session.result?.classification ?? []).map((row) => [String(row.driverId), row]));
  }
  return session.resumeState?.states ?? {};
}

function orderedDriverIds(session = {}) {
  if (session.status === "completed") {
    return (session.result?.classification ?? []).map((row) => String(row.driverId));
  }
  const resumeOrder = session.resumeState?.order;
  if (Array.isArray(resumeOrder) && resumeOrder.length) return resumeOrder.map(String);
  return (session.weekend?.grid ?? []).map((row) => String(row.driverId));
}

function telemetryFor(session, state, driverId, supplied = {}) {
  return supplied?.[driverId]
    ?? supplied?.[String(driverId)]
    ?? session.positionTelemetry?.[driverId]
    ?? session.positionTelemetry?.[String(driverId)]
    ?? session.resumeState?.positionTelemetry?.[driverId]
    ?? session.resumeState?.positionTelemetry?.[String(driverId)]
    ?? state?.positionTelemetry
    ?? state?.telemetry
    ?? state
    ?? {};
}

function directLapFraction(telemetry = {}) {
  for (const value of [
    telemetry.lapFraction,
    telemetry.lap_fraction,
    telemetry.lapProgress,
    telemetry.lap_progress,
    telemetry.trackProgress,
    telemetry.track_progress,
  ]) {
    const parsed = numeric(value);
    if (parsed !== null) return wrapFraction(parsed);
  }
  return null;
}

function sectorIdentity(telemetry = {}, state = {}) {
  return telemetry.sectorId
    ?? telemetry.sector_id
    ?? telemetry.currentSectorId
    ?? telemetry.current_sector_id
    ?? state.currentSectorId
    ?? state.current_sector_id
    ?? state.retirementSectorId
    ?? state.retirement_sector_id
    ?? null;
}

function sectorProgress(telemetry = {}, state = {}) {
  for (const value of [
    telemetry.sectorProgress,
    telemetry.sector_progress,
    telemetry.intraSectorProgress,
    telemetry.intra_sector_progress,
    state.sectorProgress,
    state.sector_progress,
  ]) {
    const parsed = numeric(value);
    if (parsed !== null) return clamp(parsed);
  }
  return null;
}

function geometrySector(geometry, sectorId) {
  if (!geometry?.available || !sectorId) return null;
  return (geometry.sectors ?? []).find((row) => String(row.id) === String(sectorId)) ?? null;
}

function fractionFromSector(geometry, sectorId, progress = null) {
  const sector = geometrySector(geometry, sectorId);
  if (!sector) return null;
  const start = numeric(sector.startFraction);
  const end = numeric(sector.endFraction);
  if (start === null || end === null) return null;
  const local = progress === null ? 0.5 : clamp(progress);
  return round(start + (end - start) * local);
}

function pitLaneState(telemetry = {}, state = {}) {
  const explicit = telemetry.inPitLane
    ?? telemetry.in_pit_lane
    ?? state.inPitLane
    ?? state.in_pit_lane;
  const location = String(
    telemetry.location
      ?? telemetry.trackLocation
      ?? telemetry.track_location
      ?? state.location
      ?? "",
  ).toLowerCase();
  return Boolean(explicit) || ["pit", "pit_lane", "pitlane", "pits"].includes(location);
}

function pitLaneProgress(telemetry = {}, state = {}) {
  for (const value of [
    telemetry.pitLaneProgress,
    telemetry.pit_lane_progress,
    telemetry.pitProgress,
    telemetry.pit_progress,
    state.pitLaneProgress,
    state.pit_lane_progress,
  ]) {
    const parsed = numeric(value);
    if (parsed !== null) return clamp(parsed);
  }
  return null;
}

function polylineSegments(points = []) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const raw = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    raw.push({
      index,
      from,
      to,
      length: Math.hypot(Number(to.x) - Number(from.x), Number(to.y) - Number(from.y)),
    });
  }
  const total = raw.reduce((sum, row) => sum + row.length, 0);
  if (!(total > 0)) return [];
  let cursor = 0;
  return raw.map((row) => {
    const startFraction = cursor / total;
    cursor += row.length;
    return { ...row, startFraction, endFraction: cursor / total };
  });
}

function pointOnPitLane(pitLane, progress) {
  if (!pitLane?.available || !Array.isArray(pitLane.points) || pitLane.points.length < 2) return null;
  const segments = polylineSegments(pitLane.points);
  if (!segments.length) return null;
  const fraction = clamp(progress ?? 0);
  let segment = segments.find((row) => fraction >= row.startFraction && fraction < row.endFraction);
  if (!segment) segment = segments[segments.length - 1];
  const span = segment.endFraction - segment.startFraction;
  const local = span > 0 ? clamp((fraction - segment.startFraction) / span) : 0;
  return {
    x: round(Number(segment.from.x) + (Number(segment.to.x) - Number(segment.from.x)) * local, 6),
    y: round(Number(segment.from.y) + (Number(segment.to.y) - Number(segment.from.y)) * local, 6),
  };
}

function circularFractionBetween(start, end, progress) {
  if (start === null || end === null) return null;
  const from = wrapFraction(start);
  const to = wrapFraction(end);
  const distance = to >= from ? to - from : 1 - from + to;
  return wrapFraction(from + distance * clamp(progress));
}

function explicitPosition(geometry, telemetry, state) {
  if (pitLaneState(telemetry, state)) {
    const progress = pitLaneProgress(telemetry, state);
    if (progress !== null) {
      const lapFraction = circularFractionBetween(
        numeric(geometry?.pitLane?.entryFraction),
        numeric(geometry?.pitLane?.exitFraction),
        progress,
      );
      const point = pointOnPitLane(geometry?.pitLane, progress);
      return {
        source: "explicit_pit_lane_progress",
        precision: "explicit",
        approximate: false,
        route: "pit_lane",
        lapFraction,
        sectorId: null,
        sectorProgress: null,
        pitLaneProgress: round(progress),
        mapPoint: point,
      };
    }
  }

  const lapFraction = directLapFraction(telemetry);
  if (lapFraction !== null) {
    return {
      source: "explicit_lap_fraction",
      precision: "explicit",
      approximate: false,
      route: "track",
      lapFraction: round(lapFraction),
      sectorId: sectorIdentity(telemetry, state),
      sectorProgress: sectorProgress(telemetry, state),
      pitLaneProgress: null,
      mapPoint: geometry?.available ? pointAtLapFraction(geometry, lapFraction) : null,
    };
  }

  const sectorId = sectorIdentity(telemetry, state);
  const progress = sectorProgress(telemetry, state);
  if (sectorId && progress !== null) {
    const fraction = fractionFromSector(geometry, sectorId, progress);
    if (fraction !== null) {
      return {
        source: "explicit_sector_progress",
        precision: "sector_progress",
        approximate: false,
        route: "track",
        lapFraction: fraction,
        sectorId: String(sectorId),
        sectorProgress: round(progress),
        pitLaneProgress: null,
        mapPoint: geometry?.available ? pointAtLapFraction(geometry, fraction) : null,
      };
    }
  }

  return null;
}

function retiredSectorPosition(geometry, state = {}, telemetry = {}) {
  const status = String(state.status ?? telemetry.status ?? "").toUpperCase();
  if (!["DNF", "RETIRED"].includes(status)) return null;
  const sectorId = sectorIdentity(telemetry, state);
  if (!sectorId) return null;
  const fraction = fractionFromSector(geometry, sectorId, null);
  if (fraction === null) {
    return {
      source: "retirement_sector_only",
      precision: "sector_only",
      approximate: true,
      route: "track",
      lapFraction: null,
      sectorId: String(sectorId),
      sectorProgress: null,
      pitLaneProgress: null,
      mapPoint: null,
    };
  }
  return {
    source: "retirement_sector_midpoint",
    precision: "sector_only",
    approximate: true,
    route: "track",
    lapFraction: fraction,
    sectorId: String(sectorId),
    sectorProgress: null,
    pitLaneProgress: null,
    mapPoint: geometry?.available ? pointAtLapFraction(geometry, fraction) : null,
  };
}

function lapBoundaryPosition(geometry, session, state = {}) {
  const status = String(state.status ?? "").toUpperCase();
  const boundaryEligible = !status || ["READY", "RUNNING", "FINISHED"].includes(status);
  if (!boundaryEligible) return null;
  const completedLaps = numeric(state.completedLaps, numeric(session.currentLap, 0));
  const start = geometry?.available ? pointAtLapFraction(geometry, 0) : null;
  return {
    source: Number(session.currentLap ?? 0) === 0 ? "start_grid_anchor" : "lap_boundary",
    precision: Number(session.currentLap ?? 0) === 0 ? "start_grid_anchor" : "lap_boundary_only",
    approximate: true,
    route: "track",
    lapFraction: 0,
    sectorId: geometry?.sectors?.[0]?.id ?? null,
    sectorProgress: 0,
    pitLaneProgress: null,
    mapPoint: start,
    completedLaps,
  };
}

function unavailablePosition(state = {}) {
  return {
    source: "position_unavailable",
    precision: "unavailable",
    approximate: true,
    route: "unknown",
    lapFraction: null,
    sectorId: state.retirementSectorId ?? null,
    sectorProgress: null,
    pitLaneProgress: null,
    mapPoint: null,
  };
}

export function projectRacePositions(options = {}) {
  const session = options.session ?? {};
  const geometry = options.geometry ?? null;
  const suppliedTelemetry = options.telemetry ?? {};
  const states = stateRows(session);
  const ids = orderedDriverIds(session);

  const cars = ids.map((driverId, index) => {
    const state = states[driverId] ?? {};
    const telemetry = telemetryFor(session, state, driverId, suppliedTelemetry);
    const projection = explicitPosition(geometry, telemetry, state)
      ?? retiredSectorPosition(geometry, state, telemetry)
      ?? lapBoundaryPosition(geometry, session, state)
      ?? unavailablePosition(state);

    return {
      position: index + 1,
      driverId,
      teamId: state.teamId
        ?? (session.weekend?.grid ?? []).find((row) => String(row.driverId) === String(driverId))?.teamId
        ?? null,
      status: state.status ?? (Number(session.currentLap ?? 0) === 0 ? "READY" : "RUNNING"),
      completedLaps: numeric(
        projection.completedLaps,
        numeric(state.completedLaps, numeric(session.currentLap, 0)),
      ),
      source: projection.source,
      precision: projection.precision,
      approximate: projection.approximate,
      route: projection.route,
      lapFraction: projection.lapFraction,
      sectorId: projection.sectorId,
      sectorProgress: projection.sectorProgress,
      pitLaneProgress: projection.pitLaneProgress,
      x: projection.mapPoint?.x ?? null,
      y: projection.mapPoint?.y ?? null,
      mapPositionAvailable: Boolean(projection.mapPoint && geometry?.available),
    };
  });

  const explicitCount = cars.filter((row) => row.precision === "explicit" || row.precision === "sector_progress").length;
  const boundaryCount = cars.filter((row) => ["lap_boundary_only", "start_grid_anchor"].includes(row.precision)).length;
  const approximateCount = cars.filter((row) => row.approximate).length;

  return {
    schemaVersion: 1,
    geometryAvailable: Boolean(geometry?.available),
    geometryDataStatus: geometry?.dataStatus ?? "geometry_unavailable",
    telemetryMode: explicitCount === cars.length && cars.length
      ? "explicit"
      : explicitCount > 0
        ? "mixed"
        : boundaryCount > 0
          ? "lap_boundary_only"
          : "unavailable",
    currentLap: Number(session.currentLap ?? 0),
    totalLaps: Number(session.totalLaps ?? 0),
    cars,
    summary: {
      cars: cars.length,
      exactOrSectorProgress: explicitCount,
      approximate: approximateCount,
      mapPositionsAvailable: cars.filter((row) => row.mapPositionAvailable).length,
    },
  };
}
