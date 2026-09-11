import { SIM_EVENT } from "../timeEngine.js";

export const SEASON_EVENT = Object.freeze({
  ROLLED_OVER: "season.rolled_over",
});

function shiftDateToYear(value, year) {
  const text = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [, monthText, dayText] = text.split("-");
  const month = Number(monthText);
  const day = Number(dayText);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCMonth() !== month - 1) candidate.setUTCDate(0);
  return candidate.toISOString().slice(0, 10);
}

function generatedGpId(race, season, index) {
  const round = Number(race.round);
  const suffix = race.track_id ?? race.circuit_id ?? race.gp_name ?? `race-${index + 1}`;
  return `${season}:${Number.isFinite(round) ? round : index + 1}:${String(suffix).replace(/\s+/g, "-").toLowerCase()}`;
}

function generateCalendar(previousCalendar, season) {
  return [...(previousCalendar ?? [])]
    .sort((a, b) => Number(a.round ?? 999) - Number(b.round ?? 999))
    .map((race, index) => ({
      ...structuredClone(race),
      source_gp_id: race.source_gp_id ?? race.gp_id ?? null,
      gp_id: generatedGpId(race, season, index),
      year: season,
      race_date: shiftDateToYear(race.race_date ?? race.date, season),
      generated: true,
      generation_source: "previous_season_calendar_fallback",
    }));
}

function referenceCalendar(saveWorld, season) {
  const rows = saveWorld.reference?.futureStructure?.calendars?.[String(season)];
  return Array.isArray(rows) ? rows : [];
}

function materializeReferenceCalendar(rows, season) {
  return [...rows]
    .sort((a, b) => Number(a.round ?? 999) - Number(b.round ?? 999))
    .map((race, index) => ({
      ...structuredClone(race),
      year: season,
      round: Number(race.round ?? index + 1),
      gp_id: race.gp_id ?? race.race_id ?? generatedGpId(race, season, index),
      generated: false,
      historical_structure_reference: true,
      generation_source: "global_historical_calendar_reference",
    }));
}

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
      const existingCurrent = (saveWorld.world?.calendar ?? []).filter((row) => Number(row.year) === season);
      const previous = (saveWorld.world?.calendar ?? []).filter((row) => Number(row.year) === previousSeason);
      const references = referenceCalendar(saveWorld, season);

      let calendar;
      let calendarSource;
      if (existingCurrent.length) {
        calendar = existingCurrent;
        calendarSource = "active_world_existing";
      } else if (references.length) {
        calendar = materializeReferenceCalendar(references, season);
        calendarSource = "global_historical_calendar_reference";
      } else {
        const template = previous.length ? previous : saveWorld.world?.calendar ?? [];
        calendar = generateCalendar(template, season);
        calendarSource = "previous_season_calendar_fallback";
      }

      const referencedTracksAdded = materializeReferencedTracks(saveWorld, calendar);
      saveWorld.world.calendar = calendar;
      saveWorld.world.season = season;
      saveWorld.history.seasons ??= [];
      saveWorld.history.seasons.push({
        season,
        previousSeason,
        date: event.date,
        calendarGenerated: calendarSource === "previous_season_calendar_fallback",
        calendarSource,
        races: calendar.length,
        referencedTracksAdded,
      });

      return {
        type: SEASON_EVENT.ROLLED_OVER,
        payload: {
          season,
          previous_season: previousSeason,
          calendar_generated: calendarSource === "previous_season_calendar_fallback",
          calendar_source: calendarSource,
          races: calendar.length,
          referenced_tracks_added: referencedTracksAdded,
        },
      };
    },
  };
}
