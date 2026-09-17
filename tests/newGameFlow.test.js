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
  databaseVersion: "v1.2.16-1980-canonical-closure-audit-consistency-candidate",
  releaseName: "F1_Manager_Sim_SeasonDefinition_1980_v1.2.16_1980_canonical_closure_audit_consistency_candidate",
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
  assert.equal(database.name, "Official Historical Database");
  assert.equal(database.versionLabel, "v1.2.16");
  assert.equal(database.seasons[0].name, "1980 Formula One World Championship");
  assert.deepEqual(decadesForDatabase(catalog, database.id).map((row) => row.decade), [1980]);
  assert.deepEqual(seasonsForDecade(catalog, database.id, 1980).map((row) => row.season), [1980]);
  assert.deepEqual(seasonsForDecade(catalog, database.id, 1990), []);
});


test("technical database filenames and candidate labels never become public New Game labels", () => {
  const catalog = buildNewGameCatalog(legacySetup1980);
  const database = catalog.databases[0];
  const season = database.seasons[0];
  const publicText = [
    database.name,
    database.description,
    database.versionLabel,
    season.name,
    season.versionLabel,
  ].join(" ");

  assert.doesNotMatch(publicText, /SeasonDefinition|canonical|closure|audit|consistency|candidate/i);
  assert.doesNotMatch(publicText, /F1_Manager_Sim/i);
  assert.equal(database.releaseName, legacySetup1980.releaseName, "internal metadata remains available below the presentation layer");
  assert.equal(database.databaseVersion, legacySetup1980.databaseVersion, "source identity remains intact");
});

test("server-supplied presentation metadata can override public copy without changing internal identity", () => {
  const catalog = buildNewGameCatalog({
    ...legacySetup1980,
    presentation: {
      databaseName: "Official Historical Database",
      databaseDescription: "Curated historical starting conditions.",
      seasonName: "1980 Formula One World Championship",
      versionLabel: "v1.2.16",
    },
  });
  const database = catalog.databases[0];
  assert.equal(database.name, "Official Historical Database");
  assert.equal(database.description, "Curated historical starting conditions.");
  assert.equal(database.versionLabel, "v1.2.16");
  assert.equal(database.seasons[0].name, "1980 Formula One World Championship");
  assert.equal(database.databaseVersion, legacySetup1980.databaseVersion);
});

test("New Game catalog never invents unsupported seasons or decades", () => {
  const catalog = buildNewGameCatalog(legacySetup1980);
  const selection = defaultNewGameSelection(catalog);
  assert.equal(selection.decade, 1980);
  assert.equal(selection.season, 1980);
  assert.equal(catalog.databases[0].seasons.some((row) => row.season !== 1980), false);
});

test("New Game catalog preserves Team Selection v2 presentation context", () => {
  const catalog = buildNewGameCatalog({
    season: 1980,
    databaseVersion: "v1.2.16-test",
    presentation: {
      databaseName: "Official Historical Database",
      seasonName: "1980 Formula One World Championship",
      versionLabel: "v1.2.16",
    },
    teams: [{
      id: "williams",
      name: "Williams",
      nationality: "British",
      drivers: [
        { id: "jones", name: "Alan Jones", role: "round_1_starter", carNumber: 27 },
        { id: "reutemann", name: "Carlos Reutemann", role: "round_1_starter", carNumber: 28 },
      ],
      engine: { id: "dfv", name: "Ford Cosworth DFV", manufacturer: "Ford" },
      chassis: "FW07B",
      visualIdentity: {
        colours: { primary: "#112233", secondary: "#DDEEFF", tertiary: "#000000" },
        simulationAuthority: false,
      },
      resolvedMedia: {
        logo: { url: "/media/fallback/teamLogo.svg" },
      },
    }],
  });

  const team = catalog.databases[0].seasons[0].teams[0];
  assert.equal(team.name, "Williams");
  assert.deepEqual(team.drivers.map((row) => row.name), ["Alan Jones", "Carlos Reutemann"]);
  assert.equal(team.engine.name, "Ford Cosworth DFV");
  assert.equal(team.chassis, "FW07B");
  assert.equal(team.visualIdentity.simulationAuthority, false);
  assert.equal(team.resolvedMedia.logo.url, "/media/fallback/teamLogo.svg");
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
  assert.equal(result.seasonName, "1980 Formula One World Championship");
  assert.equal(result.databaseName, "Official Historical Database");
  assert.equal(result.databaseVersionLabel, "v1.2.16");
  assert.equal(result.teamId, "t_0001");
  assert.equal(result.teamName, "Williams");
  assert.equal(result.managerName, "Ricardo Nakata");

  assert.throws(() => validateNewGameSelection(catalog, { ...selection, season: 1990 }), /valid season/i);
  assert.throws(() => validateNewGameSelection(catalog, { ...selection, teamId: "future_team" }), /valid team/i);
  assert.throws(() => validateNewGameSelection(catalog, { ...selection, managerName: "" }), /manager name/i);
});
