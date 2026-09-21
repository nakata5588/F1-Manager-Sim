import assert from "node:assert/strict";
import test from "node:test";

import {
  calendarPromoterProjection,
  createCalendarPromoterSystem,
  createSeasonRolloverSystem,
  initializeCalendarPromoters,
  planDynamicCalendar,
  SIM_EVENT,
} from "../src/index.js";

function calendarRows(season) {
  return ["Alpha", "Bravo", "Charlie", "Delta"].map((name, index) => ({
    year: season,
    round: index + 1,
    gp_id: `${season}-${name}`,
    gp_name: `${name} Grand Prix`,
    track_id: `T${index + 1}`,
    race_date: `${season}-${String(index + 3).padStart(2, "0")}-01`,
  }));
}

function futureRows() {
  return ["Alpha", "Bravo", "Charlie", "Echo", "Foxtrot"].map((name, index) => ({
    year: 1981,
    round: index + 1,
    gp_id: `1981-${name}`,
    gp_name: `${name} Grand Prix`,
    track_id: index < 3 ? `T${index + 1}` : `T${index + 2}`,
    race_date: `1981-${String(index + 3).padStart(2, "0")}-08`,
    winner_driver_id: "SCRIPTED_WINNER_MUST_NOT_SURVIVE",
  }));
}

function saveWorld(seed = "calendar-test") {
  return {
    meta: { seed, sourceSeason: 1980 },
    clock: { season: 1980, date: "1980-01-01", day: 1 },
    world: {
      season: 1980,
      calendar: calendarRows(1980),
      tracks: [
        { track_id: "T1", track_name: "Alpha Circuit", incident_risk: 0.2 },
        { track_id: "T2", track_name: "Bravo Circuit", incident_risk: 0.3 },
        { track_id: "T3", track_name: "Charlie Circuit", incident_risk: 0.25 },
        { track_id: "T4", track_name: "Delta Circuit", incident_risk: 0.45 },
      ],
    },
    reference: {
      futureStructure: {
        calendars: { "1981": futureRows() },
        tracks: [
          { track_id: "T5", track_name: "Echo Circuit", incident_risk: 0.18 },
          { track_id: "T6", track_name: "Foxtrot Circuit", incident_risk: 0.22 },
        ],
      },
    },
    history: { seasons: [] },
    simulation: { nextEventSequence: 0, systemState: {} },
  };
}

function expireAndWeakenContracts(save) {
  initializeCalendarPromoters(save, "1980-01-01");
  for (const contract of Object.values(save.world.calendarEvolution.contracts)) {
    contract.endSeason = 1980;
    contract.commercialHealth = 30;
    contract.promoterStability = 30;
    contract.safetyConfidence = 45;
  }
}

test("career start materializes promoter contracts without changing the historical opening calendar", () => {
  const save = saveWorld();
  const before = structuredClone(save.world.calendar);
  initializeCalendarPromoters(save, "1980-01-01");

  const projection = calendarPromoterProjection(save);
  assert.equal(projection.activeContracts.length, 4);
  assert.deepEqual(save.world.calendar, before);
  assert.equal(save.world.calendarEvolution.seasons["1980"].source, "historical_starting_calendar");
  assert.ok(projection.activeContracts.every((row) => row.provenance === "career_start_calendar_promoter_baseline"));
});

test("dynamic calendar planning can drop weak promoters and award future reference venues without replaying outcomes", () => {
  const save = saveWorld("calendar-change");
  expireAndWeakenContracts(save);

  const plan = planDynamicCalendar(save, 1981, {
    date: "1980-11-01",
    targetRaceCount: 4,
    renewalThreshold: 100,
  });

  assert.equal(plan.source, "dynamic_calendar_promoter_system");
  assert.equal(plan.referencePolicy, "historical_future_calendar_is_candidate_not_script");
  assert.equal(plan.referenceRaceCount, 5);
  assert.equal(plan.raceCount, 4);
  assert.ok(plan.dropped.length > 0);
  assert.ok(plan.added.length > 0);
  assert.ok(plan.calendar.every((row) => row.generation_source === "dynamic_calendar_promoter_system"));
  assert.ok(plan.calendar.every((row) => row.winner_driver_id === undefined));
  assert.ok(plan.calendar.every((row) => row.promoter_id && row.promoter_contract_id));
});

