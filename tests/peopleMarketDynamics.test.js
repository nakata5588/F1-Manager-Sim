import test from "node:test";
import assert from "node:assert/strict";
import { createSaveWorld } from "../src/save/createSaveWorld.js";
import { serializeSaveWorld, deserializeSaveWorld } from "../src/save/serialization.js";
import { createCoreWorldSystems } from "../src/sim/systems/coreWorldSystems.js";
import { advanceDays, dispatchSimulationEvents, initializeSimulation, SIM_EVENT } from "../src/sim/timeEngine.js";
import {
  ensurePersonState,
  ensureRelationship,
  evaluateDriverTransferInterest,
  personProjection,
} from "../src/game/management/people.js";
import {
  createExternalDriverOffer,
  marketPressureForDriver,
} from "../src/game/management/market.js";
import {
  openDriverContractNegotiation,
  submitDriverContractOfferEvent,
} from "../src/game/management/contracts.js";
import { listManagementInbox } from "../src/game/management/inbox.js";
import { EMPLOYMENT_EVENT } from "../src/sim/systems/employmentMarket.js";

function world() {
  return createSaveWorld({
    season: 1980,
    teams: [
      { team_id: "T1", team_name: "Player Racing", reputation: 55, starting_budget: 2_000_000 },
      { team_id: "T2", team_name: "Rival Racing", reputation: 50, starting_budget: 2_000_000 },
      { team_id: "T3", team_name: "Works Racing", reputation: 85, starting_budget: 3_000_000 },
    ],
    drivers: [
      { driver_id: "D1", display_name: "Loyal Star", birth_date: "1952-01-01", current_ability: 82, potential_ability: 84, reputation: 76, ambition: 70, loyalty: 88, professionalism: 82, adaptability: 66, composure: 75, teamwork: 78 },
      { driver_id: "D2", display_name: "Market Star", birth_date: "1954-01-01", current_ability: 79, potential_ability: 86, reputation: 72 },
      { driver_id: "D3", display_name: "Free Prospect", birth_date: "1958-01-01", current_ability: 66, potential_ability: 88, reputation: 52 },
    ],
    driverRatings: [
      { driver_id: "D1", current_ability: 82, potential_ability: 84, reputation: 76 },
      { driver_id: "D2", current_ability: 79, potential_ability: 86, reputation: 72 },
      { driver_id: "D3", current_ability: 66, potential_ability: 88, reputation: 52 },
    ],
    contracts: [
      { driver_id: "D1", team_id: "T1", role: "main_driver", contract_start: 1980, contract_until: 1980, annual_salary: 180000 },
      { driver_id: "D2", team_id: "T2", role: "main_driver", contract_start: 1980, contract_until: 1982, annual_salary: 160000, release_clause: 500000 },
    ],
    staff: [],
    staffRatings: [],
    staffContracts: [],
    teamFinancials: [
      { team_id: "T1", cash_balance: 2_000_000 },
      { team_id: "T2", cash_balance: 2_000_000 },
      { team_id: "T3", cash_balance: 3_000_000 },
    ],
    sponsorContracts: [],
    facilities: [],
    calendar: [],
    rules: {},
    qualifyingRules: {},
  }, { seed: "phase-33", startDate: "1980-01-01" });
}

function initialized(options = {}) {
  const saveWorld = world();
  saveWorld.player = { manager: { name: "Manager" }, controlledTeamIds: ["T1"] };
  const systems = createCoreWorldSystems({
    controlledTeamIds: ["T1"],
    competingOfferBaseChance: options.competingOfferBaseChance ?? 0,
    poachingBaseChance: options.poachingBaseChance ?? 0,
  });
  initializeSimulation(saveWorld, systems);
  return { saveWorld, systems };
}

test("historical personality fields remain inputs while missing traits use neutral fallback", () => {
  const { saveWorld } = initialized();
  const explicit = personProjection(saveWorld, "driver", "D1");
  assert.equal(explicit.personality.traits.ambition, 70);
  assert.equal(explicit.personality.traits.loyalty, 88);
  assert.match(explicit.personality.traitSources.loyalty, /^historical:/);
  const fallback = personProjection(saveWorld, "driver", "D2");
  assert.equal(fallback.personality.traits.loyalty, 50);
  assert.equal(fallback.personality.traitSources.loyalty, "neutral_fallback");
  assert.equal(fallback.representative.name, null, "simulation fallback representatives must not invent historical names");
  assert.equal(fallback.representative.source, "simulation_fallback");
});

