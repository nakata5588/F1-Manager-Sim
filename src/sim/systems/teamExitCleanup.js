import { TEAM_EVOLUTION_EVENT } from "../../game/management/teamEvolution.js";

function archiveObjectBucket(world, activeKey, archiveKey, teamId) {
  const active = world?.[activeKey];
  if (!active || !Object.hasOwn(active, teamId)) return false;
  world[archiveKey] ??= {};
  world[archiveKey][teamId] = structuredClone(active[teamId]);
  delete active[teamId];
  return true;
}

function archiveTechnicalTeam(saveWorld, teamId) {
  const technical = saveWorld.world?.technical;
  if (!technical) return;
  technical.inactiveTeams ??= {};
  if (technical.teams?.[teamId]) {
    technical.inactiveTeams[teamId] = structuredClone(technical.teams[teamId]);
    delete technical.teams[teamId];
  }
  if (technical.suppliers?.teams?.[teamId]) {
    technical.inactiveSupplierTeams ??= {};
    technical.inactiveSupplierTeams[teamId] = structuredClone(technical.suppliers.teams[teamId]);
    delete technical.suppliers.teams[teamId];
  }
}

function cancelFutureAssignments(employment, teamId, date) {
  let cancelled = 0;
  for (const type of ["drivers", "staff"]) {
    const bucket = employment?.futureAssignments?.[type] ?? {};
    for (const [workerId, assignment] of Object.entries(bucket)) {
      if (assignment?.teamId !== teamId) continue;
      delete bucket[workerId];
      cancelled += 1;
    }
  }
  for (const vacancy of employment?.vacancies ?? []) {
    if (vacancy?.teamId !== teamId || vacancy.status !== "open") continue;
    vacancy.status = "cancelled";
    vacancy.closedAt = date;
    vacancy.closeReason = "team_exit";
  }
  return cancelled;
}

export function archiveExitedTeamOperationalState(saveWorld, teamId, date = saveWorld.clock?.date ?? null) {
  if (!teamId) return { teamId: null, archived: false, cancelledFutureAssignments: 0 };
  const world = saveWorld.world ?? {};
  const archivedFinance = archiveObjectBucket(world, "teamState", "inactiveTeamState", teamId);
  const archivedCar = archiveObjectBucket(world, "carState", "inactiveCarState", teamId);
  archiveTechnicalTeam(saveWorld, teamId);
  const cancelledFutureAssignments = cancelFutureAssignments(world.employment, teamId, date);
  return {
    teamId,
    archived: archivedFinance || archivedCar,
    archivedFinance,
    archivedCar,
    cancelledFutureAssignments,
  };
}

export function createTeamExitCleanupSystem() {
  return {
    id: "team.exit_cleanup",
    eventTypes: [TEAM_EVOLUTION_EVENT.TEAM_EXITED],
    handle({ saveWorld, event }) {
      const result = archiveExitedTeamOperationalState(saveWorld, event.payload?.team_id, event.date);
      saveWorld.history.teamEvolution ??= [];
      saveWorld.history.teamEvolution.push({
        date: event.date,
        type: "team_exit_operational_state_archived",
        ...result,
      });
      return null;
    },
  };
}
