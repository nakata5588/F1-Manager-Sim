import test from "node:test";
import assert from "node:assert/strict";
import { createSaveWorld } from "../src/save/createSaveWorld.js";
import { createCoreWorldSystems } from "../src/sim/systems/coreWorldSystems.js";
import { advanceDays, dispatchSimulationEvents, initializeSimulation } from "../src/sim/timeEngine.js";
import { EMPLOYMENT_EVENT } from "../src/sim/systems/employmentMarket.js";
import { createExternalDriverOffer } from "../src/game/management/market.js";
import { openDriverContractNegotiation } from "../src/game/management/contracts.js";

function initialized() {
  const saveWorld = createSaveWorld({
    season: 1980,
    teams: [
      { team_id: "T1", team_name: "Player", reputation: 58 },
      { team_id: "T2", team_name: "Rival", reputation: 54 },
      { team_id: "T3", team_name: "Works", reputation: 82 },
    ],
    drivers: [
      { driver_id: "D1", display_name: "Player Driver", birth_date: "1950-01-01", current_ability: 74, potential_ability: 76, reputation: 58 },
      { driver_id: "D2", display_name: "Target Driver", birth_date: "1952-01-01", current_ability: 80, potential_ability: 83, reputation: 70 },
      { driver_id: "D3", display_name: "Free Driver", birth_date: "1955-01-01", current_ability: 68, potential_ability: 72, reputation: 48 },
    ],
    driverRatings: [
      { driver_id: "D1", current_ability: 74, potential_ability: 76, reputation: 58 },
      { driver_id: "D2", current_ability: 80, potential_ability: 83, reputation: 70 },
      { driver_id: "D3", current_ability: 68, potential_ability: 72, reputation: 48 },
    ],
    contracts: [
      { driver_id: "D1", team_id: "T1", role: "main_driver", contract_start: 1980, contract_until: 1981 },
      { driver_id: "D2", team_id: "T2", role: "main_driver", contract_start: 1980, contract_until: 1982, annual_salary: 100000 },
    ],
    staff: [], staffRatings: [], staffContracts: [],
    teamFinancials: [], sponsorContracts: [], facilities: [], calendar: [], rules: {}, qualifyingRules: {},
  }, { seed: "market-coherence", startDate: "1980-01-01" });
  saveWorld.player = { manager: { name: "Manager" }, controlledTeamIds: ["T1"] };
  const systems = createCoreWorldSystems({ controlledTeamIds: ["T1"], competingOfferBaseChance: 0, poachingBaseChance: 0 });
  initializeSimulation(saveWorld, systems);
  return { saveWorld, systems };
}

test("an immediate transfer opens the old-team vacancy and AI can refill it", () => {
  const { saveWorld, systems } = initialized();
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
      decision: "test_transfer",
    },
  }], systems);

  assert.equal(saveWorld.world.employment.drivers.D2.teamId, "T1");
  const vacancy = saveWorld.world.employment.vacancies.find((row) => row.previousWorkerId === "D2" && row.teamId === "T2");
  assert.ok(vacancy, "the source team must receive a real vacancy");
  assert.equal(vacancy.status, "filled");
  assert.equal(vacancy.workerId, "D3");
  assert.equal(saveWorld.world.employment.drivers.D3.teamId, "T2");
});

test("a rival agreement closes the player's active negotiation for the same driver", () => {
  const { saveWorld, systems } = initialized();
  const negotiation = openDriverContractNegotiation(saveWorld, { driverId: "D2", teamId: "T1" });
  const external = createExternalDriverOffer(saveWorld, {
    driverId: "D2",
    teamId: "T3",
    source: "competing_offer",
    negotiationId: negotiation.id,
    startSeason: negotiation.startSeason,
    windowDays: 1,
    salaryIndex: 110,
  });
  const stored = saveWorld.world.management.people.market.externalOffers.find((row) => row.id === external.id);
  stored.interest.score = 100;

  advanceDays(saveWorld, 1, systems);

  const after = saveWorld.world.management.contracts.negotiations.find((row) => row.id === negotiation.id);
  assert.equal(stored.status, "accepted");
  assert.equal(after.status, "lost_to_rival");
  assert.equal(after.lostToTeamId, "T3");
  assert.equal(saveWorld.world.employment.futureAssignments.drivers.D2[0].teamId, "T3");
});
