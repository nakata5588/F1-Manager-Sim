import { responsibilityOwner } from "../../game/management/responsibilities.js";
import {
  SUPPLIER_EVENT,
  acceptSupplierCounter,
  activateSupplierSeason,
  ensureSupplierTeam,
  initializeSupplierWorld,
  listSupplierMarket,
  openSupplierNegotiation,
  submitSupplierOffer,
} from "../../game/management/suppliers.js";
import {
  PRESEASON_EVENT,
  ensurePreseasonTeam,
  initializePreseasonWorld,
  isPreseasonWindow,
  runPreseasonTest,
} from "../../game/management/preseason.js";
import {
  RELIABILITY_EVENT,
  applyRaceWear,
  ensureReliabilityTeam,
  initializeReliabilityWorld,
  rebuildFittedComponent,
  reliabilityProjection,
  replaceWornComponent,
  serviceEngineUnit,
} from "../../game/management/reliability.js";
import {
  TECHNICAL_EVENT,
  ensureTechnicalTeam,
  startManufacturingJob,
  technicalProjection,
} from "../../game/management/technical.js";
import { createRng } from "../random.js";
import { SIM_EVENT } from "../timeEngine.js";
import { RACE_EVENT } from "./raceWeekend.js";
import { controlledTeamSet } from "./controlState.js";

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mayAutoManage(saveWorld, teamId, controlled) {
  if (!controlled.has(String(teamId))) return true;
  try { return responsibilityOwner(saveWorld, teamId, "carDevelopment") === "delegated"; }
  catch { return false; }
}

function sourceFor(controlled, teamId) {
  return controlled.has(String(teamId)) ? "delegated" : "ai";
}

function financeCanSpend(saveWorld, teamId, amount) {
  const finance = saveWorld.world?.teamState?.[teamId];
  if (!finance) return false;
  const cash = numeric(finance.cash, 0);
  const reserve = Math.max(80000, numeric(finance.openingCash, 0) * 0.06);
  return cash - amount > reserve;
}

function supplierUtility(candidate) {
  const costPenalty = numeric(candidate.expectedTerms?.annualValue, 0) / 100000 * 0.32;
  return numeric(candidate.power, 50) * 0.48
    + numeric(candidate.reliability, 65) * 0.52
    + numeric(candidate.interest?.score, 50) * 0.08
    - costPenalty
    + (candidate.current ? 2.5 : 0);
}

function maybeAiSupplierDeal(saveWorld, event, teamId, source) {
  const month = Number(String(event.date ?? saveWorld.clock?.date ?? "").slice(5, 7));
  if (!Number.isInteger(month) || month < 7) return [];
  const state = ensureSupplierTeam(saveWorld, teamId, event.date);
  if (state.futureDeal || state.negotiations.some((row) => ["open", "countered"].includes(row.status))) return [];
  if (!state.active) return [];
  if (Number(state.active.endSeason) > Number(saveWorld.clock.season)) return [];

  const candidates = listSupplierMarket(saveWorld, teamId)
    .filter((row) => row.interest.score >= 24)
    .sort((a, b) => supplierUtility(b) - supplierUtility(a) || a.engineId.localeCompare(b.engineId));
  if (!candidates.length) return [];
  const best = candidates[0];
  if (!financeCanSpend(saveWorld, teamId, best.expectedTerms.annualValue / 12)) return [];

  const negotiation = openSupplierNegotiation(saveWorld, teamId, best.engineId, { source });
  const result = submitSupplierOffer(saveWorld, teamId, negotiation.negotiationId, {
    annualValue: best.expectedTerms.annualValue,
    durationYears: best.expectedTerms.durationYears,
  });
  const events = [{ type: SUPPLIER_EVENT.NEGOTIATION_OPENED, payload: { team_id: teamId, negotiation_id: negotiation.negotiationId, engine_id: best.engineId, source } }];
  if (result.status === "accepted") {
    events.push({ type: SUPPLIER_EVENT.ACCEPTED, payload: { team_id: teamId, negotiation_id: negotiation.negotiationId, engine_id: best.engineId, contract_id: result.deal.contractId, effective_season: result.deal.effectiveSeason, annual_value: result.deal.annualValue, source } });
  } else if (result.status === "countered") {
    const accepted = acceptSupplierCounter(saveWorld, teamId, negotiation.negotiationId);
    events.push({ type: SUPPLIER_EVENT.COUNTERED, payload: { team_id: teamId, negotiation_id: negotiation.negotiationId, engine_id: best.engineId, annual_value: result.counter.annualValue, source } });
    events.push({ type: SUPPLIER_EVENT.ACCEPTED, payload: { team_id: teamId, negotiation_id: negotiation.negotiationId, engine_id: best.engineId, contract_id: accepted.deal.contractId, effective_season: accepted.deal.effectiveSeason, annual_value: accepted.deal.annualValue, source } });
  } else {
    events.push({ type: SUPPLIER_EVENT.REJECTED, payload: { team_id: teamId, negotiation_id: negotiation.negotiationId, engine_id: best.engineId, source } });
  }
  return events;
}

