import test from "node:test";
import assert from "node:assert/strict";
import { resolveRaceControlPolicy, reviewRaceTimeline } from "../src/index.js";

function save(overrides = {}) {
  return {
    meta: { seed: "race-control" },
    world: {
      eraSafety: {
        yellow_flags: true,
        red_flags: true,
        modern_safety_car: false,
        source: "season_pack_rules",
        ...overrides,
      },
      tracks: [{ track_id: "TR", incident_risk: 70 }],
      driverRatings: [{ driver_id: "D1", crash_likelihood: 30 }],
      careerState: { drivers: { D1: { attributes: {} } } },
    },
  };
}

function race(severity = 70) {
  return {
    key: "1980:ARG",
    gpId: "ARG",
    trackId: "TR",
    timeline: {
      events: [
        { lap: 12, type: "retirement", driverId: "D1", reason: "incident", severity },
      ],
    },
  };
}

test("1980-style policy explicitly disables modern Safety Car while retaining flag control", () => {
  const policy = resolveRaceControlPolicy(save());
  assert.equal(policy.modernSafetyCar, false);
  assert.equal(policy.safetyCarMode, "unavailable_in_era");
  assert.equal(policy.yellowFlags, true);
  assert.equal(policy.redFlags, true);
});

test("an ordinary 1980 incident receives local yellow treatment but never a modern Safety Car", () => {
  const result = reviewRaceTimeline(save(), race(70));
  assert.equal(result.interventions.length, 1);
  assert.equal(result.interventions[0].type, "local_yellow");
  assert.equal(result.reviews.some((row) => row.type === "safety_car_review"), false);
});

test("a severe incident can trigger red-flag review without pretending the already-resolved race was stopped", () => {
  const result = reviewRaceTimeline(save(), race(95));
  const red = result.reviews.find((row) => row.type === "red_flag_review");
  assert.ok(red);
  assert.equal(red.decision, "candidate");
  assert.equal(red.effectStatus, "awaiting_resumable_race_control");
  assert.equal(result.status, "control_review_pending_live_engine");
});

test("modern era can expose Safety Car review while 1980 cannot", () => {
  const result = reviewRaceTimeline(save({ modern_safety_car: true }), race(75));
  assert.ok(result.reviews.some((row) => row.type === "safety_car_review"));
  assert.equal(result.interventions.some((row) => row.type === "local_yellow"), false);
});

test("missing era controls do not invent Safety Car, VSC or flags", () => {
  const policy = resolveRaceControlPolicy({ meta: { seed: "none" }, world: {} });
  assert.equal(policy.modernSafetyCar, false);
  assert.equal(policy.virtualSafetyCar, false);
  assert.equal(policy.yellowFlags, false);
  assert.equal(policy.redFlags, false);
});