import { SIM_EVENT } from "../timeEngine.js";
import { addManagementInboxItem, ensureManagementInbox } from "../../game/management/inbox.js";
import { SCOUTING_EVENT } from "../../game/management/scouting.js";
import { CONTRACT_NEGOTIATION_EVENT } from "../../game/management/contracts.js";
import { STAFF_NEGOTIATION_EVENT } from "../../game/management/staffRecruitment.js";
import { personProfile } from "../../game/management/people.js";
import { EMPLOYMENT_EVENT } from "./employmentMarket.js";
import { PEOPLE_EVENT } from "./peopleDynamics.js";
import { MARKET_EVENT } from "./marketDynamics.js";
import { BOARD_EVENT } from "./boardManagement.js";
import { MANAGER_EVENT } from "../../game/management/managerCareer.js";
import { STAFF_ADVICE_EVENT } from "./staffAdvice.js";

function controlledTeamIds(saveWorld, configured) {
  const dynamic = saveWorld.player?.controlledTeamIds;
  return new Set((Array.isArray(dynamic) ? dynamic : configured).map(String));
}

function personName(saveWorld, type, id) {
  const row = personProfile(saveWorld, type, id) ?? {};
  return row.display_name ?? row.driver_name ?? row.staff_name ?? row.name ?? id ?? "Person";
}

function assignment(saveWorld, type, id) {
  return type === "staff"
    ? saveWorld.world?.employment?.staff?.[id] ?? null
    : saveWorld.world?.employment?.drivers?.[id] ?? null;
}

function negotiation(saveWorld, id) {
  return saveWorld.world?.management?.contracts?.negotiations?.find((row) => row.id === id) ?? null;
}

function staffNegotiation(saveWorld, id) {
  return saveWorld.world?.management?.staffRecruitment?.negotiations?.find((row) => row.id === id) ?? null;
}

