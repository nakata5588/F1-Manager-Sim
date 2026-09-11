#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

import { mergeSeasonBoundaryReferences } from "../src/data/seasonDatabase.js";
import { applySeasonPackOverlay, overlaySourceChecksum } from "../src/data/seasonPackOverlay.js";
import { loadSeasonPackRuntimePayload, validateSeasonPackRuntimePayload } from "../src/data/seasonPackRuntime.js";
import { SeasonPackValidationError } from "../src/data/seasonPackLoader.js";
import { loadHistoricalSeason } from "../src/domain/historicalWorld.js";
import { createSaveWorld } from "../src/save/createSaveWorld.js";
import { serializeSaveWorld } from "../src/save/serialization.js";

function usage() {
  return [
    "Usage:",
    "  node scripts/materialize-season-pack.js <season-pack.json> [output-save.json] [seed]",
    "  node scripts/materialize-season-pack.js --season-pack <payload.json> [--overlay <overlay.json|overlay.json.gz>] [--global-world <canonical-world.json>] [--out <save.json>] [--seed <seed>] [--start-date YYYY-MM-DD]",
    "",
    "Canonical 1980 v0.8 example with Global history boundary:",
    "  npm run seasonpack:materialize -- --season-pack data/season-packs/1980/season-pack-1980.v0.7.json --overlay data/season-packs/1980/season-pack-1980.v0.8.overlay.json.gz --global-world build/historical/canonical-world.json --out tmp/1980-loader-test.save.json --seed 1980-loader-test",
  ].join("\n");
}

function parseArguments(argv) {
  if (!argv.length) throw new Error(usage());
  if (!argv[0].startsWith("--")) {
    return {
      seasonPack: argv[0],
      overlay: null,
      globalWorld: null,
      out: argv[1] ?? null,
      seed: argv[2] ?? null,
      startDate: null,
    };
  }

  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument '${token}'.\n${usage()}`);
    const key = token.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for --${key}.\n${usage()}`);
    parsed[key] = value;
    index += 1;
  }
  if (!parsed["season-pack"]) throw new Error(`--season-pack is required.\n${usage()}`);
  return {
    seasonPack: parsed["season-pack"],
    overlay: parsed.overlay ?? null,
    globalWorld: parsed["global-world"] ?? null,
    out: parsed.out ?? null,
    seed: parsed.seed ?? null,
    startDate: parsed["start-date"] ?? null,
  };
}

function parseOverlay(raw, path) {
  const bytes = path.endsWith(".gz") ? gunzipSync(raw) : raw;
  return JSON.parse(bytes.toString("utf8"));
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const inputPath = resolve(args.seasonPack);
  const raw = await readFile(inputPath);
  let payload = JSON.parse(raw.toString("utf8"));
  let sourceChecksum = createHash("sha256").update(raw).digest("hex");
  let sourcePath = inputPath;

  if (args.overlay) {
    const overlayPath = resolve(args.overlay);
    const overlayRaw = await readFile(overlayPath);
    const overlay = parseOverlay(overlayRaw, overlayPath);
    payload = applySeasonPackOverlay(payload, overlay);
    sourceChecksum = overlaySourceChecksum(overlay) ?? createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    sourcePath = `${inputPath} + ${overlayPath}`;
  }

  validateSeasonPackRuntimePayload(payload);
  let snapshot = loadSeasonPackRuntimePayload(payload, {
    sourceChecksum,
    sourcePath,
  });

  let globalBoundary = null;
  if (args.globalWorld) {
    const globalPath = resolve(args.globalWorld);
    const globalDatabase = JSON.parse(await readFile(globalPath, "utf8"));
    const globalSnapshot = loadHistoricalSeason(globalDatabase, snapshot.season, { allowWarnings: true });
    snapshot = mergeSeasonBoundaryReferences(snapshot, globalSnapshot);
    globalBoundary = {
      path: globalPath,
      databaseVersion: globalSnapshot.databaseVersion ?? null,
      sourceChecksum: globalSnapshot.sourceChecksum ?? null,
    };
  }

  const save = createSaveWorld(snapshot, {
    seed: args.seed ?? `${snapshot.season}-season-pack`,
    startDate: args.startDate ?? undefined,
  });
  const serialized = serializeSaveWorld(save);

  if (!args.out) {
    process.stdout.write(serialized);
    return;
  }

  const outputPath = resolve(args.out);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, "utf8");
  const counts = snapshot.seasonPack?.counts ?? {};
  console.log(JSON.stringify({
    output: outputPath,
    season: snapshot.season,
    databaseVersion: snapshot.databaseVersion,
    sourceChecksum,
    globalBoundary,
    teams: snapshot.teams.length,
    drivers: snapshot.drivers.length,
    loaderSafeStaff: snapshot.staff.length,
    races: snapshot.calendar.length,
    historicalRacesBeforeStart: snapshot.historicalArchive?.calendar?.length ?? 0,
    historicalResultRowsBeforeStart: snapshot.historicalArchive?.raceResults?.length ?? 0,
    futureCalendarSeasons: Object.keys(snapshot.futureStructure?.calendars ?? {}).length,
    futureDrivers: snapshot.futureDrivers?.length ?? 0,
    futureTeams: snapshot.futureTeams?.length ?? 0,
    startingRaceEntries: snapshot.startingRaceEntries.length,
    fullEntrants: counts.fullEntrants ?? null,
    carPerformanceModels: counts.carPerformanceModels ?? null,
    engineModels: counts.engineModels ?? null,
    tyreModels: counts.tyreModels ?? null,
  }, null, 2));
}

main().catch((error) => {
  if (error instanceof SeasonPackValidationError) {
    console.error(error.message);
    for (const issue of error.issues) console.error(`- ${issue}`);
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
});
