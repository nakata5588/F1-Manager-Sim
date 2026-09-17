import { publicLabel } from "/presentation-labels.js";

export const CAREER_ENTRY_STORAGE_KEY = "f1ms:career-active";
export const REDUCED_MOTION_STORAGE_KEY = "f1ms:reduced-motion";

function timeValue(value) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function usableSaveSlots(rows = []) {
  return [...rows]
    .filter((row) => row && !row.invalid && row.compatible !== false && row.slot)
    .sort((a, b) => timeValue(b.savedAt) - timeValue(a.savedAt) || String(a.slot).localeCompare(String(b.slot)));
}

export function latestCompatibleSaveSlot(rows = []) {
  return usableSaveSlots(rows)[0] ?? null;
}

export function hasLoadableSaves(rows = []) {
  return usableSaveSlots(rows).length > 0;
}

export function saveSlotStatus(row) {
  if (row?.invalid) return "Invalid save file";
  if (row?.compatible === false) return "Incompatible with the loaded Season Database";
  if (row?.liveRace?.status && row.liveRace.status !== "completed") {
    return `Race in progress · Lap ${Number(row.liveRace.currentLap ?? 0)}/${Number(row.liveRace.totalLaps ?? 0)}`;
  }
  if (row?.weekend?.phase && row.weekend.phase !== "completed") {
    return publicLabel(row.weekend.phase, "Race Weekend");
  }
  return "Career save";
}

export function shouldResumeCareer(storageValue, state) {
  return storageValue === "1" && Boolean(state?.career) && state?.screen !== "new_career";
}
