import test from "node:test";
import assert from "node:assert/strict";
import {
  createEmploymentMarketSystem,
  createSaveWorld,
  createSeasonSnapshot,
  entityVisibilityState,
  initializeSimulation,
  isEntityF1EligibleInSeason,
  isEntityVisibleInSeason,
  listVisibleDrivers,
  listVisibleSponsors,
  listVisibleStaff,
  listVisibleTeams,
} from "../src/index.js";

function visibilityDatabase() {
  return {
    manifest: { databaseVersion: "visibility-test", sourceSha256: "vis", readiness: { "1980": "READY" } },
    teams: [
      { team_id: "TEAM_ACTIVE", team_name: "Active Team" },
      { team_id: "TEAM_FUTURE", team_name: "Future Team", world_visible_from: 1982, f1_eligible_from: 1983 },
    ],
    teamBrands: [
      { year: 1980, team_id: "TEAM_ACTIVE", team_name: "Active Team" },
      { year: 1983, team_id: "TEAM_FUTURE", team_name: "Future Team" },
    ],
    drivers: [
      {
        driver_id: "DRV_ACTIVE",
        display_name: "Active Driver",
        birth_date: "1955-01-01",
        world_visible_from: 1970,
        talent_visible_from: 1972,
        f1_eligible_from: 1975,
        f1_debut_reference: 1976,
      },
      {
        driver_id: "DRV_RETIRED",
        display_name: "Retired Driver",
        birth_date: "1940-01-01",
        world_visible_from: 1958,
        talent_visible_from: 1960,
        f1_eligible_from: 1965,
        f1_debut_reference: 1966,
        career_end_reference: 1977,
      },
      {
        driver_id: "DRV_YOUNG",
        display_name: "Young Talent",
        birth_date: "1965-06-01",
        world_visible_from: 1981,
        talent_visible_from: 1982,
        f1_eligible_from: 1984,
        f1_debut_reference: 1985,
        career_end_reference: 2001,
      },
    ],
    driverRatings: [{ year: 1980, driver_id: "DRV_ACTIVE", pace: 75 }],
    driverCareer: [
      { year: 1970, driver_id: "DRV_RETIRED", starts: 5 },
      { year: 1976, driver_id: "DRV_ACTIVE", starts: 8 },
    ],
    contracts: [{ year: 1980, team_id: "TEAM_ACTIVE", driver_id: "DRV_ACTIVE", role: "main_driver" }],
    staff: [
      { staff_id: "STAFF_ACTIVE", staff_name: "Active Staff" },
      { staff_id: "STAFF_FUTURE", staff_name: "Future Staff", world_visible_from: 1982, talent_visible_from: 1982, f1_eligible_from: 1983 },
    ],
    staffRatings: [
      { year: 1980, staff_id: "STAFF_ACTIVE", technical: 70 },
      { year: 1983, staff_id: "STAFF_FUTURE", technical: 75 },
    ],
    staffContracts: [
      { year: 1980, team_id: "TEAM_ACTIVE", staff_id: "STAFF_ACTIVE", role: "technical_director" },
      { year: 1983, team_id: "TEAM_FUTURE", staff_id: "STAFF_FUTURE", role: "technical_director" },
    ],
    sponsorCatalog: [
      { sponsor_id: "SP_ACTIVE", sponsor_name: "Active Sponsor", start_year: 1975, end_year: 1990 },
      { sponsor_id: "SP_FUTURE", sponsor_name: "Future Sponsor", start_year: 1983, end_year: 2000 },
    ],
    sponsorContracts: [{ year: 1980, team_id: "TEAM_ACTIVE", sponsor_id: "SP_ACTIVE" }],
    availabilityTimeline: [
      {
        entity_type: "driver",
        entity_id: "DRV_YOUNG",
        name: "Young Talent",
        world_visible_from: 1981,
        talent_visible_from: 1982,
        f1_eligible_from: 1984,
        f1_debut_reference: 1985,
        career_end_reference: 2001,
        eligible_when_reached: true,
      },
      {
        entity_type: "team",
        entity_id: "TEAM_FUTURE",
        name: "Future Team",
        world_visible_from: 1982,
        f1_eligible_from: 1983,
        eligible_when_reached: true,
      },
      {
        entity_type: "staff",
        entity_id: "STAFF_FUTURE",
        name: "Future Staff",
        world_visible_from: 1982,
        talent_visible_from: 1982,
        f1_eligible_from: 1983,
        eligible_when_reached: true,
      },
    ],
    engines: [],
    teamEngines: [],
    carStats: [],
    facilities: [],
    financeLedger: [],
    rdProjects: [],
    tracks: [{ track_id: "TR1", track_name: "Track" }, { track_id: "TR2", track_name: "Future Track" }],
    calendar: [
      { year: 1980, round: 1, gp_id: "GP1980", track_id: "TR1", race_date: "1980-03-01" },
      { year: 1981, round: 1, gp_id: "GP1981", track_id: "TR2", race_date: "1981-03-01", winner_driver_id: "DRV_YOUNG" },
    ],
    raceResults: [
      { year: 1979, race_id: "OLD", driver_id: "DRV_RETIRED", position: 1 },
      { year: 1981, race_id: "FUTURE", driver_id: "DRV_YOUNG", position: 1 },
    ],
    rules: [],
    qualifyingRules: [],
    eraSafety: [],
    accidentModel: [],
  };
}

