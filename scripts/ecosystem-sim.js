#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

import { applySeasonPackOverlay } from "../src/data/seasonPackOverlay.js";
import { loadSeasonPackRuntimePayload } from "../src/data/seasonPackRuntime.js";
import { runLongRunMatrix } from "../src/sim/validation/ecosystem.js";

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

const basePath = argument("--season-pack", "data/season-packs/1980/season-pack-1980.v0.7.json");
const v08Path = argument("--overlay-v08", "data/season-packs/1980/season-pack-1980.v0.8.overlay.json.gz");
const v09Path = argument("--overlay-v09", "data/season-packs/1980/season-pack-1980.v0.9.circuit-layout.overlay.json");
const seasons = Math.max(1, Math.round(Number(argument("--seasons", 20))));
const seedCount = Math.max(1, Math.round(Number(argument("--seeds", 10))));
const seedPrefix = argument("--seed-prefix", "1980-ecosystem");

const base = JSON.parse(await readFile(basePath, "utf8"));
const v08 = JSON.parse(gunzipSync(await readFile(v08Path)).toString("utf8"));
const v09 = JSON.parse(await readFile(v09Path, "utf8"));
const payload = applySeasonPackOverlay(applySeasonPackOverlay(base, v08), v09);
const snapshot = loadSeasonPackRuntimePayload(payload, {
  sourceChecksum: v09.sourcePayloadSha256 ?? null,
  sourcePath: `${basePath} + ${v08Path} + ${v09Path}`,
});

const report = runLongRunMatrix(snapshot, { seasons, seedCount, seedPrefix });
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
