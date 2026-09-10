import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceDays,
  createEntityAvailabilitySystem,
  createSaveWorld,
  createSeasonSnapshot,
  ENTITY_EVENT,
  initializeSimulation,
  SIM_EVENT,
} from "../src/index.js";

function databaseWithFutureEntities() {
  return {
    teams: [
      { team_id: "TEAM_CURRENT", team_name: "Current Team" },
      { team_id: "TEAM_FUTURE", team_name: "Future Team" },
    ],
    teamBrands: [{ year: 1980, team_id: "TEAM_CURRENT", team_name: "Current Team" }],
    drivers: [
      { driver_id: "DRV_CURRENT", display_name: "Current Driver", career_start_year: 1978, career_end_year: 1985 },
      { driver_id: "DRV_FUTURE", display_name: "Future Talent" },
    ],
    driverRatings: [{ year: 1980, driver_id: "DRV_CURRENT", pace: 70 }],
    contracts: [{ year: 1980, team_id: "TEAM_CURRENT", driver_id: "DRV_CURRENT" }],
    staff: [],
    staffRatings: [],
    staffContracts: [],
    engines: [],
    teamEngines: [],
    carStats: [],
    facilities: [],
    tracks: [],
    calendar: [],
    rules: [],
    qualifyingRules: [],
    eraSafety: [],
    accidentModel: [],
    availabilityTimeline: [
      {
        entity_type: "driver",
        entity_id: "DRV_FUTURE",
        name: "Future Talent",
        activation_year: 1980,
        next_reference_f1_entry_year: 1984,
        eligible_when_reached: true,
        state_at_1980: "active_non_f1_pool",
      },
      {
        entity_type: "team",
        entity_id: "TEAM_FUTURE",
        name: "Future Team",
        activation_year: 1981,
        next_reference_f1_entry_year: 1981,
        eligible_when_reached: true,
        state_at_1980: "future_team",
      },
    ],
  };
}

test("season snapshot carries future entity queue and profiles without activating them", () => {
  const snapshot = createSeasonSnapshot(databaseWithFutureEntities(), 1980);
  assert.equal(snapshot.futureEntities.length, 2);
  assert.deepEqual(snapshot.futureDrivers.map((row) => row.driver_id), ["DRV_FUTURE"]);
  assert.deepEqual(snapshot.futureTeams.map((row) => row.team_id), ["TEAM_FUTURE"]);
  assert.equal(snapshot.drivers.some((row) => row.driver_id === "DRV_FUTURE"), false);
  assert.equal(snapshot.teams.some((row) => row.team_id === "TEAM_FUTURE"), false);
});

test("career start makes already-reached talent eligible without scripting F1 entry", () => {
  const snapshot = createSeasonSnapshot(databaseWithFutureEntities(), 1980);
  const save = createSaveWorld(snapshot, { startDate: "1980-01-01" });
  const system = createEntityAvailabilitySystem();

  const result = initializeSimulation(save, [system]);
  assert.deepEqual(result.events.map((event) => event.type), [SIM_EVENT.CAREER_STARTED, ENTITY_EVENT.ELIGIBLE]);
  assert.equal(save.world.entityAvailability.driver.DRV_FUTURE.status, "eligible");
  assert.equal(save.world.entityAvailability.driver.DRV_FUTURE.referenceEntryYear, 1984);
  assert.equal(save.world.drivers.some((row) => row.driver_id === "DRV_FUTURE"), false);

  const repeated = initializeSimulation(save, [system]);
  assert.deepEqual(repeated.events, []);
});

test("future organisation becomes eligible at its activation season but is not auto-entered", () => {
  const snapshot = createSeasonSnapshot(databaseWithFutureEntities(), 1980);
  const save = createSaveWorld(snapshot, { startDate: "1980-12-31" });
  const system = createEntityAvailabilitySystem();
  initializeSimulation(save, [system]);

  const result = advanceDays(save, 1, [system]);
  assert.equal(save.clock.date, "1981-01-01");
  assert.ok(result.events.some((event) => event.type === SIM_EVENT.SEASON_STARTED));
  assert.ok(result.events.some((event) => event.type === ENTITY_EVENT.ELIGIBLE && event.payload.entity_id === "TEAM_FUTURE"));
  assert.equal(save.world.entityAvailability.team.TEAM_FUTURE.status, "eligible");
  assert.equal(save.world.teams.some((row) => row.team_id === "TEAM_FUTURE"), false);
});
