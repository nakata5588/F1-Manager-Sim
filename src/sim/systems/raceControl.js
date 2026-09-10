import { reviewRaceTimeline } from "../raceControl.js";
import { RACE_EVENT } from "./raceWeekend.js";

export const RACE_CONTROL_EVENT = Object.freeze({
  REVIEWED: "race.control_reviewed",
});

function updateStoredHistory(saveWorld, payload) {
  const races = saveWorld.history?.races ?? [];
  const index = races.findIndex((row) => row.key === payload.key);
  if (index >= 0) races[index] = structuredClone(payload);
}

export function createRaceControlSystem() {
  return {
    id: "race.control",
    eventTypes: [RACE_EVENT.COMPLETED],
    handle({ saveWorld, event }) {
      const payload = event.payload ?? {};
      if (payload.raceControl || !payload.timelineApplied || !payload.timeline) return null;

      const result = reviewRaceTimeline(saveWorld, payload);
      payload.raceControl = result;
      updateStoredHistory(saveWorld, payload);

      return {
        type: RACE_CONTROL_EVENT.REVIEWED,
        payload: {
          weekend_key: payload.key ?? null,
          gp_id: payload.gpId ?? null,
          status: result.status,
          local_yellows: result.interventions.filter((row) => row.type === "local_yellow").length,
          safety_car_candidates: result.reviews.filter((row) => row.type === "safety_car_review").length,
          vsc_candidates: result.reviews.filter((row) => row.type === "virtual_safety_car_review").length,
          red_flag_candidates: result.reviews.filter((row) => row.type === "red_flag_review").length,
          modern_safety_car_available: result.policy.modernSafetyCar,
        },
      };
    },
  };
}
