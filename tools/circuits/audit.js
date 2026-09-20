import { automaticCandidateStatus, rankGeometryCandidates } from "./geometryPipeline.js";
import { historicalMapSourceByLayout, summarizeHistoricalMapSources } from "./historicalMapSources.js";

const REVIEWED_RUNTIME_GEOMETRY_STATUSES = new Set([
  "MATCHED_REVIEWED",
  "MATCHED_REVIEWED_SCHEMATIC",
  "REVIEWED",
  "reviewed",
  "source_locked_geometry",
]);

function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function layoutId(row) {
  return row?.layout_id ?? row?.layoutId ?? null;
}

function runtimeGeometryReviewed(row) {
  return REVIEWED_RUNTIME_GEOMETRY_STATUSES.has(String(row?.geometry_status ?? row?.geometryStatus ?? ""));
}

export function buildCircuitLayoutCoverage({
  season,
  layouts = [],
  assignments = [],
  candidates = [],
  curatedRows = [],
  historicalMapSources = [],
  geometries = [],
} = {}) {
  const targetSeason = numeric(season);
  if (!Number.isInteger(targetSeason)) throw new TypeError("Circuit layout coverage requires an integer season.");
  const layoutById = new Map(layouts.map((row) => [layoutId(row), row]));
  const curatedByKey = new Map(curatedRows.map((row) => [(row.gp_id ?? "") + ":" + (row.track_id ?? ""), row]));
  const mapSourceByLayout = historicalMapSourceByLayout(historicalMapSources);
  const geometryByLayout = new Map(geometries.map((row) => [layoutId(row), row]).filter(([id]) => id));
  const seasonAssignments = assignments
    .filter((row) => numeric(row.season ?? row.year) === targetSeason)
    .sort((a, b) => numeric(a.round, 999) - numeric(b.round, 999));

  const rows = seasonAssignments.map((assignment) => {
    const targetLayoutId = layoutId(assignment);
    const layout = layoutById.get(targetLayoutId);
    if (!layout) throw new Error("Assignment references unknown layout '" + targetLayoutId + "'.");
    const ranked = rankGeometryCandidates(layout, candidates);
    const best = ranked[0] ?? null;
    const curated = curatedByKey.get((assignment.gp_id ?? "") + ":" + (assignment.track_id ?? "")) ?? null;
    const historicalMap = mapSourceByLayout.get(targetLayoutId) ?? null;
    const geometry = geometryByLayout.get(targetLayoutId) ?? null;
    const candidateReviewStatus = curated?.geometry_status ?? automaticCandidateStatus(best);
    return {
      season: targetSeason,
      round: numeric(assignment.round),
      gp_id: assignment.gp_id ?? null,
      track_id: assignment.track_id ?? null,
      layout_id: targetLayoutId,
      layout_name: layout.layout_name ?? null,
      required_lap_length_km: numeric(layout.lap_length_km),
      valid_from: numeric(layout.valid_from),
      valid_to: numeric(layout.valid_to),
      historical_status: layout.historical_status ?? null,
      auto_candidate_id: best?.candidate?.candidate_id ?? null,
      auto_candidate_length_km: numeric(best?.candidate?.declared_length_km ?? best?.candidate?.computed_length_km),
      auto_length_difference_percent: best?.lengthDifferencePercent ?? null,
      auto_status: automaticCandidateStatus(best),
      candidate_review_status: candidateReviewStatus,
      reviewed_geometry_status: geometry?.geometry_status ?? null,
      runtime_geometry_status: geometry?.geometry_status ?? null,
      runtime_geometry_reviewed: runtimeGeometryReviewed(geometry),
      runtime_geometry_precision: geometry?.precision ?? null,
      shape_confidence: curated?.shape_confidence ?? null,
      historical_confidence: curated?.historical_confidence ?? null,
      historical_map_source_id: historicalMap?.source_id ?? null,
      historical_map_license: historicalMap?.license ?? null,
      historical_map_media_type: historicalMap?.media_type ?? null,
      historical_map_ready: historicalMap?.source_status === "HISTORICAL_MAP_READY",
      needs_research: geometry ? !runtimeGeometryReviewed(geometry) : (curated?.needs_research ?? true),
      notes: curated?.notes ?? geometry?.notes ?? null,
    };
  });

  const statusCounts = {};
  for (const row of rows) {
    const status = row.candidate_review_status ?? row.auto_status;
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }
  const sourceSummary = summarizeHistoricalMapSources({
    layouts: seasonAssignments.map((row) => layoutById.get(layoutId(row))).filter(Boolean),
    sources: historicalMapSources,
  });

  return {
    schemaVersion: 1,
    season: targetSeason,
    summary: {
      assignments: rows.length,
      identifiedLayouts: rows.filter((row) => row.layout_id).length,
      candidatesFound: rows.filter((row) => row.auto_candidate_id).length,
      historicalMapSourcesReady: rows.filter((row) => row.historical_map_ready).length,
      runtimeGeometryReviewed: rows.filter((row) => row.runtime_geometry_reviewed).length,
      reviewedGeometry: rows.filter((row) => row.runtime_geometry_reviewed).length,
      statusCounts,
      runtimeGeometryStatusCounts: rows.reduce((counts, row) => {
        const status = row.runtime_geometry_status ?? "GEOMETRY_UNAVAILABLE";
        counts[status] = (counts[status] ?? 0) + 1;
        return counts;
      }, {}),
      historicalMapLicenseBuckets: sourceSummary.licenseBuckets,
    },
    rows,
  };
}
