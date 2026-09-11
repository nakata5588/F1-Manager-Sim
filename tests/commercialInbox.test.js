import test from "node:test";
import assert from "node:assert/strict";
import { createSaveWorld } from "../src/save/createSaveWorld.js";
import { initializeSimulation, dispatchSimulationEvents, SIM_EVENT } from "../src/sim/timeEngine.js";
import { createTeamEconomySystem } from "../src/sim/systems/teamEconomy.js";
import { createCommercialManagementSystem } from "../src/sim/systems/commercialManagement.js";
import { createCommercialInboxSystem } from "../src/sim/systems/commercialInbox.js";
import { COMMERCIAL_EVENT, commercialProjection } from "../src/game/management/commercial.js";
import { listManagementInbox } from "../src/game/management/inbox.js";
import { setResponsibility } from "../src/game/management/responsibilities.js";

function makeWorld() {
  const saveWorld = createSaveWorld({
    season: 1980,
    teams: [
      { team_id: "T1", team_name: "Player Team", reputation: 95, country: "United Kingdom" },
      { team_id: "T2", team_name: "AI Team", reputation: 60, country: "France" },
    ],
    drivers: [], driverRatings: [], contracts: [],
    staff: [], staffRatings: [], staffContracts: [],
    sponsorCatalog: [
      { sponsor_id: "S1", sponsor_name: "Alpha", category: "technology", country: "United Kingdom", reputation: 92 },
      { sponsor_id: "S2", sponsor_name: "Beta", category: "finance", country: "United Kingdom", reputation: 88 },
      { sponsor_id: "S3", sponsor_name: "Gamma", category: "oil", country: "France", reputation: 75 },
    ],
    sponsorContracts: [],
    sponsorModels: [
      { team_id: "T1", estimated_annual_value_m: 1.2, data_status: "gameplay_design_estimate" },
      { team_id: "T2", estimated_annual_value_m: 0.4, data_status: "gameplay_design_estimate" },
    ],
    financeModels: [],
    teamFinancials: [
      { team_id: "T1", cash_balance: 2_000_000 },
      { team_id: "T2", cash_balance: 1_000_000 },
    ],
    facilities: [], calendar: [], rules: {}, qualifyingRules: {}, tracks: [], engines: [], carStats: [], tyres: [],
  }, { seed: "commercial-inbox-phase-35", startDate: "1980-01-01" });
  saveWorld.player = { manager: { name: "Manager" }, controlledTeamIds: ["T1"] };
  saveWorld.world.employment = { drivers: {}, staff: {}, vacancies: [], futureAssignments: { drivers: {}, staff: {} } };
  return saveWorld;
}

function commercialSystems() {
  return [
    createTeamEconomySystem(),
    createCommercialManagementSystem({ controlledTeamIds: ["T1"] }),
  ];
}

test("player-managed Commercial never signs sponsor deals autonomously", () => {
  const saveWorld = makeWorld();
  const systems = commercialSystems();
  initializeSimulation(saveWorld, systems);
  assert.equal(commercialProjection(saveWorld, "T1").activeDeals.length, 0);

  dispatchSimulationEvents(saveWorld, [{
    type: SIM_EVENT.MONTH_STARTED,
    date: "1980-02-01",
    payload: { year: 1980, month: 2 },
  }], systems);

  assert.equal(commercialProjection(saveWorld, "T1").activeDeals.length, 0);
  assert.equal(saveWorld.world.management.commercial.negotiations.filter((row) => row.teamId === "T1").length, 0);
});

test("delegated Commercial uses the canonical AI sponsor pipeline", () => {
  const saveWorld = makeWorld();
  setResponsibility(saveWorld, "T1", "commercial", "delegated");
  const systems = commercialSystems();
  initializeSimulation(saveWorld, systems);

  dispatchSimulationEvents(saveWorld, [{
    type: SIM_EVENT.MONTH_STARTED,
    date: "1980-02-01",
    payload: { year: 1980, month: 2 },
  }], systems);

  const negotiations = saveWorld.world.management.commercial.negotiations.filter((row) => row.teamId === "T1");
  assert.ok(negotiations.length >= 1);
  assert.ok(commercialProjection(saveWorld, "T1").activeDeals.length >= 1);
  assert.equal(commercialProjection(saveWorld, "T1").activeDeals[0].source, "ai_commercial");
});

