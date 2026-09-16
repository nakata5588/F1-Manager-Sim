import test from "node:test";
import assert from "node:assert/strict";
import { DeveloperPlaytestSession } from "../src/app/developerPlaytest.js";
import {
  restoreDeveloperPlaytestSession,
  serializeDeveloperPlaytestSession,
  validateDeveloperSaveCompatibility,
} from "../src/app/developerPersistence.js";
import { deserializeSaveWorld } from "../src/save/serialization.js";

function seasonDatabase() {
  return {
    format: "f1-manager-sim-season-database",
    schemaVersion: 1,
    season: 1980,
    databaseVersion: "phase-45-test-db",
    sourceChecksum: "phase-45-source",
    releaseName: "Phase 45 Test 1980",
    snapshot: {
      season: 1980,
      databaseVersion: "phase-45-test-db",
      sourceChecksum: "phase-45-source",
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
      staff: [], staffRatings: [], staffContracts: [],
      teamEngines: [{ team_id: "T1", engine_id: "E1" }, { team_id: "T2", engine_id: "E1" }],
      engines: [{ engine_id: "E1", power: 82, reliability: 100 }],
      carStats: [
        { team_id: "T1", chassis_spec: 82, aero_spec: 82, gearbox_spec: 88, suspension_spec: 82, brakes_spec: 88, cooling_spec: 90, electronics_spec: 90 },
        { team_id: "T2", chassis_spec: 79, aero_spec: 79, gearbox_spec: 86, suspension_spec: 80, brakes_spec: 86, cooling_spec: 90, electronics_spec: 90 },
      ],
      tracks: [{ track_id: "TR1", track_name: "Test Circuit", power_dependency: 45, aero_dependency: 65, technicality: 65, overtaking_difficulty: 45, incident_risk: 15 }],
      calendar: [{ year: 1980, round: 1, gp_id: "GP1", gp_name: "Opening Grand Prix", track_id: "TR1", race_date: "1980-03-02", laps: 10 }],
      qualifyingRules: { year: 1980, practice_session_count: 2, session_count: 1, max_starters: 4 },
      rules: { year: 1980, points_system: "9-6-4-3-2-1" },
      sponsors: [], sponsorContracts: [], teamFinancials: [], facilities: [], rdProjects: [],
      tyres: [
        { compound_id: "DRY-A", compound_name: "Dry A", condition: "dry", dry_grip: 80, wet_grip: 25, durability_laps: 5 },
        { compound_id: "DRY-B", compound_name: "Dry B", condition: "dry", dry_grip: 74, wet_grip: 25, durability_laps: 10 },
        { compound_id: "WET", compound_name: "Wet", condition: "wet", dry_grip: 30, wet_grip: 82, durability_laps: 10 },
      ],
      futureDrivers: [], futureStaff: [], futureTeams: [], futureSponsors: [], futureEntities: [],
    },
  };
}

function pausedRaceSession(seed = "phase-45-resume") {
  const session = new DeveloperPlaytestSession(seasonDatabase());
  session.startCareer({ managerName: "Persistence Manager", teamId: "T1", seed });
  session.continue();
  session.advanceWeekend();
  session.advanceWeekend();
  session.advanceWeekend();
  session.startRace();
  session.advanceRace(3);
  return session;
}

test("playtest restore resumes a paused live race to the exact same authoritative result", () => {
  const uninterrupted = pausedRaceSession("phase-45-equivalence");
  const serialized = serializeDeveloperPlaytestSession(uninterrupted, { savedAt: "2026-09-16T22:00:00.000Z" });

  const restored = new DeveloperPlaytestSession(seasonDatabase());
  const restoredState = restoreDeveloperPlaytestSession(restored, serialized);
  assert.equal(restoredState.screen, "race");
  assert.equal(restoredState.liveRace.currentLap, 3);
  assert.equal(restoredState.career.managerName, "Persistence Manager");
  assert.equal(restoredState.career.controlledTeamId, "T1");

  const fullState = uninterrupted.finishRace();
  const resumedState = restored.finishRace();
  assert.deepEqual(resumedState.lastRace.classification, fullState.lastRace.classification);
  assert.deepEqual(restored.saveWorld.history.races[0].timeline, uninterrupted.saveWorld.history.races[0].timeline);
  assert.deepEqual(restored.saveWorld.world.championship, uninterrupted.saveWorld.world.championship);
});

test("restore does not replay Career Start or duplicate narrative/history state", () => {
  const original = pausedRaceSession("phase-45-no-replay");
  const beforeSequence = original.saveWorld.simulation.nextEventSequence;
  const beforeStories = structuredClone(original.saveWorld.world?.media?.news?.stories ?? []);
  const beforeHistory = structuredClone(original.saveWorld.history?.events ?? []);
  const serialized = serializeDeveloperPlaytestSession(original, { savedAt: "2026-09-16T22:05:00.000Z" });

  const restored = new DeveloperPlaytestSession(seasonDatabase());
  restoreDeveloperPlaytestSession(restored, serialized);
  assert.equal(restored.saveWorld.simulation.nextEventSequence, beforeSequence);
  assert.deepEqual(restored.saveWorld.world?.media?.news?.stories ?? [], beforeStories);
  assert.deepEqual(restored.saveWorld.history?.events ?? [], beforeHistory);
});

test("save compatibility rejects a different Season Database identity", () => {
  const original = pausedRaceSession("phase-45-provenance");
  const save = deserializeSaveWorld(serializeDeveloperPlaytestSession(original));
  const incompatible = seasonDatabase();
  incompatible.databaseVersion = "different-db";
  incompatible.snapshot.databaseVersion = "different-db";
  const session = new DeveloperPlaytestSession(incompatible);

  assert.throws(() => validateDeveloperSaveCompatibility(session, save), /compatibility failed/i);
  assert.throws(() => restoreDeveloperPlaytestSession(session, save), /compatibility failed/i);
});