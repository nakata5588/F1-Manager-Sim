import test from "node:test";
import assert from "node:assert/strict";

import {
  MANAGEMENT_PRIMARY_SECTIONS,
  MANAGEMENT_SUBSECTIONS,
  managementViewForHash,
  managementViewHref,
  normalizeManagementView,
  primarySectionForView,
  subsectionsForView,
} from "../playtest/management-workspace-model.js";

test("management workspace exposes seven player-facing primary sections", () => {
  assert.deepEqual(MANAGEMENT_PRIMARY_SECTIONS.map((row) => row.id), [
    "inbox",
    "team",
    "drivers",
    "staff",
    "board",
    "commercial",
    "career",
  ]);
  assert.equal(new Set(MANAGEMENT_PRIMARY_SECTIONS.map((row) => row.id)).size, 7);
});

test("management workspace groups technical subviews under the correct player context", () => {
  assert.deepEqual(MANAGEMENT_SUBSECTIONS.team.map((row) => row.id), ["team", "responsibilities"]);
  assert.deepEqual(MANAGEMENT_SUBSECTIONS.drivers.map((row) => row.id), ["drivers", "recruitment", "contracts", "market"]);
  assert.deepEqual(MANAGEMENT_SUBSECTIONS.staff.map((row) => row.id), ["staff", "staff-market"]);

  assert.equal(primarySectionForView("contracts"), "drivers");
  assert.equal(primarySectionForView("market"), "drivers");
  assert.equal(primarySectionForView("staff-market"), "staff");
  assert.equal(primarySectionForView("responsibilities"), "team");
});

test("management workspace preserves legacy People deep links without preserving the old flat IA", () => {
  assert.equal(managementViewForHash("#people"), "team");
  assert.equal(normalizeManagementView("#people"), "team");
  assert.equal(managementViewForHash("#not-a-view"), null);
  assert.equal(normalizeManagementView("#not-a-view"), "inbox");
});

test("management workspace produces stable deep links", () => {
  assert.equal(managementViewHref("drivers"), "/management.html#drivers");
  assert.equal(managementViewHref("contracts"), "/management.html#contracts");
  assert.equal(managementViewHref("staff-market"), "/management.html#staff-market");
  assert.deepEqual(subsectionsForView("recruitment").map((row) => row.id), ["drivers", "recruitment", "contracts", "market"]);
});
