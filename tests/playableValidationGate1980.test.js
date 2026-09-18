import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import { DeveloperPlaytestSession } from "../src/app/developerPlaytest.js";
import { applySeasonPackOverlay } from "../src/data/seasonPackOverlay.js";
import { loadSeasonPackRuntimePayload } from "../src/data/seasonPackRuntime.js";
import {
  buildNewGameCatalog,
  defaultNewGameSelection,
  validateNewGameSelection,
} from "../playtest/new-game-flow.js";

const BASE_PACK_URL = new URL("../data/season-packs/1980/season-pack-1980.v0.7.json", import.meta.url);
const OVERLAY_URL = new URL("../data/season-packs/1980/season-pack-1980.v0.8.overlay.json.gz", import.meta.url);
const BASELINE_URL = new URL(
  "../data/database-baselines/v1.2.16-1980-canonical-closure-audit-consistency-candidate/baseline.json",
  import.meta.url,
);
const LATEST_URL = new URL("../data/database-baselines/LATEST_1980_CANDIDATE.json", import.meta.url);

let fixturePromise = null;

async function runtimeFixture() {
  if (!fixturePromise) fixturePromise = (async () => {
    const base = JSON.parse(await readFile(BASE_PACK_URL, "utf8"));
    const overlay = JSON.parse(gunzipSync(await readFile(OVERLAY_URL)).toString("utf8"));
    const snapshot = loadSeasonPackRuntimePayload(applySeasonPackOverlay(base, overlay), {
      sourceChecksum: overlay.sourcePayloadSha256,
      sourcePath: "season-pack-1980.v0.7.json + season-pack-1980.v0.8.overlay.json.gz",
    });

    const mutable = structuredClone(snapshot);
    mutable.historicalArchive ??= { throughSeason: 1979, raceResults: [] };
    mutable.futureStructure ??= {
      calendars: {},
      tracks: [],
      rules: [],
      qualifyingRules: [],
      eraSafety: [],
      accidentModel: [],
    };

    return {
      format: "f1-manager-sim-season-database",
      schemaVersion: 1,
      season: 1980,
      databaseVersion: snapshot.databaseVersion,
      sourceChecksum: snapshot.sourceChecksum,
      releaseName: "1980 Runtime Validation Fixture",
      snapshot: mutable,
    };
  })();
  return fixturePromise;
}

function id(row, type) {
  return row?.[`${type}_id`] ?? row?.id ?? null;
}

function name(row, type) {
  return row?.[`${type}_name`] ?? row?.display_name ?? row?.name ?? id(row, type);
}

function roundOne(snapshot) {
  return [...(snapshot.calendar ?? [])]
    .sort((a, b) => Number(a.round ?? 0) - Number(b.round ?? 0))[0] ?? null;
}

function pointsAreZero(rows = []) {
  return rows.every((row) => Number(row.points ?? row.countedPoints ?? 0) === 0 && Number(row.wins ?? 0) === 0);
}

function assertNoFutureLeak(value, label) {
  const serialized = JSON.stringify(value);
  for (const forbidden of [
    "futureDrivers",
    "futureTeams",
    "futureStaff",
    "futureSponsors",
    "futureEntities",
    "futureStructure",
  ]) {
    assert.equal(serialized.includes(forbidden), false, `${label} must not expose ${forbidden}`);
  }
}

test("Playable Validation Gate #1 locks the real 1980 opening-world invariants", async () => {
  const [seasonDatabase, baseline, latest] = await Promise.all([
    runtimeFixture(),
    readFile(BASELINE_URL, "utf8").then(JSON.parse),
    readFile(LATEST_URL, "utf8").then(JSON.parse),
  ]);
  const snapshot = seasonDatabase.snapshot;

  assert.equal(latest.latestCandidate, baseline.databaseVersion);
  assert.equal(baseline.databaseVersion, "v1.2.16-1980-canonical-closure-audit-consistency-candidate");
  assert.equal(baseline.season1980Counts.activeTeams, 15);
  assert.equal(baseline.season1980Counts.calendarRaces, 14);
  assert.equal(baseline.promotion.readyForDevelopmentCandidateIntegration, true);

  assert.equal(snapshot.teams.length, 15, "runtime 1980 fixture must expose exactly 15 opening teams");
  assert.equal(snapshot.calendar.length, 14, "runtime 1980 fixture must expose the 14-round opening calendar");

  const williams = snapshot.teams.find((row) => /^williams$/i.test(String(name(row, "team"))));
  assert.ok(williams, "Williams must be selectable in the 1980 opening world");
  const williamsId = String(id(williams, "team"));

  const driversById = new Map((snapshot.drivers ?? []).map((row) => [String(id(row, "driver")), row]));
  const openingWilliamsDrivers = (snapshot.startingRaceEntries ?? [])
    .filter((row) => String(row.team_id ?? row.teamId ?? "") === williamsId)
    .map((row) => name(driversById.get(String(row.driver_id ?? row.driverId)), "driver"))
    .sort();

  assert.deepEqual(openingWilliamsDrivers, ["Alan Jones", "Carlos Reutemann"]);

  const firstRace = roundOne(snapshot);
  assert.equal(Number(firstRace?.round), 1);
  assert.equal(firstRace?.gp_name ?? firstRace?.race_name ?? firstRace?.name, "Argentine Grand Prix");
  assert.equal(String(firstRace?.race_date ?? firstRace?.date).slice(0, 10), "1980-01-13");
});

