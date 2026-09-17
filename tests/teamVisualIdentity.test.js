import test from "node:test";
import assert from "node:assert/strict";
import { teamVisualIdentity } from "../src/presentation/teamVisualIdentity.js";

function world(team = {}) {
  return {
    world: {
      teams: [{ team_id: "t_001", team_name: "Example Racing", ...team }],
    },
  };
}

test("team visual identity is deterministic and explicitly presentation-only", () => {
  const saveWorld = world();
  const first = teamVisualIdentity(saveWorld, "t_001");
  const second = teamVisualIdentity(saveWorld, "t_001");
  assert.deepEqual(first.colours, second.colours);
  assert.equal(first.provenance, "derived_presentation_fallback");
  assert.equal(first.simulationAuthority, false);
  assert.deepEqual(first.media.logo, { kind: "teamLogo", entityId: "t_001" });
});

test("explicit source presentation hints override the derived palette", () => {
  const saveWorld = world({
    visual_identity: {
      primary_color: "#112233",
      secondary_color: "#AABBCC",
      tertiary_color: "#445566",
      car_template: "historic-car-a",
      livery_template: "historic-livery-a",
    },
  });
  const identity = teamVisualIdentity(saveWorld, "t_001");
  assert.deepEqual(identity.colours, { primary: "#112233", secondary: "#AABBCC", tertiary: "#445566" });
  assert.deepEqual(identity.templates, { car: "historic-car-a", livery: "historic-livery-a", suit: null });
  assert.equal(identity.provenance, "source_presentation_hint");
});

test("Save World presentation override has priority without changing team authority", () => {
  const saveWorld = world({ primary_color: "#111111" });
  saveWorld.world.presentation = {
    teamVisualIdentity: {
      t_001: {
        primaryColor: "#ABCDEF",
        secondaryColor: "#123456",
        liveryTemplate: "alternate-future-livery",
      },
    },
  };
  const identity = teamVisualIdentity(saveWorld, "t_001", { displayName: "Example Grand Prix" });
  assert.equal(identity.teamId, "t_001");
  assert.equal(identity.displayName, "Example Grand Prix");
  assert.equal(identity.colours.primary, "#ABCDEF");
  assert.equal(identity.colours.secondary, "#123456");
  assert.equal(identity.templates.livery, "alternate-future-livery");
  assert.equal(identity.provenance, "save_world_presentation_override");
  assert.equal(identity.simulationAuthority, false);
});

test("invalid colour hints are ignored instead of leaking malformed CSS values", () => {
  const saveWorld = world({ primary_color: "red; background:url(x)", secondary_color: "not-a-colour" });
  const identity = teamVisualIdentity(saveWorld, "t_001");
  assert.match(identity.colours.primary, /^#[0-9A-F]{6}$/);
  assert.match(identity.colours.secondary, /^#[0-9A-F]{6}$/);
  assert.equal(identity.provenance, "derived_presentation_fallback");
});
