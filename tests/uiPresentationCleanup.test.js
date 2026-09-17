import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PLAYER_UI_FILES = [
  "playtest/app.js",
  "playtest/career-shell.js",
  "playtest/career-home.js",
  "playtest/championship.js",
  "playtest/management.js",
  "playtest/technical.js",
  "playtest/governance.js",
  "playtest/offseason.js",
  "playtest/world.js",
  "playtest/profile.js",
];

test("normal player UI contains no phase badges or developer-playtest branding", () => {
  for (const path of PLAYER_UI_FILES) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /Developer Playtest|Developer Playable Validation/i, path);
    assert.doesNotMatch(source, /\bPhase\s+\d+\b/i, path);
  }
});

test("normal player UI does not explain itself using internal Save World authority terminology", () => {
  for (const path of PLAYER_UI_FILES) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /Save World|simulation authority/i, path);
  }
});

test("profile UI hides stable internal ids from normal profile headings", () => {
  const source = readFileSync("playtest/profile.js", "utf8");
  assert.doesNotMatch(source, /profile\.id/);
  assert.match(source, /publicLabel\(profile\.type/);
});

test("driver and staff roles are rendered through presentation labels", () => {
  const home = readFileSync("playtest/career-home.js", "utf8");
  const app = readFileSync("playtest/app.js", "utf8");
  const management = readFileSync("playtest/management.js", "utf8");

  assert.match(home, /publicLabel\(driver\.role/);
  assert.match(app, /publicLabel\(driver\.role/);
  assert.match(management, /publicLabel\(row\.role/);
  assert.match(management, /enumSelect\("offer-role"/);
  assert.match(management, /enumSelect\("staff-offer-role"/);
});

test("Career Shell resolves known public labels for dynamically inserted page content", () => {
  const shell = readFileSync("playtest/career-shell.js", "utf8");
  assert.match(shell, /resolvePublicLabelsInText/);
  assert.doesNotMatch(shell, /Persistent Career Shell|PHASE 47/i);
});
