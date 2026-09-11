import { SIM_EVENT } from "../timeEngine.js";
import { addManagementInboxItem, ensureManagementInbox } from "../../game/management/inbox.js";
import { SCOUTING_EVENT } from "../../game/management/scouting.js";
import { CONTRACT_NEGOTIATION_EVENT } from "../../game/management/contracts.js";
import { personProfile } from "../../game/management/people.js";
import { EMPLOYMENT_EVENT } from "./employmentMarket.js";
import { PEOPLE_EVENT } from "./peopleDynamics.js";
import { MARKET_EVENT } from "./marketDynamics.js";

function controlledTeamIds(saveWorld, configured) {
  return new Set((configured.length ? configured : saveWorld.player?.controlledTeamIds ?? []).map(String));
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
      EMPLOYMENT_EVENT.VACANCY_OPENED,
      PEOPLE_EVENT.DISCONTENT,
      MARKET_EVENT.RIVAL_OFFER_CREATED,
      MARKET_EVENT.PLAYER_DRIVER_TARGETED,
      MARKET_EVENT.EXTERNAL_OFFER_ACCEPTED,
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
          body: "Recruitment, people, market and contract decisions will appear here as the world advances.",
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
