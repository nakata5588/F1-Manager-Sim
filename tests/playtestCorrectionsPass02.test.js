import test from "node:test";
import assert from "node:assert/strict";
import {
  listStaffRecruitmentCandidates,
  openStaffContractNegotiation,
  staffRecruitmentEligibility,
} from "../src/game/management/staffRecruitment.js";
import {
  advanceTechnicalMonth,
  ensureTechnicalTeam,
  facilityEraAvailability,
  startFacilityUpgrade,
  startTechnicalDesignProject,
  technicalProjection,
} from "../src/game/management/technical.js";
import { availableTyreCompounds, materializedTyreCompounds } from "../src/sim/raceStrategy.js";

function baseSave() {
  return {
    meta: { seed: "pass02" },
    clock: { season: 1980, date: "1980-01-10" },
    player: { controlledTeamIds: ["T1"] },
    history: {},
    world: {
      teams: [
        { team_id: "T1", team_name: "Player Team", reputation: 70 },
        { team_id: "T2", team_name: "Rival Team", reputation: 60 },
      ],
      staff: [
        { staff_id: "OWNER", staff_name: "Owner Principal", role: "Owner / Team Principal" },
        { staff_id: "TP", staff_name: "Movable Principal", role: "Team Principal" },
      ],
      futureStaff: [],
      staffRatings: [
        { staff_id: "OWNER", leadership: 80 },
        { staff_id: "TP", leadership: 75 },
      ],
      staffContracts: [],
      driverRatings: [],
      careerState: { staff: {}, drivers: {} },
      employment: {
        staff: {
          OWNER: { teamId: "T2", role: "Owner / Team Principal", status: "employed", contractUntil: 1985 },
          TP: { teamId: "T2", role: "Team Principal", status: "employed", contractUntil: 1981 },
        },
        drivers: {},
      },
      facilities: [{
        team_id: "T1",
        wind_tunnel_level: 5,
        simulator_level: 6,
        aero_dept_level: 5,
        chassis_shop_level: 6,
        manufacturing_level: 5,
      }],
      carStats: [{ team_id: "T1", chassis_spec: 70, aero_spec: 70 }],
      carState: {},
      teamState: { T1: { cash: 10_000_000, openingCash: 5_000_000 } },
      tyres: [],
      teamTyreSuppliers: {},
      management: {},
    },
  };
}

test("ownership and governance identities stay visible but are excluded from ordinary staff recruitment", () => {
  const save = baseSave();
  assert.equal(staffRecruitmentEligibility(save, "OWNER").eligible, false);
  assert.equal(staffRecruitmentEligibility(save, "OWNER").reason, "governance_ownership_locked");
  assert.equal(staffRecruitmentEligibility(save, "TP").eligible, true, "ordinary team principals remain movable staff");

  const ids = listStaffRecruitmentCandidates(save, { teamId: "T1" }).map((row) => row.id);
  assert.deepEqual(ids, ["TP"]);
  assert.throws(
    () => openStaffContractNegotiation(save, { staffId: "OWNER", teamId: "T1" }),
    /ownership\/governance structure/i,
  );
});

test("1980 simulator is future technology and cannot leak into design efficiency", () => {
  const save = baseSave();
  const availability = facilityEraAvailability(save, "simulator");
  assert.equal(availability.available, false);
  assert.equal(availability.status, "unavailable_future_technology");

  const team = ensureTechnicalTeam(save, "T1");
  assert.equal(team.facilities.simulator.availabilityStatus, "unavailable_future_technology");
  assert.equal(team.facilities.simulator.level, null);
  assert.equal(team.facilities.simulator.ignoredOpeningLevel, 6, "stale derived opening level is quarantined, not treated as a real 1980 facility");
  assert.throws(() => startFacilityUpgrade(save, "T1", "simulator"), /unavailable future technology/i);

  const project = startTechnicalDesignProject(save, "T1", { component: "chassis_spec", focus: "balanced" });
  assert.equal(project.facilityEfficiency, 0.6, "unavailable simulator must not be averaged into chassis design efficiency");
});

test("existing saves quarantine legacy simulator state and cancel stale upgrades before monthly processing", () => {
  const save = baseSave();
  const team = ensureTechnicalTeam(save, "T1");
  team.facilities.simulator = {
    id: "simulator",
    label: "Simulator",
    level: 4,
    availabilityStatus: "operational",
    source: "save_world_upgraded",
    sourceField: "simulator_level",
    maintenanceDeltaAnnual: 42000,
  };
  team.facilityUpgrades.push({
    upgradeId: "legacy-simulator-upgrade",
    teamId: "T1",
    facilityId: "simulator",
    fromLevel: 4,
    toLevel: 5,
    cost: 250000,
    status: "active",
    startedAt: "1980-01-01",
    durationMonths: 1,
    monthsRemaining: 1,
  });

  const events = advanceTechnicalMonth(save, "1980-02-01");
  assert.equal(team.facilities.simulator.availabilityStatus, "unavailable_future_technology");
  assert.equal(team.facilities.simulator.level, null);
  assert.equal(team.facilities.simulator.ignoredOpeningLevel, 4);
  assert.equal(team.facilities.simulator.maintenanceDeltaAnnual, 0);
  assert.equal(team.facilityUpgrades[0].status, "cancelled_era_unavailable");
  assert.equal(team.facilityUpgrades[0].cancellationReason, "unavailable_future_technology");
  assert.equal(events.some((event) => event.payload?.facility_id === "simulator"), false);
});

test("future-era facility metadata can explicitly unlock a previously unavailable simulator", () => {
  const save = baseSave();
  ensureTechnicalTeam(save, "T1");
  save.world.facilityAvailability = { simulator: { available: true, availableFrom: 1990, source: "test_future_era_rule" } };
  save.clock.season = 1990;
  save.clock.date = "1990-01-10";
  const projection = technicalProjection(save, "T1");
  const simulator = projection.facilities.find((row) => row.id === "simulator");
  assert.equal(simulator.availabilityStatus, "available_unbuilt");
  assert.equal(simulator.level, 0);
  const build = startFacilityUpgrade(save, "T1", "simulator");
  assert.equal(build.fromLevel, 0);
  assert.equal(build.toLevel, 1);
});

test("supplier-level 1980 tyre packages expose derived dry alternatives and a wet option without modern compound labels", () => {
  const save = baseSave();
  save.world.tyres = [{
    tyre_id: "goodyear",
    supplier_id: "goodyear",
    compound_id: "goodyear",
    tyre_name: "Goodyear",
    compound_name: "Goodyear",
    condition: "dry",
    dry_grip: 82,
    wet_grip: 81,
    durability_rating: 78,
  }];
  save.world.teamTyreSuppliers.T1 = "goodyear";

  const all = materializedTyreCompounds(save);
  const dry = availableTyreCompounds(save, false, "T1");
  const wet = availableTyreCompounds(save, true, "T1");
  assert.equal(all.length, 3);
  assert.equal(dry.length, 2);
  assert.equal(wet.length, 1);
  assert.ok(dry.every((row) => row.dataStatus === "derived_gameplay_compound_family_from_supplier_package"));
  assert.ok(dry.some((row) => /Grip/.test(row.name)));
  assert.ok(dry.some((row) => /Endurance/.test(row.name)));
  assert.match(wet[0].name, /Wet/);
  assert.ok(all.every((row) => !/soft|medium|hard/i.test(row.name)), "runtime fallback must not invent modern historical compound names");
  assert.ok(dry[0].durabilityLaps !== dry[1].durabilityLaps, "dry choices must create a meaningful strategy trade-off");
});
