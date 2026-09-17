import test from "node:test";
import assert from "node:assert/strict";
import { developerChampionship } from "../src/app/championshipPlaytest.js";

function saveWorld() {
  return {
    clock: { season: 1980, date: "1980-03-01" },
    player: { controlledTeamIds: ["T1"] },
    world: {
      drivers: [
        { driver_id: "D1", display_name: "Alice Fast" },
        { driver_id: "D2", display_name: "Bruno Quick" },
      ],
      teams: [
        { team_id: "T1", team_name: "Alpha Racing" },
        { team_id: "T2", team_name: "Beta GP" },
      ],
      tracks: [
        { track_id: "TR1", track_name: "Opening Park", country: "Argentina" },
        { track_id: "TR2", track_name: "Coastal Circuit", country: "Brazil" },
        { track_id: "TR3", track_name: "Mountain Ring", country: "South Africa" },
      ],
      calendar: [
        { year: 1980, round: 1, gp_id: "GP1", gp_name: "Opening Grand Prix", track_id: "TR1", race_date: "1980-01-13", laps: 53 },
        { year: 1980, round: 2, gp_id: "GP2", gp_name: "Coastal Grand Prix", track_id: "TR2", race_date: "1980-03-01", laps: 40 },
        { year: 1980, round: 3, gp_id: "GP3", gp_name: "Mountain Grand Prix", track_id: "TR3", race_date: "1980-03-29", laps: 78 },
      ],
      championship: {
        drivers: {
          D1: { points: 9, countedPoints: 9, wins: 1 },
          D2: { points: 6, countedPoints: 6, wins: 0 },
        },
        constructors: {
          T1: { points: 9, countedPoints: 9, wins: 1 },
          T2: { points: 6, countedPoints: 6, wins: 0 },
        },
      },
      raceWeekendState: {
        active: {
          "1980:2:GP2": { key: "1980:2:GP2", gpId: "GP2", phase: "practice_completed" },
        },
      },
    },
    history: {
      races: [
        {
          key: "1980:1:GP1",
          gpId: "GP1",
          gpName: "Opening Grand Prix",
          season: 1980,
          round: 1,
          date: "1980-01-13",
          classification: [
            { position: 1, driverId: "D1", teamId: "T1" },
            { position: 2, driverId: "D2", teamId: "T2" },
          ],
        },
      ],
      championships: [
        { season: 1979, driverChampionId: "D2", constructorChampionId: "T2", racesCompleted: 15 },
      ],
    },
  };
}

function session(world) {
  return {
    controlledTeamId: "T1",
    requireCareer() { return world; },
  };
}

test("Championship Hub projects the complete current Save World calendar without scripting results", () => {
  const world = saveWorld();
  const before = structuredClone(world);
  const projection = developerChampionship(session(world));

  assert.equal(projection.calendar.length, 3);
  assert.deepEqual(projection.calendar.map((row) => row.status), ["completed", "current", "upcoming"]);
  assert.equal(projection.calendar[0].winner.driverName, "Alice Fast");
  assert.equal(projection.calendar[0].winner.teamName, "Alpha Racing");
  assert.equal(projection.calendar[1].winner, null);
  assert.equal(projection.calendar[2].winner, null);
  assert.deepEqual(world, before);
});

test("Championship Hub standings come from current championship state and identify controlled team", () => {
  const projection = developerChampionship(session(saveWorld()));
  assert.equal(projection.controlledTeamId, "T1");
  assert.deepEqual(projection.standings.drivers.map((row) => [row.position, row.id, row.points]), [
    [1, "D1", 9],
    [2, "D2", 6],
  ]);
  assert.deepEqual(projection.standings.constructors.map((row) => [row.position, row.id, row.points]), [
    [1, "T1", 9],
    [2, "T2", 6],
  ]);
});

test("Championship Hub preserves dynamic championship archive and excludes hidden future pools", () => {
  const world = saveWorld();
  world.reference = {
    futureStructure: {
      teams: [{ team_id: "T9", team_name: "Hidden Future Team" }],
      drivers: [{ driver_id: "D9", display_name: "Hidden Future Driver" }],
      results: [{ season: 1985, winner: "D9" }],
    },
  };
  const projection = developerChampionship(session(world));
  assert.equal(projection.archive[0].season, 1979);
  assert.equal(projection.archive[0].driverChampionName, "Bruno Quick");
  assert.equal(projection.archive[0].constructorChampionName, "Beta GP");
  assert.doesNotMatch(JSON.stringify(projection), /Hidden Future/);
});
