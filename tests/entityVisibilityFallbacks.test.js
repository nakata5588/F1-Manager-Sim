import test from "node:test";
import assert from "node:assert/strict";

import {
  entityVisibilityState,
  isEntityVisibleInSeason,
  normalizeEntityVisibility,
} from "../src/index.js";

test("birth date is identity only and never makes a future driver player-visible", () => {
  const driver = {
    driver_id: "BIRTH_ONLY",
    birth_date: "1965-06-01",
  };

  const normalized = normalizeEntityVisibility(driver, { type: "driver" });
  assert.equal(normalized.birthYear, 1965);
  assert.equal(normalized.worldVisibleFrom, null);
  assert.equal(normalized.talentVisibleFrom, null);
  assert.equal(normalized.f1EligibleFrom, null);
  assert.equal(entityVisibilityState(driver, 1980, { type: "driver" }), "hidden");
  assert.equal(isEntityVisibleInSeason(driver, 2000, { type: "driver" }), false);
});

test("explicit F1 eligibility without earlier visibility makes the entity visible at eligibility, not at birth", () => {
  const driver = {
    driver_id: "ELIGIBILITY_ONLY",
    birth_date: "1965-06-01",
    f1_eligible_from: 1984,
  };

  const normalized = normalizeEntityVisibility(driver, { type: "driver" });
  assert.equal(normalized.worldVisibleFrom, 1984);
  assert.equal(normalized.talentVisibleFrom, 1984);
  assert.equal(normalized.f1EligibleFrom, 1984);
  assert.equal(normalized.visibilitySource, "explicit_eligibility_visibility_floor");
  assert.equal(entityVisibilityState(driver, 1983, { type: "driver" }), "hidden");
  assert.equal(entityVisibilityState(driver, 1984, { type: "driver" }), "f1_eligible");
});

test("historical F1 debut remains only a conservative legacy fallback when dedicated visibility metadata is absent", () => {
  const legacyDriver = {
    driver_id: "LEGACY_DEBUT_ONLY",
    birth_date: "1960-01-01",
    f1_rookie_season: 1984,
  };

  const normalized = normalizeEntityVisibility(legacyDriver, { type: "driver" });
  assert.equal(normalized.worldVisibleFrom, 1984);
  assert.equal(normalized.talentVisibleFrom, 1984);
  assert.equal(normalized.f1EligibleFrom, 1984);
  assert.equal(normalized.f1DebutReference, 1984);
  assert.equal(normalized.visibilitySource, "legacy_f1_debut_fallback");
  assert.equal(entityVisibilityState(legacyDriver, 1983, { type: "driver" }), "hidden");
  assert.equal(entityVisibilityState(legacyDriver, 1984, { type: "driver" }), "f1_eligible");
});
