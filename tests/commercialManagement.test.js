import test from "node:test";
import assert from "node:assert/strict";
import { createSaveWorld } from "../src/save/createSaveWorld.js";
import { serializeSaveWorld, deserializeSaveWorld } from "../src/save/serialization.js";
import { dispatchSimulationEvents, initializeSimulation, SIM_EVENT } from "../src/sim/timeEngine.js";
import { createTeamEconomySystem } from "../src/sim/systems/teamEconomy.js";
import { createCommercialManagementSystem } from "../src/sim/systems/commercialManagement.js";
import { setResponsibility } from "../src/game/management/responsibilities.js";
import {
  acceptSponsorCounterEvent,
  commercialMonthlySponsorIncome,
  commercialProjection,
  createSponsorActivity,
  listSponsorMarket,
  openSponsorNegotiation,
  raceCommercialConsequences,
  resolveSponsorActivity,
  submitSponsorOfferEvent,
} from "../src/game/management/commercial.js";

function world() {
  const saveWorld = createSaveWorld({
    season: 1980,
    teams: [
      { team_id: "T1", team_name: "Team One", reputation: 88, country: "United Kingdom" },
      { team_id: "T2", team_name: "Team Two", reputation: 55, country: "France" },
    ],
    drivers: [], driverRatings: [], contracts: [],
    staff: [], staffRatings: [], staffContracts: [],
    sponsorCatalog: [
      { sponsor_id: "S1", sponsor_name: "OilCo", category: "oil", country: "United Kingdom", reputation: 75 },
      { sponsor_id: "S2", sponsor_name: "TechCo", category: "technology", country: "France", reputation: 65 },
      { sponsor_id: "S3", sponsor_name: "BankCo", category: "finance", country: "United Kingdom", reputation: 82 },
      { sponsor_id: "S4", sponsor_name: "Rival Oil", category: "oil", country: "United Kingdom", reputation: 70 },
      { sponsor_id: "S5", sponsor_name: "WatchCo", category: "luxury", country: "Switzerland", reputation: 60 },
    ],
    sponsorContracts: [
      { sponsor_id: "S1", sponsor_name: "OilCo", team_id: "T1", category: "oil", year: 1980, annual_value: 120000 },
      { sponsor_id: "S2", sponsor_name: "TechCo", team_id: "T2", category: "technology", year: 1980, annual_value: 60000 },
    ],
    sponsorModels: [
      { team_id: "T1", estimated_annual_value_m: 0.35, data_status: "gameplay_design_estimate" },
      { team_id: "T2", estimated_annual_value_m: 0.18, data_status: "gameplay_design_estimate" },
    ],
    financeModels: [],
    teamFinancials: [
      { team_id: "T1", cash_balance: 1000000 },
      { team_id: "T2", cash_balance: 700000 },
    ],
    facilities: [],
    calendar: Array.from({ length: 12 }, (_, index) => ({ gp_id: `GP${index + 1}`, race_date: `1980-${String(index + 1).padStart(2, "0")}-15` })),
    rules: {}, qualifyingRules: {}, tracks: [], engines: [], carStats: [], tyres: [],
  }, { seed: "commercial-phase-35", startDate: "1980-01-01" });
  saveWorld.player = { manager: { name: "Manager" }, controlledTeamIds: ["T1"] };
  saveWorld.world.employment = { drivers: {}, staff: {}, vacancies: [], futureAssignments: { drivers: {}, staff: {} } };
  return saveWorld;
}

function systems() {
  return [createTeamEconomySystem(), createCommercialManagementSystem({ controlledTeamIds: ["T1"] })];
}

test("historical sponsorship becomes mutable commercial starting state without double-counting", () => {
  const saveWorld = world();
  initializeSimulation(saveWorld, systems());
  const commercial = commercialProjection(saveWorld, "T1");
  assert.equal(commercial.activeDeals.length, 1);
  assert.equal(commercial.activeDeals[0].source, "historical_start_contract");
  assert.equal(commercial.activeDeals[0].annualValue, 120000);
  assert.equal(commercialMonthlySponsorIncome(saveWorld, "T1", 1980), 10000);

  dispatchSimulationEvents(saveWorld, [{ type: SIM_EVENT.MONTH_STARTED, date: "1980-02-01", payload: { year: 1980, month: 2 } }], systems());
  const close = saveWorld.history.finances.find((row) => row.type === "monthly_close" && row.teamId === "T1");
  assert.equal(close.breakdown.sponsors, 10000);
});

test("sponsor category exclusivity blocks conflicting partners", () => {
  const saveWorld = world();
  initializeSimulation(saveWorld, systems());
  assert.throws(() => openSponsorNegotiation(saveWorld, { teamId: "T1", sponsorId: "S4", tier: "major" }), /conflicts with an active partner/i);
});

test("player sponsor negotiation can sign a deal and pay negotiated upfront value", () => {
  const saveWorld = world();
  const sim = systems();
  initializeSimulation(saveWorld, sim);
  const negotiation = openSponsorNegotiation(saveWorld, { teamId: "T1", sponsorId: "S3", tier: "major" });
  const stored = saveWorld.world.management.commercial.negotiations.find((row) => row.id === negotiation.id);
  stored.interest.score = 95;
  const before = saveWorld.world.teamState.T1.cash;
  const event = submitSponsorOfferEvent(saveWorld, negotiation.id, { ...negotiation.expectedTerms, annualValue: negotiation.expectedTerms.annualValue * 0.9, upfrontPercent: 10 });
  const processed = dispatchSimulationEvents(saveWorld, [{ ...event, date: saveWorld.clock.date }], sim);
  assert.ok(processed.some((row) => row.type === "commercial.deal_signed"));
  const projection = commercialProjection(saveWorld, "T1");
  const deal = projection.activeDeals.find((row) => row.sponsorId === "S3");
  assert.ok(deal);
  assert.equal(deal.valueSource, "simulation_negotiation");
  assert.ok(saveWorld.world.teamState.T1.cash > before);
});

