import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import {
  applySeasonPackOverlay,
  createChampionshipSystem,
  createSaveWorld,
  dispatchSimulationEvents,
  loadSeasonPackRuntimePayload,
  RACE_EVENT,
  SIM_EVENT,
} from "../src/index.js";
import { resolveChampionshipRuleSet } from "../src/sim/championshipRules.js";

const BASE_URL = new URL("../data/season-packs/1980/season-pack-1980.v0.7.json", import.meta.url);
const OVERLAY_URL = new URL("../data/season-packs/1980/season-pack-1980.v0.8.overlay.json.gz", import.meta.url);

async function create1980Save(seed) {
  const base = JSON.parse(await readFile(BASE_URL, "utf8"));
  const overlay = JSON.parse(gunzipSync(await readFile(OVERLAY_URL)).toString("utf8"));
  const payload = applySeasonPackOverlay(base, overlay);
  const snapshot = loadSeasonPackRuntimePayload(payload);
  return createSaveWorld(snapshot, { seed, startDate: "1980-01-01" });
}

function twoTeams(save) {
  const first = save.world.startingRaceEntries[0];
  const second = save.world.startingRaceEntries.find((entry) => entry.team_id !== first.team_id);
  assert.ok(first?.driver_id && first?.team_id);
  assert.ok(second?.driver_id && second?.team_id);
  return { first, second };
}

function raceEvent(round, first, second, swapped = false) {
  const winner = swapped ? second : first;
  const runnerUp = swapped ? first : second;
  return {
    type: RACE_EVENT.COMPLETED,
    date: `1980-${String(Math.min(12, round)).padStart(2, "0")}-15`,
    payload: {
      season: 1980,
      round,
      gpId: `TEST-GP-${round}`,
      classification: [
        { position: 1, driverId: winner.driver_id, teamId: winner.team_id, status: "FINISHED" },
        { position: 2, driverId: runnerUp.driver_id, teamId: runnerUp.team_id, status: "FINISHED" },
      ],
    },
  };
}

test("SeasonPack 1980 resolves official split driver scoring and all-round constructor scoring", async () => {
  const save = await create1980Save("championship-rules-resolve");
  const rules = resolveChampionshipRuleSet(save, 1980);

  assert.deepEqual(rules.pointsSystem, [9, 6, 4, 3, 2, 1]);
  assert.deepEqual(rules.driver.segments, [
    { roundStart: 1, roundEnd: 7, bestResults: 5 },
    { roundStart: 8, roundEnd: 14, bestResults: 5 },
  ]);
  assert.equal(rules.driver.mode, "split_best_results");
  assert.equal(rules.constructors.mode, "all_scoring_finishes");
  assert.equal(rules.constructors.allRoundsCount, true);
  assert.equal(rules.expectedRounds, 14);
  assert.equal(rules.complete, true);
  assert.equal(rules.tieBreakComplete, false);
});

test("1980 standings retain gross points while applying five-plus-five counted results", async () => {
  const save = await create1980Save("championship-five-plus-five");
  const { first, second } = twoTeams(save);
  const system = createChampionshipSystem();

  dispatchSimulationEvents(save, [{
    type: SIM_EVENT.CAREER_STARTED,
    date: "1980-01-01",
    payload: { season: 1980 },
  }], [system]);

  for (let round = 1; round <= 14; round += 1) {
    dispatchSimulationEvents(save, [raceEvent(round, first, second)], [system]);
  }

  const championship = save.world.championship;
  const winner = championship.drivers[first.driver_id];
  const runnerUp = championship.drivers[second.driver_id];
  const winningConstructor = championship.constructors[first.team_id];

  assert.equal(championship.scoringMode, "split_best_results");
  assert.equal(championship.constructorScoringMode, "all_scoring_finishes");
  assert.equal(winner.grossPoints, 126);
  assert.equal(winner.countedPoints, 90);
  assert.equal(winner.droppedPoints, 36);
  assert.equal(winner.points, 90);
  assert.equal(winner.results.length, 14);
  assert.equal(winner.countedResults.length, 10);
  assert.deepEqual(winner.droppedResults.map((result) => result.round), [6, 7, 13, 14]);
  assert.equal(runnerUp.grossPoints, 84);
  assert.equal(runnerUp.countedPoints, 60);
  assert.equal(runnerUp.droppedPoints, 24);

  assert.equal(winningConstructor.grossPoints, 126);
  assert.equal(winningConstructor.countedPoints, 126);
  assert.equal(winningConstructor.droppedPoints, 0);
  assert.equal(winningConstructor.results.length, 14);

  assert.equal(championship.racesCompleted, 14);
  assert.equal(championship.seasonComplete, true);
  assert.equal(championship.driverChampionId, first.driver_id);
  assert.equal(championship.constructorChampionId, first.team_id);
  assert.equal(championship.driverChampionStatus, "resolved_unique_points");
  assert.equal(championship.constructorChampionStatus, "resolved_unique_points");
  assert.equal(championship.standingsStatus, "official_final");
});

test("1980 does not invent a champion when final counted points require an unsourced tie-break", async () => {
  const save = await create1980Save("championship-unresolved-tie");
  const { first, second } = twoTeams(save);
  const system = createChampionshipSystem();

  dispatchSimulationEvents(save, [{
    type: SIM_EVENT.CAREER_STARTED,
    date: "1980-01-01",
    payload: { season: 1980 },
  }], [system]);

  for (let round = 1; round <= 14; round += 1) {
    dispatchSimulationEvents(save, [raceEvent(round, first, second, round % 2 === 0)], [system]);
  }

  const championship = save.world.championship;
  assert.equal(championship.drivers[first.driver_id].countedPoints, 81);
  assert.equal(championship.drivers[second.driver_id].countedPoints, 81);
  assert.equal(championship.constructors[first.team_id].countedPoints, 105);
  assert.equal(championship.constructors[second.team_id].countedPoints, 105);
  assert.equal(championship.driverChampionId, null);
  assert.equal(championship.constructorChampionId, null);
  assert.equal(championship.driverChampionStatus, "tiebreak_required");
  assert.equal(championship.constructorChampionStatus, "tiebreak_required");
  assert.equal(championship.standingsStatus, "final_tiebreak_unresolved");
});
