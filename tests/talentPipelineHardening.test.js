import test from "node:test";
import assert from "node:assert/strict";

import { deserializeSaveWorld, serializeSaveWorld } from "../src/save/serialization.js";
import { dispatchSimulationEvents, initializeSimulation, SIM_EVENT } from "../src/sim/timeEngine.js";
import { createCareerDevelopmentSystem } from "../src/sim/systems/careerDevelopment.js";
import { createCareerLifecycleSystem } from "../src/sim/systems/careerLifecycle.js";
import { createEmploymentMarketSystem } from "../src/sim/systems/employmentMarket.js";
import { createEntityAvailabilitySystem } from "../src/sim/systems/entityAvailability.js";
import { createTalentPipelineSystem } from "../src/sim/systems/talentPipeline.js";

function fixture(seed = "phase-40-hardening") {
  return {
    meta: { seed },
    clock: { date: "1980-01-01", season: 1980 },
    player: { controlledTeamIds: [] },
    world: {
      season: 1980,
      teams: Array.from({ length: 12 }, (_, index) => ({
        team_id: `T${index + 1}`,
        team_name: `Team ${index + 1}`,
        country: index % 2 ? "Italian" : "British",
      })),
      drivers: [],
      futureDrivers: [],
      futureEntities: [],
      driverRatings: [],
      staff: [],
      staffRatings: [],
      contracts: [],
      staffContracts: [],
      management: {},
    },
    simulation: { nextEventSequence: 0, systemState: {} },
    history: {},
  };
}

function systems() {
  return [
    createTalentPipelineSystem({ cohortSize: 3 }),
    createEntityAvailabilitySystem(),
    createCareerLifecycleSystem(),
    createCareerDevelopmentSystem(),
    createEmploymentMarketSystem(),
  ];
}

function startSeason(saveWorld, year, registeredSystems) {
  saveWorld.clock.season = year;
  saveWorld.clock.date = `${year}-01-01`;
  saveWorld.world.season = year;
  return dispatchSimulationEvents(saveWorld, [{
    type: SIM_EVENT.SEASON_STARTED,
    date: saveWorld.clock.date,
    payload: { previousSeason: year - 1, season: year },
  }], registeredSystems);
}

test("a newly generated annual cohort is created after career development and does not receive instant full-year growth", () => {
  const save = fixture();
  const registered = systems();
  initializeSimulation(save, registered);
  startSeason(save, 1981, registered);

  const cohort = save.world.management.talentPipeline.cohorts.find((row) => row.season === 1981);
  assert.equal(cohort.count, 3);
  for (const driverId of cohort.driverIds) {
    const rating = save.world.driverRatings.find((row) => row.driver_id === driverId);
    const career = save.world.careerState.drivers[driverId];
    assert.equal(career.currentAbility, rating.current_ability);
    assert.equal(career.lastDevelopmentSeason, undefined);
    assert.equal(career.status, "junior");
  }

  startSeason(save, 1982, registered);
  for (const driverId of cohort.driverIds) {
    const career = save.world.careerState.drivers[driverId];
    assert.equal(career.lastDevelopmentSeason, 1982);
  }
});

test("ten career seasons create a bounded renewable population with unique stable ids", () => {
  const save = fixture("ten-season-population");
  const registered = systems();
  initializeSimulation(save, registered);
  for (let year = 1981; year <= 1989; year += 1) startSeason(save, year, registered);

  const pipeline = save.world.management.talentPipeline;
  assert.equal(pipeline.cohorts.length, 10);
  assert.equal(pipeline.generatedDriverIds.length, 30);
  assert.equal(new Set(pipeline.generatedDriverIds).size, 30);
  assert.deepEqual(pipeline.generatedSeasons, [1980, 1981, 1982, 1983, 1984, 1985, 1986, 1987, 1988, 1989]);

  const generatedProfiles = save.world.futureDrivers.filter((row) => row.generated === true);
  assert.equal(generatedProfiles.length, 30);
  assert.ok(generatedProfiles.every((row) => row.source === "simulation_generated"));
  assert.ok(generatedProfiles.every((row) => row.world_visible_from <= row.talent_visible_from));
  assert.ok(generatedProfiles.every((row) => row.talent_visible_from <= row.f1_eligible_from));
  assert.ok(pipeline.feederHistory.length > 0);

  const eligibleFreeAgents = pipeline.generatedDriverIds.filter((id) => save.world.employment?.freeAgents?.drivers?.includes(id));
  assert.ok(eligibleFreeAgents.length > 0);
});

test("generated talent, feeder history and sequence state survive Save World serialization", () => {
  const save = fixture("serialization-population");
  const registered = systems();
  initializeSimulation(save, registered);
  for (let year = 1981; year <= 1984; year += 1) startSeason(save, year, registered);

  const before = structuredClone(save.world.management.talentPipeline);
  const serialized = serializeSaveWorld(save, { savedAt: "1984-01-01T00:00:00.000Z" });
  const restored = deserializeSaveWorld(serialized);

  assert.deepEqual(restored.world.management.talentPipeline, before);
  assert.deepEqual(
    restored.world.futureDrivers.filter((row) => row.generated === true),
    save.world.futureDrivers.filter((row) => row.generated === true),
  );
  assert.equal(restored.simulation.nextEventSequence, save.simulation.nextEventSequence);
});
