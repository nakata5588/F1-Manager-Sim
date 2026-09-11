import { SIM_EVENT } from "../timeEngine.js";
import { createRng } from "../random.js";
import { CONTRACT_NEGOTIATION_EVENT, ensureContractNegotiationState } from "../../game/management/contracts.js";
import { ensurePersonState } from "../../game/management/people.js";
import { chooseRivalTeam, createExternalDriverOffer, listOpenExternalOffers } from "../../game/management/market.js";
import { EMPLOYMENT_EVENT } from "./employmentMarket.js";
import { controlledTeamSet } from "./controlState.js";

export const MARKET_EVENT = Object.freeze({
  RIVAL_OFFER_CREATED: "market.rival_offer_created",
  PLAYER_DRIVER_TARGETED: "market.player_driver_targeted",
  EXTERNAL_OFFER_ACCEPTED: "market.external_offer_accepted",
  EXTERNAL_OFFER_EXPIRED: "market.external_offer_expired",
  COMPETING_OFFERS_CLOSED: "market.competing_offers_closed",
});

function numeric(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function clamp(value, minimum = 0, maximum = 1) { return Math.min(maximum, Math.max(minimum, value)); }
function dateValue(value) { const parsed = Date.parse(`${String(value ?? "").slice(0, 10)}T00:00:00Z`); return Number.isFinite(parsed) ? parsed : null; }
function dueOnOrBefore(expiresAt, eventDate) { const expiry = dateValue(expiresAt); const current = dateValue(eventDate); if (expiry === null || current === null) return String(expiresAt ?? "") <= String(eventDate ?? ""); return expiry <= current; }

function driverMetrics(saveWorld, driverId) {
  const state = saveWorld.world?.careerState?.drivers?.[driverId] ?? {};
  const profile = (saveWorld.world?.drivers ?? []).find((row) => String(row.driver_id ?? row.id) === String(driverId)) ?? {};
  const rating = (saveWorld.world?.driverRatings ?? []).find((row) => String(row.driver_id) === String(driverId)) ?? {};
  return { ability: numeric(state.currentAbility ?? rating.current_ability ?? profile.current_ability, 50), potential: numeric(state.potentialAbility ?? rating.potential_ability ?? profile.potential_ability, 50), reputation: numeric(state.reputation ?? rating.reputation ?? profile.reputation, 50) };
}

function futureAssignments(saveWorld, driverId) { return saveWorld.world?.employment?.futureAssignments?.drivers?.[driverId] ?? []; }
function hasFutureAssignment(saveWorld, driverId) { return futureAssignments(saveWorld, driverId).length > 0; }

function maybeCreateCompetingOffer(saveWorld, event, options = {}) {
  const negotiationId = event.payload?.negotiation_id ?? null;
  if (!negotiationId) return null;
  const negotiation = ensureContractNegotiationState(saveWorld).negotiations.find((row) => row.id === negotiationId);
  if (!negotiation || negotiation.workerType !== "driver" || negotiation.status === "accepted" || hasFutureAssignment(saveWorld, negotiation.driverId)) return null;
  if (listOpenExternalOffers(saveWorld, { driverId: negotiation.driverId }).some((row) => row.relatedNegotiationId === negotiationId)) return null;
  const person = ensurePersonState(saveWorld, "driver", negotiation.driverId);
  const metrics = driverMetrics(saveWorld, negotiation.driverId);
  const ambition = numeric(person.personality?.traits?.ambition, 50);
  const chance = clamp(numeric(options.competingOfferBaseChance, 0.12) + Math.max(0, metrics.reputation - 45) / 130 + Math.max(0, metrics.ability - 60) / 180 + Math.max(0, ambition - 50) / 400, 0, 0.78);
  const rng = createRng(`${saveWorld.meta?.seed}|competing-offer|${negotiationId}|${negotiation.offers.length}|${event.date}`);
  if (rng.next() > chance) return null;
  const rivalTeamId = chooseRivalTeam(saveWorld, negotiation.driverId, { excludeTeamId: negotiation.teamId, reason: `competing:${negotiationId}` });
  if (!rivalTeamId) return null;
  const offer = createExternalDriverOffer(saveWorld, { driverId: negotiation.driverId, teamId: rivalTeamId, source: "competing_offer", negotiationId, startSeason: negotiation.startSeason, role: negotiation.expectedTerms?.role ?? "driver", salaryIndex: Math.round((negotiation.expectedTerms?.salaryIndex ?? 65) * (1.02 + rng.next() * 0.08)), windowDays: 7 });
  return { type: MARKET_EVENT.RIVAL_OFFER_CREATED, payload: { external_offer_id: offer.id, driver_id: negotiation.driverId, driver_name: negotiation.driverName, team_id: rivalTeamId, related_negotiation_id: negotiationId, expires_at: offer.expiresAt } };
}

function monthlyPlayerDriverApproaches(saveWorld, event, controlled, options = {}) {
  const output = [];
  const currentSeason = Number(saveWorld.clock?.season);
  for (const [driverId, current] of Object.entries(saveWorld.world?.employment?.drivers ?? {})) {
    if (!current?.teamId || !controlled.has(String(current.teamId)) || hasFutureAssignment(saveWorld, driverId)) continue;
    const contractUntil = Number(current.contractUntil);
    if (!Number.isInteger(contractUntil) || contractUntil > currentSeason + 1 || listOpenExternalOffers(saveWorld, { driverId }).length) continue;
    const person = ensurePersonState(saveWorld, "driver", driverId);
    const metrics = driverMetrics(saveWorld, driverId);
    const mentality = person.mentality ?? {};
    const ambition = numeric(person.personality?.traits?.ambition, 50);
    const loyalty = numeric(person.personality?.traits?.loyalty, 50);
    const openness = numeric(mentality.transferOpenness, 45);
    const chance = clamp(numeric(options.poachingBaseChance, 0.08) + Math.max(0, metrics.reputation - 50) / 160 + Math.max(0, metrics.ability - 65) / 220 + Math.max(0, ambition - loyalty) / 500 + Math.max(0, openness - 50) / 350, 0, 0.65);
    const rng = createRng(`${saveWorld.meta?.seed}|poaching|${driverId}|${event.date}`);
    if (rng.next() > chance) continue;
    const rivalTeamId = chooseRivalTeam(saveWorld, driverId, { reason: "player-driver-poaching", excludeTeamIds: [...controlled] });
    if (!rivalTeamId) continue;
    const offer = createExternalDriverOffer(saveWorld, { driverId, teamId: rivalTeamId, source: "ai_poaching", startSeason: contractUntil + 1, salaryIndex: Math.round(45 + metrics.ability * 0.32 + metrics.reputation * 0.28), windowDays: 12 });
    output.push({ type: MARKET_EVENT.PLAYER_DRIVER_TARGETED, payload: { external_offer_id: offer.id, driver_id: driverId, team_id: rivalTeamId, current_team_id: current.teamId, start_season: offer.startSeason, expires_at: offer.expiresAt } });
  }
  return output;
}

function closeOtherOffers(saveWorld, driverId, winningOfferId, date, reason = "agreement_reached") {
  const closed = [];
  for (const row of saveWorld.world?.management?.people?.market?.externalOffers ?? []) {
    if (row.status !== "open" || String(row.workerId) !== String(driverId) || row.id === winningOfferId) continue;
    row.status = "closed"; row.closedAt = date; row.closedReason = reason; closed.push(row.id);
  }
  return closed;
}

function resolveExternalOffers(saveWorld, event) {
  const output = [];
  for (const row of saveWorld.world?.management?.people?.market?.externalOffers ?? []) {
    if (row.status !== "open" || !row.expiresAt || !dueOnOrBefore(row.expiresAt, event.date)) continue;
    const existingFuture = futureAssignments(saveWorld, row.workerId);
    if (existingFuture.length) {
      row.status = "closed"; row.closedAt = event.date; row.closedReason = "driver_already_committed";
      output.push({ type: MARKET_EVENT.EXTERNAL_OFFER_EXPIRED, payload: { external_offer_id: row.id, driver_id: row.workerId, team_id: row.teamId, reason: "driver_already_committed" } });
      continue;
    }
    const person = ensurePersonState(saveWorld, "driver", row.workerId);
    const interest = numeric(row.interest?.score, 50);
    const ambition = numeric(person.personality?.traits?.ambition, 50);
    const loyalty = numeric(person.personality?.traits?.loyalty, 50);
    const rng = createRng(`${saveWorld.meta?.seed}|external-resolution|${row.id}|${event.date}`);
    const acceptance = interest + (ambition - loyalty) * 0.08 + (rng.next() - 0.5) * 8;
    if (acceptance >= 58) {
      row.status = "accepted"; row.closedAt = event.date;
      const closed = closeOtherOffers(saveWorld, row.workerId, row.id, event.date);
      output.push({ type: MARKET_EVENT.EXTERNAL_OFFER_ACCEPTED, payload: { external_offer_id: row.id, driver_id: row.workerId, team_id: row.teamId, start_season: row.startSeason, related_negotiation_id: row.relatedNegotiationId ?? null } });
      if (closed.length) output.push({ type: MARKET_EVENT.COMPETING_OFFERS_CLOSED, payload: { driver_id: row.workerId, winning_offer_id: row.id, closed_offer_ids: closed } });
      if (row.relatedNegotiationId) {
        const negotiation = ensureContractNegotiationState(saveWorld).negotiations.find((item) => item.id === row.relatedNegotiationId);
        if (negotiation && ["open", "countered"].includes(negotiation.status)) {
          negotiation.status = "lost_to_rival"; negotiation.closedAt = event.date; negotiation.lostToTeamId = row.teamId;
          output.push({ type: CONTRACT_NEGOTIATION_EVENT.LOST_TO_RIVAL, payload: { negotiation_id: negotiation.id, driver_id: negotiation.driverId, driver_name: negotiation.driverName, team_id: negotiation.teamId, rival_team_id: row.teamId, external_offer_id: row.id } });
        }
      }
      output.push({ type: EMPLOYMENT_EVENT.CONTRACT_SIGNED, payload: { worker_type: "driver", worker_id: row.workerId, team_id: row.teamId, role: row.terms?.role ?? "driver", contract_start: row.startSeason, contract_until: row.startSeason + Math.max(1, Number(row.terms?.lengthYears ?? 2)) - 1, salary_index: row.terms?.salaryIndex ?? null, external_offer_id: row.id, decision: "ai_poaching" } });
    } else {
      row.status = "expired"; row.closedAt = event.date;
      output.push({ type: MARKET_EVENT.EXTERNAL_OFFER_EXPIRED, payload: { external_offer_id: row.id, driver_id: row.workerId, team_id: row.teamId, related_negotiation_id: row.relatedNegotiationId ?? null, reason: "not_accepted" } });
    }
  }
  return output;
}

function closeOffersAfterSigning(saveWorld, event) {
  if (String(event.payload?.worker_type ?? "driver").toLowerCase() !== "driver") return null;
  const driverId = event.payload?.worker_id ?? null;
  if (!driverId) return null;
  const winningOfferId = event.payload?.external_offer_id ?? null;
  const closed = closeOtherOffers(saveWorld, driverId, winningOfferId, event.date, "driver_committed_elsewhere");
  return closed.length ? { type: MARKET_EVENT.COMPETING_OFFERS_CLOSED, payload: { driver_id: driverId, winning_offer_id: winningOfferId, closed_offer_ids: closed } } : null;
}

export function createMarketDynamicsSystem(options = {}) {
  const configured = [...(options.controlledTeamIds ?? [])];
  return {
    id: "market.dynamics",
    eventTypes: [SIM_EVENT.MONTH_STARTED, SIM_EVENT.DAY_ADVANCED, CONTRACT_NEGOTIATION_EVENT.OFFER_SUBMITTED, EMPLOYMENT_EVENT.CONTRACT_SIGNED],
    handle({ saveWorld, event }) {
      if (event.type === CONTRACT_NEGOTIATION_EVENT.OFFER_SUBMITTED) return maybeCreateCompetingOffer(saveWorld, event, options);
      if (event.type === EMPLOYMENT_EVENT.CONTRACT_SIGNED) return closeOffersAfterSigning(saveWorld, event);
      if (event.type === SIM_EVENT.MONTH_STARTED) return [...monthlyPlayerDriverApproaches(saveWorld, event, controlledTeamSet(saveWorld, configured), options), ...resolveExternalOffers(saveWorld, event)];
      return resolveExternalOffers(saveWorld, event);
    },
  };
}
