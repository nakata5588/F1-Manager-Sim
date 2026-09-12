import { SIM_EVENT } from "../timeEngine.js";
import { CAREER_EVENT } from "./careerLifecycle.js";
import { CONTRACT_EVENT } from "./contractMilestones.js";
import { EMPLOYMENT_EVENT } from "./employmentMarket.js";
import { RACE_EVENT } from "./raceWeekend.js";
import { TEAM_EVOLUTION_EVENT } from "../../game/management/teamEvolution.js";

export const RACE_ENTRY_EVENT = Object.freeze({
  INITIALIZED: "race.entries_initialized",
  UPDATED: "race.entries_updated",
});

function raceRole(role) {
  const text = String(role ?? "driver").trim().toLowerCase();
  if (["", "driver", "main_driver", "race_driver", "primary_driver", "secondary_driver", "lead_driver", "second_driver"].includes(text)) return true;
  return !text.includes("reserve") && !text.includes("test") && !text.includes("third") && !text.includes("development");
}

function ensureState(saveWorld) {
  saveWorld.world.raceEntryState ??= {
    season: Number(saveWorld.clock.season),
    current: [],
    source: "employment_fallback",
    revision: 0,
  };
  saveWorld.world.raceEntryState.current ??= [];
  return saveWorld.world.raceEntryState;
}

function normalizeEntry(row, source = "season_pack") {
  const driverId = row?.driverId ?? row?.driver_id;
  const teamId = row?.teamId ?? row?.team_id;
  if (!driverId || !teamId) return null;
  return {
    driverId,
    teamId,
    entrantId: row?.entrantId ?? row?.entrant_id ?? null,
    carNumber: row?.carNumber ?? row?.car_number ?? row?.driver_number ?? row?.number ?? null,
    tyreSupplier: row?.tyreSupplier ?? row?.tyre_supplier ?? null,
    sourceRole: row?.sourceRole ?? row?.source_role ?? row?.role ?? null,
    source,
  };
}

function employmentEntries(saveWorld) {
  return Object.entries(saveWorld.world?.employment?.drivers ?? {})
    .filter(([driverId, assignment]) => assignment?.status === "employed"
      && assignment.teamId
      && raceRole(assignment.role)
      && saveWorld.world?.careerState?.drivers?.[driverId]?.status !== "retired")
    .map(([driverId, assignment]) => normalizeEntry({
      driverId,
      teamId: assignment.teamId,
      role: assignment.role,
    }, "employment"))
    .filter(Boolean);
}

function sortEntries(entries) {
  return entries.sort((a, b) => String(a.teamId).localeCompare(String(b.teamId))
    || Number(a.carNumber ?? 999) - Number(b.carNumber ?? 999)
    || String(a.driverId).localeCompare(String(b.driverId)));
}

function initialize(saveWorld) {
  const state = ensureState(saveWorld);
  const explicit = (saveWorld.world?.startingRaceEntries ?? [])
    .map((row) => normalizeEntry(row, "season_pack_start_entry"))
    .filter(Boolean)
    .filter((entry) => saveWorld.world?.careerState?.drivers?.[entry.driverId]?.status !== "retired");
  state.current = sortEntries(explicit.length ? explicit : employmentEntries(saveWorld));
  state.source = explicit.length ? "season_pack_start_entries" : "employment_fallback";
  state.season = Number(saveWorld.clock.season);
  state.revision += 1;
  return state;
}

function startSeason(saveWorld, event) {
  const state = ensureState(saveWorld);
  const season = Number(event.payload?.season ?? saveWorld.clock.season);
  if (!Number.isFinite(season) || state.season === season) return null;
  state.season = season;
  state.source = "save_world_dynamic";
  state.revision += 1;
  return { reason: "season_started", season };
}

function removeDriver(saveWorld, driverId, reason, teamId = null) {
  if (!driverId) return null;
  const state = ensureState(saveWorld);
  const entry = state.current.find((row) => row.driverId === driverId);
  if (!entry || (teamId && entry.teamId !== teamId)) return null;
  state.current = state.current.filter((row) => row.driverId !== driverId);
  state.revision += 1;
  return { reason, driverId, teamId: entry.teamId };
}

function removeTeam(saveWorld, teamId, reason = "team_exited") {
  if (!teamId) return null;
  const state = ensureState(saveWorld);
  const removed = state.current.filter((row) => row.teamId === teamId);
  if (!removed.length) return null;
  state.current = state.current.filter((row) => row.teamId !== teamId);
  state.source = "save_world_dynamic";
  state.revision += 1;
  return {
    reason,
    teamId,
    removedDrivers: removed.map((row) => row.driverId),
  };
}