test("calendar planning is deterministic for the same Save World seed and state", () => {
  const first = saveWorld("same-seed");
  const second = saveWorld("same-seed");
  expireAndWeakenContracts(first);
  expireAndWeakenContracts(second);

  const firstPlan = planDynamicCalendar(first, 1981, { date: "1980-11-01", targetRaceCount: 4, renewalThreshold: 70 });
  const secondPlan = planDynamicCalendar(second, 1981, { date: "1980-11-01", targetRaceCount: 4, renewalThreshold: 70 });

  assert.deepEqual(firstPlan, secondPlan);
});

test("November promoter review finalizes next season before rollover applies it", () => {
  const save = saveWorld("annual-system");
  const promoterSystem = createCalendarPromoterSystem();
  const rollover = createSeasonRolloverSystem();

  promoterSystem.handle({
    saveWorld: save,
    event: { type: SIM_EVENT.CAREER_STARTED, date: "1980-01-01", payload: { season: 1980 } },
  });
  const finalized = promoterSystem.handle({
    saveWorld: save,
    event: { type: SIM_EVENT.MONTH_STARTED, date: "1980-11-01", payload: { year: 1980, month: 11 } },
  });

  assert.equal(finalized.type, "calendar_promoters.schedule_finalized");
  assert.ok(save.world.calendarEvolution.plans["1981"]);
  assert.ok(save.world.calendar.every((row) => row.year === 1980));

  save.clock = { season: 1981, date: "1981-01-01", day: 1 };
  const rolled = rollover.handle({
    saveWorld: save,
    event: { type: SIM_EVENT.SEASON_STARTED, date: "1981-01-01", payload: { previousSeason: 1980, season: 1981 } },
  });

  assert.equal(rolled.payload.calendar_source, "dynamic_calendar_promoter_system");
  assert.ok(save.world.calendar.every((row) => row.year === 1981));
  assert.equal(save.world.calendarEvolution.seasons["1981"].status, "active");
  assert.equal(save.world.calendarEvolution.plans["1981"].appliedAt, "1981-01-01");
});


test("duplicate event keys are normalized and dense modern calendars stay inside the target year", () => {
  const season = 2020;
  const rows = Array.from({ length: 26 }, (_, index) => ({
    year: season,
    round: index + 1,
    gp_id: `GP-${index + 1}`,
    gp_name: `Grand Prix ${index + 1}`,
    calendar_event_key: index < 2 ? "duplicate-key" : `event-${index + 1}`,
    track_id: `MODERN-${index + 1}`,
  }));
  const save = {
    meta: { seed: "dense-modern-calendar", sourceSeason: season },
    clock: { season, date: `${season}-01-01`, day: 1 },
    world: { season, calendar: rows, tracks: rows.map((row) => ({ track_id: row.track_id })) },
    reference: { futureStructure: { calendars: {}, tracks: [] } },
    history: { seasons: [] },
    simulation: { nextEventSequence: 0, systemState: {} },
  };

  initializeCalendarPromoters(save, `${season}-01-01`);
  const plan = planDynamicCalendar(save, season + 1, {
    date: `${season}-11-01`,
    targetRaceCount: 26,
  });

  const keys = plan.calendar.map((row) => row.calendar_event_key);
  const dates = plan.calendar.map((row) => row.race_date);
  assert.equal(new Set(keys).size, plan.calendar.length);
  assert.equal(new Set(dates).size, plan.calendar.length);
  assert.ok(dates.every((date) => date.startsWith(`${season + 1}-`)));
});
