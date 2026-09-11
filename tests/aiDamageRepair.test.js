import assert from "node:assert/strict";
import test from "node:test";

import { evaluateAiLiveStrategyDecision } from "../src/index.js";

function world() {
  return {
    meta: { seed: "ai-damage" },
    world: {
      tyres: [{ compound_id: "DRY", condition: "dry", dry_grip: 75, wet_grip: 20, durability_laps: 20 }],
      drivers: [{ driver_id: "A" }],
      driverRatings: [{ driver_id: "A", tire_management: 70 }],
      careerState: { drivers: { A: { attributes: {} } } },
    },
  };
}

function weekend(source = "ai_generated") {
  return {
    key: "1980:GP1",
    grid: [{ driverId: "A", teamId: "TA" }],
    classification: [{ driverId: "A", teamId: "TA" }],
    strategies: {
      A: {
        source,
        condition: "dry",
        dataStatus: "tyre_data_available",
        stints: [{ stint: 1, compoundId: "DRY", condition: "dry", targetLaps: 12 }],
        pitStops: [],
      },
    },
  };
}

test("AI can choose a repair stop for meaningful repairable damage", () => {
  const decision = evaluateAiLiveStrategyDecision(world(), weekend(), "A", {
    currentLap: 4,
    totalLaps: 12,
    condition: "dry",
    tyreWear: 0.3,
    damagePaceLoss: 1.2,
    repairableDamage: true,
  });
  assert.ok(decision);
  assert.equal(decision.trigger, "damage_repair");
  assert.equal(decision.compoundId, "DRY");
});

test("player-controlled strategy is not auto-pitted for damage", () => {
  const decision = evaluateAiLiveStrategyDecision(world(), weekend("player"), "A", {
    currentLap: 4,
    totalLaps: 12,
    condition: "dry",
    tyreWear: 1.5,
    damagePaceLoss: 3,
    repairableDamage: true,
    activeControl: { type: "safety_car", startLap: 4, endLap: 6 },
  });
  assert.equal(decision, null);
});
