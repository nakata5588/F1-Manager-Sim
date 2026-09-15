import test from "node:test";
import assert from "node:assert/strict";
import { createSaveWorld } from "../src/save/createSaveWorld.js";
import { deserializeSaveWorld, serializeSaveWorld } from "../src/save/serialization.js";
import {
  appendWorldHistoryEvent,
  listWorldHistory,
  listWorldNews,
  publishWorldStory,
  worldRecordsSummary,
} from "../src/game/worldNarrative.js";
import { MANAGER_EVENT } from "../src/game/management/managerCareer.js";
import { REGULATION_EVENT } from "../src/game/management/regulations.js";
import { TEAM_EVOLUTION_EVENT } from "../src/game/management/teamEvolution.js";
import { dispatchSimulationEvents, initializeSimulation, SIM_EVENT } from "../src/sim/timeEngine.js";
import { CAREER_EVENT } from "../src/sim/systems/careerLifecycle.js";
import { CHAMPIONSHIP_EVENT } from "../src/sim/systems/championship.js";
import { EMPLOYMENT_EVENT } from "../src/sim/systems/employmentMarket.js";
import { RACE_EVENT } from "../src/sim/systems/raceWeekend.js";
import { createCoreWorldSystems } from "../src/sim/systems/coreWorldSystems.js";
import { createWorldNarrativeSystem } from "../src/sim/systems/worldNarrative.js";

function world() {
  return createSaveWorld({
    season: 1980,
    teams: [
      { team_id: "T1", team_name: "Aurora Racing" },
      { team_id: "T2", team_name: "Northstar GP" },
    ],
    futureTeams: [
      { team_id: "T3", team_name: "Future Motorsport", world_visible_from: 1985, f1_eligible_from: 1985 },
    ],
    drivers: [
      { driver_id: "D1", display_name: "Alex Mercer", birth_date: "1950-01-01" },
      { driver_id: "D2", display_name: "Bruno Vale", birth_date: "1951-01-01" },
      { driver_id: "D3", display_name: "Carlos Reed", birth_date: "1952-01-01" },
    ],
    futureDrivers: [
      { driver_id: "D9", display_name: "Hidden Future Star", world_visible_from: 1990, talent_visible_from: 1990, f1_eligible_from: 1992 },
    ],
    staff: [
      { staff_id: "S1", display_name: "Eleanor Hart" },
    ],
    contracts: [],
    staffContracts: [],
    calendar: [],
    rules: {},
    qualifyingRules: {},
  }, { seed: "world-narrative", startDate: "1980-01-01" });
}

function racePayload() {
  return {
    key: "1980:1:GP1",
    season: 1980,
    round: 1,
    gpId: "GP1",
    gpName: "Argentine Grand Prix",
    classification: [
      { position: 1, status: "FINISHED", driverId: "D1", teamId: "T1" },
      { position: 2, status: "FINISHED", driverId: "D2", teamId: "T2" },
      { position: 3, status: "FINISHED", driverId: "D3", teamId: "T1" },
    ],
  };
}

test("career initialization creates one simulation-owned world story and history event without emitting a second simulation event", () => {
  const saveWorld = world();
  const result = initializeSimulation(saveWorld, [createWorldNarrativeSystem()]);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].type, SIM_EVENT.CAREER_STARTED);
  assert.equal(listWorldNews(saveWorld).length, 1);
  assert.equal(listWorldHistory(saveWorld).length, 1);
  assert.equal(listWorldNews(saveWorld)[0].provenance, "simulation_event_projection");
  assert.equal(listWorldHistory(saveWorld)[0].provenance, "simulation_event_history");
});

test("race completion creates news, durable history and a first-win record without changing the race outcome", () => {
  const saveWorld = world();
  const system = createWorldNarrativeSystem();
  const race = racePayload();
  saveWorld.history.races.push(structuredClone(race));

  const result = dispatchSimulationEvents(saveWorld, [{ type: RACE_EVENT.COMPLETED, date: "1980-01-13", payload: race }], [system]);
  assert.equal(result.length, 1, "narrative projection must not emit another simulation event");
  const story = listWorldNews(saveWorld)[0];
  assert.match(story.headline, /Alex Mercer wins Argentine Grand Prix/);
  assert.match(story.summary, /Aurora Racing/);
  assert.equal(listWorldHistory(saveWorld, { type: "race_result" }).length, 1);
  assert.equal(saveWorld.history.records.length, 1);
  assert.equal(saveWorld.history.records[0].recordType, "first_race_win");
  assert.equal(saveWorld.history.records[0].entityId, "D1");
  assert.deepEqual(race.classification.map((row) => row.driverId), ["D1", "D2", "D3"]);
});

