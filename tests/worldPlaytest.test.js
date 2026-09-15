import test from "node:test";
import assert from "node:assert/strict";
import { createSaveWorld } from "../src/save/createSaveWorld.js";
import {
  appendWorldHistoryEvent,
  appendWorldRecord,
  publishWorldStory,
} from "../src/game/worldNarrative.js";
import { developerWorld } from "../src/app/worldPlaytest.js";

function save() {
  const saveWorld = createSaveWorld({
    season: 1980,
    teams: [
      { team_id: "T1", team_name: "Aurora Racing" },
      { team_id: "T2", team_name: "Northstar GP" },
    ],
    drivers: [
      { driver_id: "D1", display_name: "Alex Mercer" },
      { driver_id: "D2", display_name: "Bruno Vale" },
    ],
    futureDrivers: [
      { driver_id: "D9", display_name: "Hidden Future Star", world_visible_from: 1990, talent_visible_from: 1991, f1_eligible_from: 1992 },
    ],
    futureTeams: [
      { team_id: "T9", team_name: "Hidden Future Team", world_visible_from: 1990, f1_eligible_from: 1991 },
    ],
    contracts: [],
    staffContracts: [],
    calendar: [],
    rules: {},
    qualifyingRules: {},
  }, { seed: "world-playtest", startDate: "1980-01-01" });

  saveWorld.history.races.push({
    key: "1980:1:GP1",
    season: 1980,
    round: 1,
    classification: [
      { position: 1, status: "FINISHED", driverId: "D1", teamId: "T1" },
      { position: 2, status: "FINISHED", driverId: "D2", teamId: "T2" },
    ],
  });
  saveWorld.history.championships.push({
    season: 1979,
    driverChampionId: "D2",
    constructorChampionId: "T2",
    standingsStatus: "official_final",
  });
  publishWorldStory(saveWorld, {
    date: "1980-01-13",
    sourceEventId: "evt:race:1",
    sourceEventType: "race.completed",
    storyKey: "race:1980:1",
    category: "race",
    importance: "high",
    headline: "Alex Mercer wins the season opener",
    summary: "Aurora Racing starts the alternative season with victory.",
    entities: [{ type: "driver", id: "D1", name: "Alex Mercer" }],
  });
  appendWorldHistoryEvent(saveWorld, {
    date: "1980-01-13",
    sourceEventId: "evt:race:1",
    sourceEventType: "race.completed",
    storyKey: "race:1980:1",
    type: "race_result",
    category: "race",
    importance: "high",
    title: "Alex Mercer wins the season opener",
    summary: "Aurora Racing starts the alternative season with victory.",
    entities: [{ type: "driver", id: "D1", name: "Alex Mercer" }],
  });
  appendWorldRecord(saveWorld, {
    recordKey: "driver:D1:first_win",
    date: "1980-01-13",
    season: 1980,
    recordType: "first_race_win",
    entityType: "driver",
    entityId: "D1",
    value: 1,
    title: "Alex Mercer records a first Formula One win",
  });
  return saveWorld;
}

function sessionFrom(saveWorld) {
  return {
    requireCareer() {
      return saveWorld;
    },
  };
}

test("F1 World projection exposes only the active world and never leaks hidden future identities", () => {
  const projection = developerWorld(sessionFrom(save()));
  assert.deepEqual(projection.activeDrivers.map((row) => row.driverId), ["D1", "D2"]);
  assert.deepEqual(projection.activeTeams.map((row) => row.teamId), ["T1", "T2"]);
  assert.doesNotMatch(JSON.stringify(projection), /Hidden Future Star/);
  assert.doesNotMatch(JSON.stringify(projection), /Hidden Future Team/);
});

test("F1 World records are derived from authoritative Save World race/championship history", () => {
  const projection = developerWorld(sessionFrom(save()));
  const driver = projection.records.drivers.find((row) => row.id === "D1");
  const team = projection.records.teams.find((row) => row.id === "T1");
  assert.equal(driver.starts, 1);
  assert.equal(driver.wins, 1);
  assert.equal(driver.podiums, 1);
  assert.equal(team.starts, 1);
  assert.equal(team.wins, 1);
  assert.equal(projection.records.championships[0].season, 1979);
  assert.equal(projection.records.championships[0].driverChampionName, "Bruno Vale");
  assert.equal(projection.records.championships[0].constructorChampionName, "Northstar GP");
});

test("F1 World returns read-only news/history projections and summary counts", () => {
  const saveWorld = save();
  const projection = developerWorld(sessionFrom(saveWorld));
  assert.equal(projection.news.length, 1);
  assert.equal(projection.history.length, 1);
  assert.equal(projection.records.milestones.length, 1);
  assert.deepEqual(projection.summary, {
    newsStories: 1,
    historyEvents: 1,
    milestones: 1,
    racesArchived: 1,
    championshipsArchived: 1,
    activeDrivers: 2,
    activeTeams: 2,
  });

  projection.news[0].headline = "Mutated browser projection";
  projection.records.drivers[0].wins = 999;
  assert.equal(saveWorld.world.media.news.stories[0].headline, "Alex Mercer wins the season opener");
  assert.notEqual(developerWorld(sessionFrom(saveWorld)).records.drivers[0].wins, 999);
});

test("F1 World filters the narrative layer without changing underlying Save World history", () => {
  const saveWorld = save();
  publishWorldStory(saveWorld, {
    date: "1980-02-01",
    sourceEventId: "evt:team:1",
    sourceEventType: "team.rebrand",
    storyKey: "team:rebrand:1",
    category: "teams",
    importance: "major",
    headline: "Aurora Racing updates its identity",
    summary: "Stable team identity is preserved.",
  });
  appendWorldHistoryEvent(saveWorld, {
    date: "1980-02-01",
    sourceEventId: "evt:team:1",
    sourceEventType: "team.rebrand",
    storyKey: "team:rebrand:1",
    type: "team_rebranded",
    category: "teams",
    importance: "major",
    title: "Aurora Racing updates its identity",
    summary: "Stable team identity is preserved.",
  });

  const projection = developerWorld(sessionFrom(saveWorld), { category: "teams", minImportance: "high" });
  assert.equal(projection.news.length, 1);
  assert.equal(projection.history.length, 1);
  assert.equal(saveWorld.world.media.news.stories.length, 2);
  assert.equal(saveWorld.history.events.length, 2);
});
