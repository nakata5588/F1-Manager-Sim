import { SIM_EVENT } from "../timeEngine.js";
import { createRng } from "../random.js";
import { CONTRACT_NEGOTIATION_EVENT, ensureContractNegotiationState } from "../../game/management/contracts.js";
import { ensurePersonState } from "../../game/management/people.js";
import {
  chooseRivalTeam,
  createExternalDriverOffer,
  listOpenExternalOffers,
} from "../../game/management/market.js";
import { EMPLOYMENT_EVENT } from "./employmentMarket.js";

export const MARKET_EVENT = Object.freeze({
  RIVAL_OFFER_CREATED: "market.rival_offer_created",
  PLAYER_DRIVER_TARGETED: "market.player_driver_targeted",
  EXTERNAL_OFFER_ACCEPTED: "market.external_offer_accepted",
  EXTERNAL_OFFER_EXPIRED: "market.external_offer_expired",
});

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function controlledTeams(saveWorld, configured) {
  return new Set((configured.length ? configured : saveWorld.player?.controlledTeamIds ?? []).map(String));
}

function driverMetrics(saveWorld, driverId) {
  const state = saveWorld.world?.careerState?.drivers?.[driverId] ?? {};
  const profile = (saveWorld.world?.drivers ?? []).find((row) => String(row.driver_id ?? row.id) === String(driverId)) ?? {};
  const rating = (saveWorld.world?.driverRatings ?? []).find((row) => String(row.driver_id) === String(driverId)) ?? {};
  return {
    ability: numeric(state.currentAbility ?? rating.current_ability ?? profile.current_ability, 50),
    potential: numeric(state.potentialAbility ?? rating.potential_ability ?? profile.potential_ability, 50),
    reputation: numeric(state.reputation ?? rating.reputation ?? profile.reputation, 50),
  };
}

function hasFutureAssignment(saveWorld, driverId) {
  return (saveWorld.world?.employment?.futureAssignments?.drivers?.[driverId] ?? []).length > 0;
}

function maybeCreateCompetingOffer(saveWorld, event, options = {}) {
  const negotiationId = event.payload?.negotiation_id ?? null;
  if (!negotiationId) return null;
  const negotiation = ensureContractNegotiationState(saveWorld).negotiations.find((row) => row.id === negotiationId);
  if (!negotiation || negotiation.workerType !== "driver" || negotiation.status === "accepted") return null;
  if (listOpenExternalOffers(saveWorld, { driverId: negotiation.driverId }).some((row) => row.relatedNegotiationId === negotiationId)) return null;

  const person = ensurePersonState(saveWorld, "driver", negotiation.driverId);
  const metrics = driverMetrics(saveWorld, negotiation.driverId);
  const ambition = numeric(person.personality?.traits?.ambition, 50);
  const chance = clamp(
    numeric(options.competingOfferBaseChance, 0.12)
      + Math.max(0, metrics.reputation - 45) / 130
      + Math.max(0, metrics.ability - 60) / 180
      + Math.max(0, ambition - 50) / 400,
    0,
    0.78,
  );
  const rng = createRng(`${saveWorld.meta?.seed}|competing-offer|${negotiationId}|${negotiation.offers.length}|${event.date}`);
  if (rng.next() > chance) return null;
  const rivalTeamId = chooseRivalTeam(saveWorld, negotiation.driverId, {
    excludeTeamId: negotiation.teamId,
    reason: `competing:${negotiationId}`,
  });
  if (!rivalTeamId) return null;
  const offer = createExternalDriverOffer(saveWorld, {
    driverId: negotiation.driverId,
    teamId: rivalTeamId,
    source: "competing_offer",
    negotiationId,
    startSeason: negotiation.startSeason,
    role: negotiation.expectedTerms?.role ?? "driver",
    salaryIndex: Math.round((negotiation.expectedTerms?.salaryIndex ?? 65) * (1.02 + rng.next() * 0.08)),
    windowDays: 7,
  });
  return {
    type: MARKET_EVENT.RIVAL_OFFER_CREATED,
    payload: {
      external_offer_id: offer.id,
      driver_id: negotiation.driverId,
      driver_name: negotiation.driverName,
      team_id: rivalTeamId,
      related_negotiation_id: negotiationId,
      expires_at: offer.expiresAt,
    },
  };
}

