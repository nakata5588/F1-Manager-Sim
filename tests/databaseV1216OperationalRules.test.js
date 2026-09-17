import assert from "node:assert/strict";
import test from "node:test";

import { createSaveWorld } from "../src/save/createSaveWorld.js";
import { dispatchSimulationEvents } from "../src/sim/timeEngine.js";
import { createChampionshipSystem } from "../src/sim/systems/championship.js";
import { createDatabaseWeatherSystem } from "../src/sim/systems/databaseWeather.js";
import { RACE_EVENT } from "../src/sim/systems/raceWeekend.js";
import { resolveChampionshipRuleSet } from "../src/sim/championshipRules.js";

function minimalSnapshot(extra = {}) {
  return {
    season: 1980,
    teams: [
      { team_id: "team-a", team_name: "Team A" },
      { team_id: "team-b", team_name: "Team B" },
    ],
    drivers: [
      { driver_id: "driver-a", driver_name: "Driver A" },
      { driver_id: "driver-b", driver_name: "Driver B" },
    ],
    staff: [],
    contracts: [],
    staffContracts: [],
    tracks: [{ track_id: "track-a", track_name: "Track A", laps_default: 10 }],
    calendar: [
      { year: 1980, round: 1, gp_id: "gp-a", track_id: "track-a", race_date: "1980-01-13", scheduled_laps: 10 },
      { year: 1980, round: 2, gp_id: "gp-b", track_id: "track-a", race_date: "1980-02-13", scheduled_laps: 10 },
    ],
    ...extra,
  };
}

function completedRace(round) {
  return {
    type: RACE_EVENT.COMPLETED,
    date: `1980-0${round}-13`,
    payload: {
      season: 1980,
      round,
      gpId: `gp-${round}`,
      classification: [
        { position: 1, driverId: "driver-a", teamId: "team-a", status: "FINISHED" },
        { position: 2, driverId: "driver-b", teamId: "team-b", status: "FINISHED" },
      ],
    },
  };
}

test("v1.2.16 countback fallback is opt-in, provenance-labelled and does not affect older databases", () => {
  const withoutFallback = createSaveWorld(minimalSnapshot({
    championshipRules: {
      pointsSystem: [1, 1],
      expectedRounds: 2,
      driver: { segments: [{ roundStart: 1, roundEnd: 2, bestResults: 2 }] },
      constructors: { allRoundsCount: true },
    },
  }), { startDate: "1980-01-01" });
  const oldRules = resolveChampionshipRuleSet(withoutFallback, 1980);
  assert.equal(oldRules.tieBreakComplete, false);
  assert.equal(oldRules.tieBreak, null);

  const withFallback = createSaveWorld(minimalSnapshot({
    championshipRules: {
      pointsSystem: [1, 1],
      expectedRounds: 2,
      driver: { segments: [{ roundStart: 1, roundEnd: 2, bestResults: 2 }] },
      constructors: { allRoundsCount: true },
    },
    operationalRegulationFallbacks1980V1216: [{
      rule_id: "op_1980_tie_break_countback",
      domain: "championship_scoring",
      value: "compare highest finishing-position counts in descending finishing order",
      status: "high_confidence_operational_fallback_primary_text_pending",
      historical_fact_claim: false,
    }],
  }), { startDate: "1980-01-01" });
  const rules = resolveChampionshipRuleSet(withFallback, 1980);
  assert.equal(rules.tieBreakComplete, true);
  assert.equal(rules.tieBreak.mode, "finishing_position_countback");
  assert.equal(rules.tieBreak.historicalFactClaim, false);
  assert.equal(rules.tieBreak.source, "world.operationalRegulationFallbacks1980V1216");

  const system = createChampionshipSystem();
  dispatchSimulationEvents(withFallback, [completedRace(1), completedRace(2)], [system]);
  assert.equal(withFallback.world.championship.driverStandings[0].points, 2);
  assert.equal(withFallback.world.championship.driverStandings[1].points, 2);
  assert.equal(withFallback.world.championship.driverChampionId, "driver-a");
  assert.equal(withFallback.world.championship.driverChampionStatus, "resolved_operational_countback");
  assert.equal(withFallback.world.championship.standingsStatus, "final_operational_tiebreak_applied");
});

test("database weather probabilities generate deterministic Save World weather rather than historical outcomes", () => {
  const makeSave = () => {
    const save = createSaveWorld(minimalSnapshot({
      calendar: [{
        year: 1980,
        round: 1,
        gp_id: "gp-a",
        track_id: "track-a",
        race_date: "1980-01-13",
        scheduled_laps: 10,
        weather_probability_baseline: {
          weatherProfileId: "weather-test",
          climateBand: "variable",
          rainChancePercent: 100,
          stormChancePercent: 0,
          source: "derived_gameplay_baseline",
        },
      }],
    }), { startDate: "1980-01-13", seed: "weather-probability-test" });
    save.world.raceWeekendState = {
      active: {
        "1980:1:gp-a": {
          key: "1980:1:gp-a",
          season: 1980,
          round: 1,
          gpId: "gp-a",
          date: "1980-01-13",
          totalLaps: 10,
          race: { gp_id: "gp-a", track_id: "track-a", scheduled_laps: 10 },
        },
      },
    };
    return save;
  };

  const event = {
    type: RACE_EVENT.WEEKEND_STARTED,
    date: "1980-01-13",
    payload: { weekend_key: "1980:1:gp-a" },
  };
  const system = createDatabaseWeatherSystem();
  const first = makeSave();
  const second = makeSave();
  system.handle({ saveWorld: first, event });
  system.handle({ saveWorld: second, event });

  assert.deepEqual(first.world.calendar[0].weather_timeline, second.world.calendar[0].weather_timeline);
  assert.equal(first.world.calendar[0].generated_weather.source, "save_world_generated_from_database_probability_baseline");
  assert.equal(first.world.calendar[0].generated_weather.rainChancePercent, 100);
  assert.equal(first.world.raceWeekendState.active["1980:1:gp-a"].race.weather_timeline[0].condition, "wet");
});

test("an explicit weather timeline always wins over the database probability baseline", () => {
  const save = createSaveWorld(minimalSnapshot({
    calendar: [{
      year: 1980,
      round: 1,
      gp_id: "gp-a",
      track_id: "track-a",
      race_date: "1980-01-13",
      scheduled_laps: 10,
      weather_timeline: [{ lap: 1, condition: "dry" }, { lap: 8, condition: "wet" }],
      weather_probability_baseline: { rainChancePercent: 100, stormChancePercent: 100 },
    }],
  }), { startDate: "1980-01-13", seed: "explicit-weather-test" });
  save.world.raceWeekendState = {
    active: {
      "1980:1:gp-a": {
        key: "1980:1:gp-a",
        gpId: "gp-a",
        round: 1,
        date: "1980-01-13",
        race: { gp_id: "gp-a", track_id: "track-a", scheduled_laps: 10 },
      },
    },
  };
  const original = structuredClone(save.world.calendar[0].weather_timeline);
  createDatabaseWeatherSystem().handle({
    saveWorld: save,
    event: { type: RACE_EVENT.WEEKEND_STARTED, date: "1980-01-13", payload: { weekend_key: "1980:1:gp-a" } },
  });
  assert.deepEqual(save.world.calendar[0].weather_timeline, original);
  assert.equal(save.world.calendar[0].generated_weather, undefined);
});
