import test from "node:test";
import assert from "node:assert/strict";
import { entityProfileProjection } from "../src/app/entityProfilePlaytest.js";

function saveWorld() {
  return {
    meta: { seed: "profiles" },
    clock: { season: 1980, date: "1980-01-10" },
    player: { controlledTeamIds: ["T1"] },
    history: { races: [] },
    world: {
      drivers: [
        { driver_id: "D1", driver_name: "Own Driver", nationality: "GB", birth_date: "1950-01-01" },
        { driver_id: "D2", driver_name: "Visible Rival", nationality: "FR", birth_date: "1952-01-01" },
      ],
      futureDrivers: [
        { driver_id: "D_FUTURE", driver_name: "Hidden Future Driver", world_visible_from: 1990, talent_visible_from: 1990, f1_eligible_from: 1991 },
      ],
      staff: [{ staff_id: "S1", staff_name: "Team Principal", role: "Team Principal" }],
      futureStaff: [],
      teams: [
        { team_id: "T1", team_name: "Opening Team", nationality: "GB" },
        { team_id: "T2", team_name: "Rival Team", nationality: "IT" },
      ],
      futureTeams: [],
      driverRatings: [
        { driver_id: "D1", racecraft: 82, wet_skill: 76 },
        { driver_id: "D2", racecraft: 79, wet_skill: 70 },
      ],
      staffRatings: [{ staff_id: "S1", leadership: 80 }],
      careerState: {
        drivers: {
          D1: { currentAbility: 81, potentialAbility: 84, reputation: 78, morale: 62, attributes: { racecraft: 83 }, talentProfile: { version: 1, careerStage: "prime", stageProgress: 0.72, ceilings: { pace: 92, racecraft: 90 }, policy: "static_attribute_ceilings_dynamic_career_curve" } },
          D2: { currentAbility: 79, potentialAbility: 80, reputation: 76, morale: 55, attributes: {}, talentProfile: { version: 1, careerStage: "veteran", stageProgress: 0.31, ceilings: { pace: 88, racecraft: 86 }, policy: "static_attribute_ceilings_dynamic_career_curve" } },
        },
        staff: { S1: { attributes: { leadership: 82 } } },
      },
      employment: {
        drivers: {
          D1: { teamId: "T1", role: "lead_driver", status: "employed", contractUntil: 1981 },
          D2: { teamId: "T2", role: "driver", status: "employed", contractUntil: 1980 },
        },
        staff: { S1: { teamId: "T1", role: "Team Principal", status: "employed", contractUntil: 1982 } },
      },
      management: {},
      championship: { constructors: { T1: { points: 12, wins: 1 }, T2: { points: 8, wins: 0 } } },
      teamState: { T1: { cash: 2500000, reputation: 75 }, T2: { cash: 1800000, reputation: 70 } },
      governance: { teamEvolution: { active: { T1: { currentBrand: "Dynamic Team", enteredSeason: 1980, source: "career_start_active_team" } } } },
      teamBrands: [],
    },
  };
}

test("direct profile URLs cannot reveal hidden future people", () => {
  const save = saveWorld();
  assert.throws(() => entityProfileProjection(save, "driver", "D_FUTURE"), /not visible/i);
});

test("controlled driver profile exposes current Save World state and known attributes", () => {
  const save = saveWorld();
  const profile = entityProfileProjection(save, "driver", "D1");
  assert.equal(profile.name, "Own Driver");
  assert.equal(profile.controlled, true);
  assert.equal(profile.employment.teamName, "Dynamic Team");
  assert.equal(profile.careerState.currentAbility, 81);
  assert.equal(profile.attributes.racecraft, 83);
  assert.deepEqual(profile.talent, { careerStage: "prime", stageProgress: 0.72 });
  assert.equal(Object.hasOwn(profile.talent, "ceilings"), false);
});

test("visible rival profile does not leak exact private ratings", () => {
  const save = saveWorld();
  const profile = entityProfileProjection(save, "driver", "D2");
  assert.equal(profile.name, "Visible Rival");
  assert.equal(profile.controlled, false);
  assert.equal(profile.attributes, null);
  assert.equal(profile.careerState, null);
  assert.deepEqual(profile.talent, { careerStage: "veteran", stageProgress: 0.31 });
  assert.equal(Object.hasOwn(profile.talent, "ceilings"), false);
  assert.ok(profile.scoutingKnowledge >= 0 && profile.scoutingKnowledge <= 100);
});

test("team profile follows current dynamic brand and links visible roster identities", () => {
  const save = saveWorld();
  const profile = entityProfileProjection(save, "team", "T1");
  assert.equal(profile.name, "Dynamic Team");
  assert.equal(profile.controlled, true);
  assert.equal(profile.championship.points, 12);
  assert.deepEqual(profile.drivers.map((row) => row.id), ["D1"]);
  assert.deepEqual(profile.staff.map((row) => row.id), ["S1"]);
  assert.equal(profile.finances.cash, 2500000);
  assert.equal(profile.visualIdentity.teamId, "T1");
  assert.equal(profile.visualIdentity.displayName, "Dynamic Team");
  assert.equal(profile.visualIdentity.simulationAuthority, false);
  assert.equal(profile.visualIdentity.provenance, "derived_presentation_fallback");
  assert.deepEqual(profile.visualIdentity.media.logo, { kind: "teamLogo", entityId: "T1" });
});
