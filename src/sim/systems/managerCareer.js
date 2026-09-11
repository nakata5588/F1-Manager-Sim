import { SIM_EVENT } from "../timeEngine.js";
import { createRng } from "../random.js";
import { BOARD_EVENT } from "./boardManagement.js";
import {
  MANAGER_EVENT,
  acceptManagerJobOfferEvent,
  adjustManagerReputation,
  appointManager,
  createManagerJobOffer,
  decideManagerApplication,
  dismissManager,
  ensureManagerCareer,
  listManagerJobVacancies,
} from "../../game/management/managerCareer.js";

function expireOffers(saveWorld, date) {
  const career = ensureManagerCareer(saveWorld);
  for (const offer of career.jobOffers) {
    if (offer.status !== "open" || !offer.expiresAt) continue;
    if (String(offer.expiresAt) <= String(date)) {
      offer.status = "expired";
      offer.closedAt = date;
    }
  }
}

function maybeCreateOffer(saveWorld, event) {
  const career = ensureManagerCareer(saveWorld);
  if (career.jobOffers.some((row) => row.status === "open")) return null;
  const jobs = listManagerJobVacancies(saveWorld);
  if (!jobs.length) return null;

  let candidate = null;
  if (career.status === "unemployed") {
    candidate = jobs[0];
  } else if (career.reputation >= 62) {
    const rng = createRng(`${saveWorld.meta?.seed}|manager-job-market|${event.date}|${career.reputation}`);
    const chance = Math.min(0.28, 0.04 + (career.reputation - 62) / 180);
    if (rng.next() < chance) {
      const realistic = jobs.filter((row) => row.reputation <= career.reputation + 18);
      const pool = realistic.length ? realistic : jobs;
      candidate = pool[Math.floor(rng.next() * Math.min(pool.length, 4))] ?? pool[0];
    }
  }
  if (!candidate) return null;
  const offer = createManagerJobOffer(saveWorld, candidate.id, { source: career.status === "unemployed" ? "unemployed_job_market" : "paddock_approach" });
  if (!offer) return null;
  return {
    type: MANAGER_EVENT.JOB_OFFER_CREATED,
    payload: {
      offer_id: offer.id,
      team_id: offer.teamId,
      team_name: offer.teamName,
      expires_at: offer.expiresAt,
    },
  };
}

export function createManagerCareerSystem() {
  return {
    id: "management.manager-career",
    eventTypes: [
      SIM_EVENT.CAREER_STARTED,
      SIM_EVENT.MONTH_STARTED,
      BOARD_EVENT.REVIEWED,
      BOARD_EVENT.DISMISSED,
      MANAGER_EVENT.APPLICATION_SUBMITTED,
      MANAGER_EVENT.JOB_OFFER_ACCEPTED,
    ],
    handle({ saveWorld, event }) {
      if (event.type === SIM_EVENT.CAREER_STARTED) {
        const career = ensureManagerCareer(saveWorld);
        return {
          type: MANAGER_EVENT.INITIALIZED,
          payload: {
            team_id: career.currentTeamId,
            reputation: career.reputation,
          },
        };
      }

      if (event.type === BOARD_EVENT.REVIEWED) {
        const teamId = event.payload?.teamId ?? event.payload?.team_id ?? null;
        const career = ensureManagerCareer(saveWorld);
        if (!teamId || String(career.currentTeamId ?? "") !== String(teamId)) return null;
        const performanceDelta = Number(event.payload?.delta ?? 0);
        const reputationDelta = Math.max(-2.5, Math.min(2.5, performanceDelta * 0.22));
        if (Math.abs(reputationDelta) < 0.01) return null;
        const result = adjustManagerReputation(saveWorld, reputationDelta, "board_review", event.date);
        return {
          type: MANAGER_EVENT.REPUTATION_CHANGED,
          payload: {
            before: result.before,
            reputation: result.reputation,
            delta: result.delta,
            reason: result.reason,
          },
        };
      }

      if (event.type === BOARD_EVENT.DISMISSED) {
        const result = dismissManager(saveWorld, event.payload?.team_id, event.date, "board_confidence");
        if (!result) return null;
        adjustManagerReputation(saveWorld, -4, "dismissed", event.date);
        return {
          type: MANAGER_EVENT.DISMISSED,
          payload: {
            team_id: result.teamId,
            confidence: event.payload?.confidence ?? null,
          },
        };
      }

      if (event.type === MANAGER_EVENT.APPLICATION_SUBMITTED) {
        const decision = decideManagerApplication(saveWorld, event.payload?.application_id, event.id);
        if (!decision.accepted) {
          return {
            type: MANAGER_EVENT.APPLICATION_REJECTED,
            payload: {
              application_id: decision.application.id,
              team_id: decision.application.teamId,
              score: decision.application.score,
            },
          };
        }
        const appointment = appointManager(saveWorld, decision.application.teamId, event.date, "application");
        adjustManagerReputation(saveWorld, 2, "appointed_via_application", event.date);
        return [
          {
            type: MANAGER_EVENT.APPLICATION_ACCEPTED,
            payload: {
              application_id: decision.application.id,
              team_id: decision.application.teamId,
              score: decision.application.score,
            },
          },
          {
            type: MANAGER_EVENT.APPOINTED,
            payload: {
              team_id: appointment.teamId,
              previous_team_id: appointment.previousTeamId,
              source: "application",
            },
          },
        ];
      }

      if (event.type === MANAGER_EVENT.JOB_OFFER_ACCEPTED) {
        const career = ensureManagerCareer(saveWorld);
        const offer = career.jobOffers.find((row) => row.id === event.payload?.offer_id && row.status === "open");
        if (!offer) return null;
        const appointment = appointManager(saveWorld, offer.teamId, event.date, "job_offer");
        adjustManagerReputation(saveWorld, 1, "accepted_job_offer", event.date);
        return {
          type: MANAGER_EVENT.APPOINTED,
          payload: {
            team_id: appointment.teamId,
            previous_team_id: appointment.previousTeamId,
            source: "job_offer",
          },
        };
      }

      expireOffers(saveWorld, event.date);
      return maybeCreateOffer(saveWorld, event);
    },
  };
}

export { acceptManagerJobOfferEvent };
