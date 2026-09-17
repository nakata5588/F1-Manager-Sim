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
      commercial: { activeDeals: 2, openNegotiations: 1, pendingActivities: 0 },
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
