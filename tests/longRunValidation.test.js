import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import { applySeasonPackOverlay, overlaySourceChecksum } from "../src/data/seasonPackOverlay.js";
import { loadSeasonPackRuntimePayload } from "../src/data/seasonPackRuntime.js";
import { runLongRunValidation, validateLongRunWorld } from "../src/sim/validation/longRun.js";

const BASE_URL = new URL("../data/season-packs/1980/season-pack-1980.v0.7.json", import.meta.url);
const OVERLAY_URL = new URL("../data/season-packs/1980/season-pack-1980.v0.8.overlay.json.gz", import.meta.url);

async function loadV08Snapshot() {
  const base = JSON.parse(await readFile(BASE_URL, "utf8"));
  const overlay = JSON.parse(gunzipSync(await readFile(OVERLAY_URL)).toString("utf8"));
  const payload = applySeasonPackOverlay(base, overlay);
  return loadSeasonPackRuntimePayload(payload, {
    sourceChecksum: overlaySourceChecksum(overlay),
    sourcePath: "versioned SeasonPack 1980 v0.8",
  });
}

test("real SeasonPack 1980 v0.8 survives ten autonomous seasons with coherent fallback continuity", async () => {
  const snapshot = await loadV08Snapshot();
  const result = runLongRunValidation(snapshot, {
    seasons: 10,
    seed: "seasonpack-1980-ten-season-soak",
  });

  // SeasonPack-only mode has no Global future calendar reference, so the normal
  // rollover fallback intentionally carries the 1980 14-race template forward.
  // Database baseline tests separately assert that a Season Database with Global
  // reference consumes the real variable race counts instead.
  assert.equal(result.report.ok, true, result.report.errors.join("\n"));
  assert.equal(result.report.metrics.finalSeason, 1990);
  assert.equal(result.report.metrics.races, 140);
  assert.equal(result.report.metrics.archivedChampionships, 10);
  assert.equal(result.checkpoints.length, 10);
  assert.ok(result.checkpoints.every((row) => row.races === 14));
  assert.ok(result.report.metrics.currentRaceEntries > 0);
});

test("long-run validator reports structural corruption instead of silently accepting it", () => {
  const saveWorld = {
    meta: { sourceSeason: 1980 },
    clock: { season: 1981 },
    world: {
      season: 1981,
      drivers: [{ driver_id: "D1" }],
      teams: [{ team_id: "T1" }],
      staff: [],
      raceEntryState: { current: [{ driverId: "D1", teamId: "MISSING" }] },
      employment: { drivers: {}, staff: {}, freeAgents: { drivers: [], staff: [] }, vacancies: [] },
      careerState: { drivers: { D1: { status: "active" } }, staff: {} },
      teamState: {},
      carState: {},
    },
    history: {
      races: [{ season: 1980, gpId: "GP1", classification: [{ position: 1, driverId: "UNKNOWN", teamId: "T1", status: "FINISHED", performanceIndex: 50 }] }],
      championships: [{ season: 1980, driverStandings: [{ id: "D1", points: 9 }], constructorStandings: [{ id: "T1", points: 9 }], scoringMode: "gross_points" }],
      transfers: [],
      retirements: [],
    },
  };

  const report = validateLongRunWorld(saveWorld, { startSeason: 1980, seasons: 1, expectedRacesPerSeason: 1 });
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((message) => message.includes("unknown driver UNKNOWN")));
  assert.ok(report.errors.some((message) => message.includes("unknown team MISSING")));
});
