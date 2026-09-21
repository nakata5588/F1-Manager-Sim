import {
  applyCalendarPlan,
  calendarPlanFor,
  initializeCalendarPromoters,
  planDynamicCalendar,
} from "../../game/management/calendarPromoters.js";
import { SIM_EVENT } from "../timeEngine.js";

export const SEASON_EVENT = Object.freeze({
  ROLLED_OVER: "season.rolled_over",
});

function materializeReferencedTracks(saveWorld, calendar) {
  const required = new Set(calendar.map((row) => row.track_id ?? row.circuit_id).filter(Boolean));
  if (!required.size) return 0;
  saveWorld.world.tracks ??= [];
  const active = new Set(saveWorld.world.tracks.map((row) => row.track_id ?? row.circuit_id).filter(Boolean));
  const references = saveWorld.reference?.futureStructure?.tracks ?? [];
  let added = 0;
  for (const track of references) {
    const id = track.track_id ?? track.circuit_id;
    if (!id || !required.has(id) || active.has(id)) continue;
    saveWorld.world.tracks.push(structuredClone(track));
    active.add(id);
    added += 1;
  }
  return added;
}

export function createSeasonRolloverSystem() {
  return {
    id: "season.rollover",
    eventTypes: [SIM_EVENT.SEASON_STARTED],
    handle({ saveWorld, event }) {
      const season = Number(event.payload?.season ?? saveWorld.clock.season);
      const previousSeason = Number(event.payload?.previousSeason ?? season - 1);
      const existingCurrent = (saveWorld.world?.calendar ?? []).filter((row) => Number(row.year ?? row.season) === season);

      initializeCalendarPromoters(saveWorld, event.date);

      let calendar;
      let calendarSource;
      let plan = null;
      let plannedJustInTime = false;

      if (existingCurrent.length) {
        calendar = existingCurrent;
        calendarSource = "active_world_existing";
      } else {
        plan = calendarPlanFor(saveWorld, season);
        const previousCalendar = saveWorld.world?.calendar ?? [];
        if (!plan && previousCalendar.length) {
          plan = planDynamicCalendar(saveWorld, season, {
            previousCalendar,
            date: event.date,
          });
          plannedJustInTime = true;
        }
        if (plan) {
          calendar = structuredClone(plan.calendar ?? []);
          calendarSource = "dynamic_calendar_promoter_system";
          applyCalendarPlan(saveWorld, season, event.date);
        } else {
          // Calendar-less focused Save Worlds existed before Stage 21 and remain
          // valid for non-racing domain tests/systems.
          calendar = [];
          calendarSource = "no_calendar_available";
        }
      }

      const referencedTracksAdded = materializeReferencedTracks(saveWorld, calendar);
      saveWorld.world.calendar = calendar;
      saveWorld.world.season = season;
      saveWorld.history.seasons ??= [];
      saveWorld.history.seasons.push({
        season,
        previousSeason,
        date: event.date,
        calendarGenerated: calendarSource === "dynamic_calendar_promoter_system",
        calendarSource,
        races: calendar.length,
        referencedTracksAdded,
        calendarTargetRaces: plan?.targetRaceCount ?? null,
        calendarReferenceRaces: plan?.referenceRaceCount ?? null,
        calendarAdded: structuredClone(plan?.added ?? []),
        calendarDropped: structuredClone(plan?.dropped ?? []),
        calendarRenewed: structuredClone(plan?.renewed ?? []),
        calendarPlannedJustInTime: plannedJustInTime,
      });

      return {
        type: SEASON_EVENT.ROLLED_OVER,
        payload: {
          season,
          previous_season: previousSeason,
          calendar_generated: calendarSource === "dynamic_calendar_promoter_system",
          calendar_source: calendarSource,
          races: calendar.length,
          referenced_tracks_added: referencedTracksAdded,
          calendar_target_races: plan?.targetRaceCount ?? null,
          calendar_reference_races: plan?.referenceRaceCount ?? null,
          calendar_added: structuredClone(plan?.added ?? []),
          calendar_dropped: structuredClone(plan?.dropped ?? []),
          calendar_renewed: structuredClone(plan?.renewed ?? []),
          calendar_planned_just_in_time: plannedJustInTime,
        },
      };
    },
  };
}
