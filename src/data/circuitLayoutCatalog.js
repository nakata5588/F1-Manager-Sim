const REVIEWED_GEOMETRY_STATUSES = new Set([
  "MATCHED_REVIEWED",
  "MATCHED_REVIEWED_SCHEMATIC",
  "REVIEWED",
  "reviewed",
  "source_locked_geometry",
]);

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function id(value) {
  return value === null || value === undefined || value === "" ? null : String(value);
}

function rowSeason(row) {
  return numeric(row?.season ?? row?.year);
}

function assignmentScore(row, context) {
  if (rowSeason(row) !== numeric(context.season)) return -1;
  let score = 0;
  const gpIds = [
    row.gp_id, row.gpId,
    row.runtime_gp_id, row.runtimeGpId,
    row.season_gp_id, row.seasonGpId,
  ].map(id).filter(Boolean);
  const trackIds = [
    row.track_id, row.trackId,
    row.runtime_track_id, row.runtimeTrackId,
    row.season_track_id, row.seasonTrackId,
  ].map(id).filter(Boolean);
  if (context.gpId && gpIds.includes(id(context.gpId))) score += 8;
  if (context.round !== null && context.round !== undefined && numeric(row.round) === numeric(context.round)) score += 4;
  if (context.trackId && trackIds.includes(id(context.trackId))) score += 2;
  return score;
}

export function isReviewedCircuitGeometry(row) {
  const status = row?.geometry_status ?? row?.geometryStatus ?? row?.data_status ?? row?.dataStatus;
  return REVIEWED_GEOMETRY_STATUSES.has(String(status ?? ""));
}

