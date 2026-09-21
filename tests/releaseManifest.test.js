import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { SAVE_SCHEMA_VERSION } from "../src/save/serialization.js";

const MANIFEST_URL = new URL("../data/release-manifest.json", import.meta.url);
const LATEST_1980_URL = new URL("../data/database-baselines/LATEST_1980_CANDIDATE.json", import.meta.url);
const CIRCUIT_OVERLAY_URL = new URL("../data/season-packs/1980/season-pack-1980.v0.9.circuit-layout.overlay.json", import.meta.url);

test("release manifest points at current save/database/circuit authorities", async () => {
  const [manifest, latest, circuitOverlay] = await Promise.all([
    readFile(MANIFEST_URL, "utf8").then(JSON.parse),
    readFile(LATEST_1980_URL, "utf8").then(JSON.parse),
    readFile(CIRCUIT_OVERLAY_URL, "utf8").then(JSON.parse),
  ]);

  assert.equal(manifest.persistence.saveSchemaVersion, SAVE_SCHEMA_VERSION);
  assert.equal(manifest.historicalDatabase.latest1980Candidate, latest.latestCandidate);
  assert.equal(manifest.historicalDatabase.promotedCanonical, latest.currentPromotedCanonical);
  assert.equal(manifest.seasonPacks["1980"].circuitLayoutOverlayVersion, circuitOverlay.targetVersion);
  assert.equal(manifest.seasonPacks["1980"].reviewedCircuitLayouts, 14);
  assert.equal(manifest.seasonPacks["1980"].assignedCircuitLayouts, 14);
  assert.equal(manifest.policies.raceParticipationAuthority, "world.raceEntryState.current");
  assert.equal(manifest.policies.financialCrisisAuthority, "world.financialCrisis");
  assert.equal(manifest.policies.ownershipChangePolicy, "save_world_dynamic_preserve_team_id");
  assert.equal(manifest.policies.insolvencyExitAuthority, "team.financial-crisis");
});
