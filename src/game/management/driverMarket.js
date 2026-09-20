import { createRng } from "../../sim/random.js";
import { isDriverRaceAvailable, ensureDriverAvailabilityState } from "./driverAvailability.js";

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function raceRole(role) {
  const text = String(role ?? "driver").trim().toLowerCase();
  if (["", "driver", "main_driver", "race_driver", "primary_driver", "secondary_driver", "lead_driver", "second_driver"].includes(text)) return true;
  return !text.includes("reserve") && !text.includes("test") && !text.includes("third") && !text.includes("development");
}

function driverProfile(saveWorld, driverId) {
  return (saveWorld.world?.drivers ?? []).find((row) => String(row.driver_id) === String(driverId)) ?? null;
}

function driverRating(saveWorld, driverId) {
  return (saveWorld.world?.driverRatings ?? []).find((row) => String(row.driver_id) === String(driverId)) ?? {};
}

function normalized(value, fallback = 50) {
  const parsed = numeric(value);
  if (parsed === null) return fallback;
  if (parsed >= 0 && parsed <= 1) return parsed * 100;
  if (parsed >= 1 && parsed <= 10) return parsed * 10;
  return clamp(parsed, 0, 100);
}

function profileName(profile, driverId) {
  return profile?.display_name ?? profile?.driver_name ?? profile?.name ?? driverId;
}

function ensureEmploymentShape(saveWorld) {
  saveWorld.world.employment ??= {};
  saveWorld.world.employment.drivers ??= {};
  saveWorld.world.employment.freeAgents ??= { drivers: [], staff: [] };
  saveWorld.world.employment.freeAgents.drivers ??= [];
  saveWorld.world.employment.vacancies ??= [];
  return saveWorld.world.employment;
}

function addFreeAgent(saveWorld, driverId) {
  const employment = ensureEmploymentShape(saveWorld);
  if (!employment.freeAgents.drivers.includes(driverId)) {
    employment.freeAgents.drivers.push(driverId);
    employment.freeAgents.drivers.sort();
  }
}

function removeFreeAgent(saveWorld, driverId) {
  const employment = ensureEmploymentShape(saveWorld);
  employment.freeAgents.drivers = employment.freeAgents.drivers.filter((id) => String(id) !== String(driverId));
}

export function ensureDriverMarketState(saveWorld) {
  saveWorld.world.driverMarketState ??= {
    drivers: {},
    transitions: [],
  };
  const state = saveWorld.world.driverMarketState;
  state.drivers ??= {};
  state.transitions ??= [];
  saveWorld.history.driverMarket ??= [];
  return state;
}

function transition(saveWorld, driverId, path, input = {}) {
  const state = ensureDriverMarketState(saveWorld);
  const current = state.drivers[driverId] ?? { driverId };
  if (current.path === path && input.force !== true) return current;
  const previousPath = current.path ?? null;
  Object.assign(current, {
    driverId,
    path,
    previousPath,
    updatedAt: input.date ?? saveWorld.clock?.date ?? null,
    updatedSeason: Number(input.season ?? saveWorld.clock?.season),
    reason: input.reason ?? null,
  });
  if (path === "f1_free_agent" && current.f1FreeSince == null) current.f1FreeSince = Number(input.season ?? saveWorld.clock?.season);
  if (path !== "f1_free_agent" && input.keepFreeSince !== true) current.f1FreeSince = null;
  if (path === "other_motorsport") current.otherMotorsportSince ??= Number(input.season ?? saveWorld.clock?.season);
  if (path !== "other_motorsport" && path !== "temporary_replacement") current.otherMotorsportSince = null;
  if (path === "f1_employed") current.lastF1Season = Number(input.season ?? saveWorld.clock?.season);
  state.drivers[driverId] = current;

  const row = {
    date: input.date ?? saveWorld.clock?.date ?? null,
    season: Number(input.season ?? saveWorld.clock?.season),
    driverId,
    from: previousPath,
    to: path,
    reason: input.reason ?? null,
  };
  state.transitions.push(row);
  saveWorld.history.driverMarket.push(structuredClone(row));
  return current;
}

