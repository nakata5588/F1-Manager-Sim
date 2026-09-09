#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { runHeadlessSimulation } from "../src/sim/headless.js";

function readOption(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const file = process.argv[2];
if (!file || file.startsWith("--")) {
  console.error("Usage: node scripts/headless-sim.js <canonical-world.json> [--season 1980] [--days 366] [--seed value]");
  process.exit(2);
}

const season = Number(readOption("--season", "1980"));
const days = Number(readOption("--days", "366"));
const seed = readOption("--seed", `headless-${season}`);
const database = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
const result = runHeadlessSimulation(database, { season, days, seed });
console.log(JSON.stringify(result.summary, null, 2));
