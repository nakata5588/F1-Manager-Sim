import test from "node:test";
import assert from "node:assert/strict";
import {
  MANAGER_BACKGROUND_OPTIONS,
  ageOnDate,
  createManagerProfile,
  ensureManagerProfile,
  managerProfileProjection,
} from "../src/game/management/managerProfile.js";

test("Manager Profile v1 creates a persistent identity separate from career state", () => {
  const profile = createManagerProfile({
    name: "Ricardo Nakata",
    nationality: "Portuguese",
    dateOfBirth: "1950-06-15",
    background: "team_management",
  }, {
    careerStartDate: "1980-01-01",
    createdAt: "2026-09-17T22:30:00.000Z",
  });

  assert.deepEqual(profile, {
    profileVersion: 1,
    id: "player-manager",
    name: "Ricardo Nakata",
    nationality: "Portuguese",
    dateOfBirth: "1950-06-15",
    background: "team_management",
    previousExperience: "Team Management",
    createdAt: "2026-09-17T22:30:00.000Z",
  });
  assert.equal(profile.career, undefined);
});

test("Manager Profile v1 validates identity and Career Start age", () => {
  const base = {
    name: "Manager",
    nationality: "Portuguese",
    dateOfBirth: "1950-01-01",
    background: "newcomer",
  };
  assert.throws(() => createManagerProfile({ ...base, name: "" }, { careerStartDate: "1980-01-01" }), /name is required/i);
  assert.throws(() => createManagerProfile({ ...base, nationality: "" }, { careerStartDate: "1980-01-01" }), /nationality is required/i);
  assert.throws(() => createManagerProfile({ ...base, dateOfBirth: "not-a-date" }, { careerStartDate: "1980-01-01" }), /valid date/i);
  assert.throws(() => createManagerProfile({ ...base, dateOfBirth: "1963-01-01" }, { careerStartDate: "1980-01-01" }), /at least 18/i);
  assert.throws(() => createManagerProfile({ ...base, background: "future_champion" }, { careerStartDate: "1980-01-01" }), /valid manager background/i);
});

test("manager age is derived from date of birth and evolving Save World date", () => {
  assert.equal(ageOnDate("1950-06-15", "1980-01-01"), 29);
  assert.equal(ageOnDate("1950-06-15", "1980-06-15"), 30);
});

test("legacy name-only managers migrate safely without invented personal facts", () => {
  const saveWorld = {
    meta: { createdAt: "2026-09-17T20:00:00.000Z" },
    clock: { date: "1980-01-01" },
    player: { manager: { name: "Legacy Manager" }, controlledTeamIds: ["T1"] },
  };
  const manager = ensureManagerProfile(saveWorld);
  assert.equal(manager.profileVersion, 1);
  assert.equal(manager.id, "player-manager");
  assert.equal(manager.name, "Legacy Manager");
  assert.equal(manager.nationality, null);
  assert.equal(manager.dateOfBirth, null);
  assert.equal(manager.background, null);
  assert.equal(manager.previousExperience, null);

  const projected = managerProfileProjection(saveWorld);
  assert.equal(projected.age, null);
  assert.equal(projected.createdAt, "2026-09-17T20:00:00.000Z");
});

test("Manager Profile background catalogue is stable and player-facing", () => {
  assert.deepEqual(MANAGER_BACKGROUND_OPTIONS.map((row) => row.id), [
    "former_driver",
    "engineering",
    "team_management",
    "commercial_business",
    "motorsport_operations",
    "newcomer",
  ]);
  assert.ok(MANAGER_BACKGROUND_OPTIONS.every((row) => row.label && row.description));
});
