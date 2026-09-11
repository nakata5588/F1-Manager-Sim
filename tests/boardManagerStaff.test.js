import test from "node:test";
import assert from "node:assert/strict";
import { createSaveWorld } from "../src/save/createSaveWorld.js";
import { serializeSaveWorld, deserializeSaveWorld } from "../src/save/serialization.js";
import { createCoreWorldSystems } from "../src/sim/systems/coreWorldSystems.js";
import { dispatchSimulationEvents, initializeSimulation, SIM_EVENT } from "../src/sim/timeEngine.js";
import { boardProjection, submitBoardRequest } from "../src/game/management/board.js";
import { BOARD_EVENT } from "../src/sim/systems/boardManagement.js";
import {
  acceptManagerJobOfferEvent,
  ensureManagerCareer,
  managerCareerProjection,
  submitManagerApplicationEvent,
} from "../src/game/management/managerCareer.js";
import { responsibilityOwner, setResponsibility } from "../src/game/management/responsibilities.js";
import {
  listStaffContractNegotiations,
  openStaffContractNegotiation,
  submitStaffContractOfferEvent,
} from "../src/game/management/staffRecruitment.js";

function createWorld() {
  const saveWorld = createSaveWorld({
    season: 1980,
    teams: [
      { team_id: "T1", team_name: "Player Racing", reputation: 58, starting_budget: 2_000_000 },
      { team_id: "T2", team_name: "Rival Racing", reputation: 52, starting_budget: 1_800_000 },
      { team_id: "T3", team_name: "Works Racing", reputation: 78, starting_budget: 3_000_000 },
    ],
    drivers: [
      { driver_id: "D1", display_name: "Driver One", birth_date: "1950-01-01", current_ability: 75, potential_ability: 78, reputation: 60 },
      { driver_id: "D2", display_name: "Driver Two", birth_date: "1952-01-01", current_ability: 70, potential_ability: 74, reputation: 55 },
      { driver_id: "D3", display_name: "Free Driver", birth_date: "1954-01-01", current_ability: 65, potential_ability: 70, reputation: 45 },
    ],
    driverRatings: [
      { driver_id: "D1", current_ability: 75, potential_ability: 78, reputation: 60 },
      { driver_id: "D2", current_ability: 70, potential_ability: 74, reputation: 55 },
      { driver_id: "D3", current_ability: 65, potential_ability: 70, reputation: 45 },
    ],
    contracts: [
      { driver_id: "D1", team_id: "T1", role: "main_driver", contract_start: 1980, contract_until: 1981, annual_salary: 150000 },
      { driver_id: "D2", team_id: "T2", role: "main_driver", contract_start: 1980, contract_until: 1981, annual_salary: 120000 },
    ],
    staff: [
      { staff_id: "S1", display_name: "Player Technical Chief", role: "technical_director", birth_date: "1938-01-01" },
      { staff_id: "S2", display_name: "Rival Designer", role: "designer", birth_date: "1940-01-01" },
      { staff_id: "S3", display_name: "Free Engineer", role: "engineer", birth_date: "1942-01-01" },
    ],
    staffRatings: [
      { staff_id: "S1", technical: 82, leadership: 76, strategy: 62 },
      { staff_id: "S2", technical: 80, design: 86, leadership: 68 },
      { staff_id: "S3", technical: 70, engineering: 74, leadership: 60 },
    ],
    staffContracts: [
      { staff_id: "S1", team_id: "T1", role: "technical_director", contract_start: 1980, contract_until: 1981, annual_salary: 90000 },
      { staff_id: "S2", team_id: "T2", role: "designer", contract_start: 1980, contract_until: 1981, annual_salary: 80000 },
    ],
    teamFinancials: [
      { team_id: "T1", cash_balance: 2_000_000 },
      { team_id: "T2", cash_balance: 1_800_000 },
      { team_id: "T3", cash_balance: 3_000_000 },
    ],
    carStats: [
      { team_id: "T1", chassis_spec: 60, aero_spec: 52, gearbox_spec: 58 },
      { team_id: "T2", chassis_spec: 55, aero_spec: 57, gearbox_spec: 54 },
      { team_id: "T3", chassis_spec: 75, aero_spec: 78, gearbox_spec: 72 },
    ],
    facilities: [
      { team_id: "T1", wind_tunnel_level: 6, manufacturing_level: 6 },
      { team_id: "T2", wind_tunnel_level: 5, manufacturing_level: 5 },
      { team_id: "T3", wind_tunnel_level: 8, manufacturing_level: 8 },
    ],
    sponsorContracts: [],
    calendar: [],
    rules: {},
    qualifyingRules: {},
  }, { seed: "phase-34", startDate: "1980-01-01" });
  saveWorld.player = { manager: { name: "Career Manager" }, controlledTeamIds: ["T1"] };
  const systems = createCoreWorldSystems({ controlledTeamIds: ["T1"], competingOfferBaseChance: 0, poachingBaseChance: 0 });
  initializeSimulation(saveWorld, systems);
  return { saveWorld, systems };
}

