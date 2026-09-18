#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { importGeoJsonFeature } from "../tools/circuits/geometryPipeline.js";

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function usage() {
  return "node scripts/import-circuit-geojson.js <source.geojson> --library-id <id> [--out file.json] [--license MIT] [--repository owner/repo] [--source-url url] [--retrieved-at YYYY-MM-DD] [--tolerance-m 0] [--metadata-only]";
}

const input = process.argv[2];
const libraryId = arg("--library-id");
if (!input || input.startsWith("--") || !libraryId) {
  console.error(usage());
  process.exit(2);
}

const sourcePath = resolve(input);
const raw = JSON.parse(await readFile(sourcePath, "utf8"));
const features = raw.type === "FeatureCollection" ? raw.features : raw.type === "Feature" ? [raw] : [];
if (!features.length) throw new Error("Input must be a GeoJSON Feature or FeatureCollection.");

const provenance = {
  libraryId,
  geometrySource: "GeoJSON LineString",
  sourceRepository: arg("--repository"),
  sourceUrl: arg("--source-url"),
  originalSource: arg("--original-source"),
  license: arg("--license"),
  retrievedAt: arg("--retrieved-at"),
};
const tolerance = Number(arg("--tolerance-m", "0"));
const includeGeometry = !process.argv.includes("--metadata-only");
const candidates = features
  .filter((feature) => feature?.geometry?.type === "LineString")
  .map((feature) => importGeoJsonFeature(feature, provenance, {
    simplificationToleranceM: Number.isFinite(tolerance) ? tolerance : 0,
    includeGeometry,
  }));

const payload = {
  schemaVersion: 1,
  library_id: libraryId,
  source_path: sourcePath,
  license: provenance.license,
  source_repository: provenance.sourceRepository,
  source_url: provenance.sourceUrl,
  original_source: provenance.originalSource,
  retrieved_at: provenance.retrievedAt,
  candidate_count: candidates.length,
  candidates,
};
const output = arg("--out");
if (!output) {
  process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
} else {
  const outputPath = resolve(output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ output: outputPath, candidates: candidates.length }, null, 2));
}