function upsertSignedDriver(saveWorld, event) {
  if (String(event.payload?.worker_type ?? "driver").toLowerCase() !== "driver") return null;
  const driverId = event.payload?.worker_id;
  const teamId = event.payload?.team_id;
  const role = event.payload?.role ?? "driver";
  if (!driverId || !teamId || !raceRole(role)) return null;

  const state = ensureState(saveWorld);
  const index = state.current.findIndex((entry) => entry.driverId === driverId);
  const previous = index >= 0 ? state.current[index] : null;
  const next = normalizeEntry({ driverId, teamId, role }, "simulation_contract");
  if (previous) {
    next.entrantId = previous.entrantId;
    next.carNumber = previous.carNumber;
    next.tyreSupplier = previous.tyreSupplier;
    state.current[index] = next;
  } else {
    state.current.push(next);
  }
  sortEntries(state.current);
  state.source = "save_world_dynamic";
  state.revision += 1;
  return {
    reason: previous && previous.teamId !== teamId ? "race_driver_reassigned" : "race_driver_signed",
    driverId,
    teamId,
    previousTeamId: previous?.teamId ?? null,
  };
}

function projectionState(saveWorld) {
  return saveWorld.simulation.systemState["race.entries"] ??= { projection: null };
}

function employmentAssignments(saveWorld) {
  saveWorld.world.employment ??= {};
  saveWorld.world.employment.drivers ??= {};
  return saveWorld.world.employment.drivers;
}

// Compatibility bridge while Race Weekend still reads the employment projection.
// The authoritative participation state remains world.raceEntryState; original
// employment roles are restored immediately after the weekend is resolved.
function projectToEmployment(saveWorld) {
  const state = ensureState(saveWorld);
  const system = projectionState(saveWorld);
  if (system.projection) return;
  const assignments = employmentAssignments(saveWorld);
  const backup = {};
  for (const entry of state.current) {
    const current = assignments[entry.driverId];
    backup[entry.driverId] = current ? structuredClone(current) : null;
    assignments[entry.driverId] = {
      ...(current ?? {}),
      teamId: entry.teamId,
      role: raceRole(current?.role) ? current.role : "race_driver",
      status: "employed",
      raceEntryProjection: true,
    };
  }
  system.projection = backup;
}

function restoreEmployment(saveWorld) {
  const system = projectionState(saveWorld);
  const backup = system.projection;
  if (!backup) return;
  const assignments = employmentAssignments(saveWorld);
  for (const [driverId, original] of Object.entries(backup)) {
    if (original === null) delete assignments[driverId];
    else assignments[driverId] = original;
  }
  system.projection = null;
}

function updateEvent(state, change) {
  return {
    type: RACE_ENTRY_EVENT.UPDATED,
    payload: {
      season: state.season,
      revision: state.revision,
      entries: state.current.length,
      ...change,
    },
  };
}

export function createRaceEntrySystem() {
  return {
    id: "race.entries",
    eventTypes: [
      SIM_EVENT.CAREER_STARTED,
      SIM_EVENT.SEASON_STARTED,
      SIM_EVENT.RACE_DAY,
      CONTRACT_EVENT.EXPIRED,
      EMPLOYMENT_EVENT.CONTRACT_SIGNED,
      CAREER_EVENT.RETIRED,
      TEAM_EVOLUTION_EVENT.TEAM_EXITED,
      RACE_EVENT.COMPLETED,
      RACE_EVENT.SKIPPED,
    ],
    handle({ saveWorld, event }) {
      if (event.type === SIM_EVENT.CAREER_STARTED) {
        const state = initialize(saveWorld);
        return {
          type: RACE_ENTRY_EVENT.INITIALIZED,
          payload: {
            season: state.season,
            source: state.source,
            entries: state.current.length,
            revision: state.revision,
          },
        };
      }

      if (event.type === SIM_EVENT.SEASON_STARTED) {
        const change = startSeason(saveWorld, event);
        return change ? updateEvent(ensureState(saveWorld), change) : null;
      }

      if (event.type === SIM_EVENT.RACE_DAY) {
        // `seasonPack.roundEntryReference` is audit/calibration data only. Race-day
        // participation evolves from the Save World and is never scripted from it.
        projectToEmployment(saveWorld);
        return null;
      }

      if (event.type === RACE_EVENT.COMPLETED || event.type === RACE_EVENT.SKIPPED) {
        restoreEmployment(saveWorld);
        return null;
      }

      if (event.type === TEAM_EVOLUTION_EVENT.TEAM_EXITED) {
        const change = removeTeam(saveWorld, event.payload?.team_id, "team_exited");
        return change ? updateEvent(ensureState(saveWorld), change) : null;
      }

      if (event.type === CONTRACT_EVENT.EXPIRED) {
        const change = removeDriver(
          saveWorld,
          event.payload?.driver_id,
          "contract_expired",
          event.payload?.team_id ?? null,
        );
        return change ? updateEvent(ensureState(saveWorld), change) : null;
      }

      if (event.type === CAREER_EVENT.RETIRED && event.payload?.worker_type === "driver") {
        const change = removeDriver(saveWorld, event.payload?.worker_id, "retired");
        return change ? updateEvent(ensureState(saveWorld), change) : null;
      }

      const change = upsertSignedDriver(saveWorld, event);
      return change ? updateEvent(ensureState(saveWorld), change) : null;
    },
  };
}
