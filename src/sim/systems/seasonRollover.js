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
  if (candidate.getUTCMonth() !== month - 1) {
    candidate.setUTCDate(0);
  }
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
      generation_source: "previous_season_calendar",
    }));
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
      const template = previous.length ? previous : saveWorld.world?.calendar ?? [];
      const generated = existingCurrent.length ? existingCurrent : generateCalendar(template, season);

      saveWorld.world.calendar = generated;
      saveWorld.world.season = season;
      saveWorld.history.seasons ??= [];
      saveWorld.history.seasons.push({
        season,
        previousSeason,
        date: event.date,
        calendarGenerated: existingCurrent.length === 0,
        races: generated.length,
      });

      return {
        type: SEASON_EVENT.ROLLED_OVER,
        payload: {
          season,
          previous_season: previousSeason,
          calendar_generated: existingCurrent.length === 0,
          races: generated.length,
        },
      };
    },
  };
}
