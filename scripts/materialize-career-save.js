#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { dirname, resolve } from "node:path";

import { createCareerFromSeasonDatabase } from "../src/data/careerBootstrap.js";
import { serializeSaveWorld } from "../src/save/serialization.js";

function usage() {
  return [
    "Usage:",
    "  node scripts/materialize-career-save.js <season-database.json|json.gz> [--global-world <global.json|json.gz>] [--out <save.json>] [--seed <seed>] [--start-date YYYY-MM-DD]",
    "",
    "Example:",
    "  npm run save:from-season-db -- F1_Manager_Sim_SeasonDefinition_1980_v1.2.5_1980_technical_source_lock_candidate.json --global-world F1_Manager_Sim_Global_Database_v1.2.5_1980_technical_source_lock_candidate.json --out build/saves/1980.save.json --seed 1980-playtest",
  ].join("\n");
}

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

async function readJson(path) {
  const raw = await readFile(path);
  const bytes = path.endsWith(".gz") ? gunzipSync(raw) : raw;
  return JSON.parse(bytes.toString("utf8"));
}

const input = process.argv[2];
if (!input || input.startsWith("--")) {
  console.error(usage());
  process.exit(2);
}

const seasonDatabasePath = resolve(input);
const globalWorldArg = argument("--global-world", null);
const globalWorldPath = globalWorldArg ? resolve(globalWorldArg) : null;
const outputArg = argument("--out", null);
const outputPath = outputArg ? resolve(outputArg) : null;
const payload = await readJson(seasonDatabasePath);
const globalDatabase = globalWorldPath ? await readJson(globalWorldPath) : null;
const save = createCareerFromSeasonDatabase(payload, {
  globalDatabase,
  seed: argument("--seed", undefined),
  startDate: argument("--start-date", undefined),
});
const serialized = serializeSaveWorld(save);

if (outputPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, "utf8");
} else {
  process.stdout.write(serialized);
}

if (outputPath) {
  console.log(JSON.stringify({
    output: outputPath,
    seasonDatabase: seasonDatabasePath,
    globalDatabase: globalWorldPath,
    season: save.meta.sourceSeason,
    databaseVersion: save.meta.seasonDatabase?.databaseVersion ?? null,
    sourceChecksum: save.meta.seasonDatabase?.sourceChecksum ?? null,
    seed: save.meta.seed,
    teams: save.world.teams?.length ?? 0,
    drivers: save.world.drivers?.length ?? 0,
    staff: save.world.staff?.length ?? 0,
    races: save.world.calendar?.length ?? 0,
    futureCalendarSeasons: Object.keys(save.reference?.futureStructure?.calendars ?? {}).length,
  }, null, 2));
}
