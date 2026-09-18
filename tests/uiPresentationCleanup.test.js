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


test("Career Shell v2 renders persistent team identity, page context and central Continue", () => {
  const shell = readFileSync("playtest/career-shell.js", "utf8");
  assert.match(shell, /career-shell-team-logo/);
  assert.match(shell, /career-shell-team-copy/);
  assert.match(shell, /data-shell-page-label/);
  assert.match(shell, /career-shell-event/);
  assert.match(shell, /career-shell-manager/);
  assert.match(shell, /career-shell-date/);
  assert.match(shell, /data-shell-continue/);
  assert.match(shell, /\/api\/profile\?type=team/);
});

test("Career Shell v2 uses Save World team profile media before setup fallback media", () => {
  const shell = readFileSync("playtest/career-shell.js", "utf8");
  const profileRequest = shell.indexOf("/api/profile?type=team");
  const fallback = shell.indexOf("setup?.teams?.find");
  assert.ok(profileRequest >= 0);
  assert.ok(fallback > profileRequest);
});

test("Career Shell v2 neutralizes legacy page chrome and double offsets", () => {
  const css = readFileSync("playtest/career-shell.css", "utf8");
  assert.match(css, /body\.career-shell-active \.management-header\{display:none!important\}/);
  assert.match(css, /body\.career-shell-active \.profile-shell\{padding:28px!important/);
  assert.match(css, /body\.career-shell-active \.championship-shell\{margin:0 auto!important/);
});

test("Career Shell v2 derives its team colours from presentation identity only", () => {
  const shell = readFileSync("playtest/career-shell.js", "utf8");
  assert.match(shell, /context\.team\.colours\?\.primary/);
  assert.match(shell, /context\.team\.colours\?\.secondary/);
  assert.match(shell, /safeColour/);
  assert.doesNotMatch(shell, /carPerformance|overall|rating|strength/i);
});


test("Career Home v2 is an actionable dashboard backed by existing projections", () => {
  const source = readFileSync("playtest/career-home.js", "utf8");
  assert.match(source, /home-race-focus/);
  assert.match(source, /Needs attention/);
  assert.match(source, /Decisions & messages/);
  assert.match(source, /Confidence & objectives/);
  assert.match(source, /Your drivers/);
  assert.match(source, /Technical programme/);
  assert.match(source, /Commercial position/);
  assert.match(source, /Latest news/);
  assert.match(source, /Current standings/);
  assert.match(source, /\/api\/profile\?type=team/);
  assert.match(source, /entityLink/);
});

test("Career Home v2 links operational panels to their existing authoritative screens", () => {
  const source = readFileSync("playtest/career-home.js", "utf8");
  for (const href of [
    "/management.html#inbox",
    "/management.html#board",
    "/management.html#people",
    "/technical.html",
    "/management.html#commercial",
    "/world.html",
    "/championship.html#standings",
    "/championship.html#calendar",
  ]) {
    assert.equal(source.includes(href), true, href);
  }
});

test("Career Home v2 no longer uses the old phase-specific dashboard marker", () => {
  const source = readFileSync("playtest/career-home.js", "utf8");
  assert.doesNotMatch(source, /phase48Home|Phase 48/i);
  assert.match(source, /careerHomeVersion = "2"/);
});
