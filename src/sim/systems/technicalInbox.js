import { addManagementInboxItem, ensureManagementInbox } from "../../game/management/inbox.js";
import { TECHNICAL_EVENT } from "../../game/management/technical.js";
import { controlledTeamSet } from "./controlState.js";

export function createTechnicalInboxSystem(options = {}) {
  const configured = [...(options.controlledTeamIds ?? [])];
  return {
    id: "management.technical-inbox",
    eventTypes: [
      TECHNICAL_EVENT.DESIGN_COMPLETED,
      TECHNICAL_EVENT.MANUFACTURING_COMPLETED,
      TECHNICAL_EVENT.COMPONENT_FITTED,
      TECHNICAL_EVENT.FACILITY_UPGRADE_COMPLETED,
      TECHNICAL_EVENT.NEXT_SEASON_SPEC_RELEASED,
    ],
    handle({ saveWorld, event }) {
      ensureManagementInbox(saveWorld);
      const teamId = String(event.payload?.team_id ?? "");
      if (!teamId || !controlledTeamSet(saveWorld, configured).has(teamId)) return null;

      if (event.type === TECHNICAL_EVENT.DESIGN_COMPLETED) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "technical",
          priority: "high",
          sourceType: "technical_design_complete",
          sourceId: event.payload?.project_id,
          title: `Design complete: ${String(event.payload?.component ?? "component").replace(/_spec$/, "").replaceAll("_", " ")}`,
          body: Number(event.payload?.target_season) > Number(saveWorld.clock?.season)
            ? `The new specification is complete for the ${event.payload?.target_season} car. It remains research-only until that season begins.`
            : `A new specification rated ${Number(event.payload?.rating ?? 0).toFixed(1)} is ready. Manufacture physical units before fitting it to either car.`,
        });
        return null;
      }

      if (event.type === TECHNICAL_EVENT.MANUFACTURING_COMPLETED) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "technical",
          priority: "normal",
          sourceType: "technical_manufacturing_complete",
          sourceId: event.payload?.job_id,
          title: "Manufacturing complete",
          body: `${event.payload?.quantity ?? 0} unit(s) are now in stock. Available inventory for this specification: ${event.payload?.available ?? 0}.`,
        });
        return null;
      }

      if (event.type === TECHNICAL_EVENT.FACILITY_UPGRADE_COMPLETED) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "technical",
          priority: "normal",
          sourceType: "facility_upgrade_complete",
          sourceId: event.payload?.upgrade_id,
          title: "Facility upgrade completed",
          body: `${String(event.payload?.facility_id ?? "facility").replaceAll("_", " ")} is now level ${event.payload?.level ?? "?"}.`,
        });
        return null;
      }

      if (event.type === TECHNICAL_EVENT.NEXT_SEASON_SPEC_RELEASED) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "technical",
          priority: "high",
          sourceType: "next_season_spec_released",
          sourceId: event.payload?.spec_id,
          title: "Next-season research released to production",
          body: `The ${String(event.payload?.component ?? "component").replace(/_spec$/, "").replaceAll("_", " ")} specification developed for ${event.payload?.target_season ?? saveWorld.clock?.season} can now be manufactured.`,
        });
      }
      return null;
    },
  };
}
