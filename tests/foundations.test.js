import test from "node:test";
import assert from "node:assert/strict";
import { advanceDay, createRng, createSaveWorld, createSeasonSnapshot } from "../src/index.js";

const db = {
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
  ],
  driverRatings: [{ year: 1980, driver_id: "d_1", pace: 80 }],
  contracts: [{ year: 1980, team_id: "t_1", driver_id: "d_1" }],
  staff: [],
  staffRatings: [],
  staffContracts: [],
  teamEngines: [{ year: 1980, team_id: "t_1", engine_id: "eg_1" }],
  carStats: [{ year: 1980, team_id: "t_1", chassis_spec: 88 }],
  facilities: [{ year: 1980, team_id: "t_1", wind_tunnel_level: 7 }],
  calendar: [{ year: 1980, round: 1, gp_id: "gp_1" }],
  rules: [{ year: 1980, points_system: "9-6-4-3-2-1" }],
};

test("historical season snapshot is season-scoped and immutable", () => {
  const snapshot = createSeasonSnapshot(db, 1980);
  assert.equal(snapshot.teams.length, 1);
  assert.equal(snapshot.teams[0].team_name, "Williams");
  assert.equal(snapshot.contracts.length, 1);
  assert.equal(snapshot.calendar.length, 1);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.teams));
  assert.throws(() => snapshot.teams.push({}), TypeError);
});

test("save world is an independent mutable copy of historical data", () => {
  const snapshot = createSeasonSnapshot(db, 1980);
  const save = createSaveWorld(snapshot, { seed: "career-1", createdAt: "1980-01-01T00:00:00.000Z" });
  save.world.teams[0].team_name = "Alternative Williams";
  assert.equal(save.world.teams[0].team_name, "Alternative Williams");
  assert.equal(snapshot.teams[0].team_name, "Williams");
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
