import test from "node:test";
import assert from "node:assert/strict";

import {
  activeTalentAgreement,
  applyTalentProgramSupport,
  ensureTalentProgramState,
  initializeTalentPrograms,
  signTalentProgramDriver,
  talentProgramEraProfile,
} from "../src/game/management/talentPrograms.js";
import { initializeSimulation } from "../src/sim/timeEngine.js";
import { createCareerLifecycleSystem } from "../src/sim/systems/careerLifecycle.js";
import { createTalentPipelineSystem } from "../src/sim/systems/talentPipeline.js";

function fixture(seed = "phase-41-core") {
  return {
    meta: { seed },
    clock: { date: "1980-01-01", season: 1980 },
    player: { controlledTeamIds: ["T1"] },
    world: {
      season: 1980,
      teams: Array.from({ length: 10 }, (_, index) => ({
        team_id: `T${index + 1}`,
        team_name: `Team ${index + 1}`,
        country: index % 2 ? "Italian" : "British",
        reputation: 42 + index * 4,
      })),
      drivers: [{ driver_id: "D_ACTIVE", display_name: "Active Driver", birth_date: "1952-03-10" }],
      futureDrivers: [],
      futureEntities: [],
      driverRatings: [{ driver_id: "D_ACTIVE", current_ability: 70, potential_ability: 72 }],
      staff: [], staffRatings: [], contracts: [], staffContracts: [], management: {},
    },
    simulation: { nextEventSequence: 0, systemState: {} },
    history: {},
  };
}

test("talent programmes use era-safe structures instead of inventing modern academies in 1980", () => {
  const save = fixture();
  initializeTalentPrograms(save, 1980);
  const state = ensureTalentProgramState(save);
  assert.equal(talentProgramEraProfile(1980).id, "informal_talent_network");
  assert.equal(talentProgramEraProfile(1995).id, "junior_relationships");
  assert.equal(talentProgramEraProfile(2005).id, "junior_program");
  assert.equal(talentProgramEraProfile(2015).id, "driver_academy");
  assert.equal(Object.keys(state.programs).length, 10);
  assert.ok(Object.values(state.programs).every((row) => row.type === "informal_talent_network"));
  assert.ok(Object.values(state.programs).every((row) => row.source === "simulation_baseline"));
});

test("talent affiliation never becomes an F1 contract and support never edits CA directly", () => {
  const save = fixture("manual-signing");
  initializeSimulation(save, [createTalentPipelineSystem({ cohortSize: 3 }), createCareerLifecycleSystem()]);
  const driver = save.world.futureDrivers.find((row) => row.generated === true);
  save.clock.season = 1982;
  save.clock.date = "1982-01-01";
  save.world.season = 1982;

  const before = save.world.careerState.drivers[driver.driver_id].currentAbility;
  const agreement = signTalentProgramDriver(save, "T1", driver.driver_id, { season: 1982 });
  assert.equal(agreement.programType, "informal_talent_network");
  assert.equal(activeTalentAgreement(save, driver.driver_id, 1982)?.id, agreement.id);
  assert.notEqual(save.world.employment?.drivers?.[driver.driver_id]?.status, "employed");
  assert.equal(save.world.careerState.drivers[driver.driver_id].status, "junior");

  applyTalentProgramSupport(save, 1982);
  const career = save.world.careerState.drivers[driver.driver_id];
  assert.equal(career.currentAbility, before);
  assert.ok(career.morale > 50);
  assert.ok(career.form > 0);

  const moraleAfterFirstSupport = career.morale;
  const formAfterFirstSupport = career.form;
  assert.deepEqual(applyTalentProgramSupport(save, 1982), []);
  assert.equal(career.morale, moraleAfterFirstSupport);
  assert.equal(career.form, formAfterFirstSupport);
});

test("an F1-eligible driver cannot enter a new junior talent programme", () => {
  const save = fixture("eligibility-boundary");
  initializeSimulation(save, [createTalentPipelineSystem({ cohortSize: 3 }), createCareerLifecycleSystem()]);
  const driver = save.world.futureDrivers.find((row) => row.generated === true);
  const entity = save.world.futureEntities.find((row) => row.entity_id === driver.driver_id);

  driver.world_visible_from = 1981;
  driver.talent_visible_from = 1981;
  driver.f1_eligible_from = 1982;
  entity.world_visible_from = 1981;
  entity.talent_visible_from = 1981;
  entity.f1_eligible_from = 1982;
  save.clock.season = 1982;
  save.clock.date = "1982-01-01";
  save.world.season = 1982;

  assert.throws(
    () => signTalentProgramDriver(save, "T1", driver.driver_id, { season: 1982 }),
    /not available to talent recruitment/,
  );
  assert.equal(activeTalentAgreement(save, driver.driver_id, 1982), null);
});
