import { SIM_EVENT } from "../timeEngine.js";

export const ENTITY_EVENT = Object.freeze({
  ELIGIBLE: "world.entity_eligible",
});

function activationYear(row) {
  const raw = row.activation_year
    ?? row.world_or_talent_activation_year
    ?? row.world_activation_year
    ?? row.talent_activation_year
    ?? row.event_year;
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

function entityType(row) {
  return String(row.entity_type ?? row.type ?? "").trim().toLowerCase();
}

function entityId(row) {
  return row.entity_id ?? row.id ?? null;
}

function isEligibleWhenReached(value) {
  if (value === false || value === 0) return false;
  if (typeof value === "string" && ["false", "no", "0"].includes(value.trim().toLowerCase())) return false;
  return true;
}

function referenceEntryYear(row) {
  const raw = row.next_reference_f1_entry_year ?? row.reference_entry_year ?? row.historical_entry_year;
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

export function createEntityAvailabilitySystem() {
  return {
    id: "world.entity-availability",
    eventTypes: [SIM_EVENT.CAREER_STARTED, SIM_EVENT.SEASON_STARTED],
    handle({ saveWorld, event }) {
      const currentSeason = Number(event.payload?.season ?? saveWorld.clock.season);
      const stateRoot = saveWorld.simulation.systemState;
      const state = stateRoot[this.id] ??= { emittedEligibility: [] };
      const emitted = new Set(state.emittedEligibility);
      const output = [];

      saveWorld.world.entityAvailability ??= {};

      for (const row of saveWorld.world?.futureEntities ?? []) {
        const year = activationYear(row);
        const type = entityType(row);
        const id = entityId(row);
        if (year === null || year > currentSeason || !type || !id) continue;
        if (!isEligibleWhenReached(row.eligible_when_reached)) continue;

        const key = `${type}:${id}`;
        if (emitted.has(key)) continue;
        emitted.add(key);

        const byType = saveWorld.world.entityAvailability[type] ??= {};
        byType[id] = {
          status: "eligible",
          eligibleSince: event.date,
          activationYear: year,
          referenceEntryYear: referenceEntryYear(row),
        };

        output.push({
          type: ENTITY_EVENT.ELIGIBLE,
          payload: {
            entity_type: type,
            entity_id: id,
            name: row.name ?? null,
            activation_year: year,
            reference_entry_year: referenceEntryYear(row),
            state_at_start: row.state_at_1980 ?? row.state_at_start ?? null,
            simulation_rule: row.simulation_rule ?? row.note ?? null,
          },
        });
      }

      state.emittedEligibility = [...emitted].sort();
      return output;
    },
  };
}
