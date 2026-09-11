import test from "node:test";
import assert from "node:assert/strict";
import { DeveloperPlaytestSession, listDeveloperPlaytestTeams } from "../src/app/developerPlaytest.js";

function seasonDatabase() {
  return {
    format: "f1-manager-sim-season-database",
    schemaVersion: 1,
    season: 1980,
    databaseVersion: "test-db",
    sourceChecksum: "test-checksum",
    releaseName: "Test 1980",
    snapshot: {
      season: 1980,
      databaseVersion: "test-db",
      sourceChecksum: "test-checksum",
      historicalArchive: { throughSeason: 1979, raceResults: [] },
      futureStructure: { calendars: {}, tracks: [], rules: [], qualifyingRules: [], eraSafety: [], accidentModel: [] },
      teams: [
        { team_id: "T1", team_name: "Alpha Racing" },
        { team_id: "T2", team_name: "Beta Racing" },
      ],
      drivers: [
        { driver_id: "D1", display_name: "Alice Fast", current_ability: 82, potential_ability: 85 },
        { driver_id: "D2", display_name: "Alex Steady", current_ability: 78, potential_ability: 80 },
        { driver_id: "D3", display_name: "Bob Quick", current_ability: 80, potential_ability: 82 },
        { driver_id: "D4", display_name: "Ben Calm", current_ability: 76, potential_ability: 79 },
      ],
      driverRatings: [
        { driver_id: "D1", qualifying: 84, pace: 84, racecraft: 82, consistency: 84, tire_management: 80, race_intelligence: 82, technical_feedback: 86, adaptability: 84, start_launch: 82, crash_likelihood: 2 },
        { driver_id: "D2", qualifying: 78, pace: 79, racecraft: 80, consistency: 86, tire_management: 84, race_intelligence: 82, technical_feedback: 78, adaptability: 78, start_launch: 77, crash_likelihood: 2 },
        { driver_id: "D3", qualifying: 82, pace: 82, racecraft: 81, consistency: 80, tire_management: 79, race_intelligence: 80, technical_feedback: 75, adaptability: 78, start_launch: 80, crash_likelihood: 2 },
        { driver_id: "D4", qualifying: 76, pace: 77, racecraft: 79, consistency: 85, tire_management: 83, race_intelligence: 81, technical_feedback: 76, adaptability: 76, start_launch: 76, crash_likelihood: 2 },
      ],
      driverCareer: [],
      contracts: [
        { driver_id: "D1", team_id: "T1", role: "main_driver", year: 1980, contract_until: 1981 },
        { driver_id: "D2", team_id: "T1", role: "second_driver", year: 1980, contract_until: 1981 },
        { driver_id: "D3", team_id: "T2", role: "main_driver", year: 1980, contract_until: 1981 },
        { driver_id: "D4", team_id: "T2", role: "second_driver", year: 1980, contract_until: 1981 },
      ],
      staff: [],
      staffRatings: [],
      staffContracts: [],
      teamEngines: [
        { team_id: "T1", engine_id: "E1" },
        { team_id: "T2", engine_id: "E1" },
      ],
      engines: [{ engine_id: "E1", power: 82, reliability: 100 }],
      carStats: [
        { team_id: "T1", chassis_spec: 82, aero_spec: 82, gearbox_spec: 88, suspension_spec: 82, brakes_spec: 88, cooling_spec: 90, electronics_spec: 90 },
        { team_id: "T2", chassis_spec: 79, aero_spec: 79, gearbox_spec: 86, suspension_spec: 80, brakes_spec: 86, cooling_spec: 90, electronics_spec: 90 },
      ],
      tracks: [{ track_id: "TR1", track_name: "Test Circuit", power_dependency: 45, aero_dependency: 65, technicality: 65, overtaking_difficulty: 45, incident_risk: 15 }],
      calendar: [{ year: 1980, round: 1, gp_id: "GP1", gp_name: "Opening Grand Prix", track_id: "TR1", race_date: "1980-03-02", laps: 8 }],
      qualifyingRules: { year: 1980, practice_session_count: 2, session_count: 1, max_starters: 4 },
      rules: { year: 1980, points_system: "9-6-4-3-2-1" },
      sponsors: [],
      sponsorContracts: [],
      teamFinancials: [],
      facilities: [],
      rdProjects: [],
      tyres: [
        { compound_id: "DRY-A", compound_name: "Dry A", condition: "dry", dry_grip: 80, wet_grip: 25, durability_laps: 5 },
        { compound_id: "DRY-B", compound_name: "Dry B", condition: "dry", dry_grip: 74, wet_grip: 25, durability_laps: 10 },
        { compound_id: "WET", compound_name: "Wet", condition: "wet", dry_grip: 30, wet_grip: 82, durability_laps: 10 },
      ],
      futureDrivers: [],
      futureStaff: [],
      futureTeams: [],
      futureSponsors: [],
      futureEntities: [],
    },
  };
}