function maybeAiPreseasonTest(saveWorld, teamId, source) {
  if (!isPreseasonWindow(saveWorld)) return null;
  const state = ensurePreseasonTeam(saveWorld, teamId);
  if (!state || state.sessionsCompleted >= Math.min(2, state.maxSessions)) return null;
  if (!financeCanSpend(saveWorld, teamId, 65000)) return null;
  const rng = createRng(`${saveWorld.meta.seed}|${saveWorld.clock.season}|ai-preseason|${teamId}|${state.sessionsCompleted}`);
  const focus = rng.next() < 0.42 ? "reliability" : rng.next() < 0.55 ? "development" : "balanced";
  try {
    const result = runPreseasonTest(saveWorld, teamId, { focus, source });
    return { type: PRESEASON_EVENT.TEST_COMPLETED, payload: { team_id: teamId, test_id: result.testId, focus: result.focus, effectiveness: result.effectiveness, reliability_prep_gain: result.reliabilityPrepGain, development_knowledge_gain: result.developmentKnowledgeGain, cost: result.cost, source } };
  } catch {
    return null;
  }
}

function manufacturingStarted(job) {
  return {
    type: TECHNICAL_EVENT.MANUFACTURING_STARTED,
    payload: {
      team_id: job.teamId,
      job_id: job.jobId,
      spec_id: job.specId,
      component: job.component,
      quantity: job.quantity,
      duration_months: job.durationMonths,
      cost: job.cost,
      source: job.source,
    },
  };
}

function reliabilityEvent(type, record) {
  return {
    type,
    payload: {
      team_id: record.teamId,
      car_slot: record.carSlot,
      component: record.component ?? null,
      spec_id: record.specId ?? null,
      engine_id: record.engineId ?? null,
      condition: record.condition ?? null,
      cost: record.cost ?? null,
      inventory_remaining: record.inventoryRemaining ?? null,
      source: record.source ?? null,
    },
  };
}

function maybeQueueSpare(saveWorld, teamId, carSlot, component, source) {
  const team = ensureTechnicalTeam(saveWorld, teamId);
  const projection = technicalProjection(saveWorld, teamId);
  const specId = team.fittedCars?.[carSlot]?.components?.[component];
  if (!specId) return null;
  const available = Number(team.inventory?.[specId]?.available ?? 0);
  if (available > 0) return null;
  if (team.manufacturingJobs.some((job) => job.status === "active" && job.specId === specId)) return null;
  if (projection.manufacturing.active.length >= projection.manufacturing.capacity) return null;
  try {
    return manufacturingStarted(startManufacturingJob(saveWorld, teamId, { specId, quantity: 1, source }));
  } catch {
    return null;
  }
}

function autoMaintainTeam(saveWorld, teamId, source) {
  const output = [];
  const projection = reliabilityProjection(saveWorld, teamId);
  if (!projection) return output;
  for (const carSlot of ["car1", "car2"]) {
    const car = projection.cars[carSlot];
    if (Number(car.engine?.condition ?? 100) < 48 && financeCanSpend(saveWorld, teamId, 140000)) {
      try {
        output.push(reliabilityEvent(RELIABILITY_EVENT.ENGINE_SERVICED, serviceEngineUnit(saveWorld, teamId, carSlot)));
      } catch { /* defer */ }
    }
    for (const [component, unit] of Object.entries(car.components ?? {})) {
      const condition = Number(unit.condition ?? 100);
      if (condition < 72) {
        const queue = maybeQueueSpare(saveWorld, teamId, carSlot, component, source);
        if (queue) output.push(queue);
      }
      if (condition >= 58) continue;
      if (Number(unit.inventoryAvailable ?? 0) > 0) {
        try {
          output.push(reliabilityEvent(RELIABILITY_EVENT.COMPONENT_REPLACED, replaceWornComponent(saveWorld, teamId, { carSlot, component })));
          continue;
        } catch { /* rebuild fallback */ }
      }
      if (financeCanSpend(saveWorld, teamId, 70000)) {
        try { output.push(reliabilityEvent(RELIABILITY_EVENT.COMPONENT_REBUILT, rebuildFittedComponent(saveWorld, teamId, { carSlot, component }))); }
        catch { /* defer */ }
      }
    }
  }
  return output;
}

