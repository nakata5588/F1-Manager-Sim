import test from "node:test";
import assert from "node:assert/strict";
import { projectTeamSelectionCards } from "../src/presentation/teamSelectionPresentation.js";

function seasonDatabase() {
  return {
    season: 1980,
    snapshot: {
      season: 1980,
      teams: [
        { team_id: "T1", team_name: "Williams", nationality: "British", primary_color: "#112233", secondary_color: "#DDEEFF" },
        { team_id: "T2", team_name: "Futureless Racing", nationality: "Italian" },
      ],
      drivers: [
        { driver_id: "D1", display_name: "Alan Jones" },
        { driver_id: "D2", display_name: "Carlos Reutemann" },
        { driver_id: "D3", display_name: "Later Driver" },
        { driver_id: "D4", display_name: "Contract Fallback" },
        { driver_id: "D5", display_name: "Midseason Driver" },
      ],
      startingRaceEntries: [
        { driver_id: "D1", team_id: "T1", car_number: 27, source_role: "round_1_starter" },
        { driver_id: "D2", team_id: "T1", car_number: 28, source_role: "round_1_starter" },
      ],
      contracts: [
        { year: 1980, driver_id: "D1", team_id: "T1", role: "main_driver" },
        { year: 1980, driver_id: "D2", team_id: "T1", role: "second_driver" },
        { year: 1980, driver_id: "D3", team_id: "T1", role: "reserve_driver" },
        { year: 1981, driver_id: "D3", team_id: "T2", role: "main_driver" },
        { year: 1980, driver_id: "D4", team_id: "T2", role: "main_driver" },
        { year: 1980, driver_id: "D5", team_id: "T2", role: "second_driver", start_date: "1980-08-01" },
      ],
      teamEngines: [
        { year: 1980, team_id: "T1", engine_id: "E1" },
        { year: 1980, team_id: "T2", engine_id: "E2" },
      ],
      engines: [
        { engine_id: "E1", engine_name: "Ford Cosworth DFV 3.0 V8", manufacturer: "Ford" },
        { engine_id: "E2", engine_name: "Engine Two", manufacturer: "Maker" },
      ],
      carStats: [
        { year: 1980, team_id: "T1", chassis_name: "FW07B", chassis_spec: 88 },
        { year: 1980, team_id: "T2", chassis_spec: 70 },
      ],
    },
  };
}

test("team selection uses explicit opening race entries ahead of broader contract context", () => {
  const cards = projectTeamSelectionCards(seasonDatabase());
  const williams = cards.find((row) => row.id === "T1");

  assert.deepEqual(williams.drivers.map((row) => row.name), ["Alan Jones", "Carlos Reutemann"]);
  assert.deepEqual(williams.drivers.map((row) => row.carNumber), [27, 28]);
  assert.equal(williams.drivers.some((row) => row.name === "Later Driver"), false);
});

test("team selection safely falls back to opening-season contracts when no explicit start entries exist", () => {
  const cards = projectTeamSelectionCards(seasonDatabase());
  const fallback = cards.find((row) => row.id === "T2");

  assert.deepEqual(fallback.drivers.map((row) => row.name), ["Contract Fallback"]);
  assert.equal(fallback.drivers.some((row) => row.name === "Later Driver"), false, "future-season contracts must not leak");
  assert.equal(fallback.drivers.some((row) => row.name === "Midseason Driver"), false, "later same-season contracts must not leak into Career Start");
});

test("team selection exposes sourced technical identity without exposing performance ratings", () => {
  const cards = projectTeamSelectionCards(seasonDatabase());
  const williams = cards.find((row) => row.id === "T1");
  const other = cards.find((row) => row.id === "T2");

  assert.equal(williams.chassis, "FW07B");
  assert.deepEqual(williams.engine, {
    id: "E1",
    name: "Ford Cosworth DFV 3.0 V8",
    manufacturer: "Ford",
  });
  assert.equal(other.chassis, null, "missing chassis identity must remain absent instead of being invented");

  const publicKeys = new Set(Object.keys(williams));
  for (const forbidden of ["rating", "overall", "strength", "rank", "expectedPosition", "championshipPosition"]) {
    assert.equal(publicKeys.has(forbidden), false);
  }
});

test("team selection visual identity is presentation-only and media uses stable team ids", () => {
  const williams = projectTeamSelectionCards(seasonDatabase()).find((row) => row.id === "T1");
  assert.equal(williams.visualIdentity.colours.primary, "#112233");
  assert.equal(williams.visualIdentity.colours.secondary, "#DDEEFF");
  assert.equal(williams.visualIdentity.simulationAuthority, false);
  assert.deepEqual(williams.media.logo, { kind: "teamLogo", entityId: "T1" });
  assert.deepEqual(williams.media.car, { kind: "car", entityId: "T1" });
});
