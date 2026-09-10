#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

import { applySeasonPackOverlay, overlaySourceChecksum } from "../src/data/seasonPackOverlay.js";
import { loadSeasonPackRuntimePayload } from "../src/data/seasonPackRuntime.js";
import { runLongRunValidation } from "../src/sim/validation/longRun.js";

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

const basePath = argument("--season-pack", "data/season-packs/1980/season-pack-1980.v0.7.json");
const overlayPath = argument("--overlay", "data/season-packs/1980/season-pack-1980.v0.8.overlay.json.gz");
const seasons = Math.max(1, Math.round(Number(argument("--seasons", 10))));
const seed = argument("--seed", "seasonpack-1980-long-run");

const base = JSON.parse(await readFile(basePath, "utf8"));
const overlayRaw = await readFile(overlayPath);
const overlay = JSON.parse(gunzipSync(overlayRaw).toString("utf8"));
const payload = applySeasonPackOverlay(base, overlay);
const checksum = overlaySourceChecksum(overlay);
const snapshot = loadSeasonPackRuntimePayload(payload, {
  sourceChecksum: checksum,
  sourcePath: `${basePath} + ${overlayPath}`,
});

const result = runLongRunValidation(snapshot, { seasons, seed });
const output = {
  ok: result.report.ok,
  databaseVersion: snapshot.databaseVersion,
  sourceChecksum: checksum,
  seed,
  checkpoints: result.checkpoints,
  metrics: result.report.metrics,
  warnings: result.report.warnings,
  errors: result.report.errors,
};

console.log(JSON.stringify(output, null, 2));
if (!result.report.ok) process.exitCode = 1;