export function createManagementInboxSystem(options = {}) {
  const configured = [...(options.controlledTeamIds ?? [])];
  return {
    id: "management.inbox",
    eventTypes: [
      SIM_EVENT.CAREER_STARTED,
      SCOUTING_EVENT.REPORT_COMPLETED,
      CONTRACT_NEGOTIATION_EVENT.COUNTERED,
      CONTRACT_NEGOTIATION_EVENT.ACCEPTED,
      CONTRACT_NEGOTIATION_EVENT.REJECTED,
      CONTRACT_NEGOTIATION_EVENT.EXPIRED,
      CONTRACT_NEGOTIATION_EVENT.LOST_TO_RIVAL,
      STAFF_NEGOTIATION_EVENT.COUNTERED,
      STAFF_NEGOTIATION_EVENT.ACCEPTED,
      STAFF_NEGOTIATION_EVENT.REJECTED,
      STAFF_NEGOTIATION_EVENT.EXPIRED,
      EMPLOYMENT_EVENT.VACANCY_OPENED,
      PEOPLE_EVENT.DISCONTENT,
      MARKET_EVENT.RIVAL_OFFER_CREATED,
      MARKET_EVENT.PLAYER_DRIVER_TARGETED,
      MARKET_EVENT.EXTERNAL_OFFER_ACCEPTED,
      BOARD_EVENT.WARNING,
      BOARD_EVENT.REQUEST_RESOLVED,
      MANAGER_EVENT.DISMISSED,
      MANAGER_EVENT.JOB_OFFER_CREATED,
      MANAGER_EVENT.APPLICATION_ACCEPTED,
      MANAGER_EVENT.APPLICATION_REJECTED,
      MANAGER_EVENT.APPOINTED,
      STAFF_ADVICE_EVENT.CREATED,
    ],
    handle({ saveWorld, event }) {
      ensureManagementInbox(saveWorld);
      const controlled = controlledTeamIds(saveWorld, configured);

      if (event.type === SIM_EVENT.CAREER_STARTED) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "management",
          priority: "normal",
          sourceType: "career",
          sourceId: "management-core-ready",
          title: "Management team ready",
          body: "Board, staff, recruitment, people, market and contract decisions will appear here as the world advances.",
        });
        return null;
      }

      if (event.type === BOARD_EVENT.WARNING) {
        if (!controlled.has(String(event.payload?.team_id ?? ""))) return null;
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "board",
          priority: "high",
          sourceType: "board_warning",
          sourceId: `${event.payload?.team_id}:${String(event.date).slice(0, 7)}`,
          title: "Board confidence is under pressure",
          body: `Board confidence has fallen to ${Math.round(Number(event.payload?.confidence ?? 0))}. Improve the weakest objective before the next review.`,
        });
        return null;
      }

      if (event.type === BOARD_EVENT.REQUEST_RESOLVED) {
        const status = event.payload?.status ?? "resolved";
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "board",
          priority: status === "approved" ? "normal" : "high",
          sourceType: "board_request",
          sourceId: event.payload?.request_id,
          title: `Board request ${status}`,
          body: status === "approved"
            ? `The board approved the ${String(event.payload?.kind ?? "request").replaceAll("_", " ")}${event.payload?.value !== null && event.payload?.value !== undefined ? ` (${event.payload.value})` : ""}.`
            : `The board rejected the ${String(event.payload?.kind ?? "request").replaceAll("_", " ")}.`,
        });
        return null;
      }

      if (event.type === MANAGER_EVENT.DISMISSED) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "board",
          priority: "urgent",
          sourceType: "manager_dismissed",
          sourceId: `${event.payload?.team_id}:${event.date}`,
          title: "The board has terminated your contract",
          body: "You are now unemployed. Your manager reputation and career history remain in the Save World, and you can apply for or accept another team role.",
        });
        return null;
      }

      if (event.type === MANAGER_EVENT.JOB_OFFER_CREATED) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "career",
          priority: "high",
          sourceType: "manager_job_offer",
          sourceId: event.payload?.offer_id,
          title: `Job offer: ${event.payload?.team_name ?? event.payload?.team_id ?? "F1 team"}`,
          body: `A team has offered you the manager role. The offer expires on ${event.payload?.expires_at ?? "an unknown date"}.`,
          decision: {
            kind: "manager_job_offer",
            refId: event.payload?.offer_id,
            options: [
              { id: "accept_job", label: "Accept job" },
              { id: "decline_job", label: "Decline" },
            ],
          },
        });
        return null;
      }

      if (event.type === MANAGER_EVENT.APPLICATION_ACCEPTED) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "career",
          priority: "high",
          sourceType: "manager_application_accepted",
          sourceId: event.payload?.application_id,
          title: "Manager application accepted",
          body: `Your application has been accepted. You have been appointed to team ${event.payload?.team_id}.`,
        });
        return null;
      }

      if (event.type === MANAGER_EVENT.APPLICATION_REJECTED) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "career",
          priority: "normal",
          sourceType: "manager_application_rejected",
          sourceId: event.payload?.application_id,
          title: "Manager application unsuccessful",
          body: `Team ${event.payload?.team_id ?? "unknown"} has chosen another direction. Your career remains active and other opportunities can emerge.`,
        });
        return null;
      }

      if (event.type === MANAGER_EVENT.APPOINTED) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "career",
          priority: "high",
          sourceType: "manager_appointed",
          sourceId: `${event.payload?.team_id}:${event.date}`,
          title: "New team appointment",
          body: `You are now manager of team ${event.payload?.team_id}. Control has moved to the new team in the Save World.`,
        });
        return null;
      }

      if (event.type === STAFF_ADVICE_EVENT.CREATED) {
        if (!controlled.has(String(event.payload?.team_id ?? ""))) return null;
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: event.payload?.category ?? "staff",
          priority: event.payload?.priority ?? "normal",
          sourceType: "staff_advice",
          sourceId: `${event.payload?.advisor_id}:${String(event.date).slice(0, 7)}:${event.payload?.category ?? "staff"}`,
          title: event.payload?.title ?? "Staff advice",
          body: `${event.payload?.advisor_name ?? "A senior staff member"}: ${event.payload?.body ?? "No additional detail."}`,
        });
        return null;
      }

      if (event.type === SCOUTING_EVENT.REPORT_COMPLETED) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "scouting",
          sourceType: "scouting_report",
          sourceId: event.payload?.report_id,
          title: `Scouting report: ${event.payload?.driver_name ?? event.payload?.driver_id ?? "Driver"}`,
          body: `The report is complete. Recruitment knowledge is now ${event.payload?.knowledge ?? "updated"}%.`,
        });
        return null;
      }

      if (event.type === STAFF_NEGOTIATION_EVENT.COUNTERED) {
        const own = staffNegotiation(saveWorld, event.payload?.negotiation_id);
        if (!own?.teamId || !controlled.has(String(own.teamId))) return null;
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "staff",
          priority: "high",
          sourceType: "staff_contract_counter",
          sourceId: event.payload?.negotiation_id,
          title: `Counter-offer from ${event.payload?.staff_name ?? "staff member"}`,
          body: "The staff member's representative has returned revised terms. Accept the counter-offer or end negotiations.",
          decision: {
            kind: "staff_contract_counter",
            refId: event.payload?.negotiation_id,
            options: [
              { id: "accept_staff_counter", label: "Accept counter-offer" },
              { id: "withdraw_staff", label: "End negotiations" },
            ],
          },
        });
        return null;
      }

      if ([STAFF_NEGOTIATION_EVENT.ACCEPTED, STAFF_NEGOTIATION_EVENT.REJECTED, STAFF_NEGOTIATION_EVENT.EXPIRED].includes(event.type)) {
        const own = staffNegotiation(saveWorld, event.payload?.negotiation_id);
        if (!own?.teamId || !controlled.has(String(own.teamId))) return null;
        const accepted = event.type === STAFF_NEGOTIATION_EVENT.ACCEPTED;
        const expired = event.type === STAFF_NEGOTIATION_EVENT.EXPIRED;
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "staff",
          priority: accepted ? "high" : "normal",
          sourceType: accepted ? "staff_contract_accepted" : expired ? "staff_contract_expired" : "staff_contract_rejected",
          sourceId: event.payload?.negotiation_id,
          title: accepted
            ? `Staff contract agreed with ${event.payload?.staff_name ?? "staff member"}`
            : expired
              ? `Staff negotiation expired: ${event.payload?.staff_name ?? "staff member"}`
              : `Staff offer rejected by ${event.payload?.staff_name ?? "staff member"}`,
          body: accepted
            ? `The agreement begins in ${event.payload?.start_season ?? saveWorld.clock?.season}.`
            : expired ? "The negotiation window closed without an agreement." : "The offer did not meet the staff member's expectations.",
        });
        return null;
      }

      if (event.type === CONTRACT_NEGOTIATION_EVENT.COUNTERED) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "contracts",
          priority: "high",
          sourceType: "contract_counter",
          sourceId: event.payload?.negotiation_id,
          title: `Counter-offer from ${event.payload?.driver_name ?? "driver"}`,
          body: "The driver's representative has returned revised terms. You can accept the counter-offer or end negotiations.",
          decision: {
            kind: "contract_counter",
            refId: event.payload?.negotiation_id,
            options: [
              { id: "accept_counter", label: "Accept counter-offer" },
              { id: "withdraw", label: "End negotiations" },
            ],
          },
        });
        return null;
      }

      if (event.type === CONTRACT_NEGOTIATION_EVENT.ACCEPTED) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "contracts",
          priority: "high",
          sourceType: "contract_accepted",
          sourceId: event.payload?.negotiation_id,
          title: `Contract agreed with ${event.payload?.driver_name ?? "driver"}`,
          body: `Terms have been agreed for a contract beginning in ${event.payload?.start_season ?? saveWorld.clock?.season}.`,
        });
        return null;
      }

      if (event.type === CONTRACT_NEGOTIATION_EVENT.REJECTED) {
        const reason = event.payload?.reason === "transfer_compensation_insufficient"
          ? "The current team would not release the driver for the compensation offered."
          : "The offer was too far from the driver's expectations and negotiations have ended.";
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "contracts",
          priority: "normal",
          sourceType: "contract_rejected",
          sourceId: event.payload?.negotiation_id,
          title: `Offer rejected by ${event.payload?.driver_name ?? "driver"}`,
          body: reason,
        });
        return null;
      }

      if (event.type === CONTRACT_NEGOTIATION_EVENT.EXPIRED) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "contracts",
          priority: "normal",
          sourceType: "contract_expired",
          sourceId: event.payload?.negotiation_id,
          title: `Negotiation expired: ${event.payload?.driver_name ?? "driver"}`,
          body: "No agreement was reached before the negotiation window closed.",
        });
        return null;
      }

      if (event.type === CONTRACT_NEGOTIATION_EVENT.LOST_TO_RIVAL) {
        const own = negotiation(saveWorld, event.payload?.negotiation_id);
        if (own?.teamId && !controlled.has(String(own.teamId))) return null;
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "contracts",
          priority: "high",
          sourceType: "lost_to_rival",
          sourceId: event.payload?.negotiation_id,
          title: `${event.payload?.driver_name ?? "Driver"} chooses a rival team`,
          body: "A competing team reached an agreement before we completed our negotiation.",
        });
        return null;
      }

      if (event.type === PEOPLE_EVENT.DISCONTENT) {
        const type = event.payload?.person_type === "staff" ? "staff" : "driver";
        const id = event.payload?.person_id ?? null;
        const current = assignment(saveWorld, type, id);
        if (!current?.teamId || !controlled.has(String(current.teamId))) return null;
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "people",
          priority: "high",
          sourceType: "discontent",
          sourceId: `${type}:${id}:${String(event.date).slice(0, 7)}`,
          title: `${personName(saveWorld, type, id)} is becoming unsettled`,
          body: `Morale ${Math.round(Number(event.payload?.morale ?? 0))} · team satisfaction ${Math.round(Number(event.payload?.team_satisfaction ?? 0))} · contract satisfaction ${Math.round(Number(event.payload?.contract_satisfaction ?? 0))}.`,
        });
        return null;
      }

      if (event.type === MARKET_EVENT.RIVAL_OFFER_CREATED) {
        const own = negotiation(saveWorld, event.payload?.related_negotiation_id);
        if (!own?.teamId || !controlled.has(String(own.teamId))) return null;
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "market",
          priority: "high",
          sourceType: "rival_offer",
          sourceId: event.payload?.external_offer_id,
          title: `Rival interest in ${event.payload?.driver_name ?? "our target"}`,
          body: `Another team has entered the race for the driver. Their offer expires on ${event.payload?.expires_at ?? "an unknown date"}. Competition can increase the driver's demands.`,
        });
        return null;
      }

      if (event.type === MARKET_EVENT.PLAYER_DRIVER_TARGETED) {
        if (!controlled.has(String(event.payload?.current_team_id ?? ""))) return null;
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "market",
          priority: "high",
          sourceType: "poaching_alert",
          sourceId: event.payload?.external_offer_id,
          title: `Rival team approaches ${personName(saveWorld, "driver", event.payload?.driver_id)}`,
          body: `A rival has made an offer for a future move beginning in ${event.payload?.start_season}. Consider the driver's contract, morale and loyalty before the offer expires.`,
        });
        return null;
      }

      if (event.type === MARKET_EVENT.EXTERNAL_OFFER_ACCEPTED) {
        const id = event.payload?.driver_id ?? null;
        const current = assignment(saveWorld, "driver", id);
        const related = negotiation(saveWorld, event.payload?.related_negotiation_id);
        if ((!current?.teamId || !controlled.has(String(current.teamId))) && (!related?.teamId || !controlled.has(String(related.teamId)))) return null;
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "market",
          priority: "high",
          sourceType: "external_offer_accepted",
          sourceId: event.payload?.external_offer_id,
          title: `${personName(saveWorld, "driver", id)} agrees a rival move`,
          body: `The driver has accepted an external offer scheduled to begin in ${event.payload?.start_season}.`,
        });
        return null;
      }

      const teamId = event.payload?.team_id ?? null;
      if (!teamId || !controlled.has(String(teamId))) return null;
      addManagementInboxItem(saveWorld, {
        date: event.date,
        category: "team",
        priority: "high",
        sourceType: "vacancy",
        sourceId: event.payload?.vacancy_id,
        title: "Team vacancy opened",
        body: `A ${event.payload?.worker_type ?? "team"} vacancy is open for role '${event.payload?.role ?? "unknown"}'. Recruitment action is required.`,
      });
      return null;
    },
  };
}
