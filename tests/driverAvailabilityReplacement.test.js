import test from "node:test";
import assert from "node:assert/strict";

import {
  advanceDays,
  createDriverAvailabilitySystem,
  createDriverMarketLifecycleSystem,
  createEmploymentMarketSystem,
  createRaceEntrySystem,
  createReplacementDriverSystem,
  driverAvailabilityProjection,
  driverMarketProjection,
  evolveDriverMarketSeason,
  initializeDriverMarket,
  initializeSimulation,
  replacementDriverCandidates,
} from "../src/index.js";
import { dispatchSimulationEvents } from "../src/sim/timeEngine.js";
import { RACE_TIMELINE_EVENT } from "../src/sim/systems/raceTimeline.js";

function baseSave({ reserve = true, freeAgent = true } = {}) {
  const drivers = [
    { driver_id: "RACE", display_name: "Race Driver", dob: "1952-01-01" },
    ...(reserve ? [{ driver_id: "RES", display_name: "Reserve Driver", dob: "1955-01-01" }] : []),
    ...(freeAgent ? [{ driver_id: "FREE", display_name: "Free Driver", dob: "1954-01-01" }] : []),
  ];
  const ratings = [
    { driver_id: "RACE", current_ability: 80, reputation: 75, adaptability: 70, experience: 80 },
    ...(reserve ? [{ driver_id: "RES", current_ability: 68, reputation: 50, adaptability: 72, experience: 58 }] : []),
    ...(freeAgent ? [{ driver_id: "FREE", current_ability: 75, reputation: 62, adaptability: 68, experience: 70 }] : []),
  ];
  const contracts = [
    { driver_id: "RACE", team_id: "T1", role: "main_driver", contract_start: 1979, contract_until: 1982 },
    ...(reserve ? [{ driver_id: "RES", team_id: "T1", role: "test_driver", contract_start: 1980, contract_until: 1982 }] : []),
  ];
  const careerDrivers = Object.fromEntries(drivers.map((row) => [row.driver_id, {
    status: contracts.some((contract) => contract.driver_id === row.driver_id) ? "employed" : "available",
    age: 27,
    currentAbility: ratings.find((rating) => rating.driver_id === row.driver_id)?.current_ability ?? 50,
    reputation: ratings.find((rating) => rating.driver_id === row.driver_id)?.reputation ?? 50,
    attributes: { adaptability: ratings.find((rating) => rating.driver_id === row.driver_id)?.adaptability ?? 50 },
  }]));

  return {
    meta: { seed: "stage-18-test" },
    clock: { date: "1980-01-13", season: 1980, day: 13 },
    simulation: { nextEventSequence: 0, systemState: {} },
    player: { controlledTeamIds: [] },
    history: {
      races: [],
      transfers: [],
      retirements: [],
      events: [],
      driverAvailability: [],
      driverMarket: [],
    },
    world: {
      teams: [{ team_id: "T1", team_name: "Team One" }],
      drivers,
      driverRatings: ratings,
      contracts,
      staff: [],
      staffRatings: [],
      staffContracts: [],
      careerState: { drivers: careerDrivers, staff: {} },
      startingRaceEntries: [{ driver_id: "RACE", team_id: "T1", car_number: 7 }],
      accidentModel: { year: 1980, injury_prob: 1, source: "test_force_injury" },
      eraSafety: { year: 1980, era_safety_index: 0.3, source: "test" },
      calendar: [],
      tracks: [],
      rules: {},
      qualifyingRules: {},
    },
  };
}

function systems() {
  return [
    createEmploymentMarketSystem(),
    createDriverMarketLifecycleSystem(),
    createRaceEntrySystem(),
    createDriverAvailabilitySystem(),
    createReplacementDriverSystem(),
  ];
}

function forceInjury(save, activeSystems, severity = 100) {
  save.history.races.push({
    key: "1980:TEST",
    date: save.clock.date,
    gpId: "TEST",
    timeline: {
      events: [{
        type: "incident",
        driverId: "RACE",
        lap: 12,
        sectorId: "S2",
        severity,
        terminal: true,
        damageType: "suspension",
      }],
    },
  });
  return dispatchSimulationEvents(save, [{
    type: RACE_TIMELINE_EVENT.APPLIED,
    date: save.clock.date,
    payload: { weekend_key: "1980:TEST" },
  }], activeSystems);
}

