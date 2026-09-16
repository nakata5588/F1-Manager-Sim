import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { deserializeSaveWorld, serializeSaveWorld } from "./serialization.js";

export const AUTOSAVE_SLOT = "autosave";
const SLOT_PATTERN = /^[a-z0-9][a-z0-9_-]{0,47}$/i;

export function normalizeSaveSlot(value) {
  const slot = String(value ?? "").trim().toLowerCase();
  if (!SLOT_PATTERN.test(slot)) {
    throw new Error("Save slot must be 1-48 characters using only letters, numbers, '-' or '_'.");
  }
  return slot;
}

function activeWeekend(saveWorld) {
  const rows = Object.values(saveWorld.world?.raceWeekendState?.active ?? {});
  return rows.find((row) => row?.phase && row.phase !== "completed")
    ?? rows.at?.(-1)
    ?? rows[rows.length - 1]
    ?? null;
}

export function projectSaveSummary(saveWorld, options = {}) {
  const live = saveWorld.world?.liveRaceState?.active ?? null;
  const weekend = activeWeekend(saveWorld);
  const controlledTeamId = saveWorld.player?.controlledTeamIds?.[0] ?? null;
  const managerName = saveWorld.player?.manager?.name
    ?? saveWorld.world?.management?.managerCareer?.name
    ?? null;
  return {
    slot: options.slot ? normalizeSaveSlot(options.slot) : null,
    savedAt: options.savedAt ?? null,
    managerName,
    controlledTeamId,
    season: Number(saveWorld.clock?.season),
    date: saveWorld.clock?.date ?? null,
    databaseVersion: saveWorld.meta?.seasonDatabase?.databaseVersion ?? null,
    sourceChecksum: saveWorld.meta?.seasonDatabase?.sourceChecksum ?? null,
    weekend: weekend ? {
      key: weekend.key ?? null,
      gpId: weekend.gpId ?? null,
      phase: weekend.phase ?? null,
    } : null,
    liveRace: live ? {
      weekendKey: live.weekendKey ?? null,
      gpId: live.gpId ?? null,
      status: live.status ?? null,
      currentLap: Number(live.currentLap ?? 0),
      totalLaps: Number(live.totalLaps ?? 0),
    } : null,
  };
}

function parseEnvelope(serialized) {
  const envelope = JSON.parse(serialized);
  const saveWorld = deserializeSaveWorld(envelope);
  return {
    envelope,
    saveWorld,
  };
}

export class FileSaveSlotStore {
  constructor(directory) {
    if (!directory) throw new TypeError("A save directory is required.");
    this.directory = resolve(String(directory));
  }

  ensureDirectory() {
    mkdirSync(this.directory, { recursive: true });
  }

  pathFor(slotValue) {
    const slot = normalizeSaveSlot(slotValue);
    return resolve(this.directory, `${slot}.json`);
  }

  save(slotValue, saveWorld, options = {}) {
    const slot = normalizeSaveSlot(slotValue);
    const savedAt = options.savedAt ?? new Date().toISOString();
    const target = this.pathFor(slot);
    const temporary = `${target}.tmp`;
    this.ensureDirectory();
    const serialized = serializeSaveWorld(saveWorld, { savedAt, pretty: options.pretty ?? true });
    writeFileSync(temporary, serialized, "utf8");
    renameSync(temporary, target);
    return projectSaveSummary(saveWorld, { slot, savedAt });
  }

  load(slotValue) {
    const slot = normalizeSaveSlot(slotValue);
    const target = this.pathFor(slot);
    if (!existsSync(target)) throw new Error(`Save slot '${slot}' does not exist.`);
    const serialized = readFileSync(target, "utf8");
    const { envelope, saveWorld } = parseEnvelope(serialized);
    return {
      slot,
      savedAt: envelope.savedAt ?? null,
      saveWorld,
      summary: projectSaveSummary(saveWorld, { slot, savedAt: envelope.savedAt ?? null }),
    };
  }

  list() {
    if (!existsSync(this.directory)) return [];
    const rows = [];
    for (const file of readdirSync(this.directory, { withFileTypes: true })) {
      if (!file.isFile() || !file.name.endsWith(".json")) continue;
      const rawSlot = file.name.slice(0, -5);
      let slot;
      try { slot = normalizeSaveSlot(rawSlot); }
      catch { continue; }
      try {
        rows.push(this.load(slot).summary);
      } catch {
        rows.push({ slot, savedAt: null, invalid: true });
      }
    }
    return rows.sort((a, b) => String(b.savedAt ?? "").localeCompare(String(a.savedAt ?? "")) || a.slot.localeCompare(b.slot));
  }

  delete(slotValue) {
    const slot = normalizeSaveSlot(slotValue);
    const target = this.pathFor(slot);
    if (!existsSync(target)) return false;
    rmSync(target);
    return true;
  }
}