function monthlyPlayerDriverApproaches(saveWorld, event, controlled, options = {}) {
  const output = [];
  const currentSeason = Number(saveWorld.clock?.season);
  const assignments = saveWorld.world?.employment?.drivers ?? {};
  for (const [driverId, current] of Object.entries(assignments)) {
    if (!current?.teamId || !controlled.has(String(current.teamId))) continue;
    if (hasFutureAssignment(saveWorld, driverId)) continue;
    const contractUntil = Number(current.contractUntil);
    if (!Number.isInteger(contractUntil) || contractUntil > currentSeason + 1) continue;
    if (listOpenExternalOffers(saveWorld, { driverId }).length) continue;

    const person = ensurePersonState(saveWorld, "driver", driverId);
    const metrics = driverMetrics(saveWorld, driverId);
    const mentality = person.mentality ?? {};
    const ambition = numeric(person.personality?.traits?.ambition, 50);
    const loyalty = numeric(person.personality?.traits?.loyalty, 50);
    const openness = numeric(mentality.transferOpenness, 45);
    const chance = clamp(
      numeric(options.poachingBaseChance, 0.08)
        + Math.max(0, metrics.reputation - 50) / 160
        + Math.max(0, metrics.ability - 65) / 220
        + Math.max(0, ambition - loyalty) / 500
        + Math.max(0, openness - 50) / 350,
      0,
      0.65,
    );
    const rng = createRng(`${saveWorld.meta?.seed}|poaching|${driverId}|${event.date}`);
    if (rng.next() > chance) continue;
    const rivalTeamId = chooseRivalTeam(saveWorld, driverId, { reason: "player-driver-poaching", excludeTeamIds: [...controlled] });
    if (!rivalTeamId) continue;
    const offer = createExternalDriverOffer(saveWorld, {
      driverId,
      teamId: rivalTeamId,
      source: "ai_poaching",
      startSeason: contractUntil + 1,
      salaryIndex: Math.round(45 + metrics.ability * 0.32 + metrics.reputation * 0.28),
      windowDays: 12,
    });
    output.push({
      type: MARKET_EVENT.PLAYER_DRIVER_TARGETED,
      payload: {
        external_offer_id: offer.id,
        driver_id: driverId,
        team_id: rivalTeamId,
        current_team_id: current.teamId,
        start_season: offer.startSeason,
        expires_at: offer.expiresAt,
      },
    });
  }
  return output;
}

function resolveExternalOffers(saveWorld, event) {
  const output = [];
  const rows = saveWorld.world?.management?.people?.market?.externalOffers ?? [];
  for (const row of rows) {
    if (row.status !== "open" || !row.expiresAt || row.expiresAt > event.date) continue;
    const person = ensurePersonState(saveWorld, "driver", row.workerId);
    const interest = numeric(row.interest?.score, 50);
    const ambition = numeric(person.personality?.traits?.ambition, 50);
    const loyalty = numeric(person.personality?.traits?.loyalty, 50);
    const rng = createRng(`${saveWorld.meta?.seed}|external-resolution|${row.id}|${event.date}`);
    const acceptance = interest + (ambition - loyalty) * 0.08 + (rng.next() - 0.5) * 8;
    if (acceptance >= 58) {
      row.status = "accepted";
      row.closedAt = event.date;
      output.push({
        type: MARKET_EVENT.EXTERNAL_OFFER_ACCEPTED,
        payload: {
          external_offer_id: row.id,
          driver_id: row.workerId,
          team_id: row.teamId,
          start_season: row.startSeason,
        },
      });
      output.push({
        type: EMPLOYMENT_EVENT.CONTRACT_SIGNED,
        payload: {
          worker_type: "driver",
          worker_id: row.workerId,
          team_id: row.teamId,
          role: row.terms?.role ?? "driver",
          contract_start: row.startSeason,
          contract_until: row.startSeason + Math.max(1, Number(row.terms?.lengthYears ?? 2)) - 1,
          salary_index: row.terms?.salaryIndex ?? null,
          external_offer_id: row.id,
          decision: "ai_poaching",
        },
      });
    } else {
      row.status = "expired";
      row.closedAt = event.date;
      output.push({
        type: MARKET_EVENT.EXTERNAL_OFFER_EXPIRED,
        payload: {
          external_offer_id: row.id,
          driver_id: row.workerId,
          team_id: row.teamId,
        },
      });
    }
  }
  return output;
}

export function createMarketDynamicsSystem(options = {}) {
  const configured = [...(options.controlledTeamIds ?? [])];
  return {
    id: "market.dynamics",
    eventTypes: [SIM_EVENT.MONTH_STARTED, SIM_EVENT.DAY_ADVANCED, CONTRACT_NEGOTIATION_EVENT.OFFER_SUBMITTED],
    handle({ saveWorld, event }) {
      if (event.type === CONTRACT_NEGOTIATION_EVENT.OFFER_SUBMITTED) {
        return maybeCreateCompetingOffer(saveWorld, event, options);
      }
      if (event.type === SIM_EVENT.MONTH_STARTED) {
        return monthlyPlayerDriverApproaches(saveWorld, event, controlledTeams(saveWorld, configured), options);
      }
      return resolveExternalOffers(saveWorld, event);
    },
  };
}
