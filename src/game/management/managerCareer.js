import { listVisibleTeams } from "../../domain/entityVisibility.js";
import { createRng } from "../../sim/random.js";
import { ensureBoardState, initializeBoardTeam } from "./board.js";

export const MANAGER_EVENT = Object.freeze({
  INITIALIZED: "manager.career_initialized",
  APPLICATION_SUBMITTED: "manager.application_submitted",
  APPLICATION_ACCEPTED: "manager.application_accepted",
  APPLICATION_REJECTED: "manager.application_rejected",
  JOB_OFFER_CREATED: "manager.job_offer_created",
  JOB_OFFER_ACCEPTED: "manager.job_offer_accepted",
  APPOINTED: "manager.appointed",
  DISMISSED: "manager.dismissed",
  REPUTATION_CHANGED: "manager.reputation_changed",
});

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function addDays(dateText, days) {
  const date = new Date(`${String(dateText ?? "").slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) return String(dateText ?? "").slice(0, 10);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function teamId(row) {
  return row?.team_id ?? row?.id ?? null;
}

function teamName(row) {
  return row?.team_name ?? row?.display_name ?? row?.name ?? teamId(row) ?? "Team";
}

function teamReputation(saveWorld, id) {
  const team = (saveWorld.world?.teams ?? []).find((row) => String(teamId(row)) === String(id)) ?? {};
  const state = saveWorld.world?.teamState?.[id] ?? {};
  const raw = Number(state.reputation ?? team.reputation ?? team.prestige ?? team.team_reputation ?? team.constructor_reputation);
  if (!Number.isFinite(raw)) return 50;
  return clamp(raw <= 10 ? raw * 10 : raw);
}

function currentTeamId(saveWorld) {
  return saveWorld.player?.controlledTeamIds?.[0] ?? null;
}

export function ensureManagerCareer(saveWorld) {
  saveWorld.player ??= {};
  saveWorld.player.manager ??= { name: "Manager" };
  const manager = saveWorld.player.manager;
  const current = currentTeamId(saveWorld);
  manager.career ??= {
    reputation: 35,
    status: current ? "employed" : "unemployed",
    currentTeamId: current,
    startedAt: saveWorld.clock?.date ?? null,
    history: [],
    applications: [],
    jobOffers: [],
    nextApplicationId: 1,
    nextJobOfferId: 1,
  };
  const career = manager.career;
  career.reputation = clamp(numeric(career.reputation, 35), 0, 100);
  career.applications ??= [];
  career.jobOffers ??= [];
  career.history ??= [];
  career.nextApplicationId = Math.max(1, Math.round(numeric(career.nextApplicationId, 1)));
  career.nextJobOfferId = Math.max(1, Math.round(numeric(career.nextJobOfferId, 1)));
  if (career.currentTeamId === undefined) career.currentTeamId = current;
  if (!career.history.length && current) {
    career.history.push({
      type: "appointed",
      teamId: current,
      date: saveWorld.clock?.date ?? null,
      source: "career_start",
    });
  }
  return career;
}

export function managerCareerProjection(saveWorld) {
  const career = ensureManagerCareer(saveWorld);
  const teams = new Map((saveWorld.world?.teams ?? []).map((row) => [String(teamId(row)), row]));
  return {
    name: saveWorld.player?.manager?.name ?? "Manager",
    reputation: career.reputation,
    status: career.status,
    currentTeamId: career.currentTeamId ?? null,
    currentTeamName: career.currentTeamId ? teamName(teams.get(String(career.currentTeamId))) : null,
    history: structuredClone(career.history),
    applications: structuredClone(career.applications),
    jobOffers: structuredClone(career.jobOffers.filter((row) => row.status === "open")),
  };
}

export function listManagerJobVacancies(saveWorld) {
  const career = ensureManagerCareer(saveWorld);
  return listVisibleTeams(saveWorld, { requireF1Eligible: true })
    .map((row) => ({
      id: teamId(row),
      name: teamName(row),
      reputation: teamReputation(saveWorld, teamId(row)),
      current: String(teamId(row)) === String(career.currentTeamId ?? ""),
    }))
    .filter((row) => row.id && !row.current)
    .sort((a, b) => Math.abs(a.reputation - career.reputation) - Math.abs(b.reputation - career.reputation) || b.reputation - a.reputation || String(a.id).localeCompare(String(b.id)));
}

export function submitManagerApplicationEvent(saveWorld, teamIdValue) {
  const career = ensureManagerCareer(saveWorld);
  const teamIdValueString = String(teamIdValue ?? "").trim();
  if (!teamIdValueString) throw new Error("teamId is required.");
  if (String(career.currentTeamId ?? "") === teamIdValueString) throw new Error("The manager already controls this team.");
  if (!listManagerJobVacancies(saveWorld).some((row) => String(row.id) === teamIdValueString)) throw new Error(`Team '${teamIdValueString}' is not available in the manager job market.`);
  const duplicate = career.applications.find((row) => row.teamId === teamIdValueString && row.status === "pending");
  if (duplicate) throw new Error("An application to this team is already pending.");
  const application = {
    id: `manager-application:${String(career.nextApplicationId++).padStart(4, "0")}`,
    teamId: teamIdValueString,
    status: "pending",
    submittedAt: saveWorld.clock?.date ?? null,
  };
  career.applications.push(application);
  return {
    type: MANAGER_EVENT.APPLICATION_SUBMITTED,
    payload: { application_id: application.id, team_id: teamIdValueString },
  };
}

export function decideManagerApplication(saveWorld, applicationId, eventId = "manager-application") {
  const career = ensureManagerCareer(saveWorld);
  const application = career.applications.find((row) => row.id === applicationId);
  if (!application) throw new Error(`Manager application '${applicationId}' does not exist.`);
  if (application.status !== "pending") return { application: structuredClone(application), accepted: application.status === "accepted" };
  const targetReputation = teamReputation(saveWorld, application.teamId);
  const rng = createRng(`${saveWorld.meta?.seed}|${eventId}|${application.id}|${application.teamId}`);
  const score = career.reputation - Math.max(0, targetReputation - career.reputation) * 0.42 + rng.next() * 22;
  const accepted = score >= 34;
  application.status = accepted ? "accepted" : "rejected";
  application.resolvedAt = saveWorld.clock?.date ?? null;
  application.score = Number(score.toFixed(2));
  return { application: structuredClone(application), accepted };
}

export function createManagerJobOffer(saveWorld, teamIdValue, options = {}) {
  const career = ensureManagerCareer(saveWorld);
  const id = String(teamIdValue ?? "").trim();
  if (!id || String(id) === String(career.currentTeamId ?? "")) return null;
  const duplicate = career.jobOffers.find((row) => row.teamId === id && row.status === "open");
  if (duplicate) return structuredClone(duplicate);
  const offer = {
    id: `manager-offer:${String(career.nextJobOfferId++).padStart(4, "0")}`,
    teamId: id,
    teamName: teamName((saveWorld.world?.teams ?? []).find((row) => String(teamId(row)) === id)),
    teamReputation: teamReputation(saveWorld, id),
    status: "open",
    source: options.source ?? "paddock_job_market",
    createdAt: saveWorld.clock?.date ?? null,
    expiresAt: addDays(saveWorld.clock?.date, Math.max(1, Math.round(numeric(options.windowDays, 14)))),
  };
  career.jobOffers.push(offer);
  return structuredClone(offer);
}

export function acceptManagerJobOfferEvent(saveWorld, offerId) {
  const career = ensureManagerCareer(saveWorld);
  const offer = career.jobOffers.find((row) => row.id === offerId);
  if (!offer || offer.status !== "open") throw new Error(`Open manager job offer '${offerId}' does not exist.`);
  return {
    type: MANAGER_EVENT.JOB_OFFER_ACCEPTED,
    payload: { offer_id: offer.id, team_id: offer.teamId },
  };
}

function refreshBoardRelationshipAfterAppointment(saveWorld, teamIdValue, date) {
  const board = initializeBoardTeam(saveWorld, teamIdValue, date);
  if (!board.dismissedAt) return board;
  board.confidence = Math.max(50, Math.min(60, Number(board.confidence ?? 55) + 45));
  board.status = "stable";
  board.reviewCount = 0;
  board.lastReviewAt = null;
  board.lastWarningAt = null;
  board.dismissalRecommended = false;
  board.dismissedAt = null;
  board.reappointedAt = date;
  return board;
}

export function appointManager(saveWorld, teamIdValue, date = saveWorld.clock?.date, source = "job_market") {
  const career = ensureManagerCareer(saveWorld);
  const nextTeamId = String(teamIdValue ?? "").trim();
  if (!nextTeamId) throw new Error("A manager appointment requires teamId.");
  const previousTeamId = career.currentTeamId ?? null;
  if (previousTeamId && String(previousTeamId) !== nextTeamId) {
    career.history.push({ type: "departed", teamId: previousTeamId, date, source });
  }
  saveWorld.player.controlledTeamIds = [nextTeamId];
  career.status = "employed";
  career.currentTeamId = nextTeamId;
  career.history.push({ type: "appointed", teamId: nextTeamId, date, source });
  for (const offer of career.jobOffers) {
    if (offer.status === "open") {
      offer.status = offer.teamId === nextTeamId ? "accepted" : "declined";
      offer.closedAt = date;
    }
  }
  refreshBoardRelationshipAfterAppointment(saveWorld, nextTeamId, date);
  return { previousTeamId, teamId: nextTeamId };
}

export function dismissManager(saveWorld, teamIdValue, date = saveWorld.clock?.date, reason = "board_decision") {
  const career = ensureManagerCareer(saveWorld);
  const teamIdValueString = String(teamIdValue ?? career.currentTeamId ?? "").trim();
  if (!teamIdValueString || String(career.currentTeamId ?? "") !== teamIdValueString) return null;
  career.history.push({ type: "dismissed", teamId: teamIdValueString, date, reason });
  career.status = "unemployed";
  career.currentTeamId = null;
  saveWorld.player.controlledTeamIds = [];
  return { teamId: teamIdValueString, date, reason };
}

export function adjustManagerReputation(saveWorld, delta, reason, date = saveWorld.clock?.date) {
  const career = ensureManagerCareer(saveWorld);
  const before = career.reputation;
  career.reputation = Number(clamp(before + numeric(delta, 0), 0, 100).toFixed(2));
  if (career.reputation !== before) career.history.push({ type: "reputation", date, before, after: career.reputation, delta: Number((career.reputation - before).toFixed(2)), reason });
  return { before, reputation: career.reputation, delta: Number((career.reputation - before).toFixed(2)), reason };
}
