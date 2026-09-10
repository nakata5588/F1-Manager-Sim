import { simulateTemporalRace } from "../raceTimeline.js";
import { RACE_EVENT } from "./raceWeekend.js";

export const RACE_TIMELINE_EVENT = Object.freeze({
  APPLIED: "race.timeline_applied",
});

function updateStoredHistory(saveWorld, payload) {
  const races = saveWorld.history?.races ?? [];
  const index = races.findIndex((row) => row.key === payload.key);
  if (index >= 0) races[index] = structuredClone(payload);
}

export function createRaceTimelineSystem() {
  return {
    id: "race.timeline",
    eventTypes: [RACE_EVENT.COMPLETED],
    handle({ saveWorld, event }) {
      const payload = event.payload ?? {};
      if (payload.timelineApplied) return null;
      if (!payload.key || !Array.isArray(payload.grid) || !Array.isArray(payload.classification)) return null;

      const result = simulateTemporalRace(saveWorld, payload);
      payload.classification = result.classification;
      payload.timeline = result.timeline;
      payload.timelineApplied = true;
      // The lap model already consumes locked tyre strategy and pit-stop execution.
      // Prevent the aggregate strategy layer from applying the same modifier twice.
      payload.strategyApplied = true;
      updateStoredHistory(saveWorld, payload);

      return {
        type: RACE_TIMELINE_EVENT.APPLIED,
        payload: {
          weekend_key: payload.key,
          gp_id: payload.gpId ?? null,
          laps_simulated: result.timeline.lapsSimulated,
          winner_driver_id: result.classification[0]?.driverId ?? null,
          retirements: result.classification.filter((row) => row.status === "DNF").length,
          overtakes: result.timeline.events.filter((row) => row.type === "overtake").length,
          pit_stops: result.timeline.events.filter((row) => row.type === "pit_stop").length,
          weather_changes: result.timeline.events.filter((row) => row.type === "weather_change").length,
        },
      };
    },
  };
}
