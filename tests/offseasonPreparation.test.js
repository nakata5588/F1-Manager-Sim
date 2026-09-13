import assert from "node:assert/strict";
import test from "node:test";

import {
  confirmOffseasonPlan,
  completeOffseasonCycle,
  offseasonProjection,
  openOffseasonCycle,
  prepareNewSeasonFromOffseason,
  refreshOffseasonCycle,
  setOffseasonPlan,
} from "../src/game/management/offseason.js";
import { initializeBoardTeam } from "../src/game/management/board.js";
import { initializeCommercialWorld } from "../src/game/management/commercial.js";
import { initializeRegulationState } from "../src/game/management/regulations.js";
import { initializeSupplierWorld } from "../src/game/management/suppliers.js";
import { initializeTeamEvolutionState } from "../src/game/management/teamEvolution.js";
import { createOffseasonManagementSystem } from "../src/sim/systems/offseasonManagement.js";
import { CHAMPIONSHIP_EVENT } from "../src/sim/systems/championship.js";
import { SIM_EVENT } from "../src/sim/timeEngine.js";

function technicalTeam(teamId, aero, chassis, future = false) {
  const specs = {
    [`initial:${teamId}:aero_spec`]: { specId: `initial:${teamId}:aero_spec`, teamId, component: "aero_spec", rating: aero, reliabilityRating: 78, targetSeason: 1980, status: "active" },
    [`initial:${teamId}:chassis_spec`]: { specId: `initial:${teamId}:chassis_spec`, teamId, component: "chassis_spec", rating: chassis, reliabilityRating: 78, targetSeason: 1980, status: "active" },
  };
  if (future) specs[`future:${teamId}:aero_spec`] = { specId: `future:${teamId}:aero_spec`, teamId, component: "aero_spec", rating: aero + 3, reliabilityRating: 82, targetSeason: 1981, status: "future" };
  return {
    teamId,
    sequence: 0,
    baseComponents: { aero_spec: aero, chassis_spec: chassis },
    specs,
    inventory: {},
    fittedCars: {
      car1: { components: { aero_spec: `initial:${teamId}:aero_spec`, chassis_spec: `initial:${teamId}:chassis_spec` } },
      car2: { components: { aero_spec: `initial:${teamId}:aero_spec`, chassis_spec: `initial:${teamId}:chassis_spec` } },
    },
    designProjects: [],
    manufacturingJobs: [],
    facilities: {},
    facilityUpgrades: [],
  };
}

function saveFixture() {
  const save = {
    meta: { seed: "phase39-test", sourceSeason: 1980 },
    clock: { date: "1980-10-05", season: 1980, day: 279 },
    player: { controlledTeamIds: ["T1"] },
    reference: { futureStructure: { rules: [], calendars: {}, tracks: [] } },
    simulation: { nextEventSequence: 0, systemState: {} },
    history: {
      races: Array.from({ length: 14 }, (_, index) => ({ season: 1980, round: index + 1 })),
      finances: [], commercial: [], suppliers: [], technical: [], reliability: [], governance: [], teamEvolution: [], preseason: [],
      championships: [], seasons: [], development: [],
    },
    world: {
      season: 1980,
      rules: { year: 1980, points_system: "9-6-4-3-2-1" },
      teams: [
        { team_id: "T1", team_name: "Alpha", reputation: 70 },
        { team_id: "T2", team_name: "Beta", reputation: 50 },
      ],
      teamBrands: [
        { year: 1980, team_id: "T1", team_name: "Alpha" },
        { year: 1980, team_id: "T2", team_name: "Beta" },
      ],
      teamState: {
        T1: { cash: 3_200_000, openingCash: 4_000_000, openingCashSeason: 1980, reputation: 70, financialStatus: "stable" },
        T2: { cash: 1_500_000, openingCash: 2_000_000, openingCashSeason: 1980, reputation: 50, financialStatus: "stable" },
      },
      carState: {
        T1: { teamId: "T1", components: { aero_spec: 80, chassis_spec: 78 } },
        T2: { teamId: "T2", components: { aero_spec: 60, chassis_spec: 62 } },
      },
      carStats: [
        { year: 1980, team_id: "T1", aero_spec: 80, chassis_spec: 78 },
        { year: 1980, team_id: "T2", aero_spec: 60, chassis_spec: 62 },
      ],
      facilities: [
        { year: 1980, team_id: "T1", manufacturing_level: 7 },
        { year: 1980, team_id: "T2", manufacturing_level: 5 },
      ],
      engines: [{ engine_id: "E1", engine_name: "Engine One", manufacturer: "Maker", power: 70, reliability: 75 }],
      teamEngines: [
        { year: 1980, team_id: "T1", engine_id: "E1" },
        { year: 1980, team_id: "T2", engine_id: "E1" },
      ],
      sponsorContracts: [],
      sponsorCatalog: [],
      management: {},
      employment: {
        drivers: {
          D1: { teamId: "T1", role: "driver", status: "employed" },
          D2: { teamId: "T1", role: "driver", status: "employed" },
          D3: { teamId: "T2", role: "driver", status: "employed" },
          D4: { teamId: "T2", role: "driver", status: "employed" },
        },
        staff: { S1: { teamId: "T1", role: "technical_director", status: "employed" } },
        futureAssignments: { drivers: {}, staff: {} },
        freeAgents: { drivers: [], staff: [] },
        vacancies: [],
      },
      contracts: [
        { driver_id: "D1", team_id: "T1", start_year: 1980, end_year: 1980 },
        { driver_id: "D2", team_id: "T1", start_year: 1980, end_year: 1981 },
        { driver_id: "D3", team_id: "T2", start_year: 1980, end_year: 1981 },
        { driver_id: "D4", team_id: "T2", start_year: 1980, end_year: 1981 },
      ],
      staffContracts: [{ staff_id: "S1", team_id: "T1", start_year: 1980, end_year: 1981 }],
      drivers: [{ driver_id: "D1" }, { driver_id: "D2" }, { driver_id: "D3" }, { driver_id: "D4" }],
      staff: [{ staff_id: "S1" }],
      technical: { teams: { T1: technicalTeam("T1", 80, 78, true), T2: technicalTeam("T2", 60, 62, false) } },
      championship: {
        season: 1980,
        seasonComplete: true,
        racesCompleted: 14,
        expectedRounds: 14,
        standingsStatus: "official_final",
        driverChampionId: "D1",
        constructorChampionId: "T1",
        driverChampionStatus: "resolved_unique_points",
        constructorChampionStatus: "resolved_unique_points",
        driverStandings: [{ position: 1, id: "D1", points: 67 }],
        constructorStandings: [
          { position: 1, id: "T1", points: 101 },
          { position: 2, id: "T2", points: 70 },
        ],
        constructors: {
          T1: { points: 101, countedPoints: 101, wins: 7 },
          T2: { points: 70, countedPoints: 70, wins: 3 },
        },
      },
    },
  };
  initializeSupplierWorld(save);
  initializeCommercialWorld(save);
  initializeRegulationState(save);
  initializeTeamEvolutionState(save);
  initializeBoardTeam(save, "T1");
  return save;
}

test("completed championship opens one persistent offseason cycle with player checklist", () => {
  const save = saveFixture();
  const cycle = openOffseasonCycle(save, { closingSeason: 1980, controlledTeamIds: ["T1"], date: "1980-10-05" });
  assert.equal(cycle.targetSeason, 1981);
  assert.equal(cycle.stage, "season_review");
  assert.equal(cycle.review.constructorChampionId, "T1");
  assert.equal(cycle.teams.T1.plan.confirmed, false);
  assert.equal(cycle.teams.T2.plan.confirmed, true);
  assert.deepEqual(cycle.teams.T1.preparation.contracts.drivers.expiring, ["D1"]);
  assert.equal(cycle.teams.T1.preparation.contracts.status, "action_required");
  assert.equal(cycle.teams.T1.preparation.nextSeasonCar.completedTargetSeasonSpecs, 1);
  const again = openOffseasonCycle(save, { closingSeason: 1980, controlledTeamIds: ["T1"] });
  assert.equal(again.cycleId, cycle.cycleId);
});