export function initializeDriverMarket(saveWorld, date = saveWorld.clock?.date) {
  const state = ensureDriverMarketState(saveWorld);
  const employment = ensureEmploymentShape(saveWorld);
  const free = new Set(employment.freeAgents.drivers.map(String));
  let created = 0;

  for (const profile of saveWorld.world?.drivers ?? []) {
    const driverId = profile?.driver_id;
    if (!driverId || state.drivers[driverId]) continue;
    const career = saveWorld.world?.careerState?.drivers?.[driverId] ?? {};
    const assignment = employment.drivers?.[driverId] ?? null;
    let path;
    if (career.status === "retired") path = "retired";
    else if (assignment?.status === "employed") path = "f1_employed";
    else if (free.has(String(driverId))) path = "f1_free_agent";
    else if (career.status === "talent") path = "talent";
    else path = "outside_f1";

    state.drivers[driverId] = {
      driverId,
      path,
      previousPath: null,
      f1FreeSince: path === "f1_free_agent" ? Number(saveWorld.clock?.season) : null,
      otherMotorsportSince: null,
      lastF1Season: path === "f1_employed" ? Number(saveWorld.clock?.season) : null,
      updatedAt: date ?? null,
      updatedSeason: Number(saveWorld.clock?.season),
      reason: "career_start",
    };
    created += 1;
  }
  return { created, total: Object.keys(state.drivers).length };
}

export function markDriverF1FreeAgent(saveWorld, driverId, reason = "free_agent", date = saveWorld.clock?.date) {
  if (!driverId) return null;
  addFreeAgent(saveWorld, driverId);
  const career = saveWorld.world?.careerState?.drivers?.[driverId];
  if (career && career.status !== "retired") career.status = "available";
  return transition(saveWorld, driverId, "f1_free_agent", { reason, date });
}

export function markDriverF1Employed(saveWorld, driverId, reason = "contract", date = saveWorld.clock?.date) {
  if (!driverId) return null;
  removeFreeAgent(saveWorld, driverId);
  const row = transition(saveWorld, driverId, "f1_employed", { reason, date });
  row.lastF1Season = Number(saveWorld.clock?.season);
  return row;
}

export function markDriverRetired(saveWorld, driverId, date = saveWorld.clock?.date) {
  if (!driverId) return null;
  removeFreeAgent(saveWorld, driverId);
  return transition(saveWorld, driverId, "retired", { reason: "motorsport_retirement", date });
}

function leaveF1Probability(saveWorld, driverId, row, season) {
  const career = saveWorld.world?.careerState?.drivers?.[driverId] ?? {};
  const yearsFree = Math.max(0, season - Number(row.f1FreeSince ?? season));
  if (yearsFree < 3) return 0;
  if (yearsFree >= 7) return 1;
  const age = numeric(career.age);
  const reputation = normalized(career.reputation, 50);
  const ability = normalized(career.currentAbility, 50);
  let probability = 0.22 + (yearsFree - 3) * 0.14;
  if (reputation < 45) probability += 0.12;
  if (ability < 55) probability += 0.1;
  if (reputation >= 80) probability -= 0.16;
  if (ability >= 80) probability -= 0.1;
  if (age !== null && age >= 36) probability += 0.1;
  return clamp(probability, 0.05, 0.88);
}

function returnToF1Probability(saveWorld, driverId, season) {
  const career = saveWorld.world?.careerState?.drivers?.[driverId] ?? {};
  const age = numeric(career.age);
  if (age !== null && age >= 44) return 0;
  const ability = normalized(career.currentAbility, 50);
  const reputation = normalized(career.reputation, 50);
  const openDriverVacancies = (saveWorld.world?.employment?.vacancies ?? [])
    .filter((row) => row?.status === "open" && row?.type === "driver").length;
  let probability = 0.035 + ability * 0.0008 + reputation * 0.0006;
  if (openDriverVacancies > 0) probability += Math.min(0.07, openDriverVacancies * 0.012);
  if (age !== null && age >= 38) probability *= 0.55;
  return clamp(probability, 0.02, 0.22);
}

