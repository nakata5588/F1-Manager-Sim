import assert from "node:assert/strict";
import test from "node:test";

import {
  activeDamagePaceLoss,
  decideLiveRaceControl,
  repairDamageAtPit,
  resolveIncidentDamage,
  simulateTemporalRace,
} from "../src/index.js";

function save(seed = "damage-test") {
  return {
    meta: { seed },
    world: {
      rules: {},
      raceModelParams: {},
      eraSafety: { yellow_flags: true, red_flags: true, modern_safety_car: false, virtual_safety_car: false },
      calendar: [{ year: 1980, round: 1, gp_id: "GP1", track_id: "TR1", laps: 6 }],
      tracks: [{ track_id: "TR1", incident_risk: 45, overtaking_difficulty: 50, brake_stress: 60 }],
      drivers: [{ driver_id: "A" }],
      driverRatings: [{ driver_id: "A", racecraft: 80, consistency: 85, crash_likelihood: 0 }],
      staff: [{ staff_id: "S1" }],
      staffRatings: [{ staff_id: "S1", technical: 85, pitstop_management: 80 }],
      careerState: {
        drivers: { A: { attributes: {}, status: "employed" } },
        staff: { S1: { attributes: {}, status: "employed" } },
      },
      employment: { staff: { S1: { teamId: "TA", status: "employed" } } },
    },
  };
}

function weekend() {
  return {
    key: "1980:GP1",
    season: 1980,
    gpId: "GP1",
    round: 1,
    trackId: "TR1",
    grid: [{ grid: 1, driverId: "A", teamId: "TA" }],
    classification: [
      { position: 1, driverId: "A", teamId: "TA", grid: 1, status: "FINISHED", performanceIndex: 80, reliability: 100 },
    ],
    strategies: {},
  };
}

test("moderate incident can create survivable repairable damage with a real pace cost", () => {
  const world = save("moderate");
  const damage = resolveIncidentDamage(world, weekend(), {
    type: "incident",
    reason: "incident",
    driverId: "A",
    lap: 2,
    sectorId: "S2",
    severity: 35,
  }, { id: "S2", aeroSensitivity: 0.6, brakeStress: 0.5, technicality: 0.5 });

  assert.equal(damage.terminal, false);
  assert.equal(damage.repairable, true);
  assert.ok(damage.paceLossIndex > 0);
  assert.equal(activeDamagePaceLoss([damage]), damage.paceLossIndex);
});

test("critical incident is terminal and cannot be repaired", () => {
  const damage = resolveIncidentDamage(save("critical"), weekend(), {
    type: "incident",
    reason: "incident",
    driverId: "A",
    lap: 3,
    sectorId: "S1",
    severity: 95,
  }, { id: "S1", brakeStress: 0.7 });

  assert.equal(damage.terminal, true);
  assert.equal(damage.repairable, false);
  assert.equal(damage.status, "terminal");
});

test("explicit no-repair era rule overrides simulation repair defaults", () => {
  const world = save("no-repair");
  world.world.rules.pit_repairs_allowed = false;
  const damage = resolveIncidentDamage(world, weekend(), {
    type: "incident",
    reason: "incident",
    driverId: "A",
    lap: 2,
    sectorId: "S2",
    severity: 30,
  }, { id: "S2", aeroSensitivity: 0.5 });

  assert.equal(damage.terminal, false);
  assert.equal(damage.repairable, false);
  assert.equal(damage.repairPolicySource, "season_rules");
});

test("pit repair removes repairable pace loss and charges additional service loss", () => {
  const world = save("repair");
  const damage = resolveIncidentDamage(world, weekend(), {
    type: "incident",
    reason: "incident",
    driverId: "A",
    lap: 2,
    sectorId: "S3",
    severity: 35,
  }, { id: "S3", aeroSensitivity: 0.7 });
  const repair = repairDamageAtPit(world, "TA", [damage], "pit-3");

  assert.equal(repair.repaired.length, 1);
  assert.equal(repair.remaining.length, 0);
  assert.ok(repair.lossIndex > 0);
  assert.equal(repair.paceLossRecovered, damage.paceLossIndex);
  assert.equal(activeDamagePaceLoss(repair.repaired), 0);
});

test("Race Control reacts to a survivable incident event, not only a retirement", () => {
  const decision = decideLiveRaceControl(save("control"), weekend(), {
    type: "incident",
    reason: "incident",
    driverId: "A",
    lap: 2,
    sectorId: "S2",
    severity: 70,
  });
  assert.equal(decision.type, "local_yellow");
  assert.equal(decision.sectorId, "S2");
});

test("damage stored in a JSON resume state remains active after reload", () => {
  const initial = simulateTemporalRace(save("persist"), weekend(), { stopAfterLap: 2 });
  const storedDamage = {
    id: "manual-aero",
    driverId: "A",
    lap: 2,
    sectorId: "S2",
    type: "aero",
    severity: 45,
    terminal: false,
    repairable: false,
    paceLossIndex: 1.25,
    repairPolicySource: "test",
    status: "persistent",
  };
  initial.resumeState.states.A.damage = [storedDamage];
  initial.resumeState.states.A.damagePaceLoss = 1.25;

  const serialized = JSON.parse(JSON.stringify(initial.resumeState));
  const result = simulateTemporalRace(save("persist"), weekend(), { resumeState: serialized });
  assert.equal(result.timeline.completed, true);
  assert.equal(result.timeline.damageSummary.A.remainingDamage.length, 1);
  assert.equal(result.timeline.damageSummary.A.remainingPaceLossIndex, 1.25);
  assert.equal(result.classification[0].damageAtFinish[0].id, "manual-aero");
});
