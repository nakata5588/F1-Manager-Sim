import { CAREER_EVENT } from "./careerLifecycle.js";
import { EMPLOYMENT_EVENT } from "./employmentMarket.js";

function ensureEmployment(saveWorld) {
  saveWorld.world.employment ??= {
    drivers: {},
    staff: {},
    freeAgents: { drivers: [], staff: [] },
    vacancies: [],
  };
  saveWorld.world.employment.drivers ??= {};
  saveWorld.world.employment.staff ??= {};
  saveWorld.world.employment.freeAgents ??= { drivers: [], staff: [] };
  saveWorld.world.employment.freeAgents.drivers ??= [];
  saveWorld.world.employment.freeAgents.staff ??= [];
  saveWorld.world.employment.vacancies ??= [];
  return saveWorld.world.employment;
}

function removeFreeAgent(employment, type, id) {
  const bucket = type === "driver" ? employment.freeAgents.drivers : employment.freeAgents.staff;
  const index = bucket.indexOf(id);
  if (index >= 0) bucket.splice(index, 1);
}

export function createRetirementEmploymentSystem() {
  return {
    id: "employment.retirement-consequences",
    eventTypes: [CAREER_EVENT.RETIRED],
    handle({ saveWorld, event }) {
      const type = event.payload?.worker_type === "staff" ? "staff" : "driver";
      const id = event.payload?.worker_id ?? null;
      if (!id) return null;

      const employment = ensureEmployment(saveWorld);
      const assignments = type === "driver" ? employment.drivers : employment.staff;
      const assignment = assignments[id] ?? null;
      removeFreeAgent(employment, type, id);
      if (!assignment) return null;

      delete assignments[id];
      const vacancy = {
        vacancyId: `${event.date}:${type}:${assignment.teamId ?? "unknown"}:${assignment.role ?? "unknown"}:${event.sequence}`,
        type,
        teamId: assignment.teamId ?? null,
        role: assignment.role ?? (type === "driver" ? "driver" : "staff"),
        openedAt: event.date,
        status: "open",
        reason: "retirement",
        previousWorkerId: id,
      };
      employment.vacancies.push(vacancy);

      return {
        type: EMPLOYMENT_EVENT.VACANCY_OPENED,
        payload: {
          vacancy_id: vacancy.vacancyId,
          worker_type: type,
          team_id: vacancy.teamId,
          role: vacancy.role,
          reason: "retirement",
          previous_worker_id: id,
        },
      };
    },
  };
}
