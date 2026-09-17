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

test("available tyre set is restricted to the team's historical supplier while exposing useful dry choices", () => {
  const save = saveWorld();
  const williams = availableTyreCompounds(save, false, "WILLIAMS");
  const renault = availableTyreCompounds(save, false, "RENAULT");
  assert.equal(williams.length, 2);
  assert.equal(renault.length, 2);
  assert.deepEqual([...new Set(williams.map((row) => row.supplierId))], ["goodyear"]);
  assert.deepEqual([...new Set(renault.map((row) => row.supplierId))], ["michelin"]);
  assert.ok(williams.every((row) => String(row.compoundId).startsWith("goodyear:")));
  assert.ok(renault.every((row) => String(row.compoundId).startsWith("michelin:")));
});

test("AI strategy cannot select a higher-grip rival supplier", () => {
  const save = saveWorld();
  const plan = createRaceStrategyPlan(save, weekend, { driverId: "D1", teamId: "WILLIAMS" });
  assert.ok(plan.stints.length >= 1);
  assert.ok(plan.stints.every((stint) => String(stint.compoundId).startsWith("goodyear:")));
  assert.equal(plan.plannedStops, Math.max(0, plan.stints.length - 1));
});