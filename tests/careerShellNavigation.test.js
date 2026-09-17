import test from "node:test";
import assert from "node:assert/strict";
import {
  CAREER_NAV_GROUPS,
  activeCareerNavId,
  buildCareerNavigation,
  continueIntent,
  homeSectionTarget,
  managementTabForHash,
} from "../playtest/career-shell-model.js";

test("career shell exposes one stable navigation model across the playable modules", () => {
  const items = CAREER_NAV_GROUPS.flatMap((group) => group.items);
  assert.deepEqual(items.map((row) => row.id), [
    "home", "inbox", "calendar", "team", "drivers", "staff",
    "technical", "commercial", "standings", "world", "governance", "offseason",
  ]);
  assert.equal(new Set(items.map((row) => row.id)).size, items.length);
  assert.equal(items.every((row) => row.href.startsWith("/")), true);
  assert.equal(items.find((row) => row.id === "calendar").href, "/championship.html#calendar");
  assert.equal(items.find((row) => row.id === "standings").href, "/championship.html#standings");
});

test("management deep links resolve existing tabs without creating duplicate screens", () => {
  assert.equal(managementTabForHash("#inbox"), "inbox");
  assert.equal(managementTabForHash("#recruitment"), "recruitment");
  assert.equal(managementTabForHash("#staff"), "staff");
  assert.equal(managementTabForHash("#commercial"), "commercial");
  assert.equal(managementTabForHash("#not-a-tab"), null);

  assert.equal(activeCareerNavId({ pathname: "/management.html", hash: "#recruitment" }), "drivers");
  assert.equal(activeCareerNavId({ pathname: "/management.html", hash: "#commercial" }), "commercial");
  assert.equal(activeCareerNavId({ pathname: "/technical.html" }), "technical");
  assert.equal(activeCareerNavId({ pathname: "/world.html" }), "world");
});

test("Championship Hub deep links keep Calendar and Standings as separate global nav targets", () => {
  assert.equal(activeCareerNavId({ pathname: "/championship.html", hash: "#calendar" }), "calendar");
  assert.equal(activeCareerNavId({ pathname: "/championship.html", hash: "#standings" }), "standings");
  assert.equal(activeCareerNavId({ pathname: "/championship.html", hash: "" }), "calendar");
});

test("career shell carries unread Inbox state as presentation metadata only", () => {
  const groups = buildCareerNavigation({ pathname: "/management.html", hash: "#inbox" }, { unreadInbox: 4 });
  const inbox = groups.flatMap((group) => group.items).find((row) => row.id === "inbox");
  assert.equal(inbox.active, true);
  assert.equal(inbox.badge, 4);
});

test("Continue remains contextual instead of bypassing an active weekend or offseason", () => {
  const career = { managerName: "Test", teamName: "Team", date: "1980-01-01", season: 1980 };
  assert.deepEqual(continueIntent({ screen: "new_career" }), { visible: false, kind: "none", label: null, href: null });
  assert.equal(continueIntent({ career, raceWeekend: { stage: "practice_completed" }, nextRace: {} }).kind, "navigate");
  assert.equal(continueIntent({ career, raceWeekend: { stage: "practice_completed" }, nextRace: {} }).label, "RACE WEEKEND ▶");
  assert.equal(continueIntent({ career, raceWeekend: null, nextRace: null }).href, "/offseason.html");
  assert.equal(continueIntent({ career, raceWeekend: null, nextRace: { round: 1 } }).kind, "continue");
});

test("legacy Home section links remain readable during the Championship Hub transition", () => {
  assert.equal(homeSectionTarget({ pathname: "/", search: "?section=calendar" }), "calendar");
  assert.equal(homeSectionTarget({ pathname: "/", search: "?section=standings" }), "standings");
  assert.equal(homeSectionTarget({ pathname: "/", search: "?section=unknown" }), null);
});