test("race incident injury removes the titular and promotes a team reserve without mutating Employment", () => {
  const save = baseSave();
  const activeSystems = systems();
  initializeSimulation(save, activeSystems);

  const events = forceInjury(save, activeSystems);
  const injury = driverAvailabilityProjection(save, "RACE");
  const replacement = save.world.driverAvailability.replacements[0];

  assert.equal(injury.status, "injured");
  assert.equal(injury.raceAvailable, false);
  assert.equal(replacement.absentDriverId, "RACE");
  assert.equal(replacement.replacementDriverId, "RES");
  assert.equal(replacement.source, "team_reserve");
  assert.deepEqual(save.world.raceEntryState.current.map((row) => row.driverId), ["RES"]);
  assert.equal(save.world.raceEntryState.current[0].carNumber, 7);
  assert.equal(save.world.employment.drivers.RACE.role, "main_driver");
  assert.equal(save.world.employment.drivers.RES.role, "test_driver");
  assert.ok(events.some((event) => event.type === "driver.injured"));
  assert.ok(events.some((event) => event.type === "driver.replacement_appointed"));
});

test("recovery restores the contracted titular and ends the temporary reserve agreement", () => {
  const save = baseSave();
  const activeSystems = systems();
  initializeSimulation(save, activeSystems);
  forceInjury(save, activeSystems);

  advanceDays(save, 230, activeSystems);

  assert.equal(driverAvailabilityProjection(save, "RACE").status, "fit");
  assert.deepEqual(save.world.raceEntryState.current.map((row) => row.driverId), ["RACE"]);
  assert.equal(save.world.driverAvailability.replacements[0].status, "ended");
  assert.equal(save.world.driverAvailability.replacements[0].endReason, "driver_recovered");
  assert.equal(save.world.employment.drivers.RES.role, "test_driver");
  assert.equal(driverMarketProjection(save, "RES").path, "f1_employed");
});

test("a free agent can sign a temporary race-only replacement agreement and returns to the market after recovery", () => {
  const save = baseSave({ reserve: false, freeAgent: true });
  const activeSystems = systems();
  initializeSimulation(save, activeSystems);
  assert.ok(save.world.employment.freeAgents.drivers.includes("FREE"));

  forceInjury(save, activeSystems);
  const agreement = save.world.driverAvailability.replacements[0];

  assert.equal(agreement.replacementDriverId, "FREE");
  assert.equal(agreement.source, "f1_free_agent");
  assert.equal(save.world.employment.drivers.FREE, undefined, "temporary replacement must not become normal Employment");
  assert.equal(save.world.employment.freeAgents.drivers.includes("FREE"), false, "temporary replacement is unavailable to the ordinary market");
  assert.equal(driverMarketProjection(save, "FREE").path, "temporary_replacement");

  advanceDays(save, 230, activeSystems);

  assert.ok(save.world.employment.freeAgents.drivers.includes("FREE"));
  assert.equal(driverMarketProjection(save, "FREE").path, "f1_free_agent");
  assert.equal(save.world.employment.drivers.FREE, undefined);
});

test("long-term free agents leave the active F1 market for other motorsport without disappearing from the universe", () => {
  const save = baseSave({ reserve: false, freeAgent: true });
  const activeSystems = systems();
  initializeSimulation(save, activeSystems);

  const market = save.world.driverMarketState.drivers.FREE;
  market.f1FreeSince = 1973;
  const result = evolveDriverMarketSeason(save, 1980, "1980-01-14");

  assert.deepEqual(result.movedOut, ["FREE"]);
  assert.equal(save.world.employment.freeAgents.drivers.includes("FREE"), false);
  assert.equal(driverMarketProjection(save, "FREE").path, "other_motorsport");
  assert.ok(save.world.drivers.some((row) => row.driver_id === "FREE"), "leaving the F1 market must not delete the driver");

  const candidates = replacementDriverCandidates(save, "T1", "RACE");
  assert.ok(candidates.some((row) => row.driverId === "FREE" && row.source === "other_motorsport"),
    "an experienced driver outside F1 can still be recalled for an emergency replacement");
});

test("medical and market state initialize independently from employment authority", () => {
  const save = baseSave();
  const activeSystems = systems();
  initializeSimulation(save, activeSystems);

  assert.equal(driverAvailabilityProjection(save, "RACE").status, "fit");
  assert.equal(driverMarketProjection(save, "RACE").path, "f1_employed");
  assert.equal(driverMarketProjection(save, "RES").path, "f1_employed");
  assert.equal(driverMarketProjection(save, "FREE").path, "f1_free_agent");
  assert.equal(save.world.employment.drivers.RES.role, "test_driver");
});
