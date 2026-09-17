import test from "node:test";
import assert from "node:assert/strict";
import {
  historicalDatabasePresentation,
  publicSeasonName,
  publicVersionLabel,
} from "../src/presentation/historicalDisplayMetadata.js";

test("historical display metadata hides candidate suffixes while preserving a concise public version", () => {
  const presentation = historicalDatabasePresentation({
    season: 1980,
    databaseVersion: "v1.2.16-1980-canonical-closure-audit-consistency-candidate",
  });

  assert.deepEqual(presentation, {
    databaseName: "Official Historical Database",
    databaseDescription: "Authentic historical Formula One starting conditions with a dynamic alternative future.",
    seasonName: "1980 Formula One World Championship",
    versionLabel: "v1.2.16",
  });
});

test("public version extraction never falls back to exposing an arbitrary technical identifier", () => {
  assert.equal(publicVersionLabel("v1.2.16-1980-candidate"), "v1.2.16");
  assert.equal(publicVersionLabel("internal-build-canonical-candidate"), "Current");
  assert.equal(publicVersionLabel(null), "Current");
});

test("public season names are stable presentation labels rather than source filenames", () => {
  assert.equal(publicSeasonName(1980), "1980 Formula One World Championship");
  assert.equal(publicSeasonName("1981"), "1981 Formula One World Championship");
  assert.equal(publicSeasonName("not-a-season"), "Formula One World Championship");
});

test("explicit presentation overrides remain presentation-only", () => {
  const presentation = historicalDatabasePresentation({
    season: 1980,
    databaseVersion: "private-source-id",
    presentation: {
      databaseName: "Curated Historical Database",
      databaseDescription: "Player-facing copy.",
      seasonName: "1980 Championship",
      versionLabel: "Release 1",
    },
  });
  assert.equal(presentation.databaseName, "Curated Historical Database");
  assert.equal(presentation.databaseDescription, "Player-facing copy.");
  assert.equal(presentation.seasonName, "1980 Championship");
  assert.equal(presentation.versionLabel, "Release 1");
});
