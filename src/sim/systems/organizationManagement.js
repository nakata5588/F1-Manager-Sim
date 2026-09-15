import { refreshOrganization } from "../../game/management/organization.js";
import { SIM_EVENT } from "../timeEngine.js";
import { CAREER_EVENT } from "./careerLifecycle.js";
import { EMPLOYMENT_EVENT } from "./employmentMarket.js";

const REFRESH_EVENTS = new Set([
  SIM_EVENT.CAREER_STARTED,
  SIM_EVENT.MONTH_STARTED,
  EMPLOYMENT_EVENT.CONTRACT_SIGNED,
  EMPLOYMENT_EVENT.FUTURE_CONTRACT_ACTIVATED,
  EMPLOYMENT_EVENT.VACANCY_OPENED,
  CAREER_EVENT.RETIRED,
]);

export function createOrganizationManagementSystem() {
  return {
    id: "management.organization",
    eventTypes: [...REFRESH_EVENTS],
    handle({ saveWorld, event }) {
      if (!REFRESH_EVENTS.has(event.type)) return null;
      refreshOrganization(saveWorld, { snapshot: event.type === SIM_EVENT.MONTH_STARTED || event.type === SIM_EVENT.CAREER_STARTED });
      return null;
    },
  };
}
