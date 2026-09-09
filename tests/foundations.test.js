import test from "node:test";
import assert from "node:assert/strict";
import { advanceDay, createRng, createSaveWorld, createSeasonSnapshot } from "../src/index.js";

const db = {
  manifest: { databaseVersion: "f1db-test", sourceSha256: "abc123", readiness: { "1980": "READY" } },
  teams: [
    { team_id: "t_1", team_name: "Williams" },
    { team_id: "t_2", team_name: "Future Team" },
  ],
  teamBrands: [
    { team_id: "t_1", year: 1980, team_name: "Williams" },
    { team_id: "t_2", year: 1981, team_name: "Future Team" },
  ],
  drivers: [
    { driver_id: "d_1", display_name: "Driver One", career_start_year: 1975, career_end_year: 1985 },
    { driver_id: "d_2", display_name: "Driver Two", career_start_year: 1981, career_end_year: 1990 },
    { driver_id: "d_3", display_name: "Unknown Career Driver" },
  ],
  driverRatings: [{ year: 1980, driver_id: "d_1", pace: 80 }],
  contracts: [{ year: 1980, team_id: "t_1", driver_id: "d_1" }],
  staff: [{ staff_id: "s_1", staff_name: "Staff One" }],
  staffRatings: [{ year: 1980, staff_id: "s_1", technical: 80 }],
  staffContracts: [{ year: 1980, team_id: "t_1", staff_id: "s_1" }],
  engines: [{ engine_id: "eg_1", engine_name: "DFV" }],
  teamEngines: [{ year: 1980, team_id: "t_1", engine_id: "eg_1" }],
  carStats: [{ year: 1980, team_id: "t_1", chassis_spec: 88 }],
  facilities: [{ year: 1980, team_id: "t_1", wind_tunnel_level: 7 }],
  tracks: [{ track_id: "tr_1", track_name: "Track One" }],
  calendar: [{ year: 1980, round: 1, gp_id: "gp_1", track_id: "tr_1" }],
  rules: [
    { year: 1950, points_system: "8-6-4-3-2" },
    { year: 1980, points_system: "9-6-4-3-2-1" },
  ],
  qualifyingRules: [{ year: 1950, format_code: "best lap" }],
  eraSafety: [{ year: 1975, era_safety_index: 0.3 }],
  accidentModel: [{ year: 1970, injury_prob: 0.03 }],
};

test("historical season snapshot is season-scoped and immutable", () => {
  const snapshot = createSeasonSnapshot(db, 1980);
  assert.equal(snapshot.teams.length, 1);
  assert.equal(snapshot.teams[0].team_name, "Williams");
  assert.equal(snapshot.contracts.length, 1);
  assert.equal(snapshot.engines.length, 1);
  assert.equal(snapshot.tracks.length, 1);
  assert.equal(snapshot.calendar.length, 1);
  assert.equal(snapshot.rules.year, 1980);
  assert.equal(snapshot.qualifyingRules.year, 1950);
  assert.equal(snapshot.readinessStatus, "READY");
  assert.equal(snapshot.drivers.some((driver) => driver.driver_id === "d_3"), false);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.teams));
  assert.throws(() => snapshot.teams.push({}), TypeError);
});

test("save world is an independent mutable copy and records database provenance", () => {
  const snapshot = createSeasonSnapshot(db, 1980);
  const save = createSaveWorld(snapshot, { seed: "career-1", createdAt: "1980-01-01T00:00:00.000Z" });
  save.world.teams[0].team_name = "Alternative Williams";
  assert.equal(save.world.teams[0].team_name, "Alternative Williams");
  assert.equal(snapshot.teams[0].team_name, "Williams");
  assert.equal(save.meta.historicalDatabase.databaseVersion, "f1db-test");
  assert.equal(save.meta.historicalDatabase.sourceChecksum, "abc123");
});

test("seeded RNG is deterministic", () => {
  const a = createRng("1980-williams");
  const b = createRng("1980-williams");
  assert.deepEqual([a.next(), a.next(), a.int(1, 100)], [b.next(), b.next(), b.int(1, 100)]);
});

test("world clock advances without touching historical snapshot", () => {
  const snapshot = createSeasonSnapshot(db, 1980);
  const save = createSaveWorld(snapshot, { startDate: "1980-01-01" });
  advanceDay(save);
  assert.equal(save.clock.date, "1980-01-02");
  assert.equal(save.clock.day, 2);
  assert.equal(snapshot.season, 1980);
});
