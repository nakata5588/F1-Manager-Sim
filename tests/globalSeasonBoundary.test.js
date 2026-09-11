import assert from "node:assert/strict";
import test from "node:test";

import {
  createSaveWorld,
  createSeasonRolloverSystem,
  createSeasonSnapshot,
} from "../src/index.js";

function globalDatabase() {
  return {
    manifest: {
      databaseVersion: "global-test",
      sourceSha256: "global-sha",
      readiness: { "1980": "READY", "2000": "READY" },
      supportedSeasons: [1980, 2000],
    },
    teams: [
      { team_id: "T0", team_name: "Old Team" },
      { team_id: "T1", team_name: "1980 Team" },
      { team_id: "T2", team_name: "Future Team" },
      { team_id: "T3", team_name: "2000 Team" },
      { team_id: "T4", team_name: "2001 Team" },
    ],
    teamBrands: [
      { year: 1979, team_id: "T0", team_name: "Old Team" },
      { year: 1980, team_id: "T1", team_name: "1980 Team" },
      { year: 1981, team_id: "T2", team_name: "Future Team" },
      { year: 2000, team_id: "T3", team_name: "2000 Team" },
      { year: 2001, team_id: "T4", team_name: "2001 Team" },
    ],
    drivers: [
      { driver_id: "D0", display_name: "Past Driver", career_start_year: 1970, career_end_year: 1979 },
      { driver_id: "D1", display_name: "1980 Driver", career_start_year: 1975, career_end_year: 1987, team_id: "T1" },
      { driver_id: "D2", display_name: "Future Driver", f1_rookie_season: 1981, career_end_year: 1992, team_id: "T2" },
      { driver_id: "D3", display_name: "2000 Driver", career_start_year: 1998, career_end_year: 2005, team_id: "T3" },
      { driver_id: "D4", display_name: "2001 Driver", f1_rookie_season: 2001, career_end_year: 2010, team_id: "T4" },
    ],
    driverRatings: [
      { year: 1979, driver_id: "D0", pace: 65 },
      { year: 1980, driver_id: "D1", pace: 80 },
      { year: 2000, driver_id: "D3", pace: 82 },
    ],
    driverCareer: [
      { year: 1979, driver_id: "D0", starts: 8 },
      { year: 1980, driver_id: "D1", starts: 14 },
      { year: 2001, driver_id: "D4", starts: 10 },
    ],
    contracts: [
      { year: 1980, team_id: "T1", driver_id: "D1", role: "main_driver" },
      { year: 2000, team_id: "T3", driver_id: "D3", role: "main_driver" },
    ],
    staff: [],
    staffRatings: [],
    staffContracts: [],
    engines: [{ engine_id: "E1" }, { engine_id: "E3" }],
    teamEngines: [
      { year: 1980, team_id: "T1", engine_id: "E1" },
      { year: 2000, team_id: "T3", engine_id: "E3" },
    ],
    carStats: [
      { year: 1980, team_id: "T1", chassis_spec: 70 },
      { year: 2000, team_id: "T3", chassis_spec: 80 },
    ],
    facilities: [],
    tracks: [
      { track_id: "TR0", track_name: "Past Track" },
      { track_id: "TR1", track_name: "Start Track" },
      { track_id: "TR2", track_name: "Future Track" },
      { track_id: "TR3", track_name: "Millennium Track" },
      { track_id: "TR4", track_name: "Later Track" },
    ],
    calendar: [
      { year: 1979, round: 1, race_id: "R1979", gp_id: "GP1979", track_id: "TR0", race_date: "1979-03-01" },
      { year: 1980, round: 1, race_id: "R1980A", gp_id: "GP1980A", track_id: "TR1", race_date: "1980-03-01" },
      { year: 1980, round: 2, race_id: "R1980B", gp_id: "GP1980B", track_id: "TR1", race_date: "1980-04-01" },
      { year: 1981, round: 1, race_id: "R1981A", gp_id: "GP1981A", track_id: "TR2", race_date: "1981-02-01", winner_driver_id: "D2" },
      { year: 1981, round: 2, race_id: "R1981B", gp_id: "GP1981B", track_id: "TR1", race_date: "1981-03-01" },
      { year: 1981, round: 3, race_id: "R1981C", gp_id: "GP1981C", track_id: "TR2", race_date: "1981-04-01" },
      { year: 2000, round: 1, race_id: "R2000", gp_id: "GP2000", track_id: "TR3", race_date: "2000-03-01" },
      { year: 2001, round: 1, race_id: "R2001A", gp_id: "GP2001A", track_id: "TR4", race_date: "2001-03-01" },
      { year: 2001, round: 2, race_id: "R2001B", gp_id: "GP2001B", track_id: "TR3", race_date: "2001-04-01" },
    ],
    raceResults: [
      { race_id: "R1979", driver_id: "D0", position: 1, points: 9 },
      { race_id: "R1980A", driver_id: "D1", position: 1, points: 9 },
      { race_id: "R1981A", driver_id: "D2", position: 1, points: 9 },
      { race_id: "R2001A", driver_id: "D4", position: 1, points: 10 },
    ],
    rules: [
      { year: 1979, points_system: "9-6-4" },
      { year: 1980, points_system: "9-6-4-3-2-1" },
      { year: 1981, points_system: "9-6-4-3-2-1" },
      { year: 2000, points_system: "10-6-4-3-2-1" },
      { year: 2001, points_system: "10-6-4-3-2-1" },
    ],
    qualifyingRules: [],
    eraSafety: [],
    accidentModel: [],
    teamFinancials: [],
    sponsorContracts: [],
    financeLedger: [],
    rdProjects: [],
    tyreCatalog: [],
    events: [
      { date: "1979-06-01", event_id: "PAST" },
      { date: "1981-06-01", event_id: "FUTURE" },
    ],
    achievements: [{ year: 1979, achievement_id: "A1" }, { year: 1981, achievement_id: "A2" }],
  };
}

