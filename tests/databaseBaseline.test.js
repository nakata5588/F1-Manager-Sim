import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createSeasonRolloverSystem } from "../src/index.js";

const BASELINE_URL = new URL("../data/database-baselines/v1.0-candidate/baseline.json", import.meta.url);

async function loadBaseline() {
  return JSON.parse(await readFile(BASELINE_URL, "utf8"));
}

function calendarRows(season, count) {
  return Array.from({ length: count }, (_, index) => ({
    year: season,
    round: index + 1,
    gp_id: `GP${season}_${index + 1}`,
    track_id: `TR${index + 1}`,
    race_date: `${season}-${String(Math.min(12, index + 1)).padStart(2, "0")}-01`,
  }));
}

test("database v1.0 candidate baseline pins the accepted 1980 materialization", async () => {
  const baseline = await loadBaseline();
  const season = baseline.seasonDatabases["1980"];

  assert.equal(baseline.format, "f1-manager-sim-database-baseline");
  assert.equal(baseline.globalDatabase.databaseVersion, "f1db-9d29b8d004db");
  assert.equal(baseline.globalDatabase.readiness["1980"], "READY");
  assert.deepEqual(baseline.globalDatabase.supportedSeasons, [1980]);
  assert.equal(season.readiness, "READY");
  assert.equal(season.activeTeams, 15);
  assert.equal(season.activeDrivers, 50);
  assert.equal(season.activeStaff, 55);
  assert.equal(season.calendarRaces, 14);
  assert.equal(season.futureDriversHidden, 237);
  assert.equal(season.preCareerRaceResults, 7927);
});

test("accepted baseline calendar reference is variable rather than a repeated 14-race template", async () => {
  const baseline = await loadBaseline();
  const counts = baseline.referenceCalendarRaceCounts;

  assert.deepEqual(
    [1980, 1981, 1982, 1983, 1984].map((year) => counts[String(year)]),
    [14, 15, 16, 15, 16],
  );
  assert.equal(counts["1995"], 17);
  assert.equal(counts["2004"], 18);
  assert.equal(counts["2024"], 24);
  assert.ok(new Set(Object.values(counts)).size > 1);
});

test("season rollover uses baseline future calendars as structural signals without replaying their exact race counts", async () => {
  const baseline = await loadBaseline();
  const counts = baseline.referenceCalendarRaceCounts;
  const calendars = Object.fromEntries(
    Object.entries(counts)
      .filter(([year]) => Number(year) > 1980)
      .map(([year, count]) => [year, calendarRows(Number(year), count)]),
  );
  const save = {
    meta: { seed: "database-baseline-calendar" },
    clock: { season: 1980, date: "1980-12-31" },
    world: {
      season: 1980,
      calendar: calendarRows(1980, counts["1980"]),
      tracks: [],
    },
    reference: { futureStructure: { calendars, tracks: [] } },
    history: { seasons: [] },
  };
  const system = createSeasonRolloverSystem();

  for (let season = 1981; season <= 1990; season += 1) {
    save.clock = { season, date: `${season}-01-01` };
    const output = system.handle({
      saveWorld: save,
      event: {
        date: `${season}-01-01`,
        payload: { season, previousSeason: season - 1 },
      },
    });
    assert.ok(save.world.calendar.length > 0, `calendar disappeared in ${season}`);
    assert.equal(output.payload.calendar_source, "dynamic_calendar_promoter_system");
    assert.equal(output.payload.calendar_reference_races, counts[String(season)]);
    assert.ok(save.world.calendar.every((row) => row.generation_source === "dynamic_calendar_promoter_system"));
    assert.equal(save.world.calendarEvolution.seasons[String(season)].raceCount, save.world.calendar.length);
  }

  assert.equal(save.world.calendarEvolution.plans["1981"].referencePolicy, "historical_future_calendar_is_candidate_not_script");
});
