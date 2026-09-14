import test from "node:test";
import assert from "node:assert/strict";

import { ensureTalentProgramState } from "../src/game/management/talentPrograms.js";
import { dispatchSimulationEvents, initializeSimulation, SIM_EVENT } from "../src/sim/timeEngine.js";
import { createCareerDevelopmentSystem } from "../src/sim/systems/careerDevelopment.js";
import { createCareerLifecycleSystem } from "../src/sim/systems/careerLifecycle.js";
import { createEntityAvailabilitySystem } from "../src/sim/systems/entityAvailability.js";
import { createTalentPipelineSystem } from "../src/sim/systems/talentPipeline.js";
import { createTalentRecruitmentSystem } from "../src/sim/systems/talentRecruitment.js";

function fixture(seed = "phase-41-sim") {
  return {
    meta: { seed }, clock: { date: "1980-01-01", season: 1980 }, player: { controlledTeamIds: ["T1"] },
    world: {
      season: 1980,
      teams: Array.from({ length: 10 }, (_, index) => ({ team_id: `T${index + 1}`, country: index % 2 ? "Italian" : "British", reputation: 45 + index * 3 })),
      drivers: [{ driver_id: "D_ACTIVE", display_name: "Active Driver", birth_date: "1952-03-10" }],
      futureDrivers: [], futureEntities: [],
      driverRatings: [{ driver_id: "D_ACTIVE", current_ability: 70, potential_ability: 72, pace: 70, racecraft: 70, consistency: 70 }],
      staff: [], staffRatings: [], contracts: [], staffContracts: [], management: {},
    },
    simulation: { nextEventSequence: 0, systemState: {} }, history: {},
  };
}

function systems() {
  return [
    createTalentPipelineSystem({ cohortSize: 4 }),
    createEntityAvailabilitySystem(),
    createCareerLifecycleSystem(),
    createTalentRecruitmentSystem({ minimumScore: 0, durationSeasons: 2 }),
    createCareerDevelopmentSystem(),
  ];
}

function startSeason(saveWorld, year, registered) {
  saveWorld.clock.season = year;
  saveWorld.clock.date = `${year}-01-01`;
  saveWorld.world.season = year;
  dispatchSimulationEvents(saveWorld, [{ type: SIM_EVENT.SEASON_STARTED, date: saveWorld.clock.date, payload: { previousSeason: year - 1, season: year } }], registered);
}

test("AI recruitment is deterministic and never auto-signs juniors for the controlled team", () => {
  const first = fixture("same-recruitment");
  const second = fixture("same-recruitment");
  const a = systems();
  const b = systems();
  initializeSimulation(first, a);
  initializeSimulation(second, b);
  startSeason(first, 1981, a); startSeason(first, 1982, a);
  startSeason(second, 1981, b); startSeason(second, 1982, b);

  const one = ensureTalentProgramState(first).agreements;
  const two = ensureTalentProgramState(second).agreements;
  assert.ok(one.length > 0);
  assert.deepEqual(one, two);
  assert.ok(one.every((row) => row.teamId !== "T1"));
  assert.equal(new Set(one.map((row) => row.driverId)).size, one.length);
});

test("feeder tiers create annual series summaries and record programme representation", () => {
  const save = fixture("feeder-series");
  const registered = systems();
  initializeSimulation(save, registered);
  startSeason(save, 1981, registered);
  startSeason(save, 1982, registered);
  startSeason(save, 1983, registered);

  const state = ensureTalentProgramState(save);
  assert.ok(state.feederSeriesHistory.length > 0);
  assert.ok(state.feederSeriesHistory.every((row) => row.source === "simulation"));
  assert.ok(state.feederSeriesHistory.every((row) => Array.isArray(row.topThreeDriverIds)));
  const rows = save.world.management.talentPipeline.feederHistory.filter((row) => row.season === 1983);
  assert.ok(rows.some((row) => row.talentProgramTeamId));
  assert.ok(rows.some((row) => Number(row.developmentSupport) > 1));
});
