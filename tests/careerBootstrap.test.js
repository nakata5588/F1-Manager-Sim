import assert from "node:assert/strict";
import test from "node:test";

import {
  createCareerFromSeasonDatabase,
  createSeasonDatabasePayload,
  validateSeasonDatabaseAgainstGlobal,
} from "../src/index.js";

function globalDatabase() {
  return {
    manifest: {
      databaseVersion: "f1db-test",
      sourceSha256: "global-source-sha",
      readiness: { "1980": "READY" },
      supportedSeasons: [1980],
    },
    teams: [{ team_id: "T1", team_name: "Team One" }],
    teamBrands: [{ year: 1980, team_id: "T1", team_name: "Team One" }],
    drivers: [
      { driver_id: "D1", display_name: "Driver One", f1_eligible_from: 1979 },
      { driver_id: "D2", display_name: "Future Driver", world_visible_from: 1981, talent_visible_from: 1982, f1_eligible_from: 1983 },
    ],
    driverRatings: [{ year: 1980, driver_id: "D1", pace: 80 }],
    driverCareer: [{ year: 1979, driver_id: "D1", starts: 10 }],
    contracts: [{ year: 1980, team_id: "T1", driver_id: "D1", role: "main_driver" }],
    staff: [],
    staffRatings: [],
    staffContracts: [],
    engines: [],
    teamEngines: [],
    carStats: [],
    facilities: [],
    teamFinancials: [],
    sponsorContracts: [],
    financeLedger: [],
    rdProjects: [],
    tyreCatalog: [],
    tracks: [
      { track_id: "TR0", track_name: "Past Track" },
      { track_id: "TR1", track_name: "Start Track" },
      { track_id: "TR2", track_name: "Future Track" },
    ],
    calendar: [
      { year: 1979, round: 1, race_id: "R1979", gp_id: "GP1979", track_id: "TR0", race_date: "1979-03-01" },
      { year: 1980, round: 1, race_id: "R1980", gp_id: "GP1980", track_id: "TR1", race_date: "1980-03-01" },
      { year: 1981, round: 1, race_id: "R1981", gp_id: "GP1981", track_id: "TR2", race_date: "1981-03-01", winner_driver_id: "D2" },
    ],
    raceResults: [{ race_id: "R1979", driver_id: "D1", position: 1, points: 9 }],
    rules: [{ year: 1980, points_system: "9-6-4-3-2-1" }],
    qualifyingRules: [],
    eraSafety: [],
    accidentModel: [],
    events: [],
    achievements: [],
  };
}

test("canonical career bootstrap creates Save World directly from a validated Season Database", () => {
  const global = globalDatabase();
  const payload = createSeasonDatabasePayload(global, 1980, { createdAt: "1980-01-01T00:00:00.000Z" });
  const save = createCareerFromSeasonDatabase(payload, {
    globalDatabase: global,
    seed: "bootstrap-test",
    startDate: "1980-01-01",
    createdAt: "1980-01-01T00:00:00.000Z",
  });

  assert.equal(save.meta.sourceSeason, 1980);
  assert.equal(save.meta.seed, "bootstrap-test");
  assert.equal(save.meta.seasonDatabase.format, "f1-manager-sim-season-database");
  assert.equal(save.meta.seasonDatabase.databaseVersion, "f1db-test");
  assert.equal(save.meta.seasonDatabase.sourceChecksum, "global-source-sha");
  assert.equal(save.meta.careerBootstrap.source, "season_database");
  assert.equal(save.meta.careerBootstrap.globalCompatibilityValidated, true);
  assert.equal(save.meta.careerBootstrap.futureOutcomesAuthoritative, false);

  assert.equal(save.world.historicalArchive, undefined);
  assert.equal(save.world.futureStructure, undefined);
  assert.equal(save.history.preCareer.raceResults.length, 1);
  assert.equal(save.reference.futureStructure.calendars["1981"].length, 1);
  assert.equal(save.reference.futureStructure.calendars["1981"][0].winner_driver_id, undefined);
  assert.ok(save.world.futureDrivers.some((row) => row.driver_id === "D2"));
});

test("career bootstrap refuses a Season Database from a different Global Database source", () => {
  const global = globalDatabase();
  const payload = createSeasonDatabasePayload(global, 1980);
  const wrongGlobal = structuredClone(global);
  wrongGlobal.manifest.sourceSha256 = "different-source-sha";

  assert.throws(
    () => validateSeasonDatabaseAgainstGlobal(payload, wrongGlobal),
    /sourceChecksum does not match Global Database sourceSha256/,
  );
});

test("career bootstrap refuses a season no longer declared career-ready by the Global Database", () => {
  const global = globalDatabase();
  const payload = createSeasonDatabasePayload(global, 1980);
  const blocked = structuredClone(global);
  blocked.manifest.readiness["1980"] = "BLOCKED";

  assert.throws(
    () => createCareerFromSeasonDatabase(payload, { globalDatabase: blocked }),
    /not career-ready/,
  );
});