test("Playable Validation Gate #1 completes New Game -> Williams -> Argentine GP -> Results -> Championship", async () => {
  const seasonDatabase = await runtimeFixture();
  const session = new DeveloperPlaytestSession(seasonDatabase);
  const setup = session.setup();

  assert.equal(setup.season, 1980);
  assert.equal(setup.teams.length, 15);
  assertNoFutureLeak(setup, "New Game setup");

  const williams = setup.teams.find((row) => /^williams$/i.test(String(row.name)));
  assert.ok(williams);
  assert.deepEqual(williams.drivers.map((row) => row.name).sort(), ["Alan Jones", "Carlos Reutemann"]);

  const catalog = buildNewGameCatalog(setup);
  const selection = defaultNewGameSelection(catalog);
  selection.databaseId = catalog.databases[0].id;
  selection.decade = 1980;
  selection.season = 1980;
  selection.teamId = williams.id;
  selection.managerName = "Playable Gate Manager";
  selection.managerNationality = "Portuguese";
  selection.managerDateOfBirth = "1950-06-15";
  selection.managerBackground = "team_management";

  const validated = validateNewGameSelection(catalog, selection);
  assert.equal(validated.teamName, "Williams");
  assert.equal(validated.seasonName, "1980 Formula One World Championship");
  assert.deepEqual(validated.managerProfile, {
    name: "Playable Gate Manager",
    nationality: "Portuguese",
    dateOfBirth: "1950-06-15",
    background: "team_management",
  });

  let state = session.startCareer({
    teamId: validated.teamId,
    managerProfile: validated.managerProfile,
    seed: "playable-validation-gate-01",
  });

  assert.equal(state.screen, "home");
  assert.equal(state.career.teamName, "Williams");
  assert.equal(state.career.date, "1980-01-01");
  assert.equal(state.career.season, 1980);
  assert.deepEqual(state.teamDrivers.map((row) => row.name).sort(), ["Alan Jones", "Carlos Reutemann"]);
  assert.equal(state.nextRace.name, "Argentine Grand Prix");
  assert.equal(state.nextRace.date, "1980-01-13");
  assert.equal(state.nextRace.round, 1);
  assert.equal(session.saveWorld.history.races.length, 0);
  assert.equal(pointsAreZero(state.standings.drivers), true);
  assert.equal(pointsAreZero(state.standings.constructors), true);
  assertNoFutureLeak(state, "Career Home state");

  state = session.continue();
  assert.equal(state.screen, "practice");
  assert.equal(state.career.date, "1980-01-13");
  assert.equal(state.raceWeekend.name, "Argentine Grand Prix");
  assert.equal(state.raceWeekend.round, 1);
  assert.equal(state.raceWeekend.geometry.available, false, "current 1980 runtime must not fabricate deferred circuit coordinates");
  assert.equal(state.raceWeekend.geometry.dataStatus, "geometry_unavailable");
  assert.equal(state.raceWeekend.geometry.reason, "no_explicit_centerline");

  state = session.advanceWeekend();
  assert.equal(state.screen, "practice_results");
  assert.equal(state.raceWeekend.practice.team.length, 2);

  state = session.advanceWeekend();
  assert.equal(state.screen, "qualifying_results");
  assert.ok(state.raceWeekend.qualifying.classification.length > 0);

  state = session.advanceWeekend();
  assert.equal(state.screen, "pre_race");
  assert.ok(state.raceWeekend.grid.length > 0);
  assert.equal(state.liveRace.currentLap, 0);
  assert.equal(session.saveWorld.history.races.length, 0, "race history must remain empty before lights out");

  state = session.startRace();
  assert.equal(state.screen, "race");
  state = session.finishRace();

  assert.equal(state.screen, "race_results");
  assert.equal(state.liveRace.status, "completed");
  assert.equal(session.saveWorld.history.races.length, 1);
  assert.equal(state.lastRace.name, "Argentine Grand Prix");
  assert.ok(state.lastRace.classification.length > 0);
  assert.equal(state.standings.drivers.some((row) => Number(row.points) > 0), true);
  assert.equal(state.standings.constructors.some((row) => Number(row.points) > 0), true);
  assertNoFutureLeak(state, "Race Results state");
});
