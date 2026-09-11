import { SIM_EVENT } from "../timeEngine.js";
import { addManagementInboxItem, ensureManagementInbox } from "../../game/management/inbox.js";
import { SCOUTING_EVENT } from "../../game/management/scouting.js";
import { CONTRACT_NEGOTIATION_EVENT } from "../../game/management/contracts.js";
import { EMPLOYMENT_EVENT } from "./employmentMarket.js";

function controlledTeamIds(saveWorld, configured) {
  return new Set(configured.length ? configured : saveWorld.player?.controlledTeamIds ?? []);
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
      EMPLOYMENT_EVENT.VACANCY_OPENED,
    ],
    handle({ saveWorld, event }) {
      ensureManagementInbox(saveWorld);

      if (event.type === SIM_EVENT.CAREER_STARTED) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "management",
          priority: "normal",
          sourceType: "career",
          sourceId: "management-core-ready",
          title: "Management team ready",
          body: "Recruitment, scouting reports and contract decisions will appear here as the world advances.",
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
          body: "The driver has returned revised terms. You can accept the counter-offer or end negotiations.",
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
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "contracts",
          priority: "normal",
          sourceType: "contract_rejected",
          sourceId: event.payload?.negotiation_id,
          title: `Offer rejected by ${event.payload?.driver_name ?? "driver"}`,
          body: "The offer was too far from the driver's expectations and negotiations have ended.",
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

      const teamId = event.payload?.team_id ?? null;
      if (!teamId || !controlledTeamIds(saveWorld, configured).has(teamId)) return null;
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
