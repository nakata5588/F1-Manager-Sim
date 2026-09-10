import assert from "node:assert/strict";
import test from "node:test";

import {
  decideLiveRaceControl,
  resolveRaceControlPolicy,
  reviewRaceTimeline,
  simulateTemporalRace,
} from "../src/index.js";

function baseSave(seed = "resumable") {
  return {
    meta: { seed },
    world: {
      calendar: [{ year: 1980, round: 1, gp_id: "GP1", track_id: "TR1", laps: 12 }],
      tracks: [{ track_id: "TR1", overtaking_difficulty: 50, incident_risk: 50 }],
      drivers: [{ driver_id: "A" }, { driver_id: "B" }],
      driverRatings: [
        { driver_id: "A", racecraft: 85, consistency: 90, wet_skill: 80, crash_likelihood: 0 },
        { driver_id: "B", racecraft: 72, consistency: 78, wet_skill: 60, crash_likelihood: 0 },
      ],
      careerState: {
        drivers: {
          A: { attributes: {}, status: "employed" },
          B: { attributes: {}, status: "employed" },
        },
      },
      eraSafety: {
        yellow_flags: true,
        red_flags: true,
        modern_safety_car: false,
        virtual_safety_car: false,
        source: "test-era",
      },
    },
  };
}

function weekend() {
  return {
    key: "1980:GP1",
    season: 1980,
    gpId: "GP1",
    round: 1,
    trackId: "TR1",
    grid: [
      { grid: 1, driverId: "A", teamId: "TA" },
      { grid: 2, driverId: "B", teamId: "TB" },
    ],
    classification: [
      { position: 1, driverId: "A", teamId: "TA", grid: 1, status: "FINISHED", performanceIndex: 82, reliability: 100 },
      { position: 2, driverId: "B", teamId: "TB", grid: 2, status: "FINISHED", performanceIndex: 75, reliability: 100 },
    ],
    strategies: {},
  };
}

test("1980-style policy can red flag a severe incident without inventing a modern Safety Car", () => {
  const save = baseSave("red-flag");
  const policy = resolveRaceControlPolicy(save);
  const decision = decideLiveRaceControl(save, weekend(), {
    type: "retirement",
    reason: "incident",
    lap: 6,
    driverId: "B",
    severity: 95,
  }, policy);

  assert.equal(policy.modernSafetyCar, false);
  assert.equal(policy.virtualSafetyCar, false);
  assert.equal(decision.type, "red_flag");
  assert.equal(decision.startLap, 6);
  assert.equal(decision.endLap, 6);
  assert.equal(decision.restartLap, 7);
  assert.equal(decision.overtakingAllowed, false);
});

test("modern era policy can deploy Safety Car and respects explicit duration", () => {
  const save = baseSave("modern-sc");
  save.world.eraSafety = {
    yellow_flags: true,
    red_flags: false,
    modern_safety_car: true,
    virtual_safety_car: true,
    safety_car_duration_laps: 4,
  };
  const policy = resolveRaceControlPolicy(save);
  const decision = decideLiveRaceControl(save, weekend(), {
    type: "retirement",
    reason: "incident",
    lap: 3,
    driverId: "A",
    severity: 75,
  }, policy);

  assert.equal(decision.type, "safety_car");
  assert.equal(decision.durationLaps, 4);
  assert.equal(decision.startLap, 3);
  assert.equal(decision.endLap, 6);
  assert.equal(decision.overtakingAllowed, false);
});

test("yellow-only incident creates a no-overtaking live local-yellow approximation", () => {
  const save = baseSave("yellow");
  save.world.eraSafety.red_flags = false;
  const decision = decideLiveRaceControl(save, weekend(), {
    type: "retirement",
    reason: "incident",
    lap: 2,
    driverId: "A",
    severity: 40,
  });

  assert.equal(decision.type, "local_yellow");
  assert.equal(decision.overtakingAllowed, false);
  assert.equal(decision.effectStatus, "live_global_approximation_pending_sector_model");
});

test("paused JSON round-trip race resumes to exactly the same result as uninterrupted simulation", () => {
  const fullSave = baseSave("resume-equivalence");
  const resumedSave = structuredClone(fullSave);
  const fullWeekend = weekend();
  const resumedWeekend = structuredClone(fullWeekend);

  const full = simulateTemporalRace(fullSave, fullWeekend);
  const partial = simulateTemporalRace(resumedSave, resumedWeekend, { stopAfterLap: 5 });

  assert.equal(partial.classification, null);
  assert.equal(partial.timeline.completed, false);
  assert.equal(partial.timeline.lapsSimulated, 5);
  assert.ok(partial.resumeState);

  const persisted = JSON.parse(JSON.stringify(partial.resumeState));
  const resumed = simulateTemporalRace(resumedSave, resumedWeekend, { resumeState: persisted });

  assert.equal(resumed.resumeState, null);
  assert.equal(resumed.timeline.completed, true);
  assert.equal(resumed.timeline.lapsSimulated, 12);
  assert.deepEqual(resumed.classification, full.classification);
  assert.deepEqual(resumed.timeline.events, full.timeline.events);
  assert.deepEqual(resumed.timeline.leaderByLap, full.timeline.leaderByLap);
  assert.deepEqual(resumed.timeline.snapshots, full.timeline.snapshots);
});

test("incident retirement is converted into a live era-available control period", () => {
  let found = null;
  for (let index = 0; index < 200 && !found; index += 1) {
    const save = baseSave(`incident-live-${index}`);
    save.world.eraSafety.red_flags = false;
    save.world.driverRatings[0].crash_likelihood = 100;
    save.world.driverRatings[1].crash_likelihood = 100;
    const result = simulateTemporalRace(save, weekend());
    if (result.timeline.events.some((row) => row.type === "retirement" && row.reason === "incident")) {
      found = result;
    }
  }

  assert.ok(found, "Expected at least one deterministic seed with an incident retirement.");
  assert.ok(found.timeline.controlPeriods.some((row) => row.type === "local_yellow"));
  assert.ok(found.timeline.events.some((row) => row.type === "race_control" && row.control === "local_yellow"));
  assert.equal(found.timeline.controlPeriods.some((row) => row.type === "safety_car"), false);
});

test("post-race Race Control review becomes audit-only when control was already applied live", () => {
  const save = baseSave("audit-live");
  const race = weekend();
  race.timeline = {
    raceControlLive: true,
    events: [{ type: "retirement", reason: "incident", lap: 4, driverId: "B", severity: 95 }],
  };

  const review = reviewRaceTimeline(save, race);
  assert.equal(review.status, "applied_live");
  assert.ok(review.reviews.some((row) => row.type === "red_flag_review" && row.effectStatus === "already_applied_live"));
});