test("player can set and confirm strategic offseason plan without creating a second finance authority", () => {
  const save = saveFixture();
  openOffseasonCycle(save, { controlledTeamIds: ["T1"] });
  const beforeCash = save.world.teamState.T1.cash;
  const plan = setOffseasonPlan(save, "T1", {
    technicalFocus: "reliability",
    staffingFocus: "selective",
    commercialFocus: "expand",
    financialRisk: "conservative",
  });
  assert.equal(plan.technicalFocus, "reliability");
  assert.equal(plan.confirmed, false);
  assert.equal(save.world.teamState.T1.cash, beforeCash);
  const confirmed = confirmOffseasonPlan(save, "T1");
  assert.equal(confirmed.confirmed, true);
  assert.equal(confirmed.source, "player");
});

test("monthly offseason refresh moves through planning and final checks while preserving unresolved actions", () => {
  const save = saveFixture();
  openOffseasonCycle(save, { controlledTeamIds: ["T1"] });
  save.clock.date = "1980-11-01";
  let refreshed = refreshOffseasonCycle(save);
  assert.equal(refreshed.stageChanged, true);
  assert.equal(refreshed.cycle.stage, "planning");
  save.clock.date = "1980-12-01";
  refreshed = refreshOffseasonCycle(save);
  assert.equal(refreshed.cycle.stage, "final_checks");
  assert.equal(refreshed.cycle.teams.T1.preparation.contracts.status, "action_required");
});

test("new-season preparation resets seasonal finance baseline, renews Board objectives and applies strategy", () => {
  const save = saveFixture();
  openOffseasonCycle(save, { controlledTeamIds: ["T1"] });
  setOffseasonPlan(save, "T1", { technicalFocus: "performance", financialRisk: "aggressive" });
  save.world.teamState.T1.cash = 2_750_000;
  save.clock = { date: "1981-01-01", season: 1981, day: 1 };
  const prepared = prepareNewSeasonFromOffseason(save, 1981, { date: "1981-01-01" });
  const team = prepared.find((row) => row.teamId === "T1");
  assert.equal(save.world.teamState.T1.openingCash, 2_750_000);
  assert.equal(save.world.teamState.T1.openingCashSeason, 1981);
  assert.equal(save.world.management.board.teams.T1.season, 1981);
  assert.ok(team.boardTarget >= 1);
  assert.equal(save.world.technical.teams.T1.seasonStrategy.technicalFocus, "performance");
  assert.equal(save.world.technical.teams.T1.seasonStrategy.financialRisk, "aggressive");
  assert.equal(save.world.management.offseason.current.teams.T1.plan.confirmed, true);
  assert.equal(save.world.management.offseason.current.teams.T1.plan.source, "auto_carried_at_season_start");
  assert.equal(save.world.management.offseason.current.stage, "preseason");
});

test("offseason management system opens at championship completion and closes on first target-season race day", () => {
  const save = saveFixture();
  const system = createOffseasonManagementSystem({ controlledTeamIds: ["T1"] });
  const opened = system.handle({ saveWorld: save, event: { type: CHAMPIONSHIP_EVENT.UPDATED, date: "1980-10-05", payload: { season: 1980 } } });
  assert.equal(opened.type, "offseason.opened");
  save.clock = { date: "1981-01-01", season: 1981, day: 1 };
  const prepared = system.handle({ saveWorld: save, event: { type: SIM_EVENT.SEASON_STARTED, date: "1981-01-01", payload: { previousSeason: 1980, season: 1981 } } });
  assert.equal(prepared.type, "offseason.season_prepared");
  const closed = system.handle({ saveWorld: save, event: { type: SIM_EVENT.RACE_DAY, date: "1981-03-15", payload: { gp_id: "1981:1" } } });
  assert.equal(closed.type, "offseason.completed");
  assert.equal(save.world.management.offseason.current.status, "completed");
  assert.equal(save.world.management.offseason.history.length, 1);
});

test("completed cycle remains available as history and survives JSON persistence", () => {
  const save = saveFixture();
  openOffseasonCycle(save, { controlledTeamIds: ["T1"] });
  completeOffseasonCycle(save, "1981-03-15");
  const restored = JSON.parse(JSON.stringify(save));
  const projection = offseasonProjection(restored, "T1");
  assert.equal(projection.active, false);
  assert.equal(projection.current.status, "completed");
  assert.equal(projection.history.length, 1);
  assert.equal(projection.history[0].closingSeason, 1980);
});
