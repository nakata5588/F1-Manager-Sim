import { addManagementInboxItem } from "../../game/management/inbox.js";
import { REGULATION_EVENT } from "../../game/management/regulations.js";
import { TEAM_EVOLUTION_EVENT } from "../../game/management/teamEvolution.js";
import { controlledTeamSet } from "./controlState.js";

function add(saveWorld, event, input) {
  return addManagementInboxItem(saveWorld, {
    date: event.date,
    category: "governance",
    sourceType: input.sourceType ?? event.type,
    sourceId: input.sourceId ?? event.id,
    priority: input.priority ?? "normal",
    title: input.title,
    body: input.body,
    decision: null,
  });
}

export function createGovernanceInboxSystem(options = {}) {
  return {
    id: "governance.inbox",
    eventTypes: [
      REGULATION_EVENT.PROPOSAL_OPENED,
      REGULATION_EVENT.PROPOSAL_RESOLVED,
      REGULATION_EVENT.PACKAGE_ENACTED,
      REGULATION_EVENT.TECHNICAL_TRANSITION_APPLIED,
      TEAM_EVOLUTION_EVENT.ENTRY_APPLICATION,
      TEAM_EVOLUTION_EVENT.ENTRY_ACCEPTED,
      TEAM_EVOLUTION_EVENT.ENTRY_REJECTED,
      TEAM_EVOLUTION_EVENT.TEAM_EXITED,
      TEAM_EVOLUTION_EVENT.TEAM_REBRANDED,
    ],
    handle({ saveWorld, event }) {
      const controlled = controlledTeamSet(saveWorld, options.controlledTeamIds ?? []);
      if (!controlled.size) return null;
      const payload = event.payload ?? {};

      if (event.type === REGULATION_EVENT.PROPOSAL_OPENED) {
        const items = [];
        for (const teamId of controlled) {
          items.push(add(saveWorld, event, {
            sourceId: `${payload.proposal_id}:${teamId}`,
            priority: "high",
            title: payload.title ?? "Regulation vote required",
            body: `A ${payload.category ?? "regulation"} proposal for ${payload.target_season} is open. Vote from the Governance screen before the resolution window closes. Future historical rules are references only and are not automatically imposed.`,
          }));
        }
        return items.map((item) => ({ type: "governance.inbox_created", payload: { inbox_id: item.id, source_id: item.sourceId } }));
      }

      if (event.type === REGULATION_EVENT.PROPOSAL_RESOLVED) {
        add(saveWorld, event, {
          sourceId: `resolved:${payload.proposal_id}`,
          title: payload.accepted ? "Regulation proposal approved" : "Regulation proposal rejected",
          body: `The governance vote for ${payload.target_season} has been resolved. Result: ${payload.accepted ? "approved" : "rejected"}.`,
        });
      } else if (event.type === REGULATION_EVENT.PACKAGE_ENACTED) {
        add(saveWorld, event, {
          sourceId: `enacted:${payload.proposal_id}:${payload.season}`,
          priority: "high",
          title: `Regulation package enacted for ${payload.season}`,
          body: "An approved regulation package is now active. Technical carry-over and/or sporting structure may change from this season onward.",
        });
      } else if (event.type === REGULATION_EVENT.TECHNICAL_TRANSITION_APPLIED) {
        add(saveWorld, event, {
          sourceId: `transition:${payload.season}`,
          title: `Technical regulation transition — ${payload.season}`,
          body: `${payload.affectedTeams ?? 0} teams and ${payload.affectedSpecs ?? 0} carried-over specifications were recalibrated under the new technical package.`,
        });
      } else if (event.type === TEAM_EVOLUTION_EVENT.ENTRY_APPLICATION) {
        add(saveWorld, event, {
          sourceId: `entry-application:${payload.application_id}`,
          title: "New team entry application",
          body: `${payload.team_id} has applied to join Formula One in ${payload.target_season}. The application will be reviewed against grid capacity and readiness.`,
        });
      } else if (event.type === TEAM_EVOLUTION_EVENT.ENTRY_ACCEPTED) {
        add(saveWorld, event, {
          sourceId: `entry-accepted:${payload.application_id}:${payload.activated ? "activated" : "decision"}`,
          priority: "high",
          title: payload.activated ? "New team joins the grid" : "Team entry approved",
          body: payload.activated
            ? `${payload.team_id} has entered Formula One for ${payload.season}. Recruitment and technical preparation now use the same simulation systems as every other team.`
            : `${payload.team_id} has been approved to enter Formula One in ${payload.target_season}.`,
        });
      } else if (event.type === TEAM_EVOLUTION_EVENT.ENTRY_REJECTED) {
        add(saveWorld, event, {
          sourceId: `entry-rejected:${payload.application_id}`,
          title: "Team entry application rejected",
          body: `${payload.team_id} was not approved for entry in ${payload.target_season}.`,
        });
      } else if (event.type === TEAM_EVOLUTION_EVENT.TEAM_EXITED) {
        add(saveWorld, event, {
          sourceId: `team-exit:${payload.team_id}:${payload.season}`,
          priority: "high",
          title: "Team leaves Formula One",
          body: `${payload.team_id} has left the championship after sustained financial distress. Its personnel return to the employment market.`,
        });
      } else if (event.type === TEAM_EVOLUTION_EVENT.TEAM_REBRANDED) {
        add(saveWorld, event, {
          sourceId: `rebrand:${payload.rebrand_id}`,
          title: "Team identity changed",
          body: `${payload.previous_name} is now competing as ${payload.new_name}.`,
        });
      }
      return null;
    },
  };
}
