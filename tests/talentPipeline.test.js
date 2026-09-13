import test from "node:test";
import assert from "node:assert/strict";

import { listVisibleDrivers } from "../src/domain/entityVisibility.js";
import { listRecruitmentCandidates } from "../src/game/management/scouting.js";
import { dispatchSimulationEvents, initializeSimulation, SIM_EVENT } from "../src/sim/timeEngine.js";
import { createCareerDevelopmentSystem } from "../src/sim/systems/careerDevelopment.js";
import { createCareerLifecycleSystem } from "../src/sim/systems/careerLifecycle.js";
import { createEmploymentMarketSystem } from "../src/sim/systems/employmentMarket.js";
import { createEntityAvailabilitySystem } from "../src/sim/systems/entityAvailability.js";
import {
  createTalentPipelineSystem,
  generateTalentCohort,
  talentPipelineSummary,
} from "../src/sim/systems/talentPipeline.js";

function fixture(seed = "phase-40-talent") {
  const teams = Array.from({ length: 12 }, (_, index) => ({
    team_id: `T${index + 1}`,
    team_name: `Team ${index + 1}`,
    country: index % 3 === 0 ? "British" : index % 3 === 1 ? "Italian" : "French",
  }));
  return {
    meta: { seed },
    clock: { date: "1980-01-01", season: 1980 },
    player: { controlledTeamIds: [] },
    world: {
      season: 1980,
      teams,
      drivers: [{
        driver_id: "D_ACTIVE",
        display_name: "Active Driver",
        birth_date: "1952-03-10",
        nationality: "British",
      }],
      futureDrivers: [{
        driver_id: "D_HIST_FUTURE",
        display_name: "Historical Future Driver",
        birth_date: "1965-04-05",
        nationality: "Brazilian",
        world_visible_from: 1983,
        talent_visible_from: 1984,
        f1_eligible_from: 1985,
        source: "historical_reference",
      }],
      futureEntities: [{
        entity_type: "driver",
        entity_id: "D_HIST_FUTURE",
        name: "Historical Future Driver",
        world_visible_from: 1983,
        talent_visible_from: 1984,
        f1_eligible_from: 1985,
        eligible_when_reached: true,
      }],
      driverRatings: [{
        driver_id: "D_ACTIVE",
        current_ability: 70,
        potential_ability: 72,
        pace: 70,
        qualifying: 70,
        racecraft: 70,
        consistency: 70,
      }, {
        driver_id: "D_HIST_FUTURE",
        current_ability: 55,
        potential_ability: 80,
        pace: 55,
        qualifying: 54,
        racecraft: 56,
        consistency: 52,
      }],
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

function systems(options = {}) {
  return [
    createTalentPipelineSystem(options),
    createEntityAvailabilitySystem(),
    createCareerLifecycleSystem(),
    createCareerDevelopmentSystem(),
    createEmploymentMarketSystem(),
  ];
}

function seasonStarted(saveWorld, year, registeredSystems) {
  saveWorld.clock.season = year;
  saveWorld.clock.date = `${year}-01-01`;
  saveWorld.world.season = year;
  return dispatchSimulationEvents(saveWorld, [{
    type: SIM_EVENT.SEASON_STARTED,
    date: saveWorld.clock.date,
    payload: { previousSeason: year - 1, season: year },
  }], registeredSystems);
}

test("generated talent is deterministic Save World state and remains hidden at the historical start", () => {
  const first = fixture("same-seed");
  const second = fixture("same-seed");
  const registered = systems({ cohortSize: 4 });
  initializeSimulation(first, registered);
  initializeSimulation(second, systems({ cohortSize: 4 }));

  const generatedFirst = first.world.futureDrivers.filter((row) => row.generated === true);
  const generatedSecond = second.world.futureDrivers.filter((row) => row.generated === true);
  assert.equal(generatedFirst.length, 4);
  assert.deepEqual(generatedFirst, generatedSecond);
  assert.deepEqual(
    first.world.driverRatings.filter((row) => row.source === "simulation_generated"),
    second.world.driverRatings.filter((row) => row.source === "simulation_generated"),
  );

  assert.ok(generatedFirst.every((row) => row.driver_id.startsWith("gen_drv_1980_")));
  assert.ok(generatedFirst.every((row) => row.source === "simulation_generated"));
  assert.ok(generatedFirst.every((row) => row.provenance === "save_world_generated_talent"));
  assert.ok(generatedFirst.every((row) => row.world_visible_from > 1980));
  assert.ok(generatedFirst.every((row) => !Object.hasOwn(row, "f1_debut_reference")));
  assert.ok(generatedFirst.every((row) => !Object.hasOwn(row, "career_end_reference")));

  const visibleIds = new Set(listVisibleDrivers(first).map((row) => row.driver_id));
  assert.ok(!generatedFirst.some((row) => visibleIds.has(row.driver_id)));
  assert.equal(talentPipelineSummary(first).visibility.hidden, 4);
});

test("generated drivers use multidimensional attributes and the existing career development system before F1 eligibility", () => {
  const save = fixture();
  const registered = systems({ cohortSize: 3 });
  initializeSimulation(save, registered);
  const generated = save.world.futureDrivers.find((row) => row.generated === true);
  const rating = save.world.driverRatings.find((row) => row.driver_id === generated.driver_id);
  const before = save.world.careerState.drivers[generated.driver_id].currentAbility;

  assert.ok(Number.isFinite(rating.pace));
  assert.ok(Number.isFinite(rating.qualifying));
  assert.ok(Number.isFinite(rating.racecraft));
  assert.ok(Number.isFinite(rating.wet_skill));
  assert.ok(Number.isFinite(rating.consistency));
  assert.ok(Number.isFinite(rating.technical_feedback));
  assert.ok(Number.isFinite(rating.adaptability));
  assert.ok(Number.isFinite(rating.pressure_handling));
  assert.ok(Number.isFinite(rating.crash_likelihood));
  assert.ok(rating.potential_ability > rating.current_ability);

  seasonStarted(save, 1981, registered);
  const career = save.world.careerState.drivers[generated.driver_id];
  assert.ok(career.currentAbility > before);
  assert.ok(Object.keys(career.attributes ?? {}).length >= 10);
  assert.ok(save.world.management.talentPipeline.feederHistory.some((row) => row.driverId === generated.driver_id && row.season === 1981));
  assert.ok(career.feederTier);
});

test("visibility progresses through world and talent stages before generated drivers enter the existing free-agent market", () => {
  const save = fixture("visibility-seed");
  const registered = systems({ cohortSize: 4 });
  initializeSimulation(save, registered);
  const cohort = save.world.management.talentPipeline.cohorts.find((row) => row.season === 1980);
  const profiles = cohort.driverIds.map((id) => save.world.futureDrivers.find((row) => row.driver_id === id));

  seasonStarted(save, 1981, registered);
  const worldVisibleIds = new Set(listVisibleDrivers(save).map((row) => row.driver_id));
  assert.ok(profiles.every((row) => worldVisibleIds.has(row.driver_id)));
  const recruitment1981 = new Set(listRecruitmentCandidates(save).map((row) => row.id));
  assert.ok(profiles.every((row) => !recruitment1981.has(row.driver_id)));

  seasonStarted(save, 1982, registered);
  const recruitment1982 = new Set(listRecruitmentCandidates(save).map((row) => row.id));
  assert.ok(profiles.every((row) => recruitment1982.has(row.driver_id)));

  const earliest = [...profiles].sort((a, b) => a.f1_eligible_from - b.f1_eligible_from)[0];
  for (let year = 1983; year <= earliest.f1_eligible_from; year += 1) seasonStarted(save, year, registered);

  assert.ok(save.world.drivers.some((row) => row.driver_id === earliest.driver_id));
  assert.ok(save.world.employment.freeAgents.drivers.includes(earliest.driver_id));
  assert.equal(save.world.careerState.drivers[earliest.driver_id].status, "available");
});

test("talent generation is idempotent per season and never rewrites historical future-driver rows", () => {
  const save = fixture("idempotent-seed");
  const historicalBefore = structuredClone(save.world.futureDrivers[0]);
  initializeSimulation(save, systems({ cohortSize: 3 }));
  const first = generateTalentCohort(save, 1980, { cohortSize: 9 });
  const second = generateTalentCohort(save, 1980, { cohortSize: 9 });

  assert.deepEqual(first, second);
  assert.equal(save.world.management.talentPipeline.cohorts.filter((row) => row.season === 1980).length, 1);
  assert.equal(save.world.futureDrivers.filter((row) => row.generated === true && row.generation_season === 1980).length, 3);
  assert.deepEqual(save.world.futureDrivers.find((row) => row.driver_id === "D_HIST_FUTURE"), historicalBefore);
});

test("each new season creates a bounded cohort and archives abstract feeder results without scripting F1 outcomes", () => {
  const save = fixture("multi-season-seed");
  const registered = systems({ cohortSize: 3 });
  initializeSimulation(save, registered);
  seasonStarted(save, 1981, registered);
  seasonStarted(save, 1982, registered);

  const pipeline = save.world.management.talentPipeline;
  assert.deepEqual(pipeline.generatedSeasons, [1980, 1981, 1982]);
  assert.equal(pipeline.generatedDriverIds.length, 9);
  assert.ok(pipeline.feederHistory.length >= 6);
  assert.ok(pipeline.feederHistory.every((row) => row.source === "simulation"));
  assert.ok(pipeline.feederHistory.every((row) => Number.isFinite(row.performanceIndex)));
  assert.ok(pipeline.feederHistory.every((row) => !Object.hasOwn(row, "f1_team")));
  assert.ok(pipeline.feederHistory.every((row) => !Object.hasOwn(row, "f1_result")));
});