test("future contract announcement and activation become separate stories while an immediate signing is not duplicated", () => {
  const saveWorld = world();
  const system = createWorldNarrativeSystem();

  dispatchSimulationEvents(saveWorld, [{
    type: EMPLOYMENT_EVENT.CONTRACT_SIGNED,
    date: "1980-07-01",
    payload: { worker_type: "driver", worker_id: "D2", team_id: "T1", role: "main_driver", contract_start: 1981, contract_until: 1982 },
  }], [system]);
  assert.equal(listWorldNews(saveWorld).length, 0, "future contract source event waits for the canonical future-signing event");

  dispatchSimulationEvents(saveWorld, [{
    type: EMPLOYMENT_EVENT.FUTURE_CONTRACT_SIGNED,
    date: "1980-07-01",
    payload: { worker_type: "driver", worker_id: "D2", team_id: "T1", role: "main_driver", contract_start: 1981, contract_until: 1982 },
  }], [system]);
  dispatchSimulationEvents(saveWorld, [{
    type: EMPLOYMENT_EVENT.FUTURE_CONTRACT_ACTIVATED,
    date: "1981-01-01",
    payload: { worker_type: "driver", worker_id: "D2", team_id: "T1", role: "main_driver", contract_start: 1981, contract_until: 1982 },
  }], [system]);

  const stories = listWorldNews(saveWorld);
  assert.equal(stories.length, 2);
  assert.ok(stories.some((row) => row.headline === "Bruno Vale agrees future move to Aurora Racing"));
  assert.ok(stories.some((row) => row.headline === "Bruno Vale joins Aurora Racing"));
});

test("championship archive produces title stories and records only when the authoritative championship event resolves champions", () => {
  const saveWorld = world();
  const system = createWorldNarrativeSystem();
  saveWorld.history.championships.push({
    season: 1980,
    driverChampionId: "D1",
    constructorChampionId: "T1",
    standingsStatus: "official_final",
  });

  dispatchSimulationEvents(saveWorld, [{
    type: CHAMPIONSHIP_EVENT.ARCHIVED,
    date: "1981-01-01",
    payload: {
      season: 1980,
      driver_champion_id: "D1",
      constructor_champion_id: "T1",
      standings_status: "official_final",
    },
  }], [system]);

  assert.match(listWorldNews(saveWorld)[0].headline, /1980 champions/);
  const summary = worldRecordsSummary(saveWorld);
  assert.equal(summary.drivers.find((row) => row.id === "D1").championships, 1);
  assert.equal(summary.teams.find((row) => row.id === "T1").championships, 1);
  assert.equal(saveWorld.history.records.filter((row) => row.recordType.includes("championship")).length, 2);
});

test("major world events share the same narrative/history boundary and do not expose hidden future identities", () => {
  const saveWorld = world();
  saveWorld.player = { manager: { name: "Riley Morgan" }, controlledTeamIds: ["T1"] };
  const system = createWorldNarrativeSystem();

  const events = [
    { type: CAREER_EVENT.RETIRED, date: "1981-01-01", payload: { worker_type: "driver", worker_id: "D3", age: 39 } },
    { type: REGULATION_EVENT.PROPOSAL_RESOLVED, date: "1981-11-01", payload: { proposal_id: "R1", target_season: 1982, accepted: true } },
    { type: TEAM_EVOLUTION_EVENT.ENTRY_ACCEPTED, date: "1981-10-01", payload: { application_id: "A1", team_id: "T3", target_season: 1982 } },
    { type: MANAGER_EVENT.DISMISSED, date: "1981-12-01", payload: { team_id: "T1" } },
  ];
  dispatchSimulationEvents(saveWorld, events, [system]);

  const headlines = listWorldNews(saveWorld).map((row) => row.headline).join(" | ");
  assert.match(headlines, /Carlos Reed retires/);
  assert.match(headlines, /Future Motorsport wins approval/);
  assert.match(headlines, /Riley Morgan dismissed/);
  assert.doesNotMatch(headlines, /Hidden Future Star/);
  assert.equal(listWorldHistory(saveWorld).length, 4);
});

test("story/history deduplication is source-event stable and narrative state survives save serialization", () => {
  const saveWorld = world();
  const input = {
    date: "1980-05-01",
    sourceEventId: "evt:1",
    sourceEventType: "test.event",
    storyKey: "test:stable",
    category: "world",
    headline: "Stable story",
    summary: "Created once.",
  };
  publishWorldStory(saveWorld, input);
  publishWorldStory(saveWorld, input);
  appendWorldHistoryEvent(saveWorld, { ...input, type: "stable_test", title: input.headline });
  appendWorldHistoryEvent(saveWorld, { ...input, type: "stable_test", title: input.headline });
  assert.equal(listWorldNews(saveWorld).length, 1);
  assert.equal(listWorldHistory(saveWorld).length, 1);

  const restored = deserializeSaveWorld(serializeSaveWorld(saveWorld, { pretty: false, savedAt: "1980-05-01T00:00:00.000Z" }));
  assert.equal(listWorldNews(restored).length, 1);
  assert.equal(listWorldHistory(restored).length, 1);
  assert.equal(listWorldNews(restored)[0].headline, "Stable story");
});

test("core world systems place the narrative observer last so it only projects already-resolved consequences", () => {
  const systems = createCoreWorldSystems();
  assert.equal(systems.at(-1)?.id, "world.narrative");
});
