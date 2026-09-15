import test from "node:test";
import assert from "node:assert/strict";
import { refreshOrganization } from "../src/game/management/organization.js";

test("an initialized empty active-team set does not resurrect historical teams", () => {
  const saveWorld = {
    clock: { date: "1985-01-01", season: 1985 },
    world: {
      teams: [{ team_id: "T1", team_name: "Former Team" }],
      employment: { staff: {}, vacancies: [] },
      governance: {
        teamEvolution: {
          initializedAt: "1980-01-01",
          active: {},
          exited: { T1: { teamId: "T1", exitedSeason: 1984 } },
        },
      },
      management: {},
    },
  };

  const state = refreshOrganization(saveWorld, { snapshot: true });
  assert.deepEqual(state.teams, {});
  assert.equal(state.history.length, 0);
  assert.equal(state.lastSnapshotMonth, "1985-01");
});
