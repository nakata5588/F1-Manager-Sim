import test from "node:test";
import assert from "node:assert/strict";
import { buildTeamLabelMap, resolveTeamLabelsInText } from "../playtest/entity-label-model.js";

test("team presentation resolver maps canonical IDs to human names", () => {
  const labels = buildTeamLabelMap([
    { id: "t_0001", name: "Williams" },
    { team_id: "t_0002", team_name: "McLaren" },
  ]);
  assert.equal(resolveTeamLabelsInText("t_0001", labels), "Williams");
  assert.equal(resolveTeamLabelsInText("t_0002 · future season 1981", labels), "McLaren · future season 1981");
});

test("team presentation resolver does not alter IDs embedded inside other identifiers", () => {
  const labels = buildTeamLabelMap([{ id: "t_0001", name: "Williams" }]);
  assert.equal(resolveTeamLabelsInText("driver:t_0001:contract", labels), "driver:Williams:contract");
  assert.equal(resolveTeamLabelsInText("xt_0001_suffix", labels), "xt_0001_suffix");
});

test("later rows override earlier labels so current Save World names beat opening database names", () => {
  const labels = buildTeamLabelMap([
    { id: "t_0001", name: "Opening Name" },
    { id: "t_0001", name: "Current Save World Name" },
  ]);
  assert.equal(resolveTeamLabelsInText("t_0001", labels), "Current Save World Name");
});
