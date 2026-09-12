import assert from "node:assert/strict";
import test from "node:test";

import {
  applyEnactedRegulations,
  castRegulationVote,
  initializeRegulationState,
  openHistoricalReferenceProposal,
  openRegulationProposal,
  regulationPackage,
  resolveRegulationProposal,
} from "../src/game/management/regulations.js";
import { applyTechnicalRegulationTransition } from "../src/game/management/regulationImpact.js";
import {
  activateAcceptedTeamEntry,
  decideTeamEntryApplication,
  exitTeam,
  initializeTeamEvolutionState,
  listTeamEntryCandidates,
  rebrandTeam,
  submitTeamEntryApplication,
  updateTeamDistress,
} from "../src/game/management/teamEvolution.js";
import { createGovernanceManagementSystem } from "../src/sim/systems/governanceManagement.js";
import { REGULATION_EVENT } from "../src/game/management/regulations.js";
import { SIM_EVENT } from "../src/sim/timeEngine.js";

function saveFixture() {
  return {
    meta: { seed: "phase38-test", sourceSeason: 1980 },
    clock: { date: "1980-01-01", season: 1980, day: 1 },
    reference: {
      futureStructure: {
        rules: [
          { year: 1981, rule_id: "R1981", points_system: "9-6-4-3-2-1", winner_driver_id: "SHOULD_NOT_LEAK" },
        ],
      },
    },
    player: { controlledTeamIds: [] },
    simulation: { nextEventSequence: 0, systemState: {} },
    history: { governance: [], teamEvolution: [], technical: [], reliability: [], suppliers: [], finances: [], commercial: [] },
    world: {
      season: 1980,
      rules: { year: 1980, points_system: "9-6-4-3-2-1" },
      teams: [
        { team_id: "T1", team_name: "Alpha", reputation: 70 },
        { team_id: "T2", team_name: "Beta", reputation: 50 },
      ],
      futureTeams: [{ team_id: "T3", team_name: "Gamma", reputation: 45, f1_eligible_from: 1980 }],
      futureEntities: [{ entity_type: "team", entity_id: "T3", f1_eligible_from: 1980, eligible_when_reached: true }],
      entityAvailability: { team: { T3: { status: "eligible" } } },
      teamBrands: [
        { year: 1980, team_id: "T1", team_name: "Alpha" },
        { year: 1980, team_id: "T2", team_name: "Beta" },
      ],
      teamState: {
        T1: { cash: 4_000_000, openingCash: 4_000_000, reputation: 70, financialStatus: "stable" },
        T2: { cash: 2_000_000, openingCash: 2_000_000, reputation: 50, financialStatus: "stable" },
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
        { year: 1980, team_id: "T1", wind_tunnel_level: 7, aero_dept_level: 7, chassis_shop_level: 7, manufacturing_level: 7 },
        { year: 1980, team_id: "T2", wind_tunnel_level: 5, aero_dept_level: 5, chassis_shop_level: 5, manufacturing_level: 5 },
      ],
      engines: [
        { engine_id: "E1", engine_name: "Engine One", manufacturer: "Maker", power: 70, reliability: 75 },
      ],
      teamEngines: [
        { year: 1980, team_id: "T1", engine_id: "E1" },
        { year: 1980, team_id: "T2", engine_id: "E1" },
      ],
      sponsorContracts: [],
      management: {},
      employment: {
        drivers: {
          D1: { teamId: "T1", role: "driver", status: "employed" },
          D2: { teamId: "T1", role: "driver", status: "employed" },
        },
        staff: {},
        futureAssignments: { drivers: {}, staff: {} },
        freeAgents: { drivers: ["D3", "D4"], staff: ["S1", "S2"] },
        vacancies: [],
      },
      drivers: [
        { driver_id: "D1" }, { driver_id: "D2" }, { driver_id: "D3" }, { driver_id: "D4" },
      ],
      staff: [{ staff_id: "S1" }, { staff_id: "S2" }],
      technical: {
        teams: {
          T1: {
            teamId: "T1",
            sequence: 0,
            baseComponents: { aero_spec: 80, chassis_spec: 78 },
            specs: {
              "initial:T1:aero_spec": { specId: "initial:T1:aero_spec", teamId: "T1", component: "aero_spec", rating: 80, reliabilityRating: 82, targetSeason: 1980, status: "active" },
              "initial:T1:chassis_spec": { specId: "initial:T1:chassis_spec", teamId: "T1", component: "chassis_spec", rating: 78, reliabilityRating: 80, targetSeason: 1980, status: "active" },
              "future:T1:aero_spec": { specId: "future:T1:aero_spec", teamId: "T1", component: "aero_spec", rating: 84, reliabilityRating: 84, targetSeason: 1981, status: "future" },
            },
            inventory: {},
            fittedCars: {
              car1: { components: { aero_spec: "initial:T1:aero_spec", chassis_spec: "initial:T1:chassis_spec" } },
              car2: { components: { aero_spec: "initial:T1:aero_spec", chassis_spec: "initial:T1:chassis_spec" } },
            },
            designProjects: [], manufacturingJobs: [], facilities: {}, facilityUpgrades: [],
          },
          T2: {
            teamId: "T2",
            sequence: 0,
            baseComponents: { aero_spec: 60, chassis_spec: 62 },
            specs: {
              "initial:T2:aero_spec": { specId: "initial:T2:aero_spec", teamId: "T2", component: "aero_spec", rating: 60, reliabilityRating: 66, targetSeason: 1980, status: "active" },
              "initial:T2:chassis_spec": { specId: "initial:T2:chassis_spec", teamId: "T2", component: "chassis_spec", rating: 62, reliabilityRating: 68, targetSeason: 1980, status: "active" },
            },
            inventory: {},
            fittedCars: {
              car1: { components: { aero_spec: "initial:T2:aero_spec", chassis_spec: "initial:T2:chassis_spec" } },
              car2: { components: { aero_spec: "initial:T2:aero_spec", chassis_spec: "initial:T2:chassis_spec" } },
            },
            designProjects: [], manufacturingJobs: [], facilities: {}, facilityUpgrades: [],
          },
        },
      },
    },
  };
}