test("career start initializes board manager career and responsibilities in Save World", () => {
  const { saveWorld } = createWorld();
  const board = boardProjection(saveWorld, "T1");
  const career = managerCareerProjection(saveWorld);
  assert.equal(board.confidence, 65);
  assert.ok(board.objectives.some((row) => row.kind === "constructors_position"));
  assert.equal(career.status, "employed");
  assert.equal(career.currentTeamId, "T1");
  assert.equal(career.history[0].type, "appointed");
  assert.equal(responsibilityOwner(saveWorld, "T1", "carDevelopment"), "manager");
});

test("delegating car development lets the controlled team use the same AI project rules", () => {
  const { saveWorld, systems } = createWorld();
  setResponsibility(saveWorld, "T1", "carDevelopment", "delegated");
  dispatchSimulationEvents(saveWorld, [{ type: SIM_EVENT.MONTH_STARTED, date: "1980-02-01", payload: { year: 1980, month: 2 } }], systems);
  const project = (saveWorld.world.development.projects ?? []).find((row) => row.teamId === "T1");
  assert.ok(project, "delegated controlled-team development should start a project when finances allow");
  assert.equal(project.source, "delegated");
});

test("board request uses confidence and can add a simulation-owned development budget", () => {
  const { saveWorld, systems } = createWorld();
  const before = saveWorld.world.teamState.T1.cash;
  const request = submitBoardRequest(saveWorld, "T1", "development_budget");
  dispatchSimulationEvents(saveWorld, [{
    type: BOARD_EVENT.REQUEST_SUBMITTED,
    date: saveWorld.clock.date,
    payload: { request_id: request.id, team_id: "T1", kind: request.kind },
  }], systems);
  const resolved = boardProjection(saveWorld, "T1").requests.find((row) => row.id === request.id);
  assert.equal(resolved.status, "approved");
  assert.ok(saveWorld.world.teamState.T1.cash > before);
});

test("staff negotiation can create a real future staff assignment", () => {
  const { saveWorld, systems } = createWorld();
  const negotiation = openStaffContractNegotiation(saveWorld, { staffId: "S2", teamId: "T1" });
  assert.equal(negotiation.startSeason, 1982, "contracted staff should default to a future move after the current deal");
  const expected = negotiation.expectedTerms;
  const terms = expected.compensationMode === "currency"
    ? { annualSalary: Math.round(expected.annualSalary * 1.5), signingBonus: Math.round((expected.signingBonus ?? 0) * 1.5), lengthYears: expected.lengthYears, role: expected.role }
    : { salaryIndex: Math.min(120, Math.round(expected.salaryIndex * 1.35)), lengthYears: expected.lengthYears, role: expected.role };
  dispatchSimulationEvents(saveWorld, [submitStaffContractOfferEvent(saveWorld, negotiation.id, terms)], systems);
  const after = listStaffContractNegotiations(saveWorld).find((row) => row.id === negotiation.id);
  assert.equal(after.status, "accepted");
  assert.equal(saveWorld.world.employment.staff.S2.teamId, "T2", "future staff deal must not move the person early");
  assert.equal(saveWorld.world.employment.futureAssignments.staff.S2[0].teamId, "T1");
});

