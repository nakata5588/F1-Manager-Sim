from pathlib import Path

path = Path("tests/tyreSupplierScope.test.js")
source = path.read_text(encoding="utf-8")
source = source.replace(
'''test("available tyre set is restricted to the team's historical supplier", () => {
  const save = saveWorld();
  assert.deepEqual(availableTyreCompounds(save, false, "WILLIAMS").map((row) => row.supplierId), ["goodyear"]);
  assert.deepEqual(availableTyreCompounds(save, false, "RENAULT").map((row) => row.supplierId), ["michelin"]);
});

test("AI strategy cannot select a higher-grip rival supplier", () => {
  const save = saveWorld();
  const plan = createRaceStrategyPlan(save, weekend, { driverId: "D1", teamId: "WILLIAMS" });
  assert.equal(plan.stints[0].compoundId, "goodyear");
  assert.equal(plan.plannedStops, 0);
});''',
'''test("available tyre set is restricted to the team's historical supplier while exposing useful dry choices", () => {
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
});''')
path.write_text(source, encoding="utf-8")