test("regulation state starts from current rules without making future rules mandatory", () => {
  const save = saveFixture();
  const state = initializeRegulationState(save, "1980-01-01");
  assert.equal(state.currentPackage.season, 1980);
  assert.equal(state.currentPackage.provenance.historicalFutureRulesMandatory, false);
  assert.equal(save.world.rules.points_system, "9-6-4-3-2-1");
  assert.equal(state.proposals.length, 0);
});

test("historical future rule becomes a proposal and strips outcome authority", () => {
  const save = saveFixture();
  initializeRegulationState(save);
  const proposal = openHistoricalReferenceProposal(save, 1981, save.reference.futureStructure.rules[0], 0);
  assert.equal(proposal.source, "historical_reference_hidden");
  assert.equal(proposal.provenance, "reference_not_mandatory_outcome");
  assert.equal(proposal.changes.sporting.sourceRulePatch.points_system, "9-6-4-3-2-1");
  assert.equal(Object.hasOwn(proposal.changes.sporting.sourceRulePatch, "winner_driver_id"), false);
  assert.equal(save.world.rules.year, 1980);
});

test("accepted regulation activates only in its target season", () => {
  const save = saveFixture();
  initializeRegulationState(save);
  const proposal = openRegulationProposal(save, {
    title: "Reset",
    targetSeason: 1981,
    changes: { technical: { carryoverRetention: 0.7 } },
  });
  castRegulationVote(save, proposal.proposalId, "T1", "yes");
  castRegulationVote(save, proposal.proposalId, "T2", "yes");
  const resolved = resolveRegulationProposal(save, proposal.proposalId, ["T1", "T2"]);
  assert.equal(resolved.status, "accepted");
  applyEnactedRegulations(save, 1980);
  assert.notEqual(regulationPackage(save).technical.carryoverRetention, 0.7);
  applyEnactedRegulations(save, 1981);
  assert.equal(regulationPackage(save).technical.carryoverRetention, 0.7);
});

test("rejected regulation never changes the active package", () => {
  const save = saveFixture();
  initializeRegulationState(save);
  const before = regulationPackage(save).technical.carryoverRetention;
  const proposal = openRegulationProposal(save, { targetSeason: 1981, changes: { technical: { carryoverRetention: 0.55 } } });
  castRegulationVote(save, proposal.proposalId, "T1", "no");
  castRegulationVote(save, proposal.proposalId, "T2", "no");
  const resolved = resolveRegulationProposal(save, proposal.proposalId, ["T1", "T2"]);
  assert.equal(resolved.status, "rejected");
  applyEnactedRegulations(save, 1981);
  assert.equal(regulationPackage(save).technical.carryoverRetention, before);
});

test("technical regulation transition affects carried-over specs but not a spec designed for the new season", () => {
  const save = saveFixture();
  initializeRegulationState(save);
  const proposal = openRegulationProposal(save, { targetSeason: 1981, changes: { technical: { carryoverRetention: 0.5, reliabilityRetention: 0.5 } } });
  castRegulationVote(save, proposal.proposalId, "T1", "yes");
  castRegulationVote(save, proposal.proposalId, "T2", "yes");
  resolveRegulationProposal(save, proposal.proposalId, ["T1", "T2"]);
  save.clock.season = 1981;
  save.clock.date = "1981-01-01";
  applyEnactedRegulations(save, 1981);
  const futureBefore = save.world.technical.teams.T1.specs["future:T1:aero_spec"].rating;
  const oldBefore = save.world.technical.teams.T1.specs["initial:T1:aero_spec"].rating;
  const result = applyTechnicalRegulationTransition(save, 1981);
  assert.ok(result.affectedSpecs >= 4);
  assert.notEqual(save.world.technical.teams.T1.specs["initial:T1:aero_spec"].rating, oldBefore);
  assert.equal(save.world.technical.teams.T1.specs["future:T1:aero_spec"].rating, futureBefore);
  assert.equal(save.world.technical.teams.T1.specs["initial:T1:aero_spec"].lastRegulationTransitionSeason, 1981);
});

