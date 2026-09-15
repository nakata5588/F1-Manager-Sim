import { refreshOrganization } from "../../game/management/organization.js";
import { TEAM_EVOLUTION_EVENT } from "../../game/management/teamEvolution.js";
import { SIM_EVENT } from "../timeEngine.js";
import { CAREER_EVENT } from "./careerLifecycle.js";
import { EMPLOYMENT_EVENT } from "./employmentMarket.js";

export const ORGANIZATION_EVENT = Object.freeze({
  REFRESHED: "management.organization.refreshed",
});

const REFRESH_EVENTS = new Set([
  SIM_EVENT.CAREER_STARTED,
  SIM_EVENT.MONTH_STARTED,
  EMPLOYMENT_EVENT.CONTRACT_SIGNED,
  EMPLOYMENT_EVENT.FUTURE_CONTRACT_ACTIVATED,
  EMPLOYMENT_EVENT.VACANCY_OPENED,
  CAREER_EVENT.RETIRED,
  TEAM_EVOLUTION_EVENT.ENTRY_ACCEPTED,
  TEAM_EVOLUTION_EVENT.TEAM_EXITED,
]);

export function createOrganizationManagementSystem() {
  return {
    id: "management.organization",
    eventTypes: [...REFRESH_EVENTS],
    handle({ saveWorld, event }) {
      if (!REFRESH_EVENTS.has(event.type)) return null;
      const state = refreshOrganization(saveWorld, {
        snapshot: event.type === SIM_EVENT.MONTH_STARTED || event.type === SIM_EVENT.CAREER_STARTED,
      });
      return {
        type: ORGANIZATION_EVENT.REFRESHED,
        payload: {
          source_event: event.type,
          teams: Object.keys(state.teams ?? {}).length,
          history_rows: state.history?.length ?? 0,
        },
      };
    },
  };
}
