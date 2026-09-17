export const MANAGER_PROFILE_VERSION = 1;

export const MANAGER_BACKGROUND_OPTIONS = Object.freeze([
  { id: "former_driver", label: "Former Driver", description: "Previous competitive driving experience." },
  { id: "engineering", label: "Engineering", description: "Technical or engineering background." },
  { id: "team_management", label: "Team Management", description: "Experience running motorsport teams or departments." },
  { id: "commercial_business", label: "Business & Commercial", description: "Commercial, finance or business leadership experience." },
  { id: "motorsport_operations", label: "Motorsport Operations", description: "Operational experience elsewhere in motorsport." },
  { id: "newcomer", label: "New to Formula One", description: "A fresh management career with no established F1 background." },
]);

const BACKGROUNDS = new Map(MANAGER_BACKGROUND_OPTIONS.map((row) => [row.id, row]));

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function validIsoDate(value) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== raw) return null;
  return raw;
}

export function ageOnDate(dateOfBirth, dateValue) {
  const birth = validIsoDate(dateOfBirth);
  const target = validIsoDate(String(dateValue ?? "").slice(0, 10));
  if (!birth || !target) return null;
  const [by, bm, bd] = birth.split("-").map(Number);
  const [ty, tm, td] = target.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

export function createManagerProfile(input = {}, options = {}) {
  const name = text(input.name ?? input.managerName);
  const nationality = text(input.nationality);
  const dateOfBirth = validIsoDate(input.dateOfBirth ?? input.date_of_birth);
  const background = text(input.background);
  const careerStartDate = validIsoDate(String(options.careerStartDate ?? "").slice(0, 10));

  if (!name) throw new Error("Manager name is required.");
  if (name.length > 64) throw new Error("Manager name must be 64 characters or fewer.");
  if (!nationality) throw new Error("Manager nationality is required.");
  if (nationality.length > 64) throw new Error("Manager nationality must be 64 characters or fewer.");
  if (!dateOfBirth) throw new Error("Manager date of birth must be a valid date.");
  if (!careerStartDate) throw new Error("A valid Career Start date is required for manager creation.");

  const age = ageOnDate(dateOfBirth, careerStartDate);
  if (age === null || age < 18) throw new Error("Manager must be at least 18 years old at Career Start.");
  if (dateOfBirth >= careerStartDate) throw new Error("Manager date of birth must be before Career Start.");
  if (!BACKGROUNDS.has(background)) throw new Error("Select a valid manager background.");

  return {
    profileVersion: MANAGER_PROFILE_VERSION,
    id: text(input.id) || "player-manager",
    name,
    nationality,
    dateOfBirth,
    background,
    previousExperience: BACKGROUNDS.get(background).label,
    createdAt: options.createdAt ?? null,
  };
}

export function ensureManagerProfile(saveWorld) {
  saveWorld.player ??= {};
  saveWorld.player.manager ??= { name: "Manager" };
  const manager = saveWorld.player.manager;
  manager.profileVersion ??= MANAGER_PROFILE_VERSION;
  manager.id ??= "player-manager";
  manager.name = text(manager.name) || "Manager";
  if (manager.nationality === undefined) manager.nationality = null;
  if (manager.dateOfBirth === undefined) manager.dateOfBirth = null;
  if (manager.background === undefined) manager.background = null;
  if (manager.previousExperience === undefined) {
    manager.previousExperience = manager.background && BACKGROUNDS.has(manager.background)
      ? BACKGROUNDS.get(manager.background).label
      : null;
  }
  if (manager.createdAt === undefined) manager.createdAt = saveWorld.meta?.createdAt ?? null;
  return manager;
}

export function managerProfileProjection(saveWorld) {
  const manager = ensureManagerProfile(saveWorld);
  return {
    profileVersion: manager.profileVersion,
    id: manager.id,
    name: manager.name,
    nationality: manager.nationality,
    dateOfBirth: manager.dateOfBirth,
    age: ageOnDate(manager.dateOfBirth, saveWorld.clock?.date),
    background: manager.background,
    previousExperience: manager.previousExperience,
    createdAt: manager.createdAt,
  };
}
