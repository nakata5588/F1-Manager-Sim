import test from "node:test";
import assert from "node:assert/strict";

import { createSaveWorld } from "../src/save/createSaveWorld.js";
import { createCoreWorldSystems } from "../src/sim/systems/coreWorldSystems.js";
import { initializeSimulation } from "../src/sim/timeEngine.js";
import { buildManagementPlanning } from "../src/app/managementPlanning.js";
import { ensurePeopleState, ensurePersonState } from "../src/game/management/people.js";
import { setDriverShortlist } from "../src/game/management/scouting.js";

function world() {
  const saveWorld = createSaveWorld({
    season: 1980,
    teams: [
      { team_id: "T1", team_name: "Player Racing", reputation: 60, starting_budget: 2_000_000 },
      { team_id: "T2", team_name: "Rival Racing", reputation: 55, starting_budget: 1_800_000 },
    ],
    drivers: [
      { driver_id: "D1", display_name: "Driver One", birth_date: "1950-01-01", current_ability: 75, potential_ability: 78, reputation: 60 },
      { driver_id: "D2", display_name: "Driver Two", birth_date: "1951-01-01", current_ability: 70, potential_ability: 72, reputation: 54 },
    ],
    futureDrivers: [
      {
        driver_id: "D3",
        display_name: "Visible Prospect",
        birth_date: "1960-01-01",
        current_ability: 48,
        potential_ability: 88,
        reputation: 25,
        world_visible_from: 1980,
        talent_visible_from: 1980,
        f1_eligible_from: 1982,
      },
      {
        driver_id: "D4",
        display_name: "Hidden Future Star",
        birth_date: "1963-01-01",
        current_ability: 40,
        potential_ability: 95,
        reputation: 10,
        world_visible_from: 1984,
        talent_visible_from: 1985,
        f1_eligible_from: 1987,
      },
    ],
    driverRatings: [
      { driver_id: "D1", current_ability: 75, potential_ability: 78, pace: 76, reputation: 60 },
      { driver_id: "D2", current_ability: 70, potential_ability: 72, pace: 71, reputation: 54 },
    ],
    contracts: [
      { driver_id: "D1", team_id: "T1", role: "main_driver", contract_start: 1980, contract_until: 1980, annual_salary: 150000 },
      { driver_id: "D2", team_id: "T1", role: "second_driver", contract_start: 1980, contract_until: 1982, annual_salary: 110000 },
    ],
    staff: [
      { staff_id: "S1", display_name: "Technical Chief", role: "technical_director", birth_date: "1938-01-01" },
      { staff_id: "S2", display_name: "Chief Scout", role: "chief_scout", birth_date: "1940-01-01" },
      { staff_id: "S3", display_name: "Owner Chairman", role: "owner", birth_date: "1930-01-01" },
    ],
    staffRatings: [
      { staff_id: "S1", technical: 82, engineering: 80, leadership: 70 },
      { staff_id: "S2", scouting: 72, judging_ability: 72, communication: 70 },
      { staff_id: "S3", leadership: 75, negotiation: 70 },
    ],
    staffContracts: [
      { staff_id: "S1", team_id: "T1", role: "technical_director", contract_start: 1980, contract_until: 1980, annual_salary: 90000 },
      { staff_id: "S2", team_id: "T1", role: "chief_scout", contract_start: 1980, contract_until: 1982, annual_salary: 60000 },
      { staff_id: "S3", team_id: "T1", role: "owner", contract_start: 1980, contract_until: 1990, annual_salary: 1 },
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
  }, { seed: "management-depth-pass", startDate: "1980-01-01" });

  saveWorld.player = { manager: { name: "Manager" }, controlledTeamIds: ["T1"] };
  const systems = createCoreWorldSystems({ controlledTeamIds: ["T1"], competingOfferBaseChance: 0, poachingBaseChance: 0 });
  initializeSimulation(saveWorld, systems);
  return saveWorld;
}

test("management planning turns contract and mentality pressure into actionable retention priorities", () => {
  const saveWorld = world();
  const driver = ensurePersonState(saveWorld, "driver", "D1");
  driver.mentality.contractSatisfaction = 24;
  driver.mentality.morale = 31;
  driver.mentality.transferOpenness = 74;

  ensurePeopleState(saveWorld).market.externalOffers.push({
    id: "external:1",
    workerType: "driver",
    workerId: "D1",
    teamId: "T2",
    status: "open",
    expiresAt: "1980-02-01",
  });

  const planning = buildManagementPlanning(saveWorld, "T1");
  const d1 = planning.drivers.find((row) => row.id === "D1");

  assert.equal(d1.horizon.status, "expiring");
  assert.equal(d1.retention.level, "high");
  assert.equal(d1.competingOffers, 1);
  assert.ok(d1.retention.signals.some((row) => row.id === "contract_expiring"));
  assert.ok(d1.retention.signals.some((row) => row.id === "rival_interest"));
  assert.ok(planning.priorities.some((row) => row.id === "driver:D1" && row.severity === "critical"));
});

test("management planning exposes organisation vacancies without changing staff authority", () => {
  const saveWorld = world();
  saveWorld.world.employment.vacancies.push({
    vacancyId: "vac:design",
    type: "staff",
    teamId: "T1",
    role: "design_engineer",
    openedAt: "1980-01-01",
    status: "open",
  });

  const beforeRatings = structuredClone(saveWorld.world.staffRatings);
  const planning = buildManagementPlanning(saveWorld, "T1");
  const technical = planning.organization.departments.find((row) => row.id === "technical");

  assert.equal(planning.organization.openStaffVacancies, 1);
  assert.equal(technical.vacancyCount, 1);
  assert.ok(["strained", "critical"].includes(technical.status));
  assert.ok(planning.priorities.some((row) => row.id === "department:technical"));
  assert.deepEqual(saveWorld.world.staffRatings, beforeRatings);
});

test("management planning keeps governance ownership staff out of ordinary renewal actions", () => {
  const saveWorld = world();
  const planning = buildManagementPlanning(saveWorld, "T1");
  const owner = planning.staff.find((row) => row.id === "S3");

  assert.equal(owner.renewalEligible, false);
  assert.equal(owner.renewalBlockedReason, "governance_ownership_locked");
});

test("management planning shortlist includes visible talent but never hidden future identities", () => {
  const saveWorld = world();
  setDriverShortlist(saveWorld, "D3", true);

  const planning = buildManagementPlanning(saveWorld, "T1");
  assert.deepEqual(planning.shortlist.map((row) => row.id), ["D3"]);

  const serialized = JSON.stringify(planning);
  assert.doesNotMatch(serialized, /Hidden Future Star|D4/);
  assert.doesNotMatch(serialized, /futureDrivers|futureStaff|futureTeams/);
});

test("management planning does not expose raw current or potential ability", () => {
  const saveWorld = world();
  setDriverShortlist(saveWorld, "D3", true);
  const planning = buildManagementPlanning(saveWorld, "T1");

  const serialized = JSON.stringify(planning);
  assert.doesNotMatch(serialized, /currentAbility|potentialAbility|current_ability|potential_ability/);
  assert.equal(planning.shortlist[0].hasReport, false);
});

test("management planning reports contract horizons for drivers and staff without creating a second contract state", () => {
  const saveWorld = world();
  const beforeDrivers = structuredClone(saveWorld.world.employment.drivers);
  const beforeStaff = structuredClone(saveWorld.world.employment.staff);

  const planning = buildManagementPlanning(saveWorld, "T1");

  assert.equal(planning.drivers.find((row) => row.id === "D1").horizon.status, "expiring");
  assert.equal(planning.drivers.find((row) => row.id === "D2").horizon.seasonsRemaining, 2);
  assert.equal(planning.staff.find((row) => row.id === "S1").horizon.status, "expiring");
  assert.deepEqual(saveWorld.world.employment.drivers, beforeDrivers);
  assert.deepEqual(saveWorld.world.employment.staff, beforeStaff);
});
