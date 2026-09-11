import test from "node:test";
import assert from "node:assert/strict";
import { createSaveWorld } from "../src/save/createSaveWorld.js";
import { createCoreWorldSystems } from "../src/sim/systems/coreWorldSystems.js";
import { advanceDays, dispatchSimulationEvents, initializeSimulation } from "../src/sim/timeEngine.js";
import {
  listRecruitmentCandidates,
  setDriverShortlist,
  startDriverScoutingAssignment,
} from "../src/game/management/scouting.js";
import {
  acceptDriverContractCounterEvent,
  listContractNegotiations,
  openDriverContractNegotiation,
  submitDriverContractOfferEvent,
} from "../src/game/management/contracts.js";
import {
  listManagementInbox,
  managementInboxSummary,
  resolveManagementInboxDecision,
} from "../src/game/management/inbox.js";

function world() {
  return createSaveWorld({
    season: 1980,
    teams: [
      { team_id: "T1", team_name: "Player Racing", reputation: 60 },
      { team_id: "T2", team_name: "Rival Racing", reputation: 55 },
    ],
    drivers: [
      { driver_id: "D1", display_name: "Player One", birth_date: "1950-01-01", current_ability: 72, potential_ability: 75, reputation: 58 },
      { driver_id: "D2", display_name: "Rival Star", birth_date: "1952-01-01", current_ability: 78, potential_ability: 80, reputation: 62 },
    ],
    futureDrivers: [
      { driver_id: "D3", display_name: "Visible Prospect", birth_date: "1961-01-01", current_ability: 56, potential_ability: 88, reputation: 30, world_visible_from: 1980, talent_visible_from: 1980, f1_eligible_from: 1982 },
      { driver_id: "D4", display_name: "Hidden Future Star", birth_date: "1965-01-01", current_ability: 60, potential_ability: 95, reputation: 25, world_visible_from: 1985, talent_visible_from: 1985, f1_eligible_from: 1987 },
    ],
    driverRatings: [
      { driver_id: "D1", current_ability: 72, potential_ability: 75, pace: 73, qualifying: 71, reputation: 58 },
      { driver_id: "D2", current_ability: 78, potential_ability: 80, pace: 80, qualifying: 79, reputation: 62 },
    ],
    contracts: [
      { driver_id: "D1", team_id: "T1", role: "main_driver", contract_start: 1980, contract_until: 1981 },
      { driver_id: "D2", team_id: "T2", role: "main_driver", contract_start: 1980, contract_until: 1980 },
    ],
    staff: [],
    staffRatings: [],
    staffContracts: [],
    calendar: [],
    rules: {},
    qualifyingRules: {},
  }, { seed: "management-core", startDate: "1980-01-01" });
}

function initialized() {
  const saveWorld = world();
  saveWorld.player = { manager: { name: "Manager" }, controlledTeamIds: ["T1"] };
  const systems = createCoreWorldSystems({ controlledTeamIds: ["T1"] });
  initializeSimulation(saveWorld, systems);
  return { saveWorld, systems };
}

test("recruitment respects talent visibility and never exposes hidden future drivers", () => {
  const { saveWorld } = initialized();
  const candidates = listRecruitmentCandidates(saveWorld);
  const ids = candidates.map((row) => row.id);
  assert.ok(ids.includes("D1"));
  assert.ok(ids.includes("D2"));
  assert.ok(ids.includes("D3"), "talent-visible prospect should be scoutable");
  assert.ok(!ids.includes("D4"), "hidden future identity must not leak into recruitment");
  assert.equal(candidates.find((row) => row.id === "D1").knowledge, 100, "own driver knowledge should initialize at 100");
  assert.equal(candidates.find((row) => row.id === "D2").report, null, "raw CA/PA must not appear before a report");
});

test("scouting advances with world time and produces an inbox report with estimated ranges", () => {
  const { saveWorld, systems } = initialized();
  setDriverShortlist(saveWorld, "D2", true);
  startDriverScoutingAssignment(saveWorld, "D2", { durationDays: 2 });
  advanceDays(saveWorld, 2, systems);

  const candidate = listRecruitmentCandidates(saveWorld).find((row) => row.id === "D2");
  assert.equal(candidate.shortlisted, true);
  assert.ok(candidate.knowledge >= 72);
  assert.ok(candidate.report);
  assert.ok(candidate.report.currentAbility.low <= candidate.report.currentAbility.high);
  assert.equal("currentAbilityExact" in candidate.report, false);

  const inbox = listManagementInbox(saveWorld);
  assert.ok(inbox.some((item) => item.category === "scouting" && /Rival Star/.test(item.title)));
});