test("retired historical driver remains in pre-career archive but never enters the 1980 market", () => {
  const snapshot = createSeasonSnapshot(visibilityDatabase(), 1980);
  assert.ok(snapshot.historicalArchive.drivers.some((row) => row.driver_id === "DRV_RETIRED"));
  assert.equal(snapshot.drivers.some((row) => row.driver_id === "DRV_RETIRED"), false);

  const save = createSaveWorld(snapshot, { startDate: "1980-01-01" });
  initializeSimulation(save, [createEmploymentMarketSystem()]);
  assert.equal(save.world.employment.freeAgents.drivers.includes("DRV_RETIRED"), false);
});

test("future driver exists internally but is absent from player selectors before world visibility", () => {
  const snapshot = createSeasonSnapshot(visibilityDatabase(), 1980);
  const save = createSaveWorld(snapshot, { startDate: "1980-01-01" });
  assert.ok(save.world.futureDrivers.some((row) => row.driver_id === "DRV_YOUNG"));
  assert.equal(listVisibleDrivers(save).some((row) => row.driver_id === "DRV_YOUNG"), false);
  assert.equal(isEntityVisibleInSeason(snapshot.futureDrivers.find((row) => row.driver_id === "DRV_YOUNG"), 1980, { type: "driver" }), false);
});

test("young driver progresses from hidden to world-visible to talent-visible to F1-eligible independently of historical debut", () => {
  const snapshot = createSeasonSnapshot(visibilityDatabase(), 1980);
  const young = snapshot.futureDrivers.find((row) => row.driver_id === "DRV_YOUNG");
  assert.equal(entityVisibilityState(young, 1980, { type: "driver" }), "hidden");
  assert.equal(entityVisibilityState(young, 1981, { type: "driver" }), "world_visible");
  assert.equal(entityVisibilityState(young, 1982, { type: "driver" }), "talent_visible");
  assert.equal(entityVisibilityState(young, 1984, { type: "driver" }), "f1_eligible");
  assert.equal(isEntityF1EligibleInSeason(young, 1983, { type: "driver" }), false);
  assert.equal(isEntityF1EligibleInSeason(young, 1984, { type: "driver" }), true);
  assert.equal(young.f1_debut_reference, 1985);

  const save = createSaveWorld(snapshot, { startDate: "1980-01-01" });
  const visible1982 = listVisibleDrivers(save, { season: 1982 });
  const publicYoung = visible1982.find((row) => row.driver_id === "DRV_YOUNG");
  assert.equal(publicYoung.visibility_state, "talent_visible");
  assert.equal(Object.hasOwn(publicYoung, "f1_debut_reference"), false);
  assert.equal(Object.hasOwn(publicYoung, "career_end_reference"), false);
});

test("future teams, staff and sponsors obey the same player visibility boundary", () => {
  const snapshot = createSeasonSnapshot(visibilityDatabase(), 1980);
  const save = createSaveWorld(snapshot, { startDate: "1980-01-01" });

  assert.equal(listVisibleTeams(save, { season: 1981 }).some((row) => row.team_id === "TEAM_FUTURE"), false);
  assert.equal(listVisibleTeams(save, { season: 1982 }).some((row) => row.team_id === "TEAM_FUTURE"), true);
  assert.equal(listVisibleStaff(save, { season: 1981 }).some((row) => row.staff_id === "STAFF_FUTURE"), false);
  assert.equal(listVisibleStaff(save, { season: 1982 }).some((row) => row.staff_id === "STAFF_FUTURE"), true);
  assert.equal(listVisibleSponsors(save, { season: 1982 }).some((row) => row.sponsor_id === "SP_FUTURE"), false);
  assert.equal(listVisibleSponsors(save, { season: 1983 }).some((row) => row.sponsor_id === "SP_FUTURE"), true);
});

test("future historical outcomes remain excluded from Save World while structural reference survives", () => {
  const snapshot = createSeasonSnapshot(visibilityDatabase(), 1980);
  const save = createSaveWorld(snapshot, { startDate: "1980-01-01" });

  assert.equal(save.history.preCareer.raceResults.some((row) => Number(row.year) >= 1980), false);
  assert.deepEqual(save.history.races, []);
  assert.equal(Object.hasOwn(save.reference.futureStructure, "raceResults"), false);
  assert.equal(save.reference.futureStructure.calendars["1981"].length, 1);
  assert.equal(Object.hasOwn(save.reference.futureStructure.calendars["1981"][0], "winner_driver_id"), false);
});
