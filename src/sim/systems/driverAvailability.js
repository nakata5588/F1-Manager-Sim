import {
  DRIVER_AVAILABILITY_EVENT,
  ensureDriverAvailabilityState,
  initializeDriverAvailability,
  recoverDueDrivers,
  resolveDriverInjury,
} from "../../game/management/driverAvailability.js";
import { SIM_EVENT } from "../timeEngine.js";
import { CAREER_EVENT } from "./careerLifecycle.js";
import { RACE_TIMELINE_EVENT } from "./raceTimeline.js";

function raceByKey(saveWorld, key) {
  return [...(saveWorld.history?.races ?? [])].reverse().find((row) => row?.key === key) ?? null;
}

function highestSeverityIncidents(race) {
  const byDriver = new Map();
  for (const event of race?.timeline?.events ?? []) {
    if (event?.type !== "incident" || !event.driverId) continue;
    const previous = byDriver.get(event.driverId);
    if (!previous || Number(event.severity ?? 0) > Number(previous.severity ?? 0)) {
      byDriver.set(event.driverId, event);
    }
  }
  return [...byDriver.values()];
}

function injuryEvents(saveWorld, event) {
  const race = raceByKey(saveWorld, event.payload?.weekend_key);
  if (!race) return [];
  const output = [];
  for (const incident of highestSeverityIncidents(race)) {
    const injury = resolveDriverInjury(saveWorld, race, incident, { date: event.date });
    if (!injury) continue;
    output.push({
      type: DRIVER_AVAILABILITY_EVENT.INJURED,
      payload: {
        injury_id: injury.id,
        driver_id: injury.driverId,
        team_id: injury.teamId,
        injury_class: injury.injuryClass,
        duration_days: injury.durationDays,
        unavailable_until: injury.unavailableUntil,
        expected_return_date: injury.expectedReturnDate,
        race_key: injury.raceKey,
        gp_id: injury.gpId,
        incident_severity: injury.incidentSeverity,
        car_number: injury.carNumber,
        entrant_id: injury.entrantId,
        tyre_supplier: injury.tyreSupplier,
        source_role: injury.sourceRole,
      },
    });
  }
  return output;
}

function recoveryEvents(saveWorld, event) {
  return recoverDueDrivers(saveWorld, event.date).map((row) => ({
    type: DRIVER_AVAILABILITY_EVENT.RECOVERED,
    payload: {
      driver_id: row.driverId,
      team_id: row.teamId,
      injury_id: row.injuryId,
      injury_class: row.injuryClass,
      recovered_at: row.recoveredAt,
      car_number: row.carNumber,
      entrant_id: row.entrantId,
      tyre_supplier: row.tyreSupplier,
      source_role: row.sourceRole,
    },
  }));
}

export function createDriverAvailabilitySystem() {
  return {
    id: "career.driver-availability",
    eventTypes: [
      SIM_EVENT.CAREER_STARTED,
      SIM_EVENT.DAY_ADVANCED,
      RACE_TIMELINE_EVENT.APPLIED,
      CAREER_EVENT.RETIRED,
    ],
    handle({ saveWorld, event }) {
      if (event.type === SIM_EVENT.CAREER_STARTED) {
        const summary = initializeDriverAvailability(saveWorld, event.date);
        return {
          type: DRIVER_AVAILABILITY_EVENT.INITIALIZED,
          payload: summary,
        };
      }

      if (event.type === SIM_EVENT.DAY_ADVANCED) return recoveryEvents(saveWorld, event);
      if (event.type === RACE_TIMELINE_EVENT.APPLIED) return injuryEvents(saveWorld, event);

      if (event.type === CAREER_EVENT.RETIRED && event.payload?.worker_type === "driver") {
        const driverId = event.payload?.worker_id;
        if (!driverId) return null;
        const state = ensureDriverAvailabilityState(saveWorld);
        state.drivers[driverId] ??= { driverId };
        Object.assign(state.drivers[driverId], {
          status: "retired",
          injuryId: null,
          injuryClass: null,
          unavailableUntil: null,
          expectedReturnDate: null,
        });
      }
      return null;
    },
  };
}
