import { addManagementInboxItem, ensureManagementInbox } from "../../game/management/inbox.js";
import { TECHNICAL_EVENT } from "../../game/management/technical.js";
import { SUPPLIER_EVENT } from "../../game/management/suppliers.js";
import { RELIABILITY_EVENT } from "../../game/management/reliability.js";
import { PRESEASON_EVENT } from "../../game/management/preseason.js";
import { controlledTeamSet } from "./controlState.js";

function label(value) {
  return String(value ?? "component").replace(/_spec$/, "").replaceAll("_", " ");
}

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
      SUPPLIER_EVENT.COUNTERED,
      SUPPLIER_EVENT.ACCEPTED,
      SUPPLIER_EVENT.CONTRACT_ACTIVATED,
      SUPPLIER_EVENT.AUTO_RENEWED,
      RELIABILITY_EVENT.CONDITION_WARNING,
      RELIABILITY_EVENT.COMPONENT_FAILED,
      RELIABILITY_EVENT.COMPONENT_REPLACED,
      RELIABILITY_EVENT.COMPONENT_REBUILT,
      RELIABILITY_EVENT.ENGINE_SERVICED,
      PRESEASON_EVENT.TEST_COMPLETED,
    ],
    handle({ saveWorld, event }) {
      ensureManagementInbox(saveWorld);
      const teamId = String(event.payload?.team_id ?? "");
      if (!teamId || !controlledTeamSet(saveWorld, configured).has(teamId)) return null;

      if (event.type === TECHNICAL_EVENT.DESIGN_COMPLETED) {
        const reliabilityText = Number.isFinite(Number(event.payload?.reliability_rating))
          ? ` Reliability rating: ${Number(event.payload.reliability_rating).toFixed(1)}.`
          : "";
        const preseasonText = Number(event.payload?.preseason_gain ?? 0) > 0
          ? ` Preseason knowledge contributed +${Number(event.payload.preseason_gain).toFixed(2)} performance.`
          : "";
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "technical",
          priority: "high",
          sourceType: "technical_design_complete",
          sourceId: event.payload?.project_id,
          title: `Design complete: ${label(event.payload?.component)}`,
          body: Number(event.payload?.target_season) > Number(saveWorld.clock?.season)
            ? `The new specification is complete for the ${event.payload?.target_season} car.${reliabilityText}${preseasonText} It remains research-only until that season begins.`
            : `A new specification rated ${Number(event.payload?.rating ?? 0).toFixed(1)} is ready.${reliabilityText}${preseasonText} Manufacture physical units before fitting it to either car.`,
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
          body: `${label(event.payload?.facility_id)} is now level ${event.payload?.level ?? "?"}.`,
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
          body: `The ${label(event.payload?.component)} specification developed for ${event.payload?.target_season ?? saveWorld.clock?.season} can now be manufactured.`,
        });
        return null;
      }

      if (event.type === SUPPLIER_EVENT.COUNTERED) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "technical",
          priority: "high",
          sourceType: "engine_supplier_counter",
          sourceId: event.payload?.negotiation_id,
          title: "Engine supplier counter-offer",
          body: `The supplier has countered at ${Number(event.payload?.annual_value ?? 0).toLocaleString("en-GB")} per season. Review the proposal in Technical Operations.`,
        });
        return null;
      }

      if (event.type === SUPPLIER_EVENT.ACCEPTED) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "technical",
          priority: "high",
          sourceType: "engine_supplier_agreement",
          sourceId: event.payload?.contract_id,
          title: "Engine supply agreement reached",
          body: `A future engine supply contract has been agreed for season ${event.payload?.effective_season ?? Number(saveWorld.clock.season) + 1}. The current engine remains fitted until the new season begins.`,
        });
        return null;
      }

      if (event.type === SUPPLIER_EVENT.CONTRACT_ACTIVATED) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "technical",
          priority: "high",
          sourceType: "engine_supplier_activated",
          sourceId: event.payload?.contract_id,
          title: "New engine supplier activated",
          body: `The new engine supply contract is now active for ${saveWorld.clock.season}. Fresh serviceable engine units have been assigned to both cars.`,
        });
        return null;
      }

      if (event.type === SUPPLIER_EVENT.AUTO_RENEWED) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "technical",
          priority: "normal",
          sourceType: "engine_supplier_continuity",
          sourceId: event.payload?.contract_id,
          title: "Engine supply continued",
          body: "No replacement supplier agreement was in place at season rollover. The incumbent supplier has been continued for one season so the team remains operational.",
        });
        return null;
      }

      if (event.type === RELIABILITY_EVENT.CONDITION_WARNING) {
        if (!event.payload?.critical) return null;
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "technical",
          priority: "high",
          sourceType: "critical_component_condition",
          sourceId: `${teamId}:${event.payload?.car_slot}:${event.payload?.component}`,
          title: `Critical wear: ${label(event.payload?.component)}`,
          body: `${String(event.payload?.car_slot ?? "car").replace("car", "Car ")} condition has fallen to ${Number(event.payload?.condition ?? 0).toFixed(1)}. Manufacture a spare, replace the unit or rebuild it before reliability deteriorates further.`,
        });
        return null;
      }

      if (event.type === RELIABILITY_EVENT.COMPONENT_FAILED) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "technical",
          priority: "urgent",
          sourceType: "component_failure",
          sourceId: `${teamId}:${event.payload?.car_slot}:${event.payload?.component}:${event.date}`,
          title: `Mechanical failure: ${label(event.payload?.component)}`,
          body: `${String(event.payload?.car_slot ?? "car").replace("car", "Car ")} suffered a terminal ${label(event.payload?.component)} failure. The failed unit remains unusable until it is replaced or serviced/rebuilt.`,
        });
        return null;
      }

      if ([RELIABILITY_EVENT.COMPONENT_REPLACED, RELIABILITY_EVENT.COMPONENT_REBUILT, RELIABILITY_EVENT.ENGINE_SERVICED].includes(event.type)) {
        const action = event.type === RELIABILITY_EVENT.COMPONENT_REPLACED ? "replaced"
          : event.type === RELIABILITY_EVENT.COMPONENT_REBUILT ? "rebuilt"
            : "serviced";
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "technical",
          priority: "normal",
          sourceType: `technical_unit_${action}`,
          sourceId: `${teamId}:${event.payload?.car_slot}:${event.payload?.component ?? "engine"}:${event.date}`,
          title: `${label(event.payload?.component ?? "engine")} ${action}`,
          body: `${String(event.payload?.car_slot ?? "car").replace("car", "Car ")} is back in service after the ${label(event.payload?.component ?? "engine")} was ${action}.`,
        });
        return null;
      }

      if (event.type === PRESEASON_EVENT.TEST_COMPLETED) {
        addManagementInboxItem(saveWorld, {
          date: event.date,
          category: "technical",
          priority: "normal",
          sourceType: "preseason_test_complete",
          sourceId: event.payload?.test_id,
          title: "Preseason test completed",
          body: `${label(event.payload?.focus)} testing generated ${Number(event.payload?.reliability_prep_gain ?? 0).toFixed(1)} reliability preparation and ${Number(event.payload?.development_knowledge_gain ?? 0).toFixed(1)} development knowledge.`,
        });
      }
      return null;
    },
  };
}