test("season start refresh does not duplicate the monthly commercial market round", () => {
  const saveWorld = makeWorld();
  setResponsibility(saveWorld, "T1", "commercial", "delegated");
  const systems = commercialSystems();
  initializeSimulation(saveWorld, systems);

  dispatchSimulationEvents(saveWorld, [{
    type: SIM_EVENT.MONTH_STARTED,
    date: "1980-02-01",
    payload: { year: 1980, month: 2 },
  }], systems);
  const before = saveWorld.world.management.commercial.negotiations.filter((row) => row.teamId === "T1").length;

  dispatchSimulationEvents(saveWorld, [{
    type: SIM_EVENT.SEASON_STARTED,
    date: "1980-02-01",
    payload: { season: 1980 },
  }], systems);
  const after = saveWorld.world.management.commercial.negotiations.filter((row) => row.teamId === "T1").length;

  assert.equal(after, before);
});

test("commercial counter-offers become persistent Inbox decisions", () => {
  const saveWorld = makeWorld();
  const systems = [createCommercialInboxSystem({ controlledTeamIds: ["T1"] })];
  dispatchSimulationEvents(saveWorld, [{
    type: COMMERCIAL_EVENT.NEGOTIATION_COUNTERED,
    date: "1980-03-01",
    payload: {
      negotiation_id: "sponsor-negotiation:00001",
      team_id: "T1",
      sponsor_id: "S1",
      sponsor_name: "Alpha",
    },
  }], systems);

  const item = listManagementInbox(saveWorld, { includeArchived: true, limit: 0 }).find((row) => row.sourceId === "sponsor-negotiation:00001");
  assert.ok(item);
  assert.equal(item.category, "commercial");
  assert.equal(item.decision.kind, "sponsor_contract_counter");
  assert.deepEqual(item.decision.options.map((row) => row.id), ["accept_sponsor_counter", "withdraw_sponsor"]);
});

test("sponsor activities become fulfil-or-skip Inbox decisions", () => {
  const saveWorld = makeWorld();
  const systems = [createCommercialInboxSystem({ controlledTeamIds: ["T1"] })];
  dispatchSimulationEvents(saveWorld, [{
    type: COMMERCIAL_EVENT.ACTIVITY_DUE,
    date: "1980-06-01",
    payload: {
      activity_id: "sponsor-activity:00001",
      deal_id: "sponsor-deal:00001",
      team_id: "T1",
      sponsor_id: "S1",
      sponsor_name: "Alpha",
      tier: "title",
    },
  }], systems);

  const item = listManagementInbox(saveWorld, { includeArchived: true, limit: 0 }).find((row) => row.sourceId === "sponsor-activity:00001");
  assert.ok(item);
  assert.equal(item.decision.kind, "sponsor_activity");
  assert.deepEqual(item.decision.options.map((row) => row.id), ["fulfil_activity", "skip_activity"]);
});

test("commercial Inbox ignores events from teams no longer controlled by the manager", () => {
  const saveWorld = makeWorld();
  saveWorld.player.controlledTeamIds = [];
  dispatchSimulationEvents(saveWorld, [{
    type: COMMERCIAL_EVENT.RENEWAL_DUE,
    date: "1980-07-01",
    payload: { team_id: "T1", deal_id: "D1", sponsor_name: "Alpha", satisfaction: 70, tier: "title" },
  }], [createCommercialInboxSystem({ controlledTeamIds: ["T1"] })]);

  assert.equal(listManagementInbox(saveWorld, { includeArchived: true, limit: 0 }).length, 0);
});
