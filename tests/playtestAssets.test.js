import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

for (const path of [
  "scripts/playtest-server.js",
  "playtest/app.js",
  "playtest/live-race-map.js",
  "playtest/persistence.js",
  "playtest/new-game-flow.js",
  "playtest/new-game.js",
  "playtest/new-game.css",
  "playtest/main-menu-model.js",
  "playtest/presentation-labels.js",
  "playtest/main-menu.css",
  "playtest/career-shell-model.js",
  "playtest/career-shell.js",
  "playtest/career-shell.css",
  "playtest/career-home-model.js",
  "playtest/career-home.js",
  "playtest/career-home.css",
  "playtest/championship.html",
  "playtest/championship.js",
  "playtest/championship.css",
  "playtest/index.html",
  "playtest/styles.css",
  "playtest/management.html",
  "playtest/management-workspace-model.js",
  "playtest/management.js",
  "playtest/management.css",
  "playtest/technical.html",
  "playtest/technical.js",
  "playtest/technical.css",
  "playtest/governance.html",
  "playtest/governance.js",
  "playtest/governance.css",
  "playtest/offseason.html",
  "playtest/offseason.js",
  "playtest/offseason.css",
  "playtest/world.html",
  "playtest/world-workspace-model.js",
  "playtest/world.js",
  "playtest/world.css",
  "playtest/profile.html",
  "playtest/profile.js",
  "playtest/profile.css",
  "playtest/entity-links.js",
]) {
  test(`developer playtest asset exists: ${path}`, () => {
    assert.equal(existsSync(path), true);
  });
}

for (const path of [
  "scripts/playtest-server.js",
  "src/app/developerPersistence.js",
  "src/app/technicalPlaytest.js",
  "src/app/governancePlaytest.js",
  "src/app/offseasonPlaytest.js",
  "src/app/worldPlaytest.js",
  "src/app/championshipPlaytest.js",
  "src/app/entityProfilePlaytest.js",
  "src/media/mediaPack.js",
  "src/presentation/teamVisualIdentity.js",
  "src/presentation/historicalDisplayMetadata.js",
  "src/presentation/teamSelectionPresentation.js",
  "src/presentation/racePositionProjection.js",
  "src/sim/circuitGeometry.js",
  "src/game/management/managerProfile.js",
  "src/save/slotStore.js",
  "playtest/app.js",
  "playtest/live-race-map.js",
  "playtest/persistence.js",
  "playtest/new-game-flow.js",
  "playtest/new-game.js",
  "playtest/main-menu-model.js",
  "playtest/presentation-labels.js",
  "playtest/career-shell-model.js",
  "playtest/career-shell.js",
  "playtest/career-home-model.js",
  "playtest/career-home.js",
  "playtest/championship.js",
  "playtest/management-workspace-model.js",
  "playtest/management.js",
  "playtest/technical.js",
  "playtest/governance.js",
  "playtest/offseason.js",
  "playtest/world-workspace-model.js",
  "playtest/world.js",
  "playtest/profile.js",
  "playtest/entity-links.js",
]) {
  test(`developer playtest JavaScript parses: ${path}`, () => {
    const result = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
}
