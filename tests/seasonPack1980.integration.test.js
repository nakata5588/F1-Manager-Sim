import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { loadSeasonPackPayload, validateSeasonPackPayload } from "../src/data/seasonPackLoader.js";
import { createSaveWorld } from "../src/save/createSaveWorld.js";

const PATH = new URL("../data/season-packs/1980/season-pack-1980.v0.7.json", import.meta.url);

test("real 1980 v0.7 SeasonPack materializes the canonical new-game Save World", async () => {
  const raw = await readFile(PATH);
  const checksum = createHash("sha256").update(raw).digest("hex");
  const payload = JSON.parse(raw.toString("utf8"));
  const sourceBefore = JSON.stringify(payload);

  const validation = validateSeasonPackPayload(payload, { season: 1980 });
  assert.equal(validation.ok, true);
  assert.deepEqual(validation.counts, {
    teams: 15,
    drivers: 28,
    driverContracts: 28,
    staff: 60,
    loaderSafeStaff: 51,
    calendarRounds: 14,
    fullEntrants: 46,
    startingRaceEntries: 28,
    roundEntryReference: 383,
    futureEntities: 305,
  });

  const snapshot = loadSeasonPackPayload(payload, {
    sourceChecksum: checksum,
    sourcePath: "data/season-packs/1980/season-pack-1980.v0.7.json",
  });
  const save = createSaveWorld(snapshot, {
    seed: "1980-loader-integration",
    createdAt: "2026-09-10T00:00:00.000Z",
  });

  assert.equal(JSON.stringify(payload), sourceBefore, "loader must not mutate the SeasonPack payload");
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.teams[0]), true);

  assert.equal(save.world.teams.length, 15);
  assert.equal(save.world.drivers.length, 28);
  assert.equal(save.world.staff.length, 51);
  assert.equal(save.world.staffContracts.length, 51);
  assert.equal(save.world.staffRatings.length, 51);
  assert.equal(save.world.calendar.length, 14);
  assert.equal(save.world.startingRaceEntries.length, 28);

  assert.equal(save.world.seasonPack.version, "0.7");
  assert.equal(save.world.seasonPack.fullEntrants.length, 46);
  assert.equal(save.world.seasonPack.roundEntryReference.length, 383);
  assert.equal(save.world.sourcePackage.sourceSha256, checksum);
  assert.equal(save.meta.historicalDatabase.sourceChecksum, checksum);
  assert.equal(save.meta.historicalDatabase.databaseVersion, "season-pack-0.7");

  const interlagos = save.world.calendar.find((row) => row.round === 2);
  assert.equal(interlagos.lap_length_km, 7.873);
  assert.equal(interlagos.laps, 40);

  const peterWarr = save.world.staff.filter((row) => row.staff_id === "st_0032");
  assert.equal(peterWarr.length, 1);
  assert.equal(peterWarr[0].team_id, "TEAM0005");
  assert.equal(peterWarr[0].role, "team_manager_operations");

  assert.equal(save.world.startingRaceEntries.some((row) => row.driver_id === "DRV0095"), false, "Mansell is later-season context, not a round-one starter");
  assert.equal(save.world.startingRaceEntries.some((row) => row.driver_id === "DRVX0001"), true, "David Kennedy is a round-one entry");

  for (const value of Object.values(save.history)) assert.deepEqual(value, []);

  save.world.teams[0].team_name = "Changed only in Save World";
  assert.notEqual(save.world.teams[0].team_name, snapshot.teams[0].team_name);
});
