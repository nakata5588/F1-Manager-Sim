import test from "node:test";
import assert from "node:assert/strict";
import { createSaveWorld } from "../src/save/createSaveWorld.js";
import { deserializeSaveWorld, serializeSaveWorld } from "../src/save/serialization.js";
import { createCoreWorldSystems } from "../src/sim/systems/coreWorldSystems.js";
import { advanceDays, dispatchSimulationEvents, initializeSimulation, SIM_EVENT } from "../src/sim/timeEngine.js";
import {
  organizationDepartmentForRole,
  organizationProjection,
  organizationSummary,
  organisationPressure,
  refreshOrganization,
} from "../src/game/management/organization.js";
import { startDriverScoutingAssignment } from "../src/game/management/scouting.js";
import { createStaffAdviceSystem } from "../src/sim/systems/staffAdvice.js";

function world() {
  return createSaveWorld({
    season: 1980,
    teams: [
      { team_id: "T1", team_name: "Player Racing", reputation: 60, starting_budget: 2_000_000 },
      { team_id: "T2", team_name: "Rival Racing", reputation: 55, starting_budget: 1_800_000 },
    ],
    drivers: [
      { driver_id: "D1", display_name: "Player Driver", birth_date: "1950-01-01", current_ability: 72, potential_ability: 75, reputation: 58 },
      { driver_id: "D2", display_name: "Rival Driver", birth_date: "1952-01-01", current_ability: 76, potential_ability: 80, reputation: 62 },
    ],
    futureDrivers: [
      { driver_id: "D3", display_name: "Visible Prospect", birth_date: "1961-01-01", current_ability: 56, potential_ability: 88, reputation: 30, world_visible_from: 1980, talent_visible_from: 1980, f1_eligible_from: 1982 },
    ],
    driverRatings: [
      { driver_id: "D1", current_ability: 72, potential_ability: 75, pace: 73, qualifying: 71, reputation: 58 },
      { driver_id: "D2", current_ability: 76, potential_ability: 80, pace: 77, qualifying: 75, reputation: 62 },
    ],
    contracts: [
      { driver_id: "D1", team_id: "T1", role: "main_driver", contract_start: 1980, contract_until: 1981 },
      { driver_id: "D2", team_id: "T2", role: "main_driver", contract_start: 1980, contract_until: 1981 },
    ],
    staff: [
      { staff_id: "S1", display_name: "Technical Chief", role: "technical_director", birth_date: "1938-01-01" },
      { staff_id: "S2", display_name: "Chief Scout", role: "chief_scout", birth_date: "1940-01-01" },
      { staff_id: "S3", display_name: "Team Manager", role: "team_manager", birth_date: "1935-01-01" },
      { staff_id: "S4", display_name: "Rival Designer", role: "designer", birth_date: "1942-01-01" },
    ],
    staffRatings: [
      { staff_id: "S1", technical: 82, engineering: 80, design: 84, leadership: 70 },
      { staff_id: "S2", scouting: 20, judging_ability: 20, data_analysis: 20, communication: 20 },
      { staff_id: "S3", leadership: 76, communication: 72, motivation: 74, negotiation: 68 },
      { staff_id: "S4", technical: 78, engineering: 80, design: 86 },
    ],
    staffContracts: [
      { staff_id: "S1", team_id: "T1", role: "technical_director", contract_start: 1980, contract_until: 1982 },
      { staff_id: "S2", team_id: "T1", role: "chief_scout", contract_start: 1980, contract_until: 1982 },
      { staff_id: "S3", team_id: "T1", role: "team_manager", contract_start: 1980, contract_until: 1982 },
      { staff_id: "S4", team_id: "T2", role: "designer", contract_start: 1980, contract_until: 1982 },
    ],
    teamFinancials: [
      { team_id: "T1", cash_balance: 2_000_000 },
      { team_id: "T2", cash_balance: 1_800_000 },
    ],
    carStats: [
      { team_id: "T1", chassis_spec: 60, aero_spec: 52, gearbox_spec: 58 },
      { team_id: "T2", chassis_spec: 55, aero_spec: 57, gearbox_spec: 54 },
    ],
    facilities: [
      { team_id: "T1", wind_tunnel_level: 6, manufacturing_level: 6 },
      { team_id: "T2", wind_tunnel_level: 5, manufacturing_level: 5 },
    ],
    sponsorContracts: [],
    calendar: [],
    rules: {},
    qualifyingRules: {},
  }, { seed: "phase-44", startDate: "1980-01-01" });
}

function initialized() {
  const saveWorld = world();
  saveWorld.player = { manager: { name: "Manager" }, controlledTeamIds: ["T1"] };
  const systems = createCoreWorldSystems({ controlledTeamIds: ["T1"], competingOfferBaseChance: 0, poachingBaseChance: 0 });
  initializeSimulation(saveWorld, systems);
  return { saveWorld, systems };
}

test("staff roles map into era-neutral organisation departments", () => {
  assert.equal(organizationDepartmentForRole("technical_director"), "technical");
  assert.equal(organizationDepartmentForRole("race engineer"), "race_operations");
  assert.equal(organizationDepartmentForRole("chief_scout"), "scouting");
  assert.equal(organizationDepartmentForRole("commercial director"), "commercial");
  assert.equal(organizationDepartmentForRole("team_manager"), "leadership");
  assert.equal(organizationDepartmentForRole("doctor"), "general");
});

