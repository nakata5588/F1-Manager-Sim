#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSaveWorld, loadSeasonPackPayload, serializeSaveWorld } from "../src/index.js";

function usage() {
  console.error("Usage: node scripts/materialize-season-pack.js <season-pack.json> [output-save.json] [seed]");
  process.exit(2);
}

const [, , inputArg, outputArg, seedArg] = process.argv;
if (!inputArg) usage();

const inputPath = resolve(inputArg);
const raw = readFileSync(inputPath);
const checksum = createHash("sha256").update(raw).digest("hex");
const payload = JSON.parse(raw.toString("utf8"));
payload.sourceChecksum = checksum;

const snapshot = loadSeasonPackPayload(payload);
const seed = seedArg ?? `${snapshot.season}-season-pack`;
const save = createSaveWorld(snapshot, { seed });
const serialized = serializeSaveWorld(save);

if (outputArg) {
  const outputPath = resolve(outputArg);
  writeFileSync(outputPath, serialized, "utf8");
  console.log(JSON.stringify({
    output: outputPath,
    season: snapshot.season,
    databaseVersion: snapshot.databaseVersion,
    sourceChecksum: checksum,
    teams: snapshot.teams.length,
    drivers: snapshot.drivers.length,
    staff: snapshot.staff.length,
    races: snapshot.calendar.length,
    tyres: snapshot.tyres.length,
    futureEntities: snapshot.futureEntities.length,
  }, null, 2));
} else {
  process.stdout.write(serialized);
}