test("eligible future team identity is only a candidate until governance accepts it", () => {
  const save = saveFixture();
  initializeRegulationState(save);
  initializeTeamEvolutionState(save);
  const candidates = listTeamEntryCandidates(save);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].teamId, "T3");
  assert.equal(save.world.teams.some((row) => row.team_id === "T3"), false);
});

test("accepted team entry creates simulation resources and employment vacancies", () => {
  const save = saveFixture();
  initializeRegulationState(save);
  initializeTeamEvolutionState(save);
  const application = submitTeamEntryApplication(save, "T3", { targetSeason: 1981 });
  decideTeamEntryApplication(save, application.applicationId, true);
  save.clock.season = 1981;
  save.clock.date = "1981-01-01";
  const result = activateAcceptedTeamEntry(save, application.applicationId);
  assert.equal(result.teamId, "T3");
  assert.equal(save.world.teams.some((row) => row.team_id === "T3"), true);
  assert.equal(save.world.futureTeams.some((row) => row.team_id === "T3"), false);
  assert.equal(save.world.teamState.T3.source, "simulation_entry_resource_baseline");
  assert.equal(save.world.carStats.some((row) => row.team_id === "T3" && row.source === "simulation_entry_baseline"), true);
  assert.equal(save.world.technical.teams.T3.teamId, "T3");
  assert.equal(save.world.technical.suppliers.teams.T3.active.engineId, "E1");
  assert.equal(result.vacancies.length, 4);
});

test("team rebrand changes presentation identity without changing stable team id", () => {
  const save = saveFixture();
  initializeRegulationState(save);
  initializeTeamEvolutionState(save);
  const result = rebrandTeam(save, "T1", "Alpha Grand Prix");
  assert.equal(result.teamId, "T1");
  assert.equal(save.world.teams.find((row) => row.team_id === "T1").team_name, "Alpha Grand Prix");
  assert.equal(save.world.teamBrands.at(-1).team_id, "T1");
});

test("team exit releases personnel to the market and preserves inactive identity", () => {
  const save = saveFixture();
  initializeRegulationState(save);
  initializeTeamEvolutionState(save);
  const result = exitTeam(save, "T1", { reason: "test_exit" });
  assert.equal(save.world.teams.some((row) => row.team_id === "T1"), false);
  assert.equal(save.world.inactiveTeams.some((row) => row.team_id === "T1"), true);
  assert.equal(result.released.length, 2);
  assert.ok(save.world.employment.freeAgents.drivers.includes("D1"));
  assert.ok(save.world.employment.freeAgents.drivers.includes("D2"));
});

test("controlled team is protected from automatic financial exit candidate list", () => {
  const save = saveFixture();
  initializeRegulationState(save);
  initializeTeamEvolutionState(save);
  save.world.teamState.T1.cash = -100;
  save.world.teamState.T1.financialStatus = "distressed";
  save.world.governance.teamEvolution.active.T1.distressSeasons = 1;
  const candidates = updateTeamDistress(save, ["T1"]);
  assert.equal(candidates.includes("T1"), false);
  assert.equal(save.world.governance.teamEvolution.active.T1.distressSeasons, 2);
});

test("annual governance cycle opens future-reference proposals without scripting acceptance", () => {
  const save = saveFixture();
  // Live player control is authoritative. Cached system options are only a
  // bootstrap fallback when the Save World has no player control state yet.
  save.player.controlledTeamIds = ["T1"];
  const system = createGovernanceManagementSystem({ controlledTeamIds: ["T1"] });
  system.handle({ saveWorld: save, event: { type: SIM_EVENT.CAREER_STARTED, date: "1980-01-01", payload: {} } });
  save.clock.date = "1980-07-01";
  const events = system.handle({ saveWorld: save, event: { type: SIM_EVENT.MONTH_STARTED, date: "1980-07-01", payload: { month: 7, year: 1980 } } });
  assert.ok(events.some((row) => row.type === REGULATION_EVENT.PROPOSAL_OPENED));
  const reference = save.world.governance.regulations.proposals.find((row) => row.source === "historical_reference_hidden");
  assert.ok(reference);
  assert.equal(reference.status, "open");
  assert.equal(reference.votes.T1, undefined);
});