export function resolveSeasonCircuitAssignment(assignments = [], context = {}) {
  const candidates = (assignments ?? [])
    .map((row) => ({ row, score: assignmentScore(row, context) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) return null;
  if (candidates.length > 1 && candidates[0].score === candidates[1].score) {
    const first = id(candidates[0].row.layout_id ?? candidates[0].row.layoutId);
    const second = id(candidates[1].row.layout_id ?? candidates[1].row.layoutId);
    if (first !== second) throw new Error("Ambiguous circuit layout assignment for season " + context.season + ".");
  }
  return structuredClone(candidates[0].row);
}

export function validateCircuitLayoutCatalog({ layouts = [], geometries = [], assignments = [] } = {}) {
  const issues = [];
  const layoutIds = new Set();
  const geometryIds = new Set();

  for (const row of layouts ?? []) {
    const layoutId = id(row?.layout_id ?? row?.layoutId);
    const trackId = id(row?.track_id ?? row?.trackId);
    if (!layoutId) issues.push("Circuit layout is missing layout_id.");
    else if (layoutIds.has(layoutId)) issues.push("Duplicate circuit layout_id '" + layoutId + "'.");
    else layoutIds.add(layoutId);
    if (!trackId) issues.push("Circuit layout '" + (layoutId ?? "<unknown>") + "' is missing track_id.");

    const from = numeric(row?.valid_from ?? row?.validFrom);
    const to = numeric(row?.valid_to ?? row?.validTo);
    if (from !== null && to !== null && from > to) issues.push("Circuit layout '" + layoutId + "' has invalid validity range " + from + "-" + to + ".");
  }

  for (const row of geometries ?? []) {
    const layoutId = id(row?.layout_id ?? row?.layoutId);
    if (!layoutId) {
      issues.push("Circuit layout geometry is missing layout_id.");
      continue;
    }
    if (!layoutIds.has(layoutId)) issues.push("Geometry references unknown layout_id '" + layoutId + "'.");
    if (geometryIds.has(layoutId)) issues.push("Duplicate geometry row for layout_id '" + layoutId + "'.");
    geometryIds.add(layoutId);

    if (isReviewedCircuitGeometry(row)) {
      const centerline = row?.centerline ?? row?.geometry?.centerline;
      if (!Array.isArray(centerline) || centerline.length < 3) issues.push("Reviewed geometry '" + layoutId + "' must contain at least three centerline points.");
      if (!row?.geometry_hash && !row?.geometryHash) issues.push("Reviewed geometry '" + layoutId + "' is missing geometry_hash.");
      if (!row?.geometry_source && !row?.geometrySource) issues.push("Reviewed geometry '" + layoutId + "' is missing geometry_source.");
      if (!row?.license) issues.push("Reviewed geometry '" + layoutId + "' is missing license.");
    }
  }

  const assignmentKeys = new Set();
  for (const row of assignments ?? []) {
    const season = rowSeason(row);
    const layoutId = id(row?.layout_id ?? row?.layoutId);
    const trackId = id(row?.track_id ?? row?.trackId);
    const gpId = id(row?.gp_id ?? row?.gpId);
    const round = numeric(row?.round);
    if (!Number.isInteger(season)) issues.push("Season circuit assignment is missing an integer season.");
    if (!layoutId || !layoutIds.has(layoutId)) issues.push("Season assignment references unknown layout_id '" + (layoutId ?? "<missing>") + "'.");
    if (!trackId) issues.push("Season assignment for '" + (layoutId ?? "<missing>") + "' is missing track_id.");

    const layout = (layouts ?? []).find((candidate) => id(candidate?.layout_id ?? candidate?.layoutId) === layoutId);
    if (layout && trackId !== id(layout.track_id ?? layout.trackId)) {
      issues.push("Season assignment '" + layoutId + "' uses track_id '" + trackId + "' but layout belongs to '" + id(layout.track_id ?? layout.trackId) + "'.");
    }
    const from = numeric(layout?.valid_from ?? layout?.validFrom);
    const to = numeric(layout?.valid_to ?? layout?.validTo);
    if (layout && from !== null && season < from) issues.push("Season " + season + " assigns layout '" + layoutId + "' before valid_from " + from + ".");
    if (layout && to !== null && season > to) issues.push("Season " + season + " assigns layout '" + layoutId + "' after valid_to " + to + ".");

    const key = [season, gpId ?? "", round ?? "", trackId ?? ""].join(":");
    if (assignmentKeys.has(key)) issues.push("Duplicate season circuit assignment '" + key + "'.");
    assignmentKeys.add(key);
  }

  return { ok: issues.length === 0, issues };
}

function geometryPayload(row) {
  if (!row || !isReviewedCircuitGeometry(row)) return null;
  const source = row.geometry_source ?? row.geometrySource ?? null;
  const dataStatus = row.geometry_status ?? row.geometryStatus ?? row.data_status ?? row.dataStatus ?? null;
  return {
    centerline: structuredClone(row.centerline ?? row.geometry?.centerline ?? []),
    pitLane: structuredClone(row.pit_lane ?? row.pitLane ?? row.geometry?.pitLane ?? null),
    startFinish: structuredClone(row.start_finish ?? row.startFinish ?? row.geometry?.startFinish ?? null),
    finishLine: structuredClone(row.finish_line ?? row.finishLine ?? row.geometry?.finishLine ?? null),
    timingLine: structuredClone(row.timing_line ?? row.timingLine ?? row.geometry?.timingLine ?? null),
    startGrid: structuredClone(row.start_grid ?? row.startGrid ?? row.start_line ?? row.startLine ?? row.geometry?.startGrid ?? null),
    corners: structuredClone(row.corners ?? row.geometry?.corners ?? []),
    sectors: structuredClone(row.sectors ?? row.geometry?.sectors ?? []),
    source,
    dataStatus,
    lapLengthKm: numeric(row.lap_length_km ?? row.lapLengthKm),
    provenance: {
      sourceUrl: row.source_url ?? row.sourceUrl ?? null,
      sourceRepository: row.source_repository ?? row.sourceRepository ?? null,
      originalSource: row.original_source ?? row.originalSource ?? null,
      license: row.license ?? null,
      retrievedAt: row.retrieved_at ?? row.retrievedAt ?? null,
      geometryHash: row.geometry_hash ?? row.geometryHash ?? null,
      historicalStatus: row.historical_status ?? row.historicalStatus ?? null,
      precision: row.precision ?? row.geometry_precision ?? row.geometryPrecision ?? null,
      reviewedFor: structuredClone(row.reviewed_for ?? row.reviewedFor ?? []),
      notAuthoritativeFor: structuredClone(row.not_authoritative_for ?? row.notAuthoritativeFor ?? []),
    },
  };
}

export function applyCircuitLayoutCatalog(snapshot) {
  const season = numeric(snapshot?.season);
  if (!Number.isInteger(season)) return { assignments: 0, reviewedGeometries: 0 };

  const layouts = snapshot?.circuitLayouts ?? [];
  const assignments = (snapshot?.seasonCircuitAssignments ?? []).filter((row) => rowSeason(row) === season);
  const geometries = snapshot?.circuitLayoutGeometry ?? [];
  if (!layouts.length || !assignments.length) return { assignments: 0, reviewedGeometries: 0 };

  const validation = validateCircuitLayoutCatalog({ layouts, geometries, assignments });
  if (!validation.ok) throw new Error("Circuit layout catalog validation failed: " + validation.issues.join(" "));

  const layoutById = new Map(layouts.map((row) => [id(row.layout_id ?? row.layoutId), row]));
  const geometryByLayout = new Map(geometries.map((row) => [id(row.layout_id ?? row.layoutId), row]));
  let reviewedGeometries = 0;

  snapshot.calendar = (snapshot.calendar ?? []).map((source) => {
    const race = structuredClone(source);
    const assignment = resolveSeasonCircuitAssignment(assignments, {
      season,
      gpId: race.gp_id ?? race.gpId,
      round: race.round,
      trackId: race.track_id ?? race.trackId ?? race.circuit_id ?? race.circuitId,
    });
    if (!assignment) return race;
    const layoutId = id(assignment.layout_id ?? assignment.layoutId);
    const layout = layoutById.get(layoutId);
    const geometry = geometryByLayout.get(layoutId);
    race.layout_id = layoutId;
    race.layout_name = layout?.layout_name ?? layout?.layoutName ?? null;
    race.layout_historical_status = layout?.historical_status ?? layout?.historicalStatus ?? null;
    const payload = geometryPayload(geometry);
    if (payload) {
      race.layout_geometry = payload;
      reviewedGeometries += 1;
    }
    return race;
  });

  const assignmentsByTrack = new Map();
  for (const row of assignments) {
    const trackIds = [
      row.track_id, row.trackId,
      row.runtime_track_id, row.runtimeTrackId,
      row.season_track_id, row.seasonTrackId,
    ].map(id).filter(Boolean);
    for (const trackId of new Set(trackIds)) {
      const rows = assignmentsByTrack.get(trackId) ?? [];
      rows.push(row);
      assignmentsByTrack.set(trackId, rows);
    }
  }

  snapshot.tracks = (snapshot.tracks ?? []).map((source) => {
    const track = structuredClone(source);
    const trackId = id(track.track_id ?? track.trackId ?? track.circuit_id ?? track.circuitId ?? track.id);
    const rows = assignmentsByTrack.get(trackId) ?? [];
    const uniqueLayouts = [...new Set(rows.map((row) => id(row.layout_id ?? row.layoutId)).filter(Boolean))];
    if (uniqueLayouts.length !== 1) return track;
    const layoutId = uniqueLayouts[0];
    const layout = layoutById.get(layoutId);
    const geometry = geometryByLayout.get(layoutId);
    track.layout_id = layoutId;
    track.layout_name = layout?.layout_name ?? layout?.layoutName ?? null;
    track.layout_historical_status = layout?.historical_status ?? layout?.historicalStatus ?? null;
    const payload = geometryPayload(geometry);
    if (payload) track.layout_geometry = payload;
    return track;
  });

  return { assignments: assignments.length, reviewedGeometries };
}
