#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function usage() {
  return [
    "Usage:",
    "  node scripts/build-circuit-layout-season-overlay.js --season <year> --season-pack <base-season-pack.json> --base-version <version> --target-version <version> [--root data/circuit-layouts] [--out overlay.json]",
    "",
    "Example:",
    "  node scripts/build-circuit-layout-season-overlay.js --season 1980 --season-pack data/season-packs/1980/season-pack-1980.v0.7.json --base-version 0.8 --target-version 0.9 --out data/season-packs/1980/season-pack-1980.v0.9.circuit-layout.overlay.json",
  ].join("\n");
}

function matrixRows(matrix = []) {
  if (!Array.isArray(matrix) || matrix.length < 2) return [];
  const headers = matrix[0].map((value) => String(value ?? "").trim());
  return matrix.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null])));
}

function jsonCell(value) {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
}

function matrix(headers, rows) {
  return [
    headers,
    ...rows.map((row) => headers.map((header) => {
      const value = row[header];
      return value === undefined ? null : value;
    })),
  ];
}

function seasonPackAliases(payload, season) {
  const rows = matrixRows(payload?.sheets?.[`${season}_Circuit_Layouts`] ?? []);
  return new Map(rows.map((row) => [Number(row.round), {
    runtime_gp_id: row.race_id ?? row.gp_id ?? null,
    runtime_track_id: row.circuit_id ?? row.track_id ?? null,
  }]));
}

const season = Number(argument("--season"));
const seasonPackPath = argument("--season-pack");
const baseVersion = argument("--base-version");
const targetVersion = argument("--target-version");
if (!Number.isInteger(season) || !seasonPackPath || !baseVersion || !targetVersion) {
  console.error(usage());
  process.exit(2);
}

const root = resolve(argument("--root", "data/circuit-layouts"));
const sourceFiles = {
  layouts: resolve(root, "layouts.json"),
  assignments: resolve(root, "season-assignments", `${season}.json`),
  geometry: resolve(root, "geometries", `${season}.json`),
};
const [layoutRaw, assignmentRaw, geometryRaw, seasonPackRaw] = await Promise.all([
  readFile(sourceFiles.layouts, "utf8"),
  readFile(sourceFiles.assignments, "utf8"),
  readFile(sourceFiles.geometry, "utf8"),
  readFile(resolve(seasonPackPath), "utf8"),
]);
const layoutPayload = JSON.parse(layoutRaw);
const assignmentPayload = JSON.parse(assignmentRaw);
const geometryPayload = JSON.parse(geometryRaw);
const seasonPack = JSON.parse(seasonPackRaw);
if (Number(seasonPack.season) !== season) throw new Error(`Season Pack targets ${seasonPack.season}, expected ${season}.`);

const assignments = (assignmentPayload.assignments ?? []).filter((row) => Number(row.season ?? row.year) === season);
const assignedIds = new Set(assignments.map((row) => row.layout_id));
const layouts = (layoutPayload.layouts ?? []).filter((row) => assignedIds.has(row.layout_id));
const geometries = (geometryPayload.geometries ?? []).filter((row) => assignedIds.has(row.layout_id));
const aliases = seasonPackAliases(seasonPack, season);
const assignmentsWithAliases = assignments.map((row) => ({
  ...row,
  ...(aliases.get(Number(row.round)) ?? {}),
}));

const layoutHeaders = [
  "layout_id", "track_id", "layout_name", "configuration_name", "valid_from", "valid_to",
  "lap_length_km", "historical_status", "candidate_aliases", "historical_verification",
  "configuration_requirements", "notes",
];
const assignmentHeaders = [
  "season", "round", "gp_id", "track_id", "layout_id", "runtime_gp_id", "runtime_track_id",
];
const geometryHeaders = [
  "layout_id", "track_id", "geometry_status", "historical_status", "geometry_source",
  "source_url", "source_repository", "source_author", "original_source", "license", "retrieved_at",
  "geometry_hash", "lap_length_km", "coordinate_system", "precision", "reviewed_for",
  "not_authoritative_for", "trace_metadata", "centerline", "finish_line", "timing_line",
  "start_finish", "start_grid", "pit_lane", "corners", "sectors", "notes",
];
const nestedLayoutFields = new Set(["candidate_aliases", "historical_verification", "configuration_requirements"]);
const nestedGeometryFields = new Set([
  "reviewed_for", "not_authoritative_for", "trace_metadata", "centerline",
  "finish_line", "timing_line", "start_finish", "start_grid", "pit_lane", "corners", "sectors",
]);
const overlayLayouts = layouts.map((row) => Object.fromEntries(
  layoutHeaders.map((field) => [field, nestedLayoutFields.has(field) ? jsonCell(row[field]) : (row[field] ?? null)]),
));
const overlayGeometry = geometries.map((row) => Object.fromEntries(
  geometryHeaders.map((field) => [field, nestedGeometryFields.has(field) ? jsonCell(row[field]) : (row[field] ?? null)]),
));

const sourcePayloadSha256 = createHash("sha256")
  .update(layoutRaw)
  .update("\n")
  .update(assignmentRaw)
  .update("\n")
  .update(geometryRaw)
  .digest("hex");

const overlay = {
  format: "f1-manager-sim-season-pack-overlay",
  schemaVersion: 1,
  season,
  baseVersion: String(baseVersion),
  targetVersion: String(targetVersion),
  sourcePayloadSha256,
  topLevel: {
    circuitLayoutCatalogVersion: 1,
    circuitLayoutCatalogSeason: season,
  },
  sheets: {
    [`${season}_Circuit_Layout_Registry`]: matrix(layoutHeaders, overlayLayouts),
    [`${season}_Circuit_Layout_Assignments`]: matrix(assignmentHeaders, assignmentsWithAliases),
    [`${season}_Circuit_Layout_Geometry`]: matrix(geometryHeaders, overlayGeometry),
  },
};

const output = argument("--out");
if (!output) {
  process.stdout.write(JSON.stringify(overlay, null, 2) + "\n");
} else {
  const outputPath = resolve(output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(overlay, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({
    output: outputPath,
    season,
    baseVersion,
    targetVersion,
    layouts: layouts.length,
    assignments: assignmentsWithAliases.length,
    geometries: geometries.length,
    sourcePayloadSha256,
  }, null, 2));
}