test("talent-visible but not F1-eligible drivers can be scouted but cannot be negotiated with", () => {
  const { saveWorld } = initialized();
  assert.ok(listRecruitmentCandidates(saveWorld).some((row) => row.id === "D3"));
  assert.throws(
    () => openDriverContractNegotiation(saveWorld, { driverId: "D3", teamId: "T1" }),
    /F1-eligible/i,
  );
});

test("contract counter-offer becomes an inbox decision and future agreement does not replace current team", () => {
  const { saveWorld, systems } = initialized();
  const negotiation = openDriverContractNegotiation(saveWorld, { driverId: "D2", teamId: "T1" });
  assert.equal(negotiation.startSeason, 1981);
  assert.equal(negotiation.expectedTerms.compensationMode, "abstract_index");

  const offer = {
    salaryIndex: Math.round(negotiation.expectedTerms.salaryIndex * 0.86),
    lengthYears: negotiation.expectedTerms.lengthYears,
    role: negotiation.expectedTerms.role,
  };
  dispatchSimulationEvents(saveWorld, [submitDriverContractOfferEvent(saveWorld, negotiation.id, offer)], systems);

  const afterOffer = listContractNegotiations(saveWorld).find((row) => row.id === negotiation.id);
  assert.equal(afterOffer.status, "countered");
  const counterItem = listManagementInbox(saveWorld).find((item) => item.sourceType === "contract_counter" && item.sourceId === negotiation.id);
  assert.ok(counterItem);
  assert.equal(counterItem.decision.status, "pending");

  const resolution = resolveManagementInboxDecision(saveWorld, counterItem.id, "accept_counter");
  assert.equal(resolution.resolution.kind, "contract_counter");
  dispatchSimulationEvents(saveWorld, [acceptDriverContractCounterEvent(saveWorld, negotiation.id)], systems);

  const accepted = listContractNegotiations(saveWorld).find((row) => row.id === negotiation.id);
  assert.equal(accepted.status, "accepted");
  assert.equal(saveWorld.world.employment.drivers.D2.teamId, "T2", "future signing must not move the driver immediately");
  assert.equal(saveWorld.world.employment.futureAssignments.drivers.D2[0].teamId, "T1");
  assert.equal(saveWorld.world.employment.futureAssignments.drivers.D2[0].contractStart, 1981);
  assert.ok(listManagementInbox(saveWorld).some((item) => item.sourceType === "contract_accepted" && item.sourceId === negotiation.id));
});

test("future contract activates when the new season begins", () => {
  const { saveWorld, systems } = initialized();
  const negotiation = openDriverContractNegotiation(saveWorld, { driverId: "D2", teamId: "T1" });
  dispatchSimulationEvents(saveWorld, [submitDriverContractOfferEvent(saveWorld, negotiation.id, {
    salaryIndex: Math.round(negotiation.expectedTerms.salaryIndex * 0.86),
    lengthYears: negotiation.expectedTerms.lengthYears,
    role: negotiation.expectedTerms.role,
  })], systems);
  const current = listContractNegotiations(saveWorld).find((row) => row.id === negotiation.id);
  if (current.status === "countered") {
    dispatchSimulationEvents(saveWorld, [acceptDriverContractCounterEvent(saveWorld, negotiation.id)], systems);
  }
  assert.equal(saveWorld.world.employment.drivers.D2.teamId, "T2");

  const daysToNextSeason = Math.round((Date.parse("1981-01-01T00:00:00Z") - Date.parse(`${saveWorld.clock.date}T00:00:00Z`)) / 86_400_000);
  advanceDays(saveWorld, daysToNextSeason, systems);
  assert.equal(saveWorld.clock.season, 1981);
  assert.equal(saveWorld.world.employment.drivers.D2.teamId, "T1");
  assert.equal(saveWorld.world.employment.drivers.D2.status, "employed");
});

test("management inbox summary tracks unread and pending decisions", () => {
  const { saveWorld } = initialized();
  const summary = managementInboxSummary(saveWorld);
  assert.ok(summary.unread >= 1, "career start should create a management inbox item");
  assert.equal(summary.decisionsPending, 0);
});
