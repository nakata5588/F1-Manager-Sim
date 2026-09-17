import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("New Game player-facing UI uses presentation metadata instead of raw source identifiers", () => {
  const wizard = readFileSync("playtest/new-game.js", "utf8");
  assert.doesNotMatch(wizard, /database\.databaseVersion/);
  assert.doesNotMatch(wizard, /row\.releaseName/);
  assert.match(wizard, /database\.versionLabel/);
  assert.match(wizard, /row\.name/);
  assert.match(wizard, /Formula One World Championship/);
});

test("pre-wizard fallback does not flash releaseName or full databaseVersion", () => {
  const app = readFileSync("playtest/app.js", "utf8");
  const start = app.indexOf("function renderSetup()");
  const end = app.indexOf("function renderHome()", start);
  assert.ok(start >= 0 && end > start);
  const renderSetup = app.slice(start, end);

  assert.doesNotMatch(renderSetup, /setup\.releaseName/);
  assert.doesNotMatch(renderSetup, /setup\.databaseVersion/);
  assert.match(renderSetup, /setup\.presentation\?\.databaseName/);
  assert.match(renderSetup, /setup\.presentation\?\.versionLabel/);
});

test("New Game card CSS prevents long public labels from escaping cards", () => {
  const css = readFileSync("playtest/new-game.css", "utf8");
  assert.match(css, /\.ng-choice\{[^}]*min-width:0[^}]*overflow:hidden/);
  assert.match(css, /\.ng-choice strong\{[^}]*overflow-wrap:anywhere/);
  assert.match(css, /\.ng-choice small\{[^}]*overflow-wrap:anywhere/);
});
