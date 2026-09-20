import assert from "node:assert/strict";
import test from "node:test";

import { summarizeLongRunEcosystem } from "../src/sim/validation/ecosystem.js";

test("ecosystem diagnostics exclude unknown ages instead of coercing them to newborn drivers", () => {
  const saveWorld = {
    world: {
      teams: [{ team_id: "T1" }, { team_id: "T2" }, { team_id: "T3" }],
      inactiveTeams: [],
      drivers: [],
      careerState: {
        drivers: {
          KNOWN: { status: "active", age: 24 },
          UNKNOWN: { status: "active", age: null },
          RETIRED: { status: "retired", age: 51 },
        },
      },
      teamState: {
        T1: { cash: -100, financialStatus: "distressed" },
        T2: { cash: -50, financialStatus: "distressed" },
        T3: { cash: 500, financialStatus: "stable" },
      },
      employment: { freeAgents: { drivers: [], staff: [] }, vacancies: [] },
    },
    history: {
      championships: [],
      races: [],
      transfers: [],
      retirements: [],
    },
  };

  const report = summarizeLongRunEcosystem(saveWorld, { ok: true });
  assert.deepEqual(report.activeDriverAges, {
    count: 1,
    minimum: 24,
    median: 24,
    maximum: 24,
    average: 24,
  });
  assert.equal(report.financiallyDistressedTeams, 2);
  assert.equal(report.distressedTeamShare, 0.6667);
});
