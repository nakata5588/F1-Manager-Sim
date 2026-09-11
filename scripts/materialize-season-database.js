#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  createSeasonDatabasePayload,
  validateSeasonDatabasePayload,
} from "../src/data/seasonDatabase.js";

function usage() {
  return [
    "Usage:",
    "  node scripts/materialize-season-database.js <canonical-world.json> --season <year> [--out <season-db.json>]",
    "",
    "Example:",
    "  npm run seasondb:materialize -- build/historical/canonical-world.json --season 1980 --out build/season-databases/1980.json",
  ].join("\n");
}

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

const input = process.argv[2];
if (!input || input.startsWith("--")) {
  console.error(usage());
  process.exit(2);
}

const season = Number(argument("--season"));
if (!Number.isInteger(season)) {
  console.error("--season must be an integer.\n" + usage());
  process.exit(2);
}

const output = argument("--out", `build/season-databases/${season}.json`);
const inputPath = resolve(input);
const outputPath = resolve(output);
const database = JSON.parse(await readFile(inputPath, "utf8"));
const payload = createSeasonDatabasePayload(database, season, { createdAt: new Date().toISOString() });
validateSeasonDatabasePayload(payload);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(payload, null, 2) + "\n", "utf8");

const archive = payload.snapshot.historicalArchive ?? {};
const future = payload.snapshot.futureStructure ?? {};
console.log(JSON.stringify({
  output: outputPath,
  season,
  databaseVersion: payload.databaseVersion,
  sourceChecksum: payload.sourceChecksum,
  active: {
    teams: payload.snapshot.teams?.length ?? 0,
    drivers: payload.snapshot.drivers?.length ?? 0,
    races: payload.snapshot.calendar?.length ?? 0,
  },
  history: {
    throughSeason: archive.throughSeason ?? null,
    races: archive.calendar?.length ?? 0,
    resultRows: archive.raceResults?.length ?? 0,
  },
  future: {
    entityQueue: payload.snapshot.futureEntities?.length ?? 0,
    drivers: payload.snapshot.futureDrivers?.length ?? 0,
    teams: payload.snapshot.futureTeams?.length ?? 0,
    calendarSeasons: Object.keys(future.calendars ?? {}).length,
    futureRaceResultsIncluded: Object.hasOwn(future, "raceResults"),
  },
}, null, 2));