test("developer playtest lists Season Database teams without exposing hidden pools", () => {
  const payload = seasonDatabase();
  payload.snapshot.futureTeams.push({ team_id: "FUTURE", team_name: "Future Team", f1_eligible_from: 1985 });
  assert.deepEqual(listDeveloperPlaytestTeams(payload).map((row) => row.id), ["T1", "T2"]);
});

test("interactive weekend runs Practice -> setup -> Qualifying -> Pre-Race -> live Race -> Results", () => {
  const session = new DeveloperPlaytestSession(seasonDatabase());
  assert.equal(session.state().screen, "new_career");

  let state = session.startCareer({ managerName: "Test Manager", teamId: "T1", seed: "interactive-weekend" });
  assert.equal(state.screen, "home");
  assert.equal(state.career.teamName, "Alpha Racing");
  assert.equal(state.teamDrivers.length, 2);
  assert.equal(state.nextRace.name, "Opening Grand Prix");

  state = session.continue();
  assert.equal(state.screen, "practice");
  assert.equal(state.career.date, "1980-03-02");
  assert.equal(state.raceWeekend.stage, "started");
  assert.equal(session.saveWorld.history.races.length, 0);

  state = session.advanceWeekend();
  assert.equal(state.screen, "practice_results");
  assert.equal(state.raceWeekend.practice.team.length, 2);
  const before = state.raceWeekend.practice.team.find((row) => row.driverId === "D1");
  assert.ok(before.setup);

  state = session.changeSetup("D1", { aeroBalance: 70, mechanicalGrip: 72, gearing: 65, cooling: 60 });
  const after = state.raceWeekend.practice.team.find((row) => row.driverId === "D1");
  assert.equal(after.setup.aeroBalance, 70);
  assert.equal(after.playerAdjusted, true);

  state = session.advanceWeekend();
  assert.equal(state.screen, "qualifying_results");
  assert.equal(state.raceWeekend.qualifying.classification.length, 4);

  state = session.advanceWeekend();
  assert.equal(state.screen, "pre_race");
  assert.equal(state.raceWeekend.grid.length, 4);
  assert.equal(state.liveRace.currentLap, 0);
  assert.equal(state.liveRace.totalLaps, 8);
  assert.equal(state.liveRace.order.filter((row) => row.controlled).length, 2);
  assert.equal(session.saveWorld.history.races.length, 0);

  const weekend = session.saveWorld.world.raceWeekendState.active[state.raceWeekend.key];
  assert.equal(weekend.classification, undefined, "no fake race classification should exist before lights out");
  assert.equal(weekend.raceStartBaseline.length, 4);
  assert.ok(weekend.raceStartBaseline.every((row) => row.status === "STARTING"));

  const originalCompound = state.liveRace.strategies.find((row) => row.driverId === "D1").startingCompoundId;
  const alternative = state.liveRace.tyreOptions.find((row) => String(row.id) !== String(originalCompound) && row.condition === "dry");
  assert.ok(alternative);
  state = session.changeStartingTyre("D1", alternative.id);
  assert.equal(state.liveRace.strategies.find((row) => row.driverId === "D1").startingCompoundId, alternative.id);

  state = session.startRace();
  assert.equal(state.screen, "race");
  state = session.advanceRace(2);
  assert.equal(state.screen, "race");
  assert.equal(state.liveRace.currentLap, 2);
  assert.equal(state.liveRace.order.length, 4);

  state = session.finishRace();
  assert.equal(state.screen, "race_results");
  assert.equal(state.liveRace.status, "completed");
  assert.equal(session.saveWorld.history.races.length, 1);
  assert.equal(session.saveWorld.history.races[0].liveRace, true);
  assert.equal(session.saveWorld.history.races[0].classification.length, 4);
  assert.equal(session.saveWorld.history.races[0].raceStartBaseline, undefined);
  assert.ok(state.standings.drivers.length > 0);
});

test("weekend stage guards prevent skipping straight from calendar into live race", () => {
  const session = new DeveloperPlaytestSession(seasonDatabase());
  session.startCareer({ managerName: "Guard Test", teamId: "T1", seed: "stage-guards" });
  session.continue();
  assert.throws(() => session.startRace(), /not ready/i);
  assert.throws(() => session.advanceRace(1), /not started/i);
  assert.throws(() => session.changeSetup("D3", { aeroBalance: 50 }), /controlled team/i);
});

test("developer playtest refuses control of a team outside the active Season Database", () => {
  const session = new DeveloperPlaytestSession(seasonDatabase());
  assert.throws(
    () => session.startCareer({ managerName: "Test Manager", teamId: "FUTURE" }),
    /not available/i,
  );
});