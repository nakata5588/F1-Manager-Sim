#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildCircuitLayoutCoverage } from "../tools/circuits/audit.js";
import {
  summarizeHistoricalMapSources,
  validateHistoricalMapSources,
} from "../tools/circuits/historicalMapSources.js";
import { validateCircuitLayoutCatalog } from "../src/data/circuitLayoutCatalog.js";

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

async function json(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

const season = Number(arg("--season", "1980"));
if (!Number.isInteger(season)) throw new TypeError("--season must be an integer.");
const root = arg("--root", "data/circuit-layouts");
const layoutPayload = await json(root + "/layouts.json");
const assignmentPayload = await json(root + "/season-assignments/" + season + ".json");
const candidatePayload = await json(arg("--candidates", root + "/candidate-libraries/bacinger-f1-circuits.manifest.json"));

let curatedPayload = { rows: [] };
try {
  curatedPayload = await json(arg("--curated", root + "/audits/" + season + ".json"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

let historicalMapPayload = { sources: [] };
try {
  historicalMapPayload = await json(arg("--historical-maps", root + "/historical-map-sources/" + season + ".json"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

let geometryPayload = { geometries: [] };
try {
  geometryPayload = await json(arg("--geometries", root + "/geometries/" + season + ".json"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const layouts = layoutPayload.layouts ?? [];
const assignments = assignmentPayload.assignments ?? [];
const historicalMapSources = historicalMapPayload.sources ?? [];
const geometries = geometryPayload.geometries ?? [];
const validation = validateCircuitLayoutCatalog({ layouts, assignments, geometries });
if (!validation.ok) {
  for (const issue of validation.issues) console.error("- " + issue);
  process.exitCode = 1;
  throw new Error("Circuit layout catalog validation failed.");
}

const assignedLayoutIds = new Set(assignments.map((row) => row.layout_id));
const seasonLayouts = layouts.filter((row) => assignedLayoutIds.has(row.layout_id));
const sourceValidation = validateHistoricalMapSources({
  layouts: seasonLayouts,
  sources: historicalMapSources,
  requireCoverage: historicalMapSources.length > 0,
});
if (!sourceValidation.ok) {
  for (const issue of sourceValidation.issues) console.error("- " + issue);
  process.exitCode = 1;
  throw new Error("Historical map source validation failed.");
}

const report = buildCircuitLayoutCoverage({
  season,
  layouts,
  assignments,
  candidates: candidatePayload.candidates ?? [],
  curatedRows: curatedPayload.rows ?? [],
  historicalMapSources,
  geometries,
});
report.historicalMapSourceSummary = summarizeHistoricalMapSources({
  layouts: seasonLayouts,
  sources: historicalMapSources,
});

const output = arg("--out");
if (!output) {
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
} else {
  const outputPath = resolve(output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ output: outputPath, ...report.summary }, null, 2));
}
