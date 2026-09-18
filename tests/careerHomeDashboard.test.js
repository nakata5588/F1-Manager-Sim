import test from "node:test";
import assert from "node:assert/strict";
import { buildCareerHomeModel } from "../playtest/career-home-model.js";

function input() {
  return {
    state: {
      screen: "home",
      career: { managerName: "Test Manager", controlledTeamId: "T1", teamName: "Alpha Racing", season: 1980, date: "1980-04-01" },
      teamDrivers: [
        { id: "D1", name: "Alice Fast", role: "main_driver" },
        { id: "D2", name: "Alex Steady", role: "second_driver" },
      ],
      nextRace: { id: "GP3", name: "Third Grand Prix", round: 3, date: "1980-04-20" },
      raceWeekend: null,
      standings: {
        drivers: [
          { id: "D3", name: "Rival", position: 1, points: 15, wins: 1 },
          { id: "D1", name: "Alice Fast", position: 2, points: 12, wins: 1 },
          { id: "D2", name: "Alex Steady", position: 4, points: 6, wins: 0 },
        ],
        constructors: [
          { id: "T2", name: "Beta Racing", position: 1, points: 20, wins: 1 },
          { id: "T1", name: "Alpha Racing", position: 2, points: 18, wins: 1 },
        ],
      },
    },
    management: {
      inbox: { total: 4, unread: 3, decisionsPending: 1 },
      board: {
        confidence: 42,
        status: "under_pressure",
        objectives: [
          { kind: "constructors_position", status: "pending" },
          { kind: "financial_stability", status: "on_track" },
        ],
      },
      commercial: { marketability: 72, activeDeals: 2, monthlySponsorIncome: 24000, openNegotiations: 1, pendingActivities: 0 },
    },
    technical: {
      responsibility: "manager",
      summary: { activeDesigns: 1, manufacturingJobs: 0, readySpecs: 1, facilityUpgrades: 0 },
    },
    world: {
      summary: { racesArchived: 2 },
      news: [
        { id: "N1", date: "1980-03-31", category: "race", title: "Rival wins again", summary: "A close finish." },
      ],
      history: [
        { id: "H2", date: "1980-03-16", category: "race", title: "Second Grand Prix" },
        { id: "H1", date: "1980-03-02", category: "race", title: "Opening Grand Prix" },
      ],
    },
    teamProfile: {
      id: "T1",
      name: "Alpha Racing",
      nationality: "British",
      media: { url: "/media/alpha.svg" },
      visualIdentity: { colours: { primary: "#123456", secondary: "#ABCDEF" } },
      finances: {
        cash: 2500000,
        monthlyIncome: 300000,
        monthlyExpenses: 275000,
        monthlyNet: 25000,
        financialStatus: "stable",
      },
    },
    inbox: {
      summary: { total: 4, unread: 3, decisionsPending: 1 },
      items: [
        { id: "I1", date: "1980-04-01", category: "contract", priority: "normal", title: "Driver counter-offer", unread: true, archived: false, decision: { status: "pending" } },
        { id: "I2", date: "1980-03-30", category: "staff", priority: "high", title: "Staff report", unread: true, archived: false, decision: null },
      ],
    },
  };
}

test("career home model aggregates existing read-only career projections", () => {
  const model = buildCareerHomeModel(input());
  assert.equal(model.career.teamName, "Alpha Racing");
  assert.equal(model.competition.constructorPosition, 2);
  assert.equal(model.competition.drivers[0].position, 2);
  assert.equal(model.board.confidence, 42);
  assert.equal(model.technical.summary.readySpecs, 1);
  assert.equal(model.calendar.nextRace.name, "Third Grand Prix");
  assert.equal(model.calendar.timeline.at(-1).status, "next");
  assert.equal(model.news[0].title, "Rival wins again");
  assert.equal(model.raceFocus.mode, "next_race");
  assert.equal(model.raceFocus.title, "Third Grand Prix");
  assert.equal(model.finances.cash, 2500000);
  assert.equal(model.finances.monthlyNet, 25000);
  assert.equal(model.finances.sponsorIncome, 24000);
  assert.equal(model.finances.activeDeals, 2);
  assert.equal(model.career.identity.logoUrl, "/media/alpha.svg");
});

test("career home prioritises pending decisions, board pressure and ready technical work", () => {
  const model = buildCareerHomeModel(input());
  assert.deepEqual(model.attention.slice(0, 4).map((row) => row.id), [
    "pending-decisions",
    "unread-inbox",
    "board-pressure",
    "ready-specs",
  ]);
  assert.equal(model.inbox.items[0].decisionPending, true);
});

test("career home model does not mutate source projections or invent hidden future entities", () => {
  const source = input();
  const before = structuredClone(source);
  const model = buildCareerHomeModel(source);
  assert.deepEqual(source, before);
  assert.equal(JSON.stringify(model).includes("futureDrivers"), false);
  assert.equal(JSON.stringify(model).includes("futureTeams"), false);
});


test("career home v2 exposes direct operational destinations instead of passive status only", () => {
  const model = buildCareerHomeModel(input());
  const byId = new Map(model.attention.map((row) => [row.id, row]));
  assert.equal(byId.get("pending-decisions").href, "/management.html#inbox");
  assert.equal(byId.get("board-pressure").href, "/management.html#board");
  assert.equal(byId.get("ready-specs").href, "/technical.html");
  assert.equal(model.raceFocus.href, "/championship.html#calendar");
  assert.equal(model.competition.drivers[0].profileHref, "/profile.html?type=driver&id=D1");
});

test("career home v2 promotes an active race weekend above the next-race view", () => {
  const source = input();
  source.state.raceWeekend = {
    id: "GP3",
    name: "Third Grand Prix",
    round: 3,
    date: "1980-04-20",
    trackName: "Test Circuit",
    weather: "dry",
    stage: "practice_completed",
  };
  const model = buildCareerHomeModel(source);
  assert.equal(model.raceFocus.mode, "weekend");
  assert.equal(model.raceFocus.stage, "practice_completed");
  assert.equal(model.raceFocus.title, "Third Grand Prix");
  assert.equal(model.raceFocus.trackName, "Test Circuit");
  assert.equal(model.raceFocus.href, "/");
  assert.equal(model.calendar.timeline.at(-1).status, "current");
});

test("career home v2 surfaces financial and sponsor pressure from existing projections", () => {
  const source = input();
  source.teamProfile.finances.financialStatus = "distressed";
  source.management.commercial.pendingActivities = 2;
  const model = buildCareerHomeModel(source);
  assert.equal(model.attention.some((row) => row.id === "financial-pressure"), true);
  assert.equal(model.attention.some((row) => row.id === "sponsor-activities"), true);
  assert.equal(model.finances.status, "distressed");
  assert.equal(model.finances.pendingActivities, 2);
});
