import { automaticCandidateStatus, rankGeometryCandidates } from "./geometryPipeline.js";

function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function layoutId(row) {
  return row?.layout_id ?? row?.layoutId ?? null;
}

export function buildCircuitLayoutCoverage({ season, layouts = [], assignments = [], candidates = [], curatedRows = [] } = {}) {
  const targetSeason = numeric(season);
  if (!Number.isInteger(targetSeason)) throw new TypeError("Circuit layout coverage requires an integer season.");
  const layoutById = new Map(layouts.map((row) => [layoutId(row), row]));
  const curatedByKey = new Map(curatedRows.map((row) => [(row.gp_id ?? "") + ":" + (row.track_id ?? ""), row]));
  const seasonAssignments = assignments
    .filter((row) => numeric(row.season ?? row.year) === targetSeason)
    .sort((a, b) => numeric(a.round, 999) - numeric(b.round, 999));

  const rows = seasonAssignments.map((assignment) => {
    const layout = layoutById.get(layoutId(assignment));
    if (!layout) throw new Error("Assignment references unknown layout '" + layoutId(assignment) + "'.");
    const ranked = rankGeometryCandidates(layout, candidates);
    const best = ranked[0] ?? null;
    const curated = curatedByKey.get((assignment.gp_id ?? "") + ":" + (assignment.track_id ?? "")) ?? null;
    return {
      season: targetSeason,
      round: numeric(assignment.round),
      gp_id: assignment.gp_id ?? null,
      track_id: assignment.track_id ?? null,
      layout_id: layoutId(assignment),
      layout_name: layout.layout_name ?? null,
      required_lap_length_km: numeric(layout.lap_length_km),
      valid_from: numeric(layout.valid_from),
      valid_to: numeric(layout.valid_to),
      historical_status: layout.historical_status ?? null,
      auto_candidate_id: best?.candidate?.candidate_id ?? null,
      auto_candidate_length_km: numeric(best?.candidate?.declared_length_km ?? best?.candidate?.computed_length_km),
      auto_length_difference_percent: best?.lengthDifferencePercent ?? null,
      auto_status: automaticCandidateStatus(best),
      reviewed_geometry_status: curated?.geometry_status ?? null,
      shape_confidence: curated?.shape_confidence ?? null,
      historical_confidence: curated?.historical_confidence ?? null,
      needs_research: curated?.needs_research ?? true,
      notes: curated?.notes ?? null,
    };
  });

  const statusCounts = {};
  for (const row of rows) {
    const status = row.reviewed_geometry_status ?? row.auto_status;
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }

  return {
    schemaVersion: 1,
    season: targetSeason,
    summary: {
      assignments: rows.length,
      identifiedLayouts: rows.filter((row) => row.layout_id).length,
      candidatesFound: rows.filter((row) => row.auto_candidate_id).length,
      reviewedGeometry: rows.filter((row) => row.reviewed_geometry_status === "MATCHED_REVIEWED").length,
      statusCounts,
    },
    rows,
  };
}