test("career start builds persistent organisation state from authoritative employment", () => {
  const { saveWorld } = initialized();
  const projection = organizationProjection(saveWorld, "T1", { refresh: false });
  assert.equal(projection.employedStaffCount, 3);
  assert.equal(projection.openStaffVacancies, 0);
  assert.equal(projection.departments.technical.memberCount, 1);
  assert.equal(projection.departments.scouting.memberCount, 1);
  assert.equal(projection.departments.leadership.memberCount, 1);
  assert.equal(projection.departments.technical.provenance, "derived_gameplay_organisation_state");
  assert.equal(saveWorld.world.management.organization.lastSnapshotMonth, "1980-01");
  assert.equal(saveWorld.world.management.organization.history.length, 2, "career-start snapshot should cover both active teams once");
});

test("vacancies and weak staff become department pressure without changing staff attributes", () => {
  const { saveWorld } = initialized();
  const original = structuredClone(saveWorld.world.staffRatings.find((row) => row.staff_id === "S1"));
  saveWorld.world.employment.vacancies.push({
    vacancyId: "vac:technical",
    type: "staff",
    teamId: "T1",
    role: "design_engineer",
    openedAt: saveWorld.clock.date,
    status: "open",
  });
  const projection = organizationProjection(saveWorld, "T1");
  assert.ok(projection.departments.technical.workloadIndex > 1);
  assert.ok(["strained", "critical"].includes(projection.departments.technical.status));
  assert.deepEqual(saveWorld.world.staffRatings.find((row) => row.staff_id === "S1"), original, "organisation review must not rewrite historical/derived staff ratings");
});

test("staff advice can surface weak organisation capability even with no vacancy", () => {
  const { saveWorld } = initialized();
  const technical = saveWorld.world.staffRatings.find((row) => row.staff_id === "S1");
  technical.technical = 20;
  technical.engineering = 20;
  technical.design = 20;
  technical.leadership = 20;
  refreshOrganization(saveWorld);
  const pressure = organisationPressure(saveWorld, "T1");
  assert.equal(pressure.id, "technical");
  assert.equal(pressure.status, "weak");

  const system = createStaffAdviceSystem({ controlledTeamIds: ["T1"] });
  const output = system.handle({ saveWorld, event: { type: SIM_EVENT.MONTH_STARTED, date: "1980-02-01", payload: {} } });
  assert.ok(output.some((event) => /Organisation review: Technical/.test(event.payload.title)));
});

test("scouting progress uses department effectiveness but does not alter visibility or eligibility", () => {
  const { saveWorld, systems } = initialized();
  const assignment = startDriverScoutingAssignment(saveWorld, "D3", { durationDays: 2 });
  assert.equal(assignment.status, "active");

  advanceDays(saveWorld, 2, systems);
  const active = saveWorld.world.management.scouting.assignments.find((row) => row.id === assignment.id);
  assert.equal(active.status, "active", "weak scouting department should need more than two calendar days for two effective scouting days");
  assert.ok(active.organisationEffectiveness < 1);
  assert.equal(saveWorld.world.employment.drivers.D3, undefined, "scouting must not create an F1 contract for a talent-visible prospect");

  advanceDays(saveWorld, 4, systems);
  const completed = saveWorld.world.management.scouting.assignments.find((row) => row.id === assignment.id);
  assert.equal(completed.status, "completed");
});

test("monthly organisation history is idempotent and survives save serialization", () => {
  const { saveWorld, systems } = initialized();
  dispatchSimulationEvents(saveWorld, [
    { type: SIM_EVENT.MONTH_STARTED, date: "1980-02-01", payload: { year: 1980, month: 2 } },
    { type: SIM_EVENT.MONTH_STARTED, date: "1980-02-01", payload: { year: 1980, month: 2 } },
  ], systems);
  const rows = saveWorld.world.management.organization.history.filter((row) => row.date === "1980-02-01");
  assert.equal(rows.length, 2, "one monthly snapshot per active team should be recorded once");

  const restored = deserializeSaveWorld(serializeSaveWorld(saveWorld));
  assert.deepEqual(organizationProjection(restored, "T1", { refresh: false }), organizationProjection(saveWorld, "T1", { refresh: false }));
  assert.equal(restored.world.management.organization.lastSnapshotMonth, "1980-02");
});

test("organisation drops exited teams from active projection while preserving history", () => {
  const { saveWorld } = initialized();
  const beforeHistory = saveWorld.world.management.organization.history.length;
  saveWorld.world.governance.teamEvolution.active = { T1: saveWorld.world.governance.teamEvolution.active.T1 };
  saveWorld.world.governance.teamEvolution.exited.T2 = { teamId: "T2", exitedSeason: 1980 };
  refreshOrganization(saveWorld);
  assert.equal(saveWorld.world.management.organization.teams.T2, undefined);
  assert.ok(saveWorld.world.management.organization.history.length >= beforeHistory, "derived active projection cleanup must not erase organisation history");
  assert.equal(organizationSummary(saveWorld).teams, 1);
});
