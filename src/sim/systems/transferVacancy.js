import { EMPLOYMENT_EVENT } from "./employmentMarket.js";

function ensureEmployment(saveWorld) {
  saveWorld.world.employment ??= {
    drivers: {},
    staff: {},
    futureAssignments: { drivers: {}, staff: {} },
    freeAgents: { drivers: [], staff: [] },
    vacancies: [],
  };
  saveWorld.world.employment.drivers ??= {};
  saveWorld.world.employment.staff ??= {};
  saveWorld.world.employment.vacancies ??= [];
  return saveWorld.world.employment;
}

function assignmentBucket(employment, type) {
  return type === "staff" ? employment.staff : employment.drivers;
}

function currentSeason(saveWorld) {
  return Number(saveWorld.clock?.season);
}

function startSeason(event, fallback) {
  const parsed = Number(event.payload?.contract_start);
  return Number.isInteger(parsed) ? parsed : fallback;
}

export function createTransferVacancySystem() {
  return {
    id: "employment.transfer-vacancy",
    eventTypes: [EMPLOYMENT_EVENT.CONTRACT_SIGNED],
    handle({ saveWorld, event }) {
      const type = String(event.payload?.worker_type ?? "driver").toLowerCase() === "staff" ? "staff" : "driver";
      const id = event.payload?.worker_id ?? null;
      const targetTeamId = event.payload?.team_id ?? null;
      if (!id || !targetTeamId) return null;
      const season = currentSeason(saveWorld);
      if (startSeason(event, season) > season) return null;

      const employment = ensureEmployment(saveWorld);
      const current = assignmentBucket(employment, type)[id];
      const previousTeamId = event.payload?.from_team_id ?? current?.teamId ?? null;
      if (!previousTeamId || String(previousTeamId) === String(targetTeamId)) return null;

      const role = current?.role ?? event.payload?.previous_role ?? (type === "driver" ? "driver" : "staff");
      const vacancyId = `transfer:${event.date}:${type}:${previousTeamId}:${role}:${id}`;
      let vacancy = employment.vacancies.find((row) => row.vacancyId === vacancyId);
      if (!vacancy) {
        vacancy = {
          vacancyId,
          type,
          teamId: previousTeamId,
          role,
          openedAt: event.date,
          reason: "worker_transferred",
          previousWorkerId: id,
          destinationTeamId: targetTeamId,
          status: "open",
        };
        employment.vacancies.push(vacancy);
      }

      return {
        type: EMPLOYMENT_EVENT.VACANCY_OPENED,
        payload: {
          vacancy_id: vacancyId,
          worker_type: type,
          team_id: previousTeamId,
          role,
          reason: "worker_transferred",
          previous_worker_id: id,
          destination_team_id: targetTeamId,
        },
      };
    },
  };
}
