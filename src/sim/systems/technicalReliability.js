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
  preseasonDevelopmentBonus,
  runPreseasonTest,
} from "../../game/management/preseason.js";
import {
  RELIABILITY_EVENT,
  applyRaceWear,
  ensureReliabilityTeam,
  initializeReliabilityWorld,
  rebuildFittedComponent,
  registerFittedComponentUnit,
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

function clamp(value, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 2) {
  return Number(Number(value).toFixed(digits));
}

function normalizeRating(value, fallback = 70) {
  const parsed = numeric(value);
  if (parsed === null) return fallback;
  if (parsed >= 0 && parsed <= 1) return parsed * 100;
  if (parsed >= 1 && parsed <= 10) return parsed * 10;
  return clamp(parsed);
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
  const first = rng.next();
  const second = rng.next();
  const focus = first < 0.42 ? "reliability" : second < 0.55 ? "development" : "balanced";
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

function fittedReliability(team, component) {
  const values = ["car1", "car2"]
    .map((slot) => team.specs?.[team.fittedCars?.[slot]?.components?.[component]])
    .filter(Boolean)
    .map((spec) => normalizeRating(spec.reliabilityRating ?? spec.reliabilityReference, 70));
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 70;
}

function enrichCompletedDesign(saveWorld, event) {
  const teamId = event.payload?.team_id;
  const projectId = event.payload?.project_id;
  const specId = event.payload?.spec_id;
  if (!teamId || !specId) return null;
  const team = ensureTechnicalTeam(saveWorld, teamId);
  const spec = team.specs?.[specId];
  const project = team.designProjects.find((row) => row.projectId === projectId);
  if (!spec || !project) return null;

  const rng = createRng(`${saveWorld.meta.seed}|${projectId}|reliability-design`);
  const baseReliability = fittedReliability(team, project.component);
  const focusReliabilityGain = project.focus === "reliability"
    ? 7 + rng.next() * 5
    : project.focus === "performance"
      ? -1.8 + rng.next() * 2.8
      : 2 + rng.next() * 3;
  const execution = (numeric(project.staffEfficiency, 0.5) + numeric(project.facilityEfficiency, 0.5)) * 1.4;
  spec.reliabilityRating = round(clamp(baseReliability + focusReliabilityGain + execution, 25, 100), 2);
  spec.reliabilitySource = "simulation_design";

  const preseasonBonus = preseasonDevelopmentBonus(saveWorld, teamId, project.targetSeason);
  const preseasonGain = round(preseasonBonus * 3, 3);
  if (preseasonGain > 0) {
    spec.rating = round(clamp(numeric(spec.rating, 50) + preseasonGain, 1, 100), 3);
    spec.gain = round(numeric(spec.gain, 0) + preseasonGain, 3);
    project.realizedGain = spec.gain;
    spec.preseasonDevelopmentGain = preseasonGain;
  }

  event.payload.rating = spec.rating;
  event.payload.gain = spec.gain;
  event.payload.reliability_rating = spec.reliabilityRating;
  event.payload.preseason_gain = preseasonGain;
  const history = saveWorld.history?.technical ?? [];
  const record = [...history].reverse().find((row) => row.type === "design_completed" && row.specId === specId);
  if (record) {
    record.gain = spec.gain;
    record.rating = spec.rating;
    record.reliabilityRating = spec.reliabilityRating;
    record.preseasonDevelopmentGain = preseasonGain;
  }
  return spec;
}

function integrateFittedUnit(saveWorld, event) {
  const teamId = event.payload?.team_id;
  const carSlot = event.payload?.car_slot;
  const component = event.payload?.component;
  const specId = event.payload?.spec_id;
  const previousSpecId = event.payload?.previous_spec_id ?? null;
  if (!teamId || !carSlot || !component || !specId) return null;
  const team = ensureTechnicalTeam(saveWorld, teamId);

  // Phase 36 has already changed fittedCars by the time this event arrives.
  // Capture the previous physical unit directly from reliability state before
  // any synchronization can replace it with the newly fitted specification.
  const previousUnit = team.reliability?.cars?.[carSlot]?.components?.[component] ?? null;
  const returnable = Boolean(
    previousSpecId
    && previousUnit
    && previousUnit.specId === previousSpecId
    && !previousUnit.failed
    && Number(previousUnit.condition ?? 100) >= 72,
  );

  if (previousSpecId && !returnable) {
    const returned = team.inventory?.[previousSpecId];
    if (returned) returned.available = Math.max(0, Number(returned.available ?? 0) - 1);
    saveWorld.history.reliability ??= [];
    saveWorld.history.reliability.push({
      date: event.date,
      type: "unserviceable_component_removed",
      teamId,
      carSlot,
      component,
      specId: previousSpecId,
      previousCondition: previousUnit?.condition ?? null,
      reason: "condition_below_return_to_stock_threshold",
    });
  }
  registerFittedComponentUnit(saveWorld, teamId, carSlot, component, specId, "freshly_fitted_unit");
  event.payload.previous_unit_returned_to_stock = Boolean(previousSpecId && returnable);
  return { previousSpecId, returnable };
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
    eventTypes: [
      SIM_EVENT.CAREER_STARTED,
      SIM_EVENT.MONTH_STARTED,
      SIM_EVENT.SEASON_STARTED,
      RACE_EVENT.COMPLETED,
      TECHNICAL_EVENT.DESIGN_COMPLETED,
      TECHNICAL_EVENT.COMPONENT_FITTED,
    ],
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
      if (event.type === TECHNICAL_EVENT.DESIGN_COMPLETED) {
        enrichCompletedDesign(saveWorld, event);
        return null;
      }
      if (event.type === TECHNICAL_EVENT.COMPONENT_FITTED) {
        integrateFittedUnit(saveWorld, event);
        return null;
      }
      if (event.type === RACE_EVENT.COMPLETED) return raceWearEvents(saveWorld, event, options);
      return autoManagementRound(saveWorld, event, options);
    },
  };
}
