import { resolveSectorModel } from "./sectorModel.js";

function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 6) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(digits)) : null;
}

function trackId(track = {}) {
  return track.track_id ?? track.trackId ?? track.circuit_id ?? track.circuitId ?? track.id ?? null;
}

function trackName(track = {}) {
  return track.period_correct_track_name
    ?? track.track_name
    ?? track.trackName
    ?? track.circuit_name
    ?? track.circuitName
    ?? track.name
    ?? trackId(track)
    ?? "Unknown Circuit";
}

function parseJson(value) {
  if (typeof value !== "string" || !value.trim()) return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function geometryPayload(track = {}, options = {}) {
  const supplied = options.geometry ?? options.geometryPayload ?? null;
  if (supplied) return parseJson(supplied);

  for (const value of [
    track.circuit_geometry,
    track.circuitGeometry,
    track.layout_geometry,
    track.layoutGeometry,
    track.map_geometry,
    track.mapGeometry,
    track.geometry,
  ]) {
    const parsed = parseJson(value);
    if (parsed && typeof parsed === "object") return parsed;
  }

  const directCenterline = parseJson(track.centerline ?? track.center_line ?? track.track_centerline);
  if (Array.isArray(directCenterline)) {
    return {
      centerline: directCenterline,
      pitLane: parseJson(track.pit_lane_geometry ?? track.pitLane ?? track.pit_lane),
      sectors: parseJson(track.geometry_sectors ?? track.sector_geometry),
      corners: parseJson(track.corners ?? track.corner_geometry),
      startFinish: parseJson(track.start_finish ?? track.startFinish),
      source: track.geometry_source ?? track.geometrySource ?? null,
      dataStatus: track.geometry_data_status ?? track.geometryDataStatus ?? null,
    };
  }
  return null;
}

function rawPoint(value, index = 0) {
  if (Array.isArray(value)) {
    const x = numeric(value[0]);
    const y = numeric(value[1]);
    if (x === null || y === null) return null;
    return { x, y, index };
  }
  if (!value || typeof value !== "object") return null;
  const x = numeric(value.x ?? value.lon ?? value.lng ?? value.longitude);
  const y = numeric(value.y ?? value.lat ?? value.latitude);
  if (x === null || y === null) return null;
  return { x, y, index };
}

function rawPointList(value) {
  const rows = parseJson(value);
  if (!Array.isArray(rows)) return [];
  return rows.map((row, index) => rawPoint(row, index)).filter(Boolean);
}

function samePoint(a, b, epsilon = 1e-9) {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
}

function cleanClosedCenterline(points) {
  const rows = [...points];
  while (rows.length > 3 && samePoint(rows[0], rows[rows.length - 1])) rows.pop();
  return rows.map((row, index) => ({ ...row, index }));
}

function boundsFor(points) {
  if (!points.length) return null;
  const xs = points.map((row) => row.x);
  const ys = points.map((row) => row.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  const scale = Math.max(width, height);
  if (!(scale > 0)) return null;
  return { minX, maxX, minY, maxY, width, height, scale };
}

function normalizationTransform(bounds) {
  const xPadding = (bounds.scale - bounds.width) / (2 * bounds.scale);
  const yPadding = (bounds.scale - bounds.height) / (2 * bounds.scale);
  return {
    x: (value) => xPadding + (value - bounds.minX) / bounds.scale,
    y: (value) => yPadding + (value - bounds.minY) / bounds.scale,
  };
}

function normalizePoint(point, transform, index = null) {
  if (!point) return null;
  return {
    ...(index === null ? {} : { index }),
    x: round(clamp(transform.x(point.x)), 6),
    y: round(clamp(transform.y(point.y)), 6),
  };
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function buildSegments(centerline) {
  const raw = centerline.map((point, index) => {
    const nextIndex = (index + 1) % centerline.length;
    const next = centerline[nextIndex];
    return {
      index,
      fromIndex: index,
      toIndex: nextIndex,
      length: distance(point, next),
    };
  });
  const total = raw.reduce((sum, row) => sum + row.length, 0);
  if (!(total > 0)) return { total: 0, segments: [] };

  let cursor = 0;
  const segments = raw.map((row) => {
    const startFraction = cursor / total;
    cursor += row.length;
    return {
      ...row,
      length: round(row.length, 8),
      startFraction: round(startFraction, 8),
      endFraction: round(cursor / total, 8),
    };
  });
  return { total: round(total, 8), segments };
}

function pointOnGeometry(centerline, segments, lapFraction) {
  if (!centerline?.length || !segments?.length) return null;
  const fraction = ((numeric(lapFraction, 0) % 1) + 1) % 1;
  let segment = segments.find((row) => fraction >= row.startFraction && fraction < row.endFraction);
  if (!segment) segment = segments[segments.length - 1];

  const start = centerline[segment.fromIndex];
  const end = centerline[segment.toIndex];
  const span = segment.endFraction - segment.startFraction;
  const local = span > 0 ? clamp((fraction - segment.startFraction) / span) : 0;
  return {
    x: round(start.x + (end.x - start.x) * local, 6),
    y: round(start.y + (end.y - start.y) * local, 6),
    lapFraction: round(fraction, 8),
    segmentIndex: segment.index,
  };
}

function explicitStartFinish(raw, transform, centerline, segments) {
  const value = parseJson(raw);
  if (value && typeof value === "object") {
    const fraction = numeric(value.lapFraction ?? value.lap_fraction ?? value.fraction);
    if (fraction !== null) {
      return {
        ...pointOnGeometry(centerline, segments, fraction),
        source: "explicit_lap_fraction",
      };
    }
    const centerlineIndex = numeric(value.centerlineIndex ?? value.centerline_index ?? value.pointIndex ?? value.point_index);
    if (centerlineIndex !== null && centerline.length) {
      const index = ((Math.round(centerlineIndex) % centerline.length) + centerline.length) % centerline.length;
      const segment = segments.find((row) => row.fromIndex === index) ?? segments[0];
      return {
        ...centerline[index],
        lapFraction: segment?.startFraction ?? 0,
        segmentIndex: segment?.index ?? index,
        source: "explicit_centerline_index",
      };
    }
    const point = rawPoint(value);
    if (point) {
      const normalized = normalizePoint(point, transform);
      return {
        ...normalized,
        lapFraction: null,
        segmentIndex: null,
        source: "explicit_coordinate",
      };
    }
  }
  return {
    ...pointOnGeometry(centerline, segments, 0),
    source: "centerline_origin",
  };
}

function sectorRows(payload, track) {
  const explicit = parseJson(payload?.sectors ?? payload?.sectorBoundaries ?? payload?.sector_boundaries);
  const rows = Array.isArray(explicit) && explicit.length
    ? explicit
    : resolveSectorModel(track).sectors.map((row) => ({
      id: row.id,
      name: row.name,
      weight: row.weight,
      source: "sector_model_weight",
    }));

  let cursor = 0;
  const weights = rows.map((row) => Math.max(0, numeric(row.weight ?? row.length_share ?? row.lap_share, 0)));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);

  return rows.map((row, index) => {
    let start = numeric(row.startFraction ?? row.start_fraction ?? row.fromFraction ?? row.from_fraction);
    let end = numeric(row.endFraction ?? row.end_fraction ?? row.toFraction ?? row.to_fraction);

    if (start === null && end === null && totalWeight > 0) {
      start = cursor / totalWeight;
      cursor += weights[index];
      end = cursor / totalWeight;
    } else {
      start = start === null ? (index === 0 ? 0 : cursor) : start;
      end = end === null ? (index === rows.length - 1 ? 1 : start) : end;
      cursor = end;
    }

    return {
      id: String(row.id ?? row.sector_id ?? row.sector ?? `S${index + 1}`),
      name: String(row.name ?? row.sector_name ?? `Sector ${index + 1}`),
      startFraction: round(clamp(start ?? 0), 8),
      endFraction: round(clamp(end ?? 1), 8),
      source: row.source ?? (Array.isArray(explicit) && explicit.length ? "explicit_geometry_sector" : "sector_model_weight"),
    };
  });
}

function cornerRows(payload, transform, centerline, segments) {
  const rows = parseJson(payload?.corners ?? payload?.turns ?? payload?.cornerMarkers ?? payload?.corner_markers);
  if (!Array.isArray(rows)) return [];
  return rows.map((row, index) => {
    const fraction = numeric(row?.lapFraction ?? row?.lap_fraction ?? row?.fraction);
    const coordinate = rawPoint(row);
    const projected = fraction !== null
      ? pointOnGeometry(centerline, segments, fraction)
      : coordinate
        ? normalizePoint(coordinate, transform)
        : null;
    if (!projected) return null;
    return {
      id: String(row?.id ?? row?.corner_id ?? `C${index + 1}`),
      number: numeric(row?.number ?? row?.corner_number, index + 1),
      name: row?.name ?? row?.corner_name ?? null,
      lapFraction: fraction === null ? null : round(clamp(fraction), 8),
      x: projected.x,
      y: projected.y,
    };
  }).filter(Boolean);
}

function pitLaneRows(payload, transform) {
  const rows = rawPointList(payload?.pitLane ?? payload?.pit_lane ?? payload?.pitlane);
  if (rows.length < 2) return [];
  return rows.map((row, index) => normalizePoint(row, transform, index));
}

function unavailableGeometry(track, reason = "no_explicit_centerline") {
  return {
    available: false,
    trackId: trackId(track),
    trackName: trackName(track),
    source: null,
    dataStatus: "geometry_unavailable",
    reason,
    coordinateSystem: "normalized_unit_box",
    closed: true,
    centerline: [],
    segments: [],
    sectors: [],
    corners: [],
    pitLane: [],
    startFinish: null,
    lapLengthKm: numeric(track.lap_length_km ?? track.lapLengthKm),
  };
}

export function resolveCircuitGeometry(track = {}, options = {}) {
  const payload = geometryPayload(track, options);
  if (!payload || typeof payload !== "object") return unavailableGeometry(track);

  const rawCenterline = cleanClosedCenterline(rawPointList(
    payload.centerline
      ?? payload.centerLine
      ?? payload.center_line
      ?? payload.points
      ?? payload.path,
  ));
  if (rawCenterline.length < 3) return unavailableGeometry(track, "invalid_centerline");

  const auxiliaryPoints = [
    ...rawPointList(payload.pitLane ?? payload.pit_lane ?? payload.pitlane),
    ...(Array.isArray(parseJson(payload.corners ?? payload.turns ?? payload.cornerMarkers ?? payload.corner_markers))
      ? parseJson(payload.corners ?? payload.turns ?? payload.cornerMarkers ?? payload.corner_markers).map((row) => rawPoint(row)).filter(Boolean)
      : []),
  ];
  const startCoordinate = rawPoint(parseJson(payload.startFinish ?? payload.start_finish));
  if (startCoordinate) auxiliaryPoints.push(startCoordinate);

  const bounds = boundsFor([...rawCenterline, ...auxiliaryPoints]);
  if (!bounds) return unavailableGeometry(track, "degenerate_centerline");
  const transform = normalizationTransform(bounds);
  const centerline = rawCenterline.map((row, index) => normalizePoint(row, transform, index));
  const built = buildSegments(centerline);
  if (!built.segments.length) return unavailableGeometry(track, "degenerate_centerline");

  const source = payload.source
    ?? payload.geometrySource
    ?? payload.geometry_source
    ?? track.geometry_source
    ?? track.geometrySource
    ?? "explicit_geometry";
  const dataStatus = payload.dataStatus
    ?? payload.data_status
    ?? track.geometry_data_status
    ?? track.geometryDataStatus
    ?? "explicit_geometry";

  return {
    available: true,
    trackId: trackId(track),
    trackName: trackName(track),
    source,
    dataStatus,
    coordinateSystem: "normalized_unit_box",
    closed: true,
    originalBounds: {
      minX: round(bounds.minX),
      maxX: round(bounds.maxX),
      minY: round(bounds.minY),
      maxY: round(bounds.maxY),
      width: round(bounds.width),
      height: round(bounds.height),
    },
    centerline,
    segments: built.segments,
    normalizedPathLength: built.total,
    startFinish: explicitStartFinish(payload.startFinish ?? payload.start_finish, transform, centerline, built.segments),
    sectors: sectorRows(payload, track),
    corners: cornerRows(payload, transform, centerline, built.segments),
    pitLane: pitLaneRows(payload, transform),
    lapLengthKm: numeric(
      payload.lapLengthKm
        ?? payload.lap_length_km
        ?? track.lap_length_km
        ?? track.lapLengthKm,
    ),
  };
}

export function pointAtLapFraction(geometry, lapFraction) {
  if (!geometry?.available) return null;
  return pointOnGeometry(geometry.centerline, geometry.segments, lapFraction);
}

export function sectorAtLapFraction(geometry, lapFraction) {
  if (!geometry?.available || !geometry.sectors?.length) return null;
  const fraction = ((numeric(lapFraction, 0) % 1) + 1) % 1;
  return geometry.sectors.find((row, index) => {
    if (index === geometry.sectors.length - 1) return fraction >= row.startFraction && fraction <= row.endFraction;
    return fraction >= row.startFraction && fraction < row.endFraction;
  }) ?? geometry.sectors[geometry.sectors.length - 1];
}
