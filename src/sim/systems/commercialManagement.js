import { SIM_EVENT } from "../timeEngine.js";
import { RACE_EVENT } from "./raceWeekend.js";
import { controlledTeamSet } from "./controlState.js";
import { responsibilityOwner } from "../../game/management/responsibilities.js";
import {
  acceptSponsorCounterEvent,
  activateSponsorDeal,
  COMMERCIAL_EVENT,
  commercialProjection,
  createSponsorActivity,
  ensureCommercialState,
  expireCommercialDeals,
  initializeCommercialWorld,
  listSponsorMarket,
  openSponsorNegotiation,
  raceCommercialConsequences,
  resolveSponsorActivity,
  submitSponsorOfferEvent,
  updateCommercialMarketability,
} from "../../game/management/commercial.js";
import { createRng } from "../random.js";

function monthOf(date) {
  return Number(String(date ?? "").slice(5, 7));
}

function playerManagesCommercial(saveWorld, teamId, configured = []) {
  const controlled = controlledTeamSet(saveWorld, configured);
  return controlled.has(String(teamId)) && responsibilityOwner(saveWorld, String(teamId), "commercial") === "manager";
}

function aiManagesCommercial(saveWorld, teamId, configured = []) {
  const controlled = controlledTeamSet(saveWorld, configured);
  return !controlled.has(String(teamId)) || responsibilityOwner(saveWorld, String(teamId), "commercial") === "delegated";
}

function teamIds(saveWorld) {
  return (saveWorld.world?.teams ?? [])
    .map((row) => row.team_id ?? row.id ?? null)
    .filter(Boolean)
    .map(String)
    .sort();
}

function refreshCommercialWorld(saveWorld, event, configured) {
  const output = [];
  for (const teamId of teamIds(saveWorld)) {
    const update = updateCommercialMarketability(saveWorld, teamId, event.date);
    if (controlledTeamSet(saveWorld, configured).has(teamId) && Math.abs(update.delta) >= 0.01) {
      output.push({
        type: COMMERCIAL_EVENT.MARKETABILITY_UPDATED,
        payload: { team_id: teamId, marketability: update.marketability, delta: update.delta },
      });
    }
  }
  for (const deal of expireCommercialDeals(saveWorld, event.date)) {
    output.push({
      type: COMMERCIAL_EVENT.DEAL_EXPIRED,
      payload: { deal_id: deal.id, team_id: deal.teamId, sponsor_id: deal.sponsorId, sponsor_name: deal.sponsorName },
    });
  }
  return output;
}

function negotiationExpiryEvents(saveWorld, event) {
  const output = [];
  for (const negotiation of ensureCommercialState(saveWorld).negotiations) {
    if (!["open", "countered"].includes(negotiation.status)) continue;
    if (!negotiation.expiresAt || negotiation.expiresAt >= event.date) continue;
    negotiation.status = "expired";
    negotiation.closedAt = event.date;
    output.push({
      type: COMMERCIAL_EVENT.NEGOTIATION_REJECTED,
      payload: {
        negotiation_id: negotiation.id,
        team_id: negotiation.teamId,
        sponsor_id: negotiation.sponsorId,
        sponsor_name: negotiation.sponsorName,
        reason: "expired",
      },
    });
  }
  return output;
}

function renewalEvents(saveWorld, event, configured) {
  if (monthOf(event.date) < 7) return [];
  const season = Number(saveWorld.clock?.season);
  const output = [];
  for (const teamId of teamIds(saveWorld)) {
    if (!playerManagesCommercial(saveWorld, teamId, configured)) continue;
    const projection = commercialProjection(saveWorld, teamId);
    for (const deal of projection.activeDeals) {
      if (deal.endSeason !== season || deal.renewalReminderSeason === season) continue;
      const live = ensureCommercialState(saveWorld).teams[teamId].activeDeals.find((row) => row.id === deal.id);
      live.renewalReminderSeason = season;
      output.push({
        type: COMMERCIAL_EVENT.RENEWAL_DUE,
        payload: {
          team_id: teamId,
          deal_id: deal.id,
          sponsor_id: deal.sponsorId,
          sponsor_name: deal.sponsorName,
          tier: deal.tier,
          satisfaction: deal.satisfaction,
        },
      });
    }
  }
  return output;
}

function activityEvents(saveWorld, event, configured) {
  if (![3, 6, 9, 11].includes(monthOf(event.date))) return [];
  const output = [];
  const state = ensureCommercialState(saveWorld);
  for (const [teamId, team] of Object.entries(state.teams)) {
    for (const deal of team.activeDeals ?? []) {
      if (deal.status !== "active" || deal.activationCommitment <= deal.activationsCompleted) continue;
      const activity = createSponsorActivity(saveWorld, deal.id, event.date);
      if (!activity || activity.status !== "pending") continue;
      if (playerManagesCommercial(saveWorld, teamId, configured)) {
        output.push({
          type: COMMERCIAL_EVENT.ACTIVITY_DUE,
          payload: {
            activity_id: activity.id,
            deal_id: deal.id,
            team_id: teamId,
            sponsor_id: deal.sponsorId,
            sponsor_name: deal.sponsorName,
            tier: deal.tier,
          },
        });
        continue;
      }
      const rng = createRng(`${saveWorld.meta?.seed}|sponsor-activity|${activity.id}|${event.date}`);
      const fulfilled = rng.next() <= 0.82;
      const result = resolveSponsorActivity(saveWorld, activity.id, fulfilled, event.date);
      output.push({
        type: COMMERCIAL_EVENT.ACTIVITY_RESOLVED,
        payload: {
          activity_id: activity.id,
          deal_id: deal.id,
          team_id: teamId,
          sponsor_id: deal.sponsorId,
          sponsor_name: deal.sponsorName,
          fulfilled,
          satisfaction: result.deal.satisfaction,
          source: "delegated_or_ai",
        },
      });
    }
  }
  return output;
}