test("low board confidence can dismiss the manager without deleting career history", () => {
  const { saveWorld, systems } = createWorld();
  saveWorld.world.management.board.teams.T1.confidence = 8;
  for (const date of ["1980-02-01", "1980-03-01", "1980-04-01"]) {
    dispatchSimulationEvents(saveWorld, [{ type: SIM_EVENT.MONTH_STARTED, date, payload: { year: 1980, month: Number(date.slice(5, 7)) } }], systems);
  }
  const career = ensureManagerCareer(saveWorld);
  assert.equal(career.status, "unemployed");
  assert.equal(career.currentTeamId, null);
  assert.deepEqual(saveWorld.player.controlledTeamIds, []);
  assert.ok(career.history.some((row) => row.type === "dismissed" && row.teamId === "T1"));
});

test("an unemployed manager receives a job offer and accepting it changes controlled team", () => {
  const { saveWorld, systems } = createWorld();
  saveWorld.world.management.board.teams.T1.confidence = 5;
  for (const date of ["1980-02-01", "1980-03-01", "1980-04-01"]) {
    dispatchSimulationEvents(saveWorld, [{ type: SIM_EVENT.MONTH_STARTED, date, payload: { year: 1980, month: Number(date.slice(5, 7)) } }], systems);
  }
  dispatchSimulationEvents(saveWorld, [{ type: SIM_EVENT.MONTH_STARTED, date: "1980-05-01", payload: { year: 1980, month: 5 } }], systems);
  const career = ensureManagerCareer(saveWorld);
  const offer = career.jobOffers.find((row) => row.status === "open");
  assert.ok(offer, "unemployed manager should receive a realistic visible-team offer");
  dispatchSimulationEvents(saveWorld, [acceptManagerJobOfferEvent(saveWorld, offer.id)], systems);
  assert.equal(ensureManagerCareer(saveWorld).status, "employed");
  assert.equal(saveWorld.player.controlledTeamIds[0], offer.teamId);
  assert.ok(ensureManagerCareer(saveWorld).history.some((row) => row.type === "appointed" && row.teamId === offer.teamId));
});

test("high-reputation manager can apply for another team and move through the job market", () => {
  const { saveWorld, systems } = createWorld();
  ensureManagerCareer(saveWorld).reputation = 95;
  dispatchSimulationEvents(saveWorld, [submitManagerApplicationEvent(saveWorld, "T2")], systems);
  const career = ensureManagerCareer(saveWorld);
  const application = career.applications.at(-1);
  assert.equal(application.status, "accepted");
  assert.equal(career.currentTeamId, "T2");
  assert.deepEqual(saveWorld.player.controlledTeamIds, ["T2"]);
});

test("board manager responsibility and staff states survive save serialization", () => {
  const { saveWorld } = createWorld();
  setResponsibility(saveWorld, "T1", "staffRecruitment", "delegated");
  openStaffContractNegotiation(saveWorld, { staffId: "S2", teamId: "T1" });
  ensureManagerCareer(saveWorld).reputation = 47;
  const restored = deserializeSaveWorld(serializeSaveWorld(saveWorld));
  assert.equal(boardProjection(restored, "T1").confidence, 65);
  assert.equal(ensureManagerCareer(restored).reputation, 47);
  assert.equal(responsibilityOwner(restored, "T1", "staffRecruitment"), "delegated");
  assert.equal(listStaffContractNegotiations(restored).length, 1);
});
