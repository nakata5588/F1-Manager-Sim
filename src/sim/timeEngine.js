import { advanceDay } from "./clock.js";

export const SIM_EVENT = Object.freeze({
  DAY_ADVANCED: "sim.day_advanced",
  MONTH_STARTED: "sim.month_started",
  SEASON_STARTED: "sim.season_started",
  RACE_DAY: "calendar.race_day",
});

function event(type, date, payload = {}) {
  return { type, date, payload };
}

function scheduledEvents(saveWorld, previousSeason) {
  const { date, season } = saveWorld.clock;
  const events = [event(SIM_EVENT.DAY_ADVANCED, date)];

  if (date.slice(8, 10) === "01") {
    events.push(event(SIM_EVENT.MONTH_STARTED, date, { year: season, month: Number(date.slice(5, 7)) }));
  }
  if (season !== previousSeason) {
    events.push(event(SIM_EVENT.SEASON_STARTED, date, { previousSeason, season }));
  }

  for (const race of saveWorld.world?.calendar ?? []) {
    const raceDate = String(race.race_date ?? race.date ?? "").slice(0, 10);
    if (raceDate === date) {
      events.push(event(SIM_EVENT.RACE_DAY, date, {
        gp_id: race.gp_id ?? null,
        gp_name: race.gp_name ?? null,
        track_id: race.track_id ?? null,
        round: race.round ?? null,
      }));
    }
  }

  return events;
}

export function dispatchSimulationEvents(saveWorld, initialEvents, systems = []) {
  const queue = [...initialEvents];
  const processed = [];
  let sequence = 0;
  const MAX_EVENTS = 10_000;

  while (queue.length > 0) {
    if (processed.length >= MAX_EVENTS) throw new Error("Simulation event limit exceeded; possible event loop.");
    const raw = queue.shift();
    const current = {
      id: `${raw.date}:${String(sequence).padStart(6, "0")}:${raw.type}`,
      sequence,
      type: raw.type,
      date: raw.date,
      payload: raw.payload ?? {},
    };
    sequence += 1;
    processed.push(current);

    for (const system of systems) {
      if (!system || typeof system.handle !== "function") continue;
      if (Array.isArray(system.eventTypes) && !system.eventTypes.includes(current.type)) continue;
      const emitted = system.handle({ saveWorld, event: current });
      if (emitted == null) continue;
      const values = Array.isArray(emitted) ? emitted : [emitted];
      for (const next of values) {
        if (!next?.type) throw new TypeError("Simulation systems may only emit events with a type.");
        queue.push({ ...next, date: next.date ?? current.date, payload: next.payload ?? {} });
      }
    }
  }

  return processed;
}

export function advanceDays(saveWorld, days, systems = []) {
  if (!Number.isInteger(days) || days < 0) throw new RangeError("days must be a non-negative integer.");
  const processed = [];

  for (let index = 0; index < days; index += 1) {
    const previousSeason = saveWorld.clock.season;
    advanceDay(saveWorld);
    const baseEvents = scheduledEvents(saveWorld, previousSeason);
    processed.push(...dispatchSimulationEvents(saveWorld, baseEvents, systems));
  }

  return { clock: { ...saveWorld.clock }, events: processed };
}
