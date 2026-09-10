import test from "node:test";
import assert from "node:assert/strict";
import {
  createRaceStrategySystem,
  createRaceWeekendSystem,
  createSaveWorld,
  createSeasonSnapshot,
  dispatchSimulationEvents,
  SIM_EVENT,
  STRATEGY_EVENT,
} from "../src/index.js";

function strategySave(options = {}) {
  const tyres = options.tyres ?? [];
  const save = createSaveWorld({
    season: 1980,
    teams: [{ team_id: "T1", team_name: "Alpha" }],
    drivers: [{ driver_id: "D1", display_name: "Driver One" }],
    driverRatings: [{
      driver_id: "D1",
      qualifying: 80,
      pace: 80,
      racecraft: 80,
      consistency: 80,
      tire_management: 50,
      race_intelligence: 80,
      technical_feedback: 80,
      adaptability: 80,
      start_launch: 80,
      crash_likelihood: 0,
    }],
    staff: [{ staff_id: "S1", staff_name: "Pit Lead" }],
    staffRatings: [{ staff_id: "S1", pitstop_management: 90, technical: 70, data_analysis: 70, communication: 70 }],
    staffContracts: [],
    teamEngines: [{ team_id: "T1", engine_id: "E1" }],
    engines: [{ engine_id: "E1", power: 80, reliability: 100 }],
    tyres,
    tracks: [{ track_id: "TR1", track_name: "Strategy Ring", power_dependency: 50, aero_dependency: 50, technicality: 50 }],
    calendar: [{ year: 1980, round: 1, gp_id: "GP1", gp_name: "Strategy GP", track_id: "TR1", race_date: "1980-05-01", laps: 70 }],
    qualifyingRules: { year: 1980, max_starters: 1 },
    rules: { year: 1980, points_system: "9-6-4-3-2-1" },
  }, { seed: options.seed ?? "strategy-test", startDate: "1980-05-01" });

  save.world.employment = {
    drivers: { D1: { teamId: "T1", role: "main_driver", status: "employed" } },
    staff: { S1: { teamId: "T1", role: "pit_lead", status: "employed" } },
    freeAgents: { drivers: [], staff: [] },
    vacancies: [],
  };
  save.world.careerState = {
    drivers: { D1: { status: "employed", form: 0 } },
    staff: { S1: { status: "employed", attributes: { pitstop_management: 90 } } },
  };
  save.world.carState = {
    T1: { components: { chassis_spec: 80, aero_spec: 80, gearbox_spec: 100, suspension_spec: 80, brakes_spec: 100, cooling_spec: 100, electronics_spec: 100 } },
  };
  return save;
}

function runWeekend(save, controlledTeamIds = []) {
  return dispatchSimulationEvents(save, [{
    type: SIM_EVENT.RACE_DAY,
    date: "1980-05-01",
    payload: { gp_id: "GP1", gp_name: "Strategy GP", track_id: "TR1", round: 1 },
  }], [
    createRaceStrategySystem({ controlledTeamIds }),
    createRaceWeekendSystem(),
  ]);
}

test("season snapshot carries only tyre catalogue rows applicable to the starting season", () => {
  const database = {
    teamBrands: [], contracts: [], driverRatings: [], staffContracts: [], staffRatings: [], teamEngines: [], calendar: [],
    drivers: [], staff: [], teams: [], engines: [], carStats: [], facilities: [], rules: [], qualifyingRules: [], eraSafety: [], accidentModel: [],
    tyres: [
      { compound_id: "OLD", name: "Old", valid_from_year: 1970, valid_to_year: 1979 },
      { compound_id: "CURRENT", name: "Current", valid_from_year: 1980, valid_to_year: 1985 },
      { compound_id: "FUTURE", name: "Future", introduced_year: 1986 },
    ],
  };
  const snapshot = createSeasonSnapshot(database, 1980);
  assert.deepEqual(snapshot.tyres.map((row) => row.compound_id), ["CURRENT"]);
});

test("missing tyre data keeps an explicitly unspecified zero-stop strategy instead of inventing compounds", () => {
  const save = strategySave({ tyres: [] });
  const events = runWeekend(save);
  const locked = events.find((event) => event.type === STRATEGY_EVENT.LOCKED);
  assert.ok(locked);
  assert.equal(locked.payload.strategies[0].data_status, "no_tyre_data");
  assert.equal(locked.payload.strategies[0].planned_stops, 0);

  const result = save.history.races[0].classification[0];
  assert.equal(result.strategy.dataStatus, "no_tyre_data");
  assert.equal(result.strategy.stints.length, 1);
  assert.equal(result.strategy.stints[0].compoundId, null);
  assert.equal(result.strategy.pitStops.length, 0);
});

test("tyre durability can create a multi-stint AI plan with simulated pit-stop execution", () => {
  const save = strategySave({
    tyres: [
      { compound_id: "SOFT", compound_name: "Soft", condition: "dry", dry_grip: 82, durability_laps: 20 },
      { compound_id: "HARD", compound_name: "Hard", condition: "dry", dry_grip: 78, durability_laps: 40 },
    ],
  });
  runWeekend(save);
  const strategy = save.history.races[0].classification[0].strategy;
  assert.equal(strategy.dataStatus, "tyre_data_available");
  assert.equal(strategy.source, "ai_generated");
  assert.ok(strategy.stints.length >= 2);
  assert.equal(strategy.pitStops.length, strategy.stints.length - 1);
  assert.ok(strategy.pitStops[0].executionScore >= 0 && strategy.pitStops[0].executionScore <= 100);
  assert.equal(strategy.pitStops[0].timeLossSeconds, null);
  assert.equal(strategy.pitStops[0].lossSource, "abstract_no_track_time");
});

test("controlled team uses an explicit player stint plan when one is present", () => {
  const save = strategySave({
    tyres: [
      { compound_id: "SOFT", compound_name: "Soft", condition: "dry", dry_grip: 85, durability_laps: 25 },
      { compound_id: "HARD", compound_name: "Hard", condition: "dry", dry_grip: 75, durability_laps: 50 },
    ],
  });
  save.world.raceStrategyPlans = {
    "1980:GP1": {
      D1: {
        stints: [
          { compoundId: "SOFT", targetLaps: 30 },
          { compoundId: "HARD", targetLaps: 40 },
        ],
      },
    },
  };
  runWeekend(save, ["T1"]);
  const strategy = save.history.races[0].classification[0].strategy;
  assert.equal(strategy.source, "player");
  assert.deepEqual(strategy.stints.map((row) => row.compoundId), ["SOFT", "HARD"]);
  assert.deepEqual(strategy.stints.map((row) => row.targetLaps), [30, 40]);
  assert.equal(strategy.pitStops.length, 1);
});
