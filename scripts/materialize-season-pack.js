#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { loadSeasonPackPayload, SeasonPackValidationError, validateSeasonPackPayload } from "../src/data/seasonPackLoader.js";
import { createSaveWorld } from "../src/save/createSaveWorld.js";
import { serializeSaveWorld } from "../src/save/serialization.js";

function usage() {
  return [
    "Usage:",
    "  node scripts/materialize-season-pack.js <season-pack.json> [output-save.json] [seed]",
    "  node scripts/materialize-season-pack.js --season-pack <payload.json> [--out <save.json>] [--seed <seed>] [--start-date YYYY-MM-DD]",
    "",
    "Canonical 1980 example:",
    "  npm run seasonpack:materialize -- --season-pack data/season-packs/1980/season-pack-1980.v0.7.json --out tmp/1980-loader-test.save.json --seed 1980-loader-test",
  ].join("\n");
}

function parseArguments(argv) {
  if (!argv.length) throw new Error(usage());
  if (!argv[0].startsWith("--")) {
    return {
      seasonPack: argv[0],
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
    out: parsed.out ?? null,
    seed: parsed.seed ?? null,
    startDate: parsed["start-date"] ?? null,
  };
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const inputPath = resolve(args.seasonPack);
  const raw = await readFile(inputPath);
  const sourceChecksum = createHash("sha256").update(raw).digest("hex");
  const payload = JSON.parse(raw.toString("utf8"));

  validateSeasonPackPayload(payload);
  const snapshot = loadSeasonPackPayload(payload, {
    sourceChecksum,
    sourcePath: inputPath,
  });
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
    teams: snapshot.teams.length,
    drivers: snapshot.drivers.length,
    loaderSafeStaff: snapshot.staff.length,
    races: snapshot.calendar.length,
    startingRaceEntries: snapshot.startingRaceEntries.length,
    fullEntrants: counts.fullEntrants ?? null,
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
