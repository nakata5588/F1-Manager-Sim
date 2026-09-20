import { addManagementInboxItem } from "../../game/management/inbox.js";
import {
  DRIVER_AVAILABILITY_EVENT,
  ensureDriverAvailabilityState,
} from "../../game/management/driverAvailability.js";
import {
  holdReplacementDriverFromMarket,
  releaseReplacementDriverToMarket,
  replacementDriverCandidates,
} from "../../game/management/driverMarket.js";
import {
  assignTemporaryRaceReplacement,
  removeRaceEntryDriver,
  restoreTemporaryRaceSeat,
} from "./raceEntry.js";
import { controlledTeamSet } from "./controlState.js";

function raceRole(role) {
  const text = String(role ?? "driver").trim().toLowerCase();
  if (["", "driver", "main_driver", "race_driver", "primary_driver", "secondary_driver", "lead_driver", "second_driver"].includes(text)) return true;
  return !text.includes("reserve") && !text.includes("test") && !text.includes("third") && !text.includes("development");
}

function driverName(saveWorld, driverId) {
  const profile = (saveWorld.world?.drivers ?? []).find((row) => String(row.driver_id) === String(driverId)) ?? {};
  return profile.display_name ?? profile.driver_name ?? profile.name ?? driverId;
}

function teamName(saveWorld, teamId) {
  const row = (saveWorld.world?.teams ?? []).find((team) => String(team.team_id) === String(teamId)) ?? {};
  return row.team_name ?? row.display_name ?? row.name ?? teamId;
}

function notify(saveWorld, controlled, teamId, input) {
  if (!teamId || !controlled.has(String(teamId))) return null;
  return addManagementInboxItem(saveWorld, {
    date: input.date ?? saveWorld.clock?.date,
    category: "drivers",
    priority: input.priority ?? "normal",
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    title: input.title,
    body: input.body,
  });
}

function chooseReplacement(saveWorld, teamId, absentDriverId) {
  return replacementDriverCandidates(saveWorld, teamId, absentDriverId)[0] ?? null;
}

function appointReplacement(saveWorld, event, controlled) {
  const state = ensureDriverAvailabilityState(saveWorld);
  const absentDriverId = event.payload?.driver_id;
  const teamId = event.payload?.team_id;
  if (!absentDriverId) return null;

  if (!teamId) {
    removeRaceEntryDriver(saveWorld, absentDriverId, "injury");
    return null;
  }

  const existing = state.replacements.find((row) => row.status === "active" && row.absentDriverId === absentDriverId);
  if (existing) return null;

  const candidate = chooseReplacement(saveWorld, teamId, absentDriverId);
  if (!candidate) {
    removeRaceEntryDriver(saveWorld, absentDriverId, "injury_no_replacement");
    notify(saveWorld, controlled, teamId, {
      date: event.date,
      priority: "high",
      sourceType: "driver_replacement_unavailable",
      sourceId: event.payload?.injury_id ?? absentDriverId,
      title: `No replacement available for ${driverName(saveWorld, absentDriverId)}`,
      body: `${teamName(saveWorld, teamId)} currently has no eligible replacement for the injured driver. The seat will remain vacant until a suitable driver becomes available.`,
    });
    return {
      type: DRIVER_AVAILABILITY_EVENT.REPLACEMENT_UNAVAILABLE,
      payload: {
        driver_id: absentDriverId,
        team_id: teamId,
        injury_id: event.payload?.injury_id ?? null,
      },
    };
  }

  const agreementId = `replacement:${String(state.nextReplacementId++).padStart(6, "0")}`;
  const previousMarketPath = holdReplacementDriverFromMarket(saveWorld, candidate.driverId, teamId, candidate.source, event.date);
  const agreement = {
    id: agreementId,
    status: "active",
    teamId,
    absentDriverId,
    replacementDriverId: candidate.driverId,
    source: candidate.source,
    candidateScore: candidate.score,
    startedAt: event.date,
    injuryId: event.payload?.injury_id ?? null,
    expectedReturnDate: event.payload?.expected_return_date ?? null,
    carNumber: event.payload?.car_number ?? null,
    entrantId: event.payload?.entrant_id ?? null,
    tyreSupplier: event.payload?.tyre_supplier ?? null,
    sourceRole: event.payload?.source_role ?? "race_driver",
    previousMarketPath,
    endedAt: null,
    endReason: null,
  };
  state.replacements.push(agreement);

  assignTemporaryRaceReplacement(saveWorld, {
    absentDriverId,
    replacementDriverId: candidate.driverId,
    teamId,
    carNumber: agreement.carNumber,
    entrantId: agreement.entrantId,
    tyreSupplier: agreement.tyreSupplier,
    agreementId,
  });

  saveWorld.history.driverAvailability.push({
    date: event.date,
    type: "replacement_started",
    agreementId,
    teamId,
    absentDriverId,
    replacementDriverId: candidate.driverId,
    source: candidate.source,
  });

  notify(saveWorld, controlled, teamId, {
    date: event.date,
    priority: "high",
    sourceType: "driver_injury_replacement",
    sourceId: agreementId,
    title: `${driverName(saveWorld, candidate.driverId)} appointed as temporary replacement`,
    body: `${driverName(saveWorld, absentDriverId)} is unavailable until ${event.payload?.unavailable_until ?? "further medical review"}. ${driverName(saveWorld, candidate.driverId)} has been registered as the temporary race replacement from the ${candidate.source.replaceAll("_", " ")} pool.`,
  });

  return {
    type: DRIVER_AVAILABILITY_EVENT.REPLACEMENT_APPOINTED,
    payload: {
      agreement_id: agreementId,
      injury_id: agreement.injuryId,
      team_id: teamId,
      absent_driver_id: absentDriverId,
      replacement_driver_id: candidate.driverId,
      source: candidate.source,
      candidate_score: candidate.score,
      expected_return_date: agreement.expectedReturnDate,
    },
  };
}