function nextNeededTier(projection) {
  if (projection.slotUsage.title.used < projection.slotUsage.title.capacity) return "title";
  if (projection.slotUsage.major.used < projection.slotUsage.major.capacity) return "major";
  if (projection.slotUsage.partner.used < projection.slotUsage.partner.capacity) return "partner";
  return null;
}

function aiCommercialDeals(saveWorld, event, configured) {
  const output = [];
  for (const teamId of teamIds(saveWorld)) {
    if (!aiManagesCommercial(saveWorld, teamId, configured)) continue;
    const projection = commercialProjection(saveWorld, teamId);
    const tier = nextNeededTier(projection);
    if (!tier) continue;
    const candidates = listSponsorMarket(saveWorld, teamId, { tier })
      .filter((row) => !row.categoryConflict && row.interest.score >= 46)
      .slice(0, 4);
    if (!candidates.length) continue;
    const rng = createRng(`${saveWorld.meta?.seed}|ai-commercial|${teamId}|${event.date}|${tier}`);
    const candidate = candidates[Math.floor(rng.next() * candidates.length)] ?? candidates[0];
    try {
      const negotiation = openSponsorNegotiation(saveWorld, { teamId, sponsorId: candidate.id, tier });
      const result = submitSponsorOfferEvent(saveWorld, negotiation.id, negotiation.expectedTerms);
      if (result.type === COMMERCIAL_EVENT.NEGOTIATION_COUNTERED) acceptSponsorCounterEvent(saveWorld, negotiation.id);
      const current = ensureCommercialState(saveWorld).negotiations.find((row) => row.id === negotiation.id);
      if (current?.status !== "accepted") continue;
      const deal = activateSponsorDeal(saveWorld, negotiation.id, { source: "ai_commercial", date: event.date });
      output.push({
        type: COMMERCIAL_EVENT.DEAL_SIGNED,
        payload: {
          deal_id: deal.id,
          negotiation_id: negotiation.id,
          team_id: teamId,
          sponsor_id: deal.sponsorId,
          sponsor_name: deal.sponsorName,
          tier: deal.tier,
          annual_value: deal.annualValue,
          source: "ai_commercial",
        },
      });
    } catch {
      // An unsuccessful AI commercial approach is a normal market outcome.
    }
  }
  return output;
}

function raceEvents(saveWorld, event) {
  const output = [];
  for (const result of raceCommercialConsequences(saveWorld, event.payload?.classification ?? [], event.date)) {
    output.push({
      type: COMMERCIAL_EVENT.SATISFACTION_CHANGED,
      payload: {
        deal_id: result.dealId,
        team_id: result.teamId,
        sponsor_id: result.sponsorId,
        satisfaction: result.satisfaction,
        target_met: result.targetMet,
      },
    });
    if (result.bonus > 0) {
      output.push({
        type: COMMERCIAL_EVENT.BONUS_PAID,
        payload: { deal_id: result.dealId, team_id: result.teamId, sponsor_id: result.sponsorId, amount: result.bonus },
      });
    }
  }
  return output;
}

export function createCommercialManagementSystem(options = {}) {
  const configured = [...(options.controlledTeamIds ?? [])];
  return {
    id: "management.commercial",
    eventTypes: [SIM_EVENT.CAREER_STARTED, SIM_EVENT.MONTH_STARTED, SIM_EVENT.SEASON_STARTED, RACE_EVENT.COMPLETED, COMMERCIAL_EVENT.NEGOTIATION_ACCEPTED],
    handle({ saveWorld, event }) {
      if (event.type === SIM_EVENT.CAREER_STARTED) {
        return { type: COMMERCIAL_EVENT.INITIALIZED, payload: initializeCommercialWorld(saveWorld, event.date) };
      }
      if (event.type === COMMERCIAL_EVENT.NEGOTIATION_ACCEPTED) {
        const deal = activateSponsorDeal(saveWorld, event.payload?.negotiation_id, { source: "player_negotiation", date: event.date });
        return {
          type: COMMERCIAL_EVENT.DEAL_SIGNED,
          payload: {
            deal_id: deal.id,
            negotiation_id: event.payload?.negotiation_id,
            team_id: deal.teamId,
            sponsor_id: deal.sponsorId,
            sponsor_name: deal.sponsorName,
            tier: deal.tier,
            annual_value: deal.annualValue,
            source: deal.source,
          },
        };
      }
      if (event.type === RACE_EVENT.COMPLETED) return raceEvents(saveWorld, event);

      const output = refreshCommercialWorld(saveWorld, event, configured);
      output.push(...negotiationExpiryEvents(saveWorld, event));
      if (event.type === SIM_EVENT.SEASON_STARTED) return output;

      // Market approaches and activation obligations run once per monthly cycle.
      output.push(...renewalEvents(saveWorld, event, configured));
      output.push(...activityEvents(saveWorld, event, configured));
      output.push(...aiCommercialDeals(saveWorld, event, configured));
      return output;
    },
  };
}
