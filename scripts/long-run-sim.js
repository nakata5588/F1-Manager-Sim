#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

import { applySeasonPackOverlay, overlaySourceChecksum } from "../src/data/seasonPackOverlay.js";
import { loadSeasonPackRuntimePayload } from "../src/data/seasonPackRuntime.js";
import { loadHistoricalSeason } from "../src/domain/historicalWorld.js";
import { runLongRunValidation } from "../src/sim/validation/longRun.js";

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

const globalWorldPath = argument("--global-world", null);
const basePath = argument("--season-pack", "data/season-packs/1980/season-pack-1980.v0.7.json");
const overlayPath = argument("--overlay", "data/season-packs/1980/season-pack-1980.v0.8.overlay.json.gz");
const season = Math.round(Number(argument("--season", 1980)));
const seasons = Math.max(1, Math.round(Number(argument("--seasons", 10))));
const seed = argument("--seed", globalWorldPath ? `global-${season}-long-run` : "seasonpack-1980-long-run");
const explicitExpectedRaces = argument("--expected-races", null);

let snapshot;
let sourceChecksum;
let sourceMode;
let sourcePath;

if (globalWorldPath) {
  const globalRaw = await readFile(globalWorldPath, "utf8");
  const database = JSON.parse(globalRaw);
  snapshot = loadHistoricalSeason(database, season, { allowWarnings: true });
  sourceChecksum = snapshot.sourceChecksum ?? database.manifest?.sourceSha256 ?? null;
  sourceMode = "global_database";
  sourcePath = globalWorldPath;
} else {
  const base = JSON.parse(await readFile(basePath, "utf8"));
  const overlayRaw = await readFile(overlayPath);
  const overlay = JSON.parse(gunzipSync(overlayRaw).toString("utf8"));
  const payload = applySeasonPackOverlay(base, overlay);
  sourceChecksum = overlaySourceChecksum(overlay);
  snapshot = loadSeasonPackRuntimePayload(payload, {
    sourceChecksum,
    sourcePath: `${basePath} + ${overlayPath}`,
  });
  sourceMode = "season_pack";
  sourcePath = `${basePath} + ${overlayPath}`;
}

const expectedRacesPerSeason = explicitExpectedRaces === null
  ? (sourceMode === "global_database" ? Number.NaN : undefined)
  : Number(explicitExpectedRaces);

const result = runLongRunValidation(snapshot, {
  seasons,
  seed,
  expectedRacesPerSeason,
});

const calendarSources = (result.saveWorld.history?.seasons ?? [])
  .filter((row) => Number(row.season) >= season && Number(row.season) < season + seasons)
  .map((row) => ({
    season: row.season,
    races: row.races,
    source: row.calendarSource ?? (row.calendarGenerated ? "previous_season_calendar_fallback" : "active_world_existing"),
  }));

const output = {
  ok: result.report.ok,
  sourceMode,
  sourcePath,
  databaseVersion: snapshot.databaseVersion,
  sourceChecksum,
  seed,
  startSeason: season,
  checkpoints: result.checkpoints,
  calendarSources,
  metrics: result.report.metrics,
  warnings: result.report.warnings,
  errors: result.report.errors,
};

console.log(JSON.stringify(output, null, 2));
if (!result.report.ok) process.exitCode = 1;