test("transfer interest responds to loyalty, relationships and team prestige", () => {
  const { saveWorld } = initialized();
  const currentRelationship = ensureRelationship(saveWorld, "driver", "D1", "team", "T1");
  currentRelationship.affinity = 92;
  currentRelationship.trust = 90;
  const lowMove = evaluateDriverTransferInterest(saveWorld, "D1", "T2", { role: "main_driver" });
  const betterMove = evaluateDriverTransferInterest(saveWorld, "D1", "T3", { role: "main_driver" });
  assert.ok(betterMove.score > lowMove.score, "works-team prestige should improve interest despite loyalty");
  assert.ok(lowMove.reasons.includes("loyal_to_current_team"));
});

test("monthly people dynamics update mentality and synchronize career morale", () => {
  const { saveWorld, systems } = initialized();
  const person = ensurePersonState(saveWorld, "driver", "D1");
  person.mentality.teamSatisfaction = 20;
  person.mentality.contractSatisfaction = 18;
  person.mentality.morale = 25;
  dispatchSimulationEvents(saveWorld, [{ type: SIM_EVENT.MONTH_STARTED, date: saveWorld.clock.date, payload: { year: 1980, month: 1 } }], systems);
  assert.equal(saveWorld.world.careerState.drivers.D1.morale, Number(person.mentality.morale.toFixed(2)));
  assert.ok(listManagementInbox(saveWorld).some((row) => row.sourceType === "discontent"));
});

test("immediate move under contract exposes explicit release clause and rejects insufficient compensation", () => {
  const { saveWorld, systems } = initialized();
  const negotiation = openDriverContractNegotiation(saveWorld, { driverId: "D2", teamId: "T1", startSeason: 1980 });
  assert.equal(negotiation.transferCompensation.mode, "currency");
  assert.equal(negotiation.transferCompensation.value, 500000);
  assert.match(negotiation.transferCompensation.source, /^historical_clause:/);

  dispatchSimulationEvents(saveWorld, [submitDriverContractOfferEvent(saveWorld, negotiation.id, {
    annualSalary: negotiation.expectedTerms.annualSalary,
    signingBonus: negotiation.expectedTerms.signingBonus,
    lengthYears: negotiation.expectedTerms.lengthYears,
    role: negotiation.expectedTerms.role,
    transferFee: 100000,
  })], systems);
  const after = saveWorld.world.management.contracts.negotiations.find((row) => row.id === negotiation.id);
  assert.equal(after.status, "rejected");
  assert.equal(after.offers[0].reason, "transfer_compensation_insufficient");
});

test("currency transfer fee and signing bonus affect team cash without converting abstract compensation", () => {
  const { saveWorld, systems } = initialized();
  const beforeTarget = saveWorld.world.teamState.T1.cash;
  const beforeSource = saveWorld.world.teamState.T2.cash;
  dispatchSimulationEvents(saveWorld, [{
    type: EMPLOYMENT_EVENT.CONTRACT_SIGNED,
    date: saveWorld.clock.date,
    payload: {
      worker_type: "driver",
      worker_id: "D2",
      team_id: "T1",
      from_team_id: "T2",
      role: "main_driver",
      contract_start: 1980,
      contract_until: 1981,
      annual_salary: 200000,
      signing_bonus: 25000,
      transfer_compensation_mode: "currency",
      transfer_compensation_value: 500000,
    },
  }], systems);
  assert.equal(saveWorld.world.teamState.T1.cash, beforeTarget - 525000);
  assert.equal(saveWorld.world.teamState.T2.cash, beforeSource + 500000);
});

test("external offers create market pressure and can become real future contracts", () => {
  const { saveWorld, systems } = initialized();
  const offer = createExternalDriverOffer(saveWorld, {
    driverId: "D1",
    teamId: "T3",
    source: "test_poaching",
    startSeason: 1981,
    windowDays: 1,
    salaryIndex: 100,
  });
  const stored = saveWorld.world.management.people.market.externalOffers.find((row) => row.id === offer.id);
  stored.interest.score = 100;
  assert.equal(marketPressureForDriver(saveWorld, "D1", "T1").competingOffers, 1);
  advanceDays(saveWorld, 1, systems);
  assert.equal(stored.status, "accepted");
  assert.equal(saveWorld.world.employment.drivers.D1.teamId, "T1", "future poaching must not move the driver early");
  assert.equal(saveWorld.world.employment.futureAssignments.drivers.D1[0].teamId, "T3");
});

test("people and external market state survive save serialization", () => {
  const { saveWorld } = initialized();
  const person = ensurePersonState(saveWorld, "driver", "D1");
  person.mentality.morale = 37;
  createExternalDriverOffer(saveWorld, { driverId: "D1", teamId: "T3", source: "roundtrip", startSeason: 1981 });
  const restored = deserializeSaveWorld(serializeSaveWorld(saveWorld));
  assert.equal(restored.world.management.people.drivers.D1.mentality.morale, 37);
  assert.equal(restored.world.management.people.market.externalOffers.length, 1);
});
