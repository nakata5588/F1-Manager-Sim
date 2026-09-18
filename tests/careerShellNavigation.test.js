import test from "node:test";
import assert from "node:assert/strict";
import {
  CAREER_NAV_GROUPS,
  activeCareerNavId,
  buildCareerNavigation,
  careerPageLabel,
  careerShellContext,
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
  assert.equal(items.find((row) => row.id === "team").href, "/management.html#team");
  assert.equal(items.find((row) => row.id === "drivers").href, "/management.html#drivers");
  assert.equal(items.find((row) => row.id === "staff").href, "/management.html#staff");
});

test("management deep links resolve existing tabs without creating duplicate screens", () => {
  assert.equal(managementTabForHash("#inbox"), "inbox");
  assert.equal(managementTabForHash("#team"), "team");
  assert.equal(managementTabForHash("#drivers"), "drivers");
  assert.equal(managementTabForHash("#recruitment"), "recruitment");
  assert.equal(managementTabForHash("#staff"), "staff");
  assert.equal(managementTabForHash("#staff-market"), "staff-market");
  assert.equal(managementTabForHash("#people"), "team");
  assert.equal(managementTabForHash("#commercial"), "commercial");
  assert.equal(managementTabForHash("#not-a-tab"), null);

  assert.equal(activeCareerNavId({ pathname: "/management.html", hash: "#team" }), "team");
  assert.equal(activeCareerNavId({ pathname: "/management.html", hash: "#drivers" }), "drivers");
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

test("Career Shell v2 derives stable page labels for navigation and entity profiles", () => {
  assert.deepEqual(careerPageLabel({ pathname: "/management.html", hash: "#staff" }), {
    id: "staff",
    label: "Staff",
    group: "Team",
  });
  assert.deepEqual(careerPageLabel({ pathname: "/profile.html", search: "?type=team&id=T1" }), {
    id: "profile",
    label: "Profile",
    group: "F1 World",
  });
});

test("management workspace detail labels remain specific inside the global Career Shell", () => {
  assert.deepEqual(careerPageLabel({ pathname: "/management.html", hash: "#board" }), {
    id: "team",
    label: "Board",
    group: "Team",
  });
  assert.deepEqual(careerPageLabel({ pathname: "/management.html", hash: "#contracts" }), {
    id: "drivers",
    label: "Driver Contracts",
    group: "Team",
  });
  assert.deepEqual(careerPageLabel({ pathname: "/management.html", hash: "#staff-market" }), {
    id: "staff",
    label: "Staff Recruitment & Contracts",
    group: "Team",
  });
  assert.deepEqual(careerPageLabel({ pathname: "/management.html", hash: "#commercial" }), {
    id: "commercial",
    label: "Finances & Sponsors",
    group: "Operations",
  });
});

test("F1 World subviews remain one global nav destination with specific page labels", () => {
  assert.equal(activeCareerNavId({ pathname: "/world.html", hash: "#drivers" }), "world");
  assert.equal(activeCareerNavId({ pathname: "/world.html", hash: "#records" }), "world");

  assert.deepEqual(careerPageLabel({ pathname: "/world.html", hash: "#news" }), {
    id: "world",
    label: "News",
    group: "F1 World",
  });
  assert.deepEqual(careerPageLabel({ pathname: "/world.html", hash: "#drivers" }), {
    id: "world",
    label: "Drivers",
    group: "F1 World",
  });
  assert.deepEqual(careerPageLabel({ pathname: "/world.html", hash: "#records" }), {
    id: "world",
    label: "Records",
    group: "F1 World",
  });
});

test("Career Shell v2 projects manager, current team identity and active weekend context", () => {
  const state = {
    screen: "practice_results",
    career: {
      managerName: "Ricardo Nakata",
      managerProfile: { nationality: "Portuguese" },
      controlledTeamId: "T1",
      teamName: "Williams",
      season: 1980,
      date: "1980-01-11",
    },
    raceWeekend: {
      stage: "practice_completed",
      round: 1,
      name: "Argentine Grand Prix",
      trackName: "Buenos Aires",
      date: "1980-01-13",
    },
    nextRace: { round: 1, name: "Argentine Grand Prix", date: "1980-01-13" },
  };
  const teamProfile = {
    id: "T1",
    name: "Williams",
    nationality: "British",
    media: { url: "/media/williams.svg" },
    visualIdentity: { colours: { primary: "#123456", secondary: "#FEDCBA" } },
  };
  const context = careerShellContext(state, teamProfile, { pathname: "/technical.html" });

  assert.equal(context.page.label, "Car & Development");
  assert.equal(context.manager.name, "Ricardo Nakata");
  assert.equal(context.manager.nationality, "Portuguese");
  assert.equal(context.team.name, "Williams");
  assert.equal(context.team.logoUrl, "/media/williams.svg");
  assert.equal(context.event.eyebrow, "Round 1");
  assert.equal(context.event.status, "practice_completed");
  assert.equal(context.event.title, "Argentine Grand Prix");
  assert.equal(context.event.meta, "Buenos Aires");
  assert.equal(context.continue.label, "RACE WEEKEND ▶");
});

test("Career Shell v2 uses the next race and then offseason as global context", () => {
  const career = {
    managerName: "Manager",
    controlledTeamId: "T1",
    teamName: "Team",
    season: 1980,
    date: "1980-02-01",
  };
  const next = careerShellContext({
    screen: "home",
    career,
    nextRace: { round: 2, name: "Brazilian Grand Prix", date: "1980-01-27" },
  }, null, { pathname: "/" });
  assert.equal(next.event.status, "upcoming");
  assert.equal(next.event.title, "Brazilian Grand Prix");
  assert.equal(next.continue.kind, "continue");

  const offseason = careerShellContext({ screen: "home", career, nextRace: null }, null, { pathname: "/" });
  assert.equal(offseason.event.status, "offseason");
  assert.equal(offseason.continue.href, "/offseason.html");
});

test("Career Shell v2 accepts New Game setup media as a safe fallback identity source", () => {
  const context = careerShellContext({
    screen: "home",
    career: {
      managerName: "Manager",
      controlledTeamId: "T1",
      teamName: "Williams",
      season: 1980,
      date: "1980-01-01",
    },
    nextRace: { round: 1, name: "Argentine Grand Prix", date: "1980-01-13" },
  }, {
    id: "T1",
    name: "Williams",
    resolvedMedia: { logo: { url: "/media/fallback/teamLogo.svg" } },
  }, { pathname: "/" });

  assert.equal(context.team.logoUrl, "/media/fallback/teamLogo.svg");
});
