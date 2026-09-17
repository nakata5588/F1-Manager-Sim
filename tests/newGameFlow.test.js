import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNewGameCatalog,
  decadesForDatabase,
  defaultNewGameSelection,
  seasonsForDecade,
  validateNewGameSelection,
} from "../playtest/new-game-flow.js";

const legacySetup1980 = {
  season: 1980,
  databaseVersion: "v1.2.15-1980-historical-source-enrichment-candidate",
  releaseName: "1980 Historical Source Enrichment",
  teams: [
    { id: "t_0001", name: "Williams", nationality: "British" },
    { id: "t_0002", name: "Ferrari", nationality: "Italian" },
  ],
};

test("legacy single-Season setup becomes an explicit Database -> Decade -> Season catalog", () => {
  const catalog = buildNewGameCatalog(legacySetup1980);
  assert.equal(catalog.databases.length, 1);
  const database = catalog.databases[0];
  assert.equal(database.databaseVersion, legacySetup1980.databaseVersion);
  assert.deepEqual(decadesForDatabase(catalog, database.id).map((row) => row.decade), [1980]);
  assert.deepEqual(seasonsForDecade(catalog, database.id, 1980).map((row) => row.season), [1980]);
  assert.deepEqual(seasonsForDecade(catalog, database.id, 1990), []);
});

test("New Game catalog never invents unsupported seasons or decades", () => {
  const catalog = buildNewGameCatalog(legacySetup1980);
  const selection = defaultNewGameSelection(catalog);
  assert.equal(selection.decade, 1980);
  assert.equal(selection.season, 1980);
  assert.equal(catalog.databases[0].seasons.some((row) => row.season !== 1980), false);
});

test("catalog shape already supports multiple historical databases and seasons without changing the selection contract", () => {
  const catalog = buildNewGameCatalog({
    databases: [
      {
        id: "official",
        name: "Official Historical Database",
        databaseVersion: "official-v1",
        seasons: [
          { season: 1980, teams: [{ id: "williams", name: "Williams" }] },
          { season: 1981, teams: [{ id: "williams", name: "Williams" }] },
          { season: 1990, teams: [{ id: "ferrari", name: "Ferrari" }] },
        ],
      },
      {
        id: "community",
        name: "Community Database",
        databaseVersion: "community-v1",
        seasons: [{ season: 2000, teams: [{ id: "mclaren", name: "McLaren" }] }],
      },
    ],
  });

  assert.deepEqual(decadesForDatabase(catalog, "official").map((row) => row.decade), [1980, 1990]);
  assert.deepEqual(seasonsForDecade(catalog, "official", 1980).map((row) => row.season), [1980, 1981]);
  assert.deepEqual(decadesForDatabase(catalog, "community").map((row) => row.decade), [2000]);
});

test("final New Game selection validates database, decade, season, team and manager together", () => {
  const catalog = buildNewGameCatalog(legacySetup1980);
  const selection = defaultNewGameSelection(catalog);
  selection.teamId = "t_0001";
  selection.managerName = "Ricardo Nakata";

  const result = validateNewGameSelection(catalog, selection);
  assert.equal(result.season, 1980);
  assert.equal(result.teamId, "t_0001");
  assert.equal(result.teamName, "Williams");
  assert.equal(result.managerName, "Ricardo Nakata");

  assert.throws(() => validateNewGameSelection(catalog, { ...selection, season: 1990 }), /valid season/i);
  assert.throws(() => validateNewGameSelection(catalog, { ...selection, teamId: "future_team" }), /valid team/i);
  assert.throws(() => validateNewGameSelection(catalog, { ...selection, managerName: "" }), /manager name/i);
});
