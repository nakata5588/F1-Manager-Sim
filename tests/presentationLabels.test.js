import test from "node:test";
import assert from "node:assert/strict";
import {
  publicLabel,
  publicLabelMap,
  resolvePublicLabelsInText,
} from "../playtest/presentation-labels.js";

test("presentation labels translate canonical driver and staff roles without changing their ids", () => {
  assert.equal(publicLabel("main_driver"), "First Driver");
  assert.equal(publicLabel("second_driver"), "Second Driver");
  assert.equal(publicLabel("reserve_driver"), "Reserve Driver");
  assert.equal(publicLabel("technical_director"), "Technical Director");
  assert.equal(publicLabel("head_of_aerodynamics"), "Head of Aerodynamics");

  const map = publicLabelMap();
  assert.equal(map.main_driver, "First Driver");
  assert.equal(Object.hasOwn(map, "First Driver"), false);
});

test("presentation labels cover statuses and race-weekend stages", () => {
  assert.equal(publicLabel("countered"), "Countered");
  assert.equal(publicLabel("practice_results"), "Practice & Setup");
  assert.equal(publicLabel("race_live"), "Race");
  assert.equal(publicLabel("talent_visible"), "Scouting Visible");
});

test("unknown enum-shaped values receive readable title case without mutating domain data", () => {
  assert.equal(publicLabel("market_value"), "Market Value");
  assert.equal(publicLabel("engine-supplier"), "Engine Supplier");
  assert.equal(publicLabel(""), "—");
});

test("text resolver replaces known enum tokens embedded in player-facing text", () => {
  assert.equal(
    resolvePublicLabelsInText("Role main_driver · contract countered"),
    "Role First Driver · contract Countered",
  );
  assert.equal(
    resolvePublicLabelsInText("technical_director / reserve_driver"),
    "Technical Director / Reserve Driver",
  );
});
