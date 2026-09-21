import {
  CALENDAR_EVENT,
  calendarPlanFor,
  initializeCalendarPromoters,
  planDynamicCalendar,
} from "../../game/management/calendarPromoters.js";
import { SIM_EVENT } from "../timeEngine.js";

function schedulePayload(plan) {
  return {
    season: plan.season,
    races: plan.raceCount,
    target_races: plan.targetRaceCount,
    reference_races: plan.referenceRaceCount,
    source: plan.source,
    added: plan.added,
    dropped: plan.dropped,
    renewed: plan.renewed,
    reference_policy: plan.referencePolicy,
  };
}

export function createCalendarPromoterSystem() {
  return {
    id: "world.calendar-promoters",
    eventTypes: [SIM_EVENT.CAREER_STARTED, SIM_EVENT.MONTH_STARTED],
    handle({ saveWorld, event }) {
      if (event.type === SIM_EVENT.CAREER_STARTED) {
        const state = initializeCalendarPromoters(saveWorld, event.date);
        return {
          type: CALENDAR_EVENT.INITIALIZED,
          payload: {
            season: Number(saveWorld.clock?.season),
            active_contracts: Object.values(state.contracts ?? {}).filter((row) => row.status === "active").length,
          },
        };
      }

      const month = Number(event.payload?.month ?? String(event.date).slice(5, 7));
      if (![11, 12].includes(month)) return null;
      const targetSeason = Number(saveWorld.clock?.season) + 1;
      if (calendarPlanFor(saveWorld, targetSeason)) return null;
      const currentCalendar = saveWorld.world?.calendar ?? [];
      const referenceCalendar = saveWorld.reference?.futureStructure?.calendars?.[String(targetSeason)] ?? [];
      // Some focused domain tests intentionally have no racing calendar. Stage 21
      // must remain additive there rather than turning an unrelated season change
      // into a calendar-planning failure.
      if (!currentCalendar.length && !referenceCalendar.length) return null;
      const plan = planDynamicCalendar(saveWorld, targetSeason, { date: event.date });
      return {
        type: CALENDAR_EVENT.SCHEDULE_FINALIZED,
        payload: schedulePayload(plan),
      };
    },
  };
}