export function evolveDriverMarketSeason(saveWorld, seasonInput, date = saveWorld.clock?.date) {
  const season = Number(seasonInput ?? saveWorld.clock?.season);
  const state = ensureDriverMarketState(saveWorld);
  const employment = ensureEmploymentShape(saveWorld);
  const free = new Set(employment.freeAgents.drivers.map(String));
  const activeReplacementIds = new Set((ensureDriverAvailabilityState(saveWorld).replacements ?? [])
    .filter((row) => row?.status === "active")
    .map((row) => String(row.replacementDriverId)));
  const movedOut = [];
  const returned = [];

  for (const [driverId, row] of Object.entries(state.drivers).sort(([a], [b]) => a.localeCompare(b))) {
    const career = saveWorld.world?.careerState?.drivers?.[driverId] ?? {};
    const assignment = employment.drivers?.[driverId] ?? null;
    if (activeReplacementIds.has(String(driverId))) continue;
    if (career.status === "retired") {
      markDriverRetired(saveWorld, driverId, date);
      continue;
    }
    if (assignment?.status === "employed") {
      markDriverF1Employed(saveWorld, driverId, "season_sync", date);
      continue;
    }

    if (free.has(String(driverId))) {
      if (row.path !== "f1_free_agent") transition(saveWorld, driverId, "f1_free_agent", { reason: "season_sync", date, season });
      const current = state.drivers[driverId];
      const probability = leaveF1Probability(saveWorld, driverId, current, season);
      if (probability <= 0) continue;
      const rng = createRng(`${saveWorld.meta?.seed}|${season}|leave-f1-market|${driverId}`);
      if (rng.next() < probability) {
        removeFreeAgent(saveWorld, driverId);
        transition(saveWorld, driverId, "other_motorsport", { reason: "prolonged_without_f1_seat", date, season });
        if (career.status !== "retired") career.status = "other_motorsport";
        movedOut.push(driverId);
      }
      continue;
    }

    if (row.path !== "other_motorsport") continue;
    const probability = returnToF1Probability(saveWorld, driverId, season);
    const rng = createRng(`${saveWorld.meta?.seed}|${season}|return-f1-market|${driverId}`);
    if (rng.next() < probability) {
      addFreeAgent(saveWorld, driverId);
      transition(saveWorld, driverId, "f1_free_agent", { reason: "f1_market_return", date, season });
      if (career.status !== "retired") career.status = "available";
      returned.push(driverId);
    }
  }

  return { movedOut, returned };
}

function activeReplacementDriverIds(saveWorld) {
  return new Set((ensureDriverAvailabilityState(saveWorld).replacements ?? [])
    .filter((row) => row?.status === "active")
    .map((row) => String(row.replacementDriverId)));
}

function candidateScore(saveWorld, driverId, source, teamId) {
  const career = saveWorld.world?.careerState?.drivers?.[driverId] ?? {};
  const rating = driverRating(saveWorld, driverId);
  const ability = normalized(career.currentAbility ?? rating.current_ability, 50);
  const reputation = normalized(career.reputation ?? rating.reputation, 45);
  const adaptability = normalized(career.attributes?.adaptability ?? rating.adaptability, 50);
  const experience = normalized(rating.experience ?? rating.race_experience, 50);
  const market = ensureDriverMarketState(saveWorld).drivers[driverId] ?? {};
  const season = Number(saveWorld.clock?.season);
  const recentF1 = Number.isFinite(Number(market.lastF1Season))
    && season - Number(market.lastF1Season) <= 2 ? 5 : 0;
  const sourceBonus = source === "team_reserve" ? 14 : source === "f1_free_agent" ? 6 : 0;
  const familiarity = source === "team_reserve"
    && saveWorld.world?.employment?.drivers?.[driverId]?.teamId === teamId ? 7 : 0;
  return Number((ability * 0.5 + reputation * 0.18 + adaptability * 0.14 + experience * 0.1 + sourceBonus + familiarity + recentF1).toFixed(3));
}