function autoManagementRound(saveWorld, event, options) {
  const controlled = controlledTeamSet(saveWorld, options.controlledTeamIds ?? []);
  const output = [];
  for (const row of saveWorld.world?.teams ?? []) {
    const teamId = row.team_id;
    if (!teamId || !mayAutoManage(saveWorld, teamId, controlled)) continue;
    const source = sourceFor(controlled, teamId);
    output.push(...maybeAiSupplierDeal(saveWorld, event, teamId, source));
    const test = maybeAiPreseasonTest(saveWorld, teamId, source);
    if (test) output.push(test);
    output.push(...autoMaintainTeam(saveWorld, teamId, source));
  }
  return output;
}

function raceWearEvents(saveWorld, event, options) {
  const result = applyRaceWear(saveWorld, event.payload ?? {}, event.date);
  const output = [{ type: RELIABILITY_EVENT.RACE_WEAR_APPLIED, payload: { teams: result.teams.length, failures: result.failures.length } }];
  for (const failure of result.failures) {
    output.push({ type: RELIABILITY_EVENT.COMPONENT_FAILED, payload: { team_id: failure.teamId, car_slot: failure.carSlot, driver_id: failure.driverId, component: failure.component, spec_id: failure.specId, engine_id: failure.engineId } });
  }
  const seen = new Set();
  for (const warning of result.warnings) {
    const key = `${warning.teamId}|${warning.carSlot}|${warning.component}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({ type: RELIABILITY_EVENT.CONDITION_WARNING, payload: { team_id: warning.teamId, car_slot: warning.carSlot, component: warning.component, condition: warning.condition, critical: warning.critical } });
  }

  const controlled = controlledTeamSet(saveWorld, options.controlledTeamIds ?? []);
  for (const teamId of new Set(result.teams.map((row) => row.teamId))) {
    if (!mayAutoManage(saveWorld, teamId, controlled)) continue;
    output.push(...autoMaintainTeam(saveWorld, teamId, sourceFor(controlled, teamId)));
  }
  return output;
}

export function createTechnicalReliabilitySystem(options = {}) {
  return {
    id: "technical.reliability-suppliers",
    eventTypes: [SIM_EVENT.CAREER_STARTED, SIM_EVENT.MONTH_STARTED, SIM_EVENT.SEASON_STARTED, RACE_EVENT.COMPLETED],
    handle({ saveWorld, event }) {
      if (event.type === SIM_EVENT.CAREER_STARTED) {
        const suppliers = initializeSupplierWorld(saveWorld, event.date);
        const reliability = initializeReliabilityWorld(saveWorld, event.date);
        const preseason = initializePreseasonWorld(saveWorld);
        return [
          { type: SUPPLIER_EVENT.INITIALIZED, payload: { teams: suppliers } },
          { type: RELIABILITY_EVENT.INITIALIZED, payload: { teams: reliability } },
          { type: PRESEASON_EVENT.INITIALIZED, payload: { teams: preseason } },
          ...autoManagementRound(saveWorld, event, options),
        ];
      }
      if (event.type === SIM_EVENT.SEASON_STARTED) {
        const activated = activateSupplierSeason(saveWorld, event.payload?.season ?? saveWorld.clock.season, event.date);
        for (const teamId of Object.keys(saveWorld.world?.technical?.teams ?? {})) {
          ensurePreseasonTeam(saveWorld, teamId, saveWorld.clock.season);
          ensureReliabilityTeam(saveWorld, teamId, event.date);
        }
        return [...activated, { type: PRESEASON_EVENT.SEASON_RESET, payload: { season: Number(saveWorld.clock.season) } }, ...autoManagementRound(saveWorld, event, options)];
      }
      if (event.type === RACE_EVENT.COMPLETED) return raceWearEvents(saveWorld, event, options);
      return autoManagementRound(saveWorld, event, options);
    },
  };
}
