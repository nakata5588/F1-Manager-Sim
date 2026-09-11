import { isEntityF1EligibleInSeason, normalizeEntityVisibility } from "../../domain/entityVisibility.js";
import { SIM_EVENT } from "../timeEngine.js";

export const ENTITY_EVENT = Object.freeze({
  ELIGIBLE: "world.entity_eligible",
});

function entityType(row) {
  const raw = String(row.entity_type ?? row.type ?? "").trim().toLowerCase();
  return ["constructor", "organisation", "organization"].includes(raw) ? "team" : raw;
}

function entityId(row) {
  return row.entity_id ?? row.id ?? null;
}

function isEligibleWhenReached(value) {
  if (value === false || value === 0) return false;
  if (typeof value === "string" && ["false", "no", "0"].includes(value.trim().toLowerCase())) return false;
  return true;
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
        const type = entityType(row);
        const id = entityId(row);
        if (!type || !id || !isEligibleWhenReached(row.eligible_when_reached)) continue;
        if (!isEntityF1EligibleInSeason(row, currentSeason, { type })) continue;

        const key = `${type}:${id}`;
        if (emitted.has(key)) continue;
        emitted.add(key);

        const visibility = normalizeEntityVisibility(row, { type });
        const byType = saveWorld.world.entityAvailability[type] ??= {};
        byType[id] = {
          status: "eligible",
          eligibleSince: event.date,
          f1EligibleFrom: visibility.f1EligibleFrom,
          worldVisibleFrom: visibility.worldVisibleFrom,
          talentVisibleFrom: visibility.talentVisibleFrom,
          f1DebutReference: visibility.f1DebutReference,
          referenceEntryYear: visibility.f1DebutReference,
          visibilitySource: visibility.visibilitySource,
        };

        output.push({
          type: ENTITY_EVENT.ELIGIBLE,
          payload: {
            entity_type: type,
            entity_id: id,
            name: row.name ?? null,
            activation_year: visibility.f1EligibleFrom,
            f1_eligible_from: visibility.f1EligibleFrom,
            reference_entry_year: visibility.f1DebutReference,
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
