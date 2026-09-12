import { addManagementInboxItem } from "../../game/management/inbox.js";
import { OFFSEASON_EVENT } from "../../game/management/offseason.js";
import { controlledTeamSet } from "./controlState.js";

function add(saveWorld, event, input) {
  return addManagementInboxItem(saveWorld, {
    date: event.date,
    category: "offseason",
    sourceType: event.type,
    sourceId: input.sourceId ?? event.id,
    priority: input.priority ?? "normal",
    title: input.title,
    body: input.body,
    decision: null,
  });
}

export function createOffseasonInboxSystem(options = {}) {
  return {
    id: "offseason.inbox",
    eventTypes: [
      OFFSEASON_EVENT.OPENED,
      OFFSEASON_EVENT.STAGE_CHANGED,
      OFFSEASON_EVENT.SEASON_PREPARED,
      OFFSEASON_EVENT.COMPLETED,
    ],
    handle({ saveWorld, event }) {
      const controlled = controlledTeamSet(saveWorld, options.controlledTeamIds ?? []);
      if (!controlled.size) return null;
      const payload = event.payload ?? {};
      const items = [];

      if (event.type === OFFSEASON_EVENT.OPENED) {
        for (const teamId of controlled) {
          items.push(add(saveWorld, event, {
            sourceId: `${payload.cycle_id}:${teamId}:opened`,
            priority: "high",
            title: `${payload.closing_season} season review`,
            body: `The ${payload.closing_season} championship is complete. Review the season, confirm your ${payload.target_season} plan and resolve contracts, suppliers, sponsors, regulations and next-car preparation before the new season.`,
          }));
        }
      } else if (event.type === OFFSEASON_EVENT.STAGE_CHANGED) {
        for (const teamId of controlled) {
          items.push(add(saveWorld, event, {
            sourceId: `${payload.cycle_id}:${teamId}:stage:${payload.stage}`,
            title: `Offseason update — ${payload.stage}`,
            body: `The ${payload.target_season} preparation cycle has moved to ${String(payload.stage ?? "planning").replaceAll("_", " ")}.`,
          }));
        }
      } else if (event.type === OFFSEASON_EVENT.SEASON_PREPARED) {
        for (const teamId of controlled) {
          const row = (payload.teams ?? []).find((candidate) => candidate.teamId === teamId);
          items.push(add(saveWorld, event, {
            sourceId: `${payload.season}:${teamId}:prepared`,
            priority: "high",
            title: `${payload.season} season preparation opened`,
            body: `The new season is active. Board target: ${row?.boardTarget ? `P${row.boardTarget}` : "not set"}. Season-opening cash: ${row?.openingCash ?? "unknown"}. Preseason testing and final technical preparation are now available.`,
          }));
        }
      } else if (event.type === OFFSEASON_EVENT.COMPLETED) {
        for (const teamId of controlled) {
          items.push(add(saveWorld, event, {
            sourceId: `${payload.cycle_id}:${teamId}:completed`,
            title: `${payload.target_season} season begins`,
            body: "The first Grand Prix weekend has started. The offseason preparation cycle is now closed and its plan remains part of the season history.",
          }));
        }
      }

      return items.map((item) => ({ type: "offseason.inbox_created", payload: { inbox_id: item.id, source_id: item.sourceId } }));
    },
  };
}
