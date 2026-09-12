import assert from "node:assert/strict";
import test from "node:test";

import { archiveExitedTeamOperationalState } from "../src/sim/systems/teamExitCleanup.js";

function fixture() {
  return {
    clock: { date: "1982-01-01", season: 1982 },
    history: { teamEvolution: [] },
    world: {
      teamState: { T1: { cash: -1000 }, T2: { cash: 2000 } },
      carState: { T1: { components: { aero_spec: 55 } }, T2: { components: { aero_spec: 70 } } },
      technical: {
        teams: { T1: { teamId: "T1", specs: {} }, T2: { teamId: "T2", specs: {} } },
        suppliers: { teams: { T1: { active: { engineId: "E1" } }, T2: { active: { engineId: "E2" } } } },
      },
      employment: {
        futureAssignments: {
          drivers: { D1: { teamId: "T1", season: 1983 }, D2: { teamId: "T2", season: 1983 } },
          staff: { S1: { teamId: "T1", season: 1983 } },
        },
        vacancies: [
          { vacancyId: "V1", teamId: "T1", status: "open" },
          { vacancyId: "V2", teamId: "T2", status: "open" },
        ],
      },
    },
  };
}

test("exited team operational state is archived rather than left active", () => {
  const save = fixture();
  const result = archiveExitedTeamOperationalState(save, "T1", "1982-01-01");

  assert.equal(result.archivedFinance, true);
  assert.equal(result.archivedCar, true);
  assert.equal(save.world.teamState.T1, undefined);
  assert.equal(save.world.carState.T1, undefined);
  assert.equal(save.world.inactiveTeamState.T1.cash, -1000);
  assert.equal(save.world.inactiveCarState.T1.components.aero_spec, 55);
  assert.equal(save.world.technical.teams.T1, undefined);
  assert.equal(save.world.technical.inactiveTeams.T1.teamId, "T1");
  assert.equal(save.world.technical.suppliers.teams.T1, undefined);
  assert.equal(save.world.technical.inactiveSupplierTeams.T1.active.engineId, "E1");

  // Other active teams must remain untouched.
  assert.equal(save.world.teamState.T2.cash, 2000);
  assert.equal(save.world.technical.teams.T2.teamId, "T2");
});

test("exited team future employment commitments and vacancies are cancelled", () => {
  const save = fixture();
  const result = archiveExitedTeamOperationalState(save, "T1", "1982-01-01");

  assert.equal(result.cancelledFutureAssignments, 2);
  assert.equal(save.world.employment.futureAssignments.drivers.D1, undefined);
  assert.equal(save.world.employment.futureAssignments.staff.S1, undefined);
  assert.ok(save.world.employment.futureAssignments.drivers.D2);
  assert.equal(save.world.employment.vacancies[0].status, "cancelled");
  assert.equal(save.world.employment.vacancies[0].closeReason, "team_exit");
  assert.equal(save.world.employment.vacancies[1].status, "open");
});
