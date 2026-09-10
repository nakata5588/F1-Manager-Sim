import test from "node:test";
import assert from "node:assert/strict";
import { availableTyreCompounds, createRaceStrategyPlan } from "../src/index.js";

function saveWorld() {
  return {
    meta: { seed: "supplier-scope" },
    world: {
      tyres: [
        { tyre_id: "goodyear", supplier_id: "goodyear", tyre_name: "Goodyear", dry_grip: 82, wet_grip: 81 },
        { tyre_id: "michelin", supplier_id: "michelin", tyre_name: "Michelin", dry_grip: 90, wet_grip: 78 },
      ],
      teamTyreSuppliers: {
        WILLIAMS: "goodyear",
        RENAULT: "michelin",
      },
      careerState: { drivers: { D1: { attributes: { tire_management: 75 } } } },
      driverRatings: [],
      employment: { staff: {} },
    },
  };
}

const weekend = {
  key: "1980:R1",
  race: { laps: 53 },
};

test("available tyre set is restricted to the team's historical supplier", () => {
  const save = saveWorld();
  assert.deepEqual(availableTyreCompounds(save, false, "WILLIAMS").map((row) => row.supplierId), ["goodyear"]);
  assert.deepEqual(availableTyreCompounds(save, false, "RENAULT").map((row) => row.supplierId), ["michelin"]);
});

test("AI strategy cannot select a higher-grip rival supplier", () => {
  const save = saveWorld();
  const plan = createRaceStrategyPlan(save, weekend, { driverId: "D1", teamId: "WILLIAMS" });
  assert.equal(plan.stints[0].compoundId, "goodyear");
  assert.equal(plan.plannedStops, 0);
});