test("counter-offers use the same canonical sponsor negotiation pipeline", () => {
  const saveWorld = world();
  const sim = systems();
  initializeSimulation(saveWorld, sim);
  const negotiation = openSponsorNegotiation(saveWorld, { teamId: "T1", sponsorId: "S5", tier: "partner" });
  const stored = saveWorld.world.management.commercial.negotiations.find((row) => row.id === negotiation.id);
  stored.interest.score = 54;
  const raw = submitSponsorOfferEvent(saveWorld, negotiation.id, negotiation.expectedTerms);
  if (raw.type === "commercial.negotiation_countered") {
    const accepted = acceptSponsorCounterEvent(saveWorld, negotiation.id);
    dispatchSimulationEvents(saveWorld, [{ ...accepted, date: saveWorld.clock.date }], sim);
    assert.ok(commercialProjection(saveWorld, "T1").activeDeals.some((row) => row.sponsorId === "S5"));
  } else {
    assert.ok(["commercial.negotiation_accepted", "commercial.negotiation_rejected"].includes(raw.type));
  }
});

test("sponsor activities change satisfaction and marketability inside Save World", () => {
  const saveWorld = world();
  const sim = systems();
  initializeSimulation(saveWorld, sim);
  const negotiation = openSponsorNegotiation(saveWorld, { teamId: "T1", sponsorId: "S3", tier: "title" });
  const stored = saveWorld.world.management.commercial.negotiations.find((row) => row.id === negotiation.id);
  stored.interest.score = 95;
  const accepted = submitSponsorOfferEvent(saveWorld, negotiation.id, { ...negotiation.expectedTerms, activationCommitment: 2 });
  dispatchSimulationEvents(saveWorld, [{ ...accepted, date: saveWorld.clock.date }], sim);
  const deal = commercialProjection(saveWorld, "T1").activeDeals.find((row) => row.sponsorId === "S3");
  const activity = createSponsorActivity(saveWorld, deal.id, "1980-03-01");
  const before = deal.satisfaction;
  const result = resolveSponsorActivity(saveWorld, activity.id, true, "1980-03-01");
  assert.equal(result.activity.status, "fulfilled");
  assert.ok(result.deal.satisfaction > before);
  assert.equal(result.deal.activationsCompleted, 1);
});

test("race sponsor objectives create satisfaction changes and performance bonuses", () => {
  const saveWorld = world();
  const sim = systems();
  initializeSimulation(saveWorld, sim);
  const negotiation = openSponsorNegotiation(saveWorld, { teamId: "T1", sponsorId: "S3", tier: "title" });
  const stored = saveWorld.world.management.commercial.negotiations.find((row) => row.id === negotiation.id);
  stored.interest.score = 95;
  const accepted = submitSponsorOfferEvent(saveWorld, negotiation.id, { ...negotiation.expectedTerms, performanceBonusPercent: 12 });
  dispatchSimulationEvents(saveWorld, [{ ...accepted, date: saveWorld.clock.date }], sim);
  const before = saveWorld.world.teamState.T1.cash;
  const results = raceCommercialConsequences(saveWorld, [{ teamId: "T1", position: 1 }], "1980-04-01");
  const result = results.find((row) => row.sponsorId === "S3");
  assert.equal(result.targetMet, true);
  assert.ok(result.bonus > 0);
  assert.ok(saveWorld.world.teamState.T1.cash > before);
});

test("delegated commercial responsibility lets the controlled team use AI sponsor rules", () => {
  const saveWorld = world();
  setResponsibility(saveWorld, "T1", "commercial", "delegated");
  const sim = systems();
  initializeSimulation(saveWorld, sim);
  const before = commercialProjection(saveWorld, "T1").activeDeals.length;
  dispatchSimulationEvents(saveWorld, [{ type: SIM_EVENT.MONTH_STARTED, date: "1980-02-01", payload: { year: 1980, month: 2 } }], sim);
  const after = commercialProjection(saveWorld, "T1").activeDeals.length;
  assert.ok(after >= before);
  assert.equal(saveWorld.world.management.responsibilities.teams.T1.commercial, "delegated");
});

test("commercial state survives normal save serialization", () => {
  const saveWorld = world();
  initializeSimulation(saveWorld, systems());
  const restored = deserializeSaveWorld(serializeSaveWorld(saveWorld));
  assert.equal(restored.world.management.commercial.teams.T1.activeDeals[0].sponsorId, "S1");
  assert.ok(Number.isFinite(restored.world.management.commercial.teams.T1.marketability));
});

test("sponsor market exposes interest and era-aware expected terms without inventing historical provenance", () => {
  const saveWorld = world();
  initializeSimulation(saveWorld, systems());
  const market = listSponsorMarket(saveWorld, "T1", { tier: "major" });
  const bank = market.find((row) => row.id === "S3");
  assert.ok(bank);
  assert.ok(Number.isFinite(bank.interest.score));
  assert.ok(bank.expectedTerms.annualValue > 0);
  assert.equal(commercialProjection(saveWorld, "T1").era.id, "early-commercial");
});
