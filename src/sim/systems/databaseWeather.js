import { createRng } from "../random.js";
import { RACE_EVENT } from "./raceWeekend.js";

function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function existingWeatherTimeline(race) {
  const value = race?.weather_timeline ?? race?.weatherTimeline ?? race?.condition_timeline ?? race?.conditions_timeline;
  if (Array.isArray(value) && value.length) return true;
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

function generateWeather(saveWorld, weekend, race) {
  const baseline = race?.weather_probability_baseline;
  if (!baseline || existingWeatherTimeline(race)) return null;

  const rainChance = clamp(numeric(baseline.rainChancePercent, 0), 0, 100) / 100;
  const stormChance = clamp(numeric(baseline.stormChancePercent, 0), 0, 100) / 100;
  const laps = Math.max(1, Math.round(numeric(race.scheduled_laps ?? race.laps ?? race.race_laps ?? weekend?.totalLaps, 60)));
  const rng = createRng(`${saveWorld.meta.seed}|${weekend.key}|database-weather`);
  const storm = rng.next() < stormChance;
  const rain = storm || rng.next() < rainChance;
  const changes = [{ lap: 1, condition: "dry" }];

  if (rain) {
    const startsWet = storm || rng.next() < 0.32;
    if (startsWet) {
      changes[0].condition = "wet";
      if (!storm && laps >= 8 && rng.next() < 0.5) {
        changes.push({ lap: Math.max(2, Math.round(laps * (0.45 + rng.next() * 0.3))), condition: "dry" });
      }
    } else if (laps >= 4) {
      changes.push({ lap: Math.max(2, Math.round(laps * (0.22 + rng.next() * 0.5))), condition: "wet" });
    }
  }

  return {
    changes,
    metadata: {
      source: "save_world_generated_from_database_probability_baseline",
      weatherProfileId: baseline.weatherProfileId ?? null,
      rainChancePercent: rainChance * 100,
      stormChancePercent: stormChance * 100,
      climateBand: baseline.climateBand ?? null,
      averageAirTempC: numeric(baseline.averageAirTempC),
      windProfile: baseline.windProfile ?? null,
      generatedAt: weekend.date ?? saveWorld.clock?.date ?? null,
    },
  };
}

export function createDatabaseWeatherSystem() {
  return {
    id: "race.database-weather",
    eventTypes: [RACE_EVENT.WEEKEND_STARTED],
    handle({ saveWorld, event }) {
      const key = event.payload?.weekend_key ?? null;
      const weekend = key ? saveWorld.world?.raceWeekendState?.active?.[key] : null;
      if (!weekend) return null;
      const calendarRace = (saveWorld.world?.calendar ?? []).find((row) => row.gp_id === weekend.gpId)
        ?? (saveWorld.world?.calendar ?? []).find((row) => Number(row.round) === Number(weekend.round));
      if (!calendarRace) return null;

      const generated = generateWeather(saveWorld, weekend, calendarRace);
      if (!generated) return null;
      calendarRace.weather_timeline = structuredClone(generated.changes);
      calendarRace.generated_weather = structuredClone(generated.metadata);
      weekend.race ??= structuredClone(calendarRace);
      weekend.race.weather_timeline = structuredClone(generated.changes);
      weekend.race.generated_weather = structuredClone(generated.metadata);
      weekend.weatherGeneration = structuredClone(generated.metadata);
      return null;
    },
  };
}