test("1980 Season Database contains past history, active 1980 state and hidden structural future without future outcomes", () => {
  const snapshot = createSeasonSnapshot(globalDatabase(), 1980);

  assert.deepEqual(snapshot.calendar.map((row) => row.race_id), ["R1980A", "R1980B"]);
  assert.deepEqual(snapshot.historicalArchive.calendar.map((row) => row.race_id), ["R1979"]);
  assert.deepEqual(snapshot.historicalArchive.raceResults.map((row) => row.race_id), ["R1979"]);
  assert.equal(snapshot.historicalArchive.events.some((row) => row.event_id === "FUTURE"), false);

  assert.equal(snapshot.futureStructure.calendars["1981"].length, 3);
  assert.equal(snapshot.futureStructure.calendars["1981"][0].winner_driver_id, undefined);
  assert.equal(Object.hasOwn(snapshot.futureStructure, "raceResults"), false);
  assert.ok(snapshot.futureStructure.tracks.some((row) => row.track_id === "TR2"));

  assert.ok(snapshot.futureEntities.some((row) => row.entity_type === "driver" && row.entity_id === "D2"));
  assert.ok(snapshot.futureEntities.some((row) => row.entity_type === "team" && row.entity_id === "T2"));
  assert.ok(snapshot.futureDrivers.some((row) => row.driver_id === "D2"));
  assert.equal(snapshot.futureDrivers.find((row) => row.driver_id === "D2").team_id, undefined);
  assert.equal(snapshot.drivers.find((row) => row.driver_id === "D1").career_end_year, undefined);
});

test("Save World keeps pre-career history and hidden future structure outside the mutable active world", () => {
  const snapshot = createSeasonSnapshot(globalDatabase(), 1980);
  const save = createSaveWorld(snapshot, { createdAt: "1980-01-01T00:00:00.000Z" });

  assert.equal(save.history.preCareer.throughSeason, 1979);
  assert.deepEqual(save.history.preCareer.raceResults.map((row) => row.race_id), ["R1979"]);
  assert.equal(save.world.historicalArchive, undefined);
  assert.equal(save.world.futureStructure, undefined);
  assert.equal(save.reference.futureStructure.calendars["1981"].length, 3);
  assert.equal(save.world.futureEntities.some((row) => row.entity_id === "D2"), true);
});

test("season rollover consumes hidden historical calendar structure and does not repeat the previous race count", () => {
  const snapshot = createSeasonSnapshot(globalDatabase(), 1980);
  const save = createSaveWorld(snapshot, { createdAt: "1980-01-01T00:00:00.000Z" });
  const system = createSeasonRolloverSystem();

  const output = system.handle({
    saveWorld: save,
    event: { date: "1981-01-01", payload: { season: 1981, previousSeason: 1980 } },
  });

  assert.equal(save.world.calendar.length, 3);
  assert.equal(save.world.calendar[0].generation_source, "global_historical_calendar_reference");
  assert.equal(save.world.calendar[0].winner_driver_id, undefined);
  assert.ok(save.world.tracks.some((row) => row.track_id === "TR2"));
  assert.equal(output.payload.calendar_source, "global_historical_calendar_reference");
  assert.equal(output.payload.races, 3);
});

test("the same Global Database can materialize a 2000 start without exposing 2001 results", () => {
  const snapshot = createSeasonSnapshot(globalDatabase(), 2000);

  assert.deepEqual(snapshot.calendar.map((row) => row.race_id), ["R2000"]);
  assert.ok(snapshot.historicalArchive.calendar.some((row) => row.race_id === "R1981A"));
  assert.ok(snapshot.historicalArchive.raceResults.some((row) => row.race_id === "R1981A"));
  assert.equal(snapshot.historicalArchive.raceResults.some((row) => row.race_id === "R2001A"), false);
  assert.equal(snapshot.futureStructure.calendars["2001"].length, 2);
  assert.ok(snapshot.futureEntities.some((row) => row.entity_type === "driver" && row.entity_id === "D4"));
  assert.ok(snapshot.futureEntities.some((row) => row.entity_type === "team" && row.entity_id === "T4"));
});