function endReplacement(saveWorld, event, controlled) {
  const state = ensureDriverAvailabilityState(saveWorld);
  const returningDriverId = event.payload?.driver_id;
  if (!returningDriverId) return [];
  const active = state.replacements.filter((row) => row.status === "active" && row.absentDriverId === returningDriverId);
  const output = [];

  for (const agreement of active) {
    const assignment = saveWorld.world?.employment?.drivers?.[returningDriverId] ?? null;
    const canRestore = assignment?.status === "employed"
      && String(assignment.teamId) === String(agreement.teamId)
      && raceRole(assignment.role);

    if (canRestore) {
      restoreTemporaryRaceSeat(saveWorld, {
        returningDriverId,
        replacementDriverId: agreement.replacementDriverId,
        teamId: agreement.teamId,
        carNumber: agreement.carNumber,
        entrantId: agreement.entrantId,
        tyreSupplier: agreement.tyreSupplier,
        sourceRole: agreement.sourceRole,
      });
    } else {
      removeRaceEntryDriver(saveWorld, agreement.replacementDriverId, "replacement_ended_without_seat_restore");
    }

    releaseReplacementDriverToMarket(saveWorld, agreement.replacementDriverId, event.date);
    agreement.status = "ended";
    agreement.endedAt = event.date;
    agreement.endReason = canRestore ? "driver_recovered" : "seat_no_longer_owned";

    saveWorld.history.driverAvailability.push({
      date: event.date,
      type: "replacement_ended",
      agreementId: agreement.id,
      teamId: agreement.teamId,
      absentDriverId: returningDriverId,
      replacementDriverId: agreement.replacementDriverId,
      restored: canRestore,
    });

    notify(saveWorld, controlled, agreement.teamId, {
      date: event.date,
      priority: "normal",
      sourceType: "driver_recovered",
      sourceId: agreement.injuryId ?? returningDriverId,
      title: `${driverName(saveWorld, returningDriverId)} cleared to return`,
      body: canRestore
        ? `${driverName(saveWorld, returningDriverId)} has recovered and returns to the race entry. ${driverName(saveWorld, agreement.replacementDriverId)}'s temporary replacement agreement has ended.`
        : `${driverName(saveWorld, returningDriverId)} has recovered, but the previous race seat is no longer held under the same contract role.`,
    });

    output.push({
      type: DRIVER_AVAILABILITY_EVENT.REPLACEMENT_ENDED,
      payload: {
        agreement_id: agreement.id,
        team_id: agreement.teamId,
        returning_driver_id: returningDriverId,
        replacement_driver_id: agreement.replacementDriverId,
        restored: canRestore,
        reason: agreement.endReason,
      },
    });
  }
  return output;
}

export function createReplacementDriverSystem(options = {}) {
  const controlled = controlledTeamSet(null, options.controlledTeamIds ?? []);
  return {
    id: "career.replacement-drivers",
    eventTypes: [
      DRIVER_AVAILABILITY_EVENT.INJURED,
      DRIVER_AVAILABILITY_EVENT.RECOVERED,
    ],
    handle({ saveWorld, event }) {
      // Rebuild the set from Save World as manager careers can change teams.
      const dynamicControlled = controlledTeamSet(saveWorld, options.controlledTeamIds ?? []);
      if (event.type === DRIVER_AVAILABILITY_EVENT.INJURED) {
        return appointReplacement(saveWorld, event, dynamicControlled);
      }
      return endReplacement(saveWorld, event, dynamicControlled);
    },
  };
}
