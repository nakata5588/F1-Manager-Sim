import { createRng } from "../../sim/random.js";
import {
  activeCompetingOffers,
  ensurePeopleState,
  evaluateDriverTransferInterest,
  personProfile,
} from "./people.js";

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function addDays(dateText, days) {
  const date = new Date(`${String(dateText ?? "").slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) return String(dateText ?? "").slice(0, 10);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function assignment(saveWorld, driverId) {
  return saveWorld.world?.employment?.drivers?.[driverId] ?? null;
}

function abilityReputation(saveWorld, driverId) {
  const state = saveWorld.world?.careerState?.drivers?.[driverId] ?? {};
  const profile = personProfile(saveWorld, "driver", driverId) ?? {};
  const rating = (saveWorld.world?.driverRatings ?? []).find((row) => String(row.driver_id) === String(driverId)) ?? {};
  return {
    ability: clamp(numeric(state.currentAbility ?? rating.current_ability ?? profile.current_ability, 50)),
    potential: clamp(numeric(state.potentialAbility ?? rating.potential_ability ?? profile.potential_ability, 50)),
    reputation: clamp(numeric(state.reputation ?? rating.reputation ?? profile.reputation, 50)),
  };
}

function teamReputation(saveWorld, teamId) {
  const team = (saveWorld.world?.teams ?? []).find((row) => String(row.team_id ?? row.id) === String(teamId)) ?? {};
  const raw = Number(team.reputation ?? team.prestige ?? team.team_reputation ?? team.constructor_reputation);
  if (Number.isFinite(raw)) return clamp(raw <= 10 ? raw * 10 : raw);
  return 50;
}

export function listOpenExternalOffers(saveWorld, options = {}) {
  let rows = ensurePeopleState(saveWorld).market.externalOffers.filter((row) => row.status === "open");
  if (options.driverId) rows = rows.filter((row) => String(row.workerId) === String(options.driverId));
  if (options.teamId) rows = rows.filter((row) => String(row.teamId) === String(options.teamId));
  if (options.source) rows = rows.filter((row) => row.source === options.source);
  return structuredClone(rows);
}

export function chooseRivalTeam(saveWorld, driverId, options = {}) {
  const excluded = new Set([
    assignment(saveWorld, driverId)?.teamId,
    options.excludeTeamId,
    ...(options.excludeTeamIds ?? []),
  ].filter(Boolean).map(String));
  const targetRep = abilityReputation(saveWorld, driverId).reputation;
  const rows = (saveWorld.world?.teams ?? [])
    .map((row) => ({ id: row.team_id ?? row.id, reputation: teamReputation(saveWorld, row.team_id ?? row.id) }))
    .filter((row) => row.id && !excluded.has(String(row.id)))
    .sort((a, b) => Math.abs(a.reputation - targetRep) - Math.abs(b.reputation - targetRep) || b.reputation - a.reputation || String(a.id).localeCompare(String(b.id)));
  if (!rows.length) return null;
  const rng = createRng(`${saveWorld.meta?.seed}|market-rival|${driverId}|${saveWorld.clock?.date}|${options.reason ?? "market"}`);
  const pool = rows.slice(0, Math.min(4, rows.length));
  return pool[Math.floor(rng.next() * pool.length)]?.id ?? pool[0]?.id ?? null;
}

export function createExternalDriverOffer(saveWorld, input = {}) {
  const driverId = String(input.driverId ?? input.driver_id ?? "").trim();
  const teamId = String(input.teamId ?? input.team_id ?? "").trim();
  if (!driverId || !teamId) throw new Error("driverId and teamId are required for an external offer.");
  if (!personProfile(saveWorld, "driver", driverId)) throw new Error(`Driver '${driverId}' does not exist.`);
  const state = ensurePeopleState(saveWorld).market;
  const duplicate = state.externalOffers.find((row) => row.status === "open" && String(row.workerId) === driverId && String(row.teamId) === teamId);
  if (duplicate) return structuredClone(duplicate);
  const metrics = abilityReputation(saveWorld, driverId);
  const interest = evaluateDriverTransferInterest(saveWorld, driverId, teamId, { role: input.role ?? "driver" });
  const serial = state.nextOfferId++;
  const current = assignment(saveWorld, driverId);
  const currentSeason = Number(saveWorld.clock?.season);
  const defaultStart = current?.contractUntil !== null && current?.contractUntil !== undefined
    ? Math.max(currentSeason, Number(current.contractUntil) + 1)
    : currentSeason;
  const startSeason = Math.max(currentSeason, Math.round(numeric(input.startSeason ?? input.start_season, defaultStart)));
  const salaryIndex = Math.round(clamp(
    numeric(input.salaryIndex ?? input.salary_index, 35 + metrics.ability * 0.35 + metrics.reputation * 0.28 + metrics.potential * 0.12),
    20,
    120,
  ));
  const windowDays = Math.max(1, Math.round(numeric(input.windowDays, 10)));
  const row = {
    id: `external-offer:${String(serial).padStart(6, "0")}`,
    workerType: "driver",
    workerId: driverId,
    teamId,
    source: input.source ?? "ai_market",
    relatedNegotiationId: input.negotiationId ?? input.negotiation_id ?? null,
    status: "open",
    createdAt: saveWorld.clock?.date ?? null,
    expiresAt: addDays(saveWorld.clock?.date, windowDays),
    startSeason,
    terms: {
      compensationMode: "abstract_index",
      salaryIndex,
      lengthYears: Math.max(1, Math.round(numeric(input.lengthYears ?? input.length_years, metrics.potential > metrics.ability + 8 ? 3 : 2))),
      role: input.role ?? "driver",
    },
    interest,
  };
  state.externalOffers.push(row);
  return structuredClone(row);
}

export function expireExternalOffers(saveWorld, date = saveWorld.clock?.date) {
  const expired = [];
  for (const row of ensurePeopleState(saveWorld).market.externalOffers) {
    if (row.status !== "open" || !row.expiresAt || row.expiresAt > date) continue;
    row.status = "expired";
    row.closedAt = date;
    expired.push(structuredClone(row));
  }
  return expired;
}

export function marketPressureForDriver(saveWorld, driverId, targetTeamId = null) {
  const offers = activeCompetingOffers(saveWorld, "driver", driverId, { excludeTeamId: targetTeamId });
  return {
    competingOffers: offers.length,
    pressure: Number(clamp(offers.length * 12, 0, 48).toFixed(2)),
    teams: offers.map((row) => row.teamId),
  };
}

export function marketSummary(saveWorld) {
  const rows = ensurePeopleState(saveWorld).market.externalOffers;
  return {
    openOffers: rows.filter((row) => row.status === "open").length,
    expiredOffers: rows.filter((row) => row.status === "expired").length,
  };
}
