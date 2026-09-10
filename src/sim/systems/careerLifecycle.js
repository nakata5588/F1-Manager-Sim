import { SIM_EVENT } from "../timeEngine.js";
import { ENTITY_EVENT } from "./entityAvailability.js";

export const CAREER_EVENT = Object.freeze({
  INITIALIZED: "career.lifecycle_initialized",
  PROFILE_ACTIVATED: "career.profile_activated",
});

function isoDate(value) {
  const text = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export function ageOnDate(profile, date) {
  const target = isoDate(date);
  const dob = isoDate(profile?.dob ?? profile?.date_of_birth ?? profile?.birth_date);
  if (target && dob) {
    const [year, month, day] = target.split("-").map(Number);
    const [birthYear, birthMonth, birthDay] = dob.split("-").map(Number);
    let age = year - birthYear;
    if (month < birthMonth || (month === birthMonth && day < birthDay)) age -= 1;
    return age >= 0 ? age : null;
  }

  const birthYear = Number(profile?.birth_year ?? profile?.year_of_birth);
  const targetYear = Number(String(date ?? "").slice(0, 4));
  if (Number.isInteger(birthYear) && Number.isInteger(targetYear) && targetYear >= birthYear) {
    return targetYear - birthYear;
  }
  return null;
}

function profileId(type, profile) {
  return type === "driver" ? profile?.driver_id : profile?.staff_id;
}

function ratingFor(saveWorld, type, id) {
  const collection = type === "driver" ? saveWorld.world?.driverRatings : saveWorld.world?.staffRatings;
  return (collection ?? []).find((row) => (type === "driver" ? row.driver_id : row.staff_id) === id) ?? null;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildState(saveWorld, type, profile, status, date) {
  const id = profileId(type, profile);
  const rating = ratingFor(saveWorld, type, id);
  return {
    status,
    age: ageOnDate(profile, date),
    currentAbility: number(rating?.current_ability ?? profile?.current_ability),
    potentialAbility: number(rating?.potential_ability ?? profile?.potential_ability),
    reputation: number(rating?.reputation ?? profile?.reputation),
    morale: 50,
    form: 0,
    activeSince: date,
    lastUpdated: date,
  };
}

function ensureCareerState(saveWorld) {
  saveWorld.world.careerState ??= { drivers: {}, staff: {} };
  saveWorld.world.careerState.drivers ??= {};
  saveWorld.world.careerState.staff ??= {};
  return saveWorld.world.careerState;
}

function initializeCollection(saveWorld, type, profiles, date) {
  const state = ensureCareerState(saveWorld);
  const target = type === "driver" ? state.drivers : state.staff;
  let created = 0;
  for (const profile of profiles ?? []) {
    const id = profileId(type, profile);
    if (!id || target[id]) continue;
    target[id] = buildState(saveWorld, type, profile, "active", date);
    created += 1;
  }
  return created;
}

function activateFutureProfile(saveWorld, type, id, date) {
  if (!["driver", "staff"].includes(type) || !id) return null;

  const liveCollectionName = type === "driver" ? "drivers" : "staff";
  const futureCollectionName = type === "driver" ? "futureDrivers" : "futureStaff";
  const idField = type === "driver" ? "driver_id" : "staff_id";
  const live = saveWorld.world[liveCollectionName] ??= [];
  let profile = live.find((row) => row?.[idField] === id) ?? null;

  if (!profile) {
    profile = (saveWorld.world?.[futureCollectionName] ?? []).find((row) => row?.[idField] === id) ?? null;
    if (!profile) return null;
    live.push(structuredClone(profile));
  }

  const state = ensureCareerState(saveWorld);
  const target = type === "driver" ? state.drivers : state.staff;
  target[id] ??= buildState(saveWorld, type, profile, "available", date);
  target[id].status = "available";
  target[id].lastUpdated = date;
  if (target[id].activeSince == null) target[id].activeSince = date;
  return profile;
}

function refreshAges(saveWorld, date) {
  const state = ensureCareerState(saveWorld);
  for (const [type, profiles] of [["driver", saveWorld.world?.drivers], ["staff", saveWorld.world?.staff]]) {
    const target = type === "driver" ? state.drivers : state.staff;
    for (const profile of profiles ?? []) {
      const id = profileId(type, profile);
      if (!id || !target[id]) continue;
      target[id].age = ageOnDate(profile, date);
      target[id].lastUpdated = date;
    }
  }
}

export function createCareerLifecycleSystem() {
  return {
    id: "career.lifecycle",
    eventTypes: [SIM_EVENT.CAREER_STARTED, SIM_EVENT.SEASON_STARTED, ENTITY_EVENT.ELIGIBLE],
    handle({ saveWorld, event }) {
      if (event.type === SIM_EVENT.CAREER_STARTED) {
        const drivers = initializeCollection(saveWorld, "driver", saveWorld.world?.drivers, event.date);
        const staff = initializeCollection(saveWorld, "staff", saveWorld.world?.staff, event.date);
        return {
          type: CAREER_EVENT.INITIALIZED,
          payload: { drivers, staff },
        };
      }

      if (event.type === SIM_EVENT.SEASON_STARTED) {
        refreshAges(saveWorld, event.date);
        return null;
      }

      const type = String(event.payload?.entity_type ?? "").toLowerCase();
      const id = event.payload?.entity_id ?? null;
      const profile = activateFutureProfile(saveWorld, type, id, event.date);
      if (!profile) return null;
      return {
        type: CAREER_EVENT.PROFILE_ACTIVATED,
        payload: {
          entity_type: type,
          entity_id: id,
          name: profile.display_name ?? profile.staff_name ?? profile.name ?? null,
        },
      };
    },
  };
}