export function replacementDriverCandidates(saveWorld, teamId, absentDriverId = null) {
  const employment = ensureEmploymentShape(saveWorld);
  const market = ensureDriverMarketState(saveWorld);
  const currentEntries = new Set((saveWorld.world?.raceEntryState?.current ?? []).map((row) => String(row.driverId)));
  const activeReplacements = activeReplacementDriverIds(saveWorld);
  const candidates = new Map();

  const add = (driverId, source) => {
    if (!driverId || String(driverId) === String(absentDriverId)) return;
    if (currentEntries.has(String(driverId)) || activeReplacements.has(String(driverId))) return;
    if (!isDriverRaceAvailable(saveWorld, driverId)) return;
    const career = saveWorld.world?.careerState?.drivers?.[driverId] ?? {};
    if (career.status === "retired") return;
    const age = numeric(career.age);
    if (age !== null && age < 18) return;
    const profile = driverProfile(saveWorld, driverId);
    if (!profile) return;
    const score = candidateScore(saveWorld, driverId, source, teamId);
    const previous = candidates.get(String(driverId));
    if (!previous || score > previous.score) {
      candidates.set(String(driverId), {
        driverId,
        name: profileName(profile, driverId),
        source,
        score,
        age,
        currentAbility: numeric(career.currentAbility),
        reputation: numeric(career.reputation),
        marketPath: market.drivers?.[driverId]?.path ?? null,
      });
    }
  };

  for (const [driverId, assignment] of Object.entries(employment.drivers ?? {})) {
    if (assignment?.status !== "employed" || String(assignment.teamId) !== String(teamId)) continue;
    if (raceRole(assignment.role)) continue;
    add(driverId, "team_reserve");
  }
  for (const driverId of employment.freeAgents.drivers ?? []) add(driverId, "f1_free_agent");
  for (const [driverId, row] of Object.entries(market.drivers ?? {})) {
    if (row?.path === "other_motorsport") add(driverId, "other_motorsport");
  }

  return [...candidates.values()].sort((a, b) => b.score - a.score || String(a.driverId).localeCompare(String(b.driverId)));
}

export function holdReplacementDriverFromMarket(saveWorld, driverId, teamId, source, date = saveWorld.clock?.date) {
  const state = ensureDriverMarketState(saveWorld);
  const previous = state.drivers[driverId]?.path ?? (source === "other_motorsport" ? "other_motorsport" : "f1_free_agent");
  if (source === "f1_free_agent") removeFreeAgent(saveWorld, driverId);
  transition(saveWorld, driverId, "temporary_replacement", { reason: "injury_replacement", date, keepFreeSince: true });
  state.drivers[driverId].temporaryTeamId = teamId;
  state.drivers[driverId].temporaryPreviousPath = previous;
  return previous;
}

export function releaseReplacementDriverToMarket(saveWorld, driverId, date = saveWorld.clock?.date) {
  const state = ensureDriverMarketState(saveWorld);
  const row = state.drivers[driverId];
  if (!row || row.path !== "temporary_replacement") return row ?? null;
  const employment = ensureEmploymentShape(saveWorld);
  if (employment.drivers?.[driverId]?.status === "employed") {
    delete row.temporaryTeamId;
    delete row.temporaryPreviousPath;
    return markDriverF1Employed(saveWorld, driverId, "replacement_ended_employed", date);
  }

  const restore = row.temporaryPreviousPath === "other_motorsport" ? "other_motorsport" : "f1_free_agent";
  delete row.temporaryTeamId;
  delete row.temporaryPreviousPath;
  if (restore === "f1_free_agent") addFreeAgent(saveWorld, driverId);
  else removeFreeAgent(saveWorld, driverId);
  return transition(saveWorld, driverId, restore, { reason: "replacement_ended", date, keepFreeSince: restore === "f1_free_agent" });
}

export function driverMarketProjection(saveWorld, driverId) {
  const row = ensureDriverMarketState(saveWorld).drivers?.[driverId] ?? null;
  return row ? structuredClone(row) : null;
}
