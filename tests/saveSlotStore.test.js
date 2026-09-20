import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AUTOSAVE_SLOT, FileSaveSlotStore, normalizeSaveSlot } from "../src/save/slotStore.js";

function saveWorld() {
  return {
    meta: {
      seed: "phase-45-slot-store",
      seasonDatabase: {
        season: 1980,
        databaseVersion: "test-db",
        sourceChecksum: "test-source",
      },
    },
    clock: { season: 1980, date: "1980-03-02" },
    player: { manager: { name: "Test Manager" }, controlledTeamIds: ["T1"] },
    world: {
      teams: [{ team_id: "T1", team_name: "Alpha" }],
      liveRaceState: {
        active: { weekendKey: "1980:GP1", gpId: "GP1", status: "paused", currentLap: 4, totalLaps: 12 },
        completed: [],
      },
      raceWeekendState: {
        active: { "1980:GP1": { key: "1980:GP1", gpId: "GP1", phase: "race_live" } },
      },
    },
    history: { races: [] },
    simulation: { nextEventSequence: 12, systemState: { __simulationInitialized: true } },
  };
}

test("save slots validate names and block path traversal", () => {
  assert.equal(normalizeSaveSlot(" Manual-1 "), "manual-1");
  assert.equal(normalizeSaveSlot(AUTOSAVE_SLOT), "autosave");
  assert.throws(() => normalizeSaveSlot("../career"), /save slot/i);
  assert.throws(() => normalizeSaveSlot("has spaces"), /save slot/i);
});

test("filesystem slot store atomically saves, lists and restores Save World", () => {
  const directory = mkdtempSync(join(tmpdir(), "f1-manager-save-slots-"));
  try {
    const store = new FileSaveSlotStore(directory);
    const original = saveWorld();
    const summary = store.save("manual-1", original, { savedAt: "2026-09-16T20:00:00.000Z" });

    assert.equal(summary.slot, "manual-1");
    assert.equal(summary.managerName, "Test Manager");
    assert.equal(summary.teamName, "Alpha");
    assert.equal(summary.liveRace.currentLap, 4);
    assert.deepEqual(readdirSync(directory), ["manual-1.json"]);

    const rows = store.list();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].date, "1980-03-02");
    assert.equal(rows[0].databaseVersion, "test-db");

    const restored = store.load("manual-1");
    assert.equal(restored.saveWorld.meta.saveSchemaVersion, 2);
    const comparable = structuredClone(restored.saveWorld);
    delete comparable.meta.saveSchemaVersion;
    assert.deepEqual(comparable, original);
    restored.saveWorld.clock.date = "1980-03-03";
    assert.equal(original.clock.date, "1980-03-02", "loaded state must be independent from the source object");

    assert.equal(store.delete("manual-1"), true);
    assert.equal(store.delete("manual-1"), false);
    assert.deepEqual(store.list(), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("slot listing isolates a corrupt save instead of crashing all save discovery", () => {
  const directory = mkdtempSync(join(tmpdir(), "f1-manager-save-slots-invalid-"));
  try {
    const store = new FileSaveSlotStore(directory);
    store.save("autosave", saveWorld(), { savedAt: "2026-09-16T21:00:00.000Z" });
    writeFileSync(join(directory, "broken.json"), "{not json", "utf8");
    const rows = store.list();
    assert.equal(rows.length, 2);
    assert.equal(rows.find((row) => row.slot === "autosave").invalid, undefined);
    assert.equal(rows.find((row) => row.slot === "broken").invalid, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("filesystem slot store transparently loads a schema-v1 save through the migration chain", () => {
  const directory = mkdtempSync(join(tmpdir(), "f1-manager-save-slots-v1-"));
  try {
    const legacy = {
      format: "f1-manager-sim-save",
      schemaVersion: 1,
      savedAt: "2026-09-16T21:30:00.000Z",
      save: saveWorld(),
    };
    writeFileSync(join(directory, "legacy.json"), JSON.stringify(legacy), "utf8");

    const store = new FileSaveSlotStore(directory);
    const rows = store.list();
    assert.equal(rows.find((row) => row.slot === "legacy")?.invalid, undefined);

    const restored = store.load("legacy");
    assert.equal(restored.saveWorld.meta.saveSchemaVersion, 2);
    assert.equal(restored.saveWorld.player.manager.name, "Test Manager");
    assert.equal(restored.summary.liveRace.currentLap, 4);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
