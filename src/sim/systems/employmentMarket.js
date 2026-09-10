import { createRng } from "../random.js";
import { SIM_EVENT } from "../timeEngine.js";
import { CONTRACT_EVENT } from "./contractMilestones.js";
import { ENTITY_EVENT } from "./entityAvailability.js";

export const EMPLOYMENT_EVENT = Object.freeze({
  INITIALIZED: "employment.market_initialized",
  FREE_AGENT: "employment.free_agent",
  VACANCY_OPENED: "employment.vacancy_opened",
  CONTRACT_SIGNED: "employment.contract_signed",
});

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

function asYear(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function contractEnd(contract) {
  return asYear(contract?.contract_until ?? contract?.contract_until_year ?? contract?.end_year);
}

function contractStart(contract, fallbackSeason) {
  return asYear(contract?.contract_start ?? contract?.contract_start_year ?? contract?.year) ?? fallbackSeason;
}

function workerTypeFromContractEvent(event) {
  return event.payload?.contractType === "staff" ? "staff" : "driver";
}

function workerId(type, payload) {
  return type === "driver" ? payload?.driver_id : payload?.staff_id;
}

function freeAgentBucket(employment, type) {
  return type === "driver" ? employment.freeAgents.drivers : employment.freeAgents.staff;
}

function assignmentBucket(employment, type) {
  return type === "driver" ? employment.drivers : employment.staff;
}

function addFreeAgent(employment, type, id) {
  const bucket = freeAgentBucket(employment, type);
  if (!bucket.includes(id)) bucket.push(id);
  bucket.sort();
}

function removeFreeAgent(employment, type, id) {
  const bucket = freeAgentBucket(employment, type);
  const index = bucket.indexOf(id);
  if (index >= 0) bucket.splice(index, 1);
}

function initializeAssignments(saveWorld, type, contracts) {
  const employment = ensureEmployment(saveWorld);
  const assignments = assignmentBucket(employment, type);
  const currentSeason = Number(saveWorld.clock.season);
  for (const contract of contracts ?? []) {
    const id = type === "driver" ? contract.driver_id : contract.staff_id;
    if (!id || !contract.team_id) continue;
    assignments[id] = {
      teamId: contract.team_id,
      role: contract.role ?? (type === "driver" ? "driver" : "staff"),
      contractStart: contractStart(contract, currentSeason),
      contractUntil: contractEnd(contract),
      status: "employed",
      source: contract.source ?? "historical",
    };
  }
}

function initializeFreeAgents(saveWorld, type, profiles) {
  const employment = ensureEmployment(saveWorld);
  const assignments = assignmentBucket(employment, type);
  const idField = type === "driver" ? "driver_id" : "staff_id";
  for (const profile of profiles ?? []) {
    const id = profile?.[idField];
    if (id && !assignments[id]) addFreeAgent(employment, type, id);
  }
}

function openVacancy(saveWorld, type, event) {
  const employment = ensureEmployment(saveWorld);
  const vacancy = {
    vacancyId: `${event.date}:${type}:${event.payload?.team_id ?? "unknown"}:${event.payload?.role ?? "unknown"}:${event.sequence}`,
    type,
    teamId: event.payload?.team_id ?? null,
    role: event.payload?.role ?? (type === "driver" ? "driver" : "staff"),
    openedAt: event.date,
    status: "open",
  };
  employment.vacancies.push(vacancy);
  return vacancy;
}

function applyContractSigning(saveWorld, event) {
  const type = String(event.payload?.worker_type ?? "driver").toLowerCase() === "staff" ? "staff" : "driver";
  const id = event.payload?.worker_id ?? null;
  const teamId = event.payload?.team_id ?? null;
  if (!id || !teamId) return;

  const employment = ensureEmployment(saveWorld);
  const assignments = assignmentBucket(employment, type);
  const start = asYear(event.payload?.contract_start) ?? saveWorld.clock.season;
  const until = asYear(event.payload?.contract_until) ?? start;
  assignments[id] = {
    teamId,
    role: event.payload?.role ?? (type === "driver" ? "driver" : "staff"),
    contractStart: start,
    contractUntil: until,
    status: "employed",
    source: "simulation",
  };
  removeFreeAgent(employment, type, id);

  const vacancy = employment.vacancies.find((row) => row.vacancyId === event.payload?.vacancy_id);
  if (vacancy) {
    vacancy.status = "filled";
    vacancy.filledAt = event.date;
    vacancy.workerId = id;
  }

  const record = {
    year: saveWorld.clock.season,
    team_id: teamId,
    role: event.payload?.role ?? (type === "driver" ? "driver" : "staff"),
    contract_start: start,
    contract_until: until,
    source: "simulation",
    generated: true,
  };
  if (type === "driver") {
    record.driver_id = id;
    saveWorld.world.contracts ??= [];
    saveWorld.world.contracts.push(record);
  } else {
    record.staff_id = id;
    saveWorld.world.staffContracts ??= [];
    saveWorld.world.staffContracts.push(record);
  }

  saveWorld.history.transfers.push({
    date: event.date,
    type,
    workerId: id,
    teamId,
    role: record.role,
    contractUntil: until,
  });

  const careerState = type === "driver" ? saveWorld.world?.careerState?.drivers?.[id] : saveWorld.world?.careerState?.staff?.[id];
  if (careerState) {
    careerState.status = "employed";
    careerState.lastUpdated = event.date;
  }
}

export function createEmploymentMarketSystem() {
  return {
    id: "employment.market",
    eventTypes: [SIM_EVENT.CAREER_STARTED, CONTRACT_EVENT.EXPIRED, ENTITY_EVENT.ELIGIBLE, EMPLOYMENT_EVENT.CONTRACT_SIGNED],
    handle({ saveWorld, event }) {
      const employment = ensureEmployment(saveWorld);

      if (event.type === SIM_EVENT.CAREER_STARTED) {
        initializeAssignments(saveWorld, "driver", saveWorld.world?.contracts);
        initializeAssignments(saveWorld, "staff", saveWorld.world?.staffContracts);
        initializeFreeAgents(saveWorld, "driver", saveWorld.world?.drivers);
        initializeFreeAgents(saveWorld, "staff", saveWorld.world?.staff);
        return {
          type: EMPLOYMENT_EVENT.INITIALIZED,
          payload: {
            employedDrivers: Object.keys(employment.drivers).length,
            employedStaff: Object.keys(employment.staff).length,
            freeDrivers: employment.freeAgents.drivers.length,
            freeStaff: employment.freeAgents.staff.length,
          },
        };
      }

      if (event.type === ENTITY_EVENT.ELIGIBLE) {
        const typeRaw = String(event.payload?.entity_type ?? "").toLowerCase();
        const type = typeRaw === "driver" ? "driver" : typeRaw === "staff" ? "staff" : null;
        const id = event.payload?.entity_id ?? null;
        if (!type || !id || assignmentBucket(employment, type)[id]) return null;
        addFreeAgent(employment, type, id);
        const careerState = type === "driver" ? saveWorld.world?.careerState?.drivers?.[id] : saveWorld.world?.careerState?.staff?.[id];
        if (careerState) careerState.status = "available";
        return {
          type: EMPLOYMENT_EVENT.FREE_AGENT,
          payload: { worker_type: type, worker_id: id, reason: "eligible" },
        };
      }

      if (event.type === CONTRACT_EVENT.EXPIRED) {
        const type = workerTypeFromContractEvent(event);
        const id = workerId(type, event.payload);
        if (!id) return null;
        const assignments = assignmentBucket(employment, type);
        const current = assignments[id];
        if (!current || current.teamId !== event.payload?.team_id) return null;
        const expiry = asYear(event.payload?.contract_until);
        if (current.contractUntil !== null && expiry !== null && current.contractUntil > expiry) return null;

        delete assignments[id];
        addFreeAgent(employment, type, id);
        const careerState = type === "driver" ? saveWorld.world?.careerState?.drivers?.[id] : saveWorld.world?.careerState?.staff?.[id];
        if (careerState) {
          careerState.status = "available";
          careerState.lastUpdated = event.date;
        }
        const vacancy = openVacancy(saveWorld, type, event);
        return [
          {
            type: EMPLOYMENT_EVENT.FREE_AGENT,
            payload: { worker_type: type, worker_id: id, reason: "contract_expired" },
          },
          {
            type: EMPLOYMENT_EVENT.VACANCY_OPENED,
            payload: {
              vacancy_id: vacancy.vacancyId,
              worker_type: type,
              team_id: vacancy.teamId,
              role: vacancy.role,
            },
          },
        ];
      }

      applyContractSigning(saveWorld, event);
      return null;
    },
  };
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function driverScore(saveWorld, id, event) {
  const state = saveWorld.world?.careerState?.drivers?.[id] ?? {};
  const profile = (saveWorld.world?.drivers ?? []).find((row) => row.driver_id === id) ?? {};
  const ability = numeric(state.currentAbility ?? profile.current_ability, 40);
  const potential = numeric(state.potentialAbility ?? profile.potential_ability, ability);
  const reputation = numeric(state.reputation ?? profile.reputation, 40);
  const age = numeric(state.age, 27);
  const ageFit = age <= 32 ? 100 - Math.abs(27 - age) * 3 : Math.max(20, 85 - (age - 32) * 6);
  const rng = createRng(`${saveWorld.meta.seed}|${event.id}|driver|${id}`);
  return ability * 0.58 + potential * 0.18 + reputation * 0.16 + ageFit * 0.08 + rng.next() * 4;
}

function staffScore(saveWorld, id, event) {
  const state = saveWorld.world?.careerState?.staff?.[id] ?? {};
  const profile = (saveWorld.world?.staff ?? []).find((row) => row.staff_id === id) ?? {};
  const rating = (saveWorld.world?.staffRatings ?? []).find((row) => row.staff_id === id) ?? {};
  const ability = numeric(state.currentAbility, (
    numeric(rating.technical ?? profile.technical, 50)
    + numeric(rating.leadership ?? profile.leadership, 50)
    + numeric(rating.strategy ?? profile.strategy, 50)
  ) / 3);
  const reputation = numeric(state.reputation ?? rating.reputation ?? profile.reputation, 40);
  const rng = createRng(`${saveWorld.meta.seed}|${event.id}|staff|${id}`);
  return ability * 0.78 + reputation * 0.18 + rng.next() * 4;
}

export function createAiEmploymentDecisionSystem(options = {}) {
  const controlled = new Set(options.controlledTeamIds ?? []);
  return {
    id: "employment.ai-decisions",
    eventTypes: [EMPLOYMENT_EVENT.VACANCY_OPENED],
    handle({ saveWorld, event }) {
      const teamId = event.payload?.team_id ?? null;
      if (!teamId || controlled.has(teamId)) return null;
      const type = event.payload?.worker_type === "staff" ? "staff" : "driver";
      const employment = ensureEmployment(saveWorld);
      const candidates = [...freeAgentBucket(employment, type)];
      if (candidates.length === 0) return null;

      const scored = candidates
        .map((id) => ({ id, score: type === "driver" ? driverScore(saveWorld, id, event) : staffScore(saveWorld, id, event) }))
        .sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)));
      const selected = scored[0];
      const duration = Math.max(1, Number(options.defaultContractYears ?? 2));
      const start = Number(saveWorld.clock.season);

      return {
        type: EMPLOYMENT_EVENT.CONTRACT_SIGNED,
        payload: {
          vacancy_id: event.payload?.vacancy_id ?? null,
          worker_type: type,
          worker_id: selected.id,
          team_id: teamId,
          role: event.payload?.role ?? (type === "driver" ? "driver" : "staff"),
          contract_start: start,
          contract_until: start + duration - 1,
          selection_score: Number(selected.score.toFixed(4)),
          decision: "ai_best_available",
        },
      };
    },
  };
}
