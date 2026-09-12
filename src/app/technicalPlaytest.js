import { developerManagementOverview } from "./managementPlaytest.js";
import { responsibilityOwner } from "../game/management/responsibilities.js";
import {
  TECHNICAL_EVENT,
  fitComponentSpec,
  startFacilityUpgrade,
  startManufacturingJob,
  startTechnicalDesignProject,
  technicalProjection,
  technicalSummary,
} from "../game/management/technical.js";
import {
  SUPPLIER_EVENT,
  acceptSupplierCounter,
  openSupplierNegotiation,
  submitSupplierOffer,
  supplierProjection,
  withdrawSupplierNegotiation,
} from "../game/management/suppliers.js";
import {
  RELIABILITY_EVENT,
  rebuildFittedComponent,
  reliabilityProjection,
  replaceWornComponent,
  serviceEngineUnit,
} from "../game/management/reliability.js";
import { PRESEASON_EVENT, preseasonProjection, runPreseasonTest } from "../game/management/preseason.js";
import { dispatchSimulationEvents } from "../sim/timeEngine.js";

function requireSession(session) {
  if (!session || typeof session.requireCareer !== "function") throw new TypeError("A DeveloperPlaytestSession is required.");
  developerManagementOverview(session);
  return session.requireCareer();
}

function requireControlledTeam(session) {
  const saveWorld = requireSession(session);
  const teamId = saveWorld.player?.controlledTeamIds?.[0] ?? null;
  if (!teamId) throw new Error("The manager is currently unemployed and does not control a team.");
  if (responsibilityOwner(saveWorld, teamId, "carDevelopment") !== "manager") {
    throw new Error("Car Development is delegated. Return the responsibility to the manager before issuing technical orders.");
  }
  return { saveWorld, teamId };
}

function dispatchTechnicalEvent(session, raw) {
  const saveWorld = session.requireCareer();
  return dispatchSimulationEvents(saveWorld, [{
    ...raw,
    date: raw.date ?? saveWorld.clock.date,
    payload: raw.payload ?? {},
  }], session.systems ?? []);
}

export function developerTechnical(session) {
  const saveWorld = requireSession(session);
  const teamId = saveWorld.player?.controlledTeamIds?.[0] ?? null;
  return {
    summary: technicalSummary(saveWorld, teamId),
    responsibility: teamId ? responsibilityOwner(saveWorld, teamId, "carDevelopment") : null,
    team: teamId ? technicalProjection(saveWorld, teamId) : null,
    supplier: teamId ? supplierProjection(saveWorld, teamId) : null,
    reliability: teamId ? reliabilityProjection(saveWorld, teamId) : null,
    preseason: teamId ? preseasonProjection(saveWorld, teamId) : null,
  };
}

export function developerStartTechnicalDesign(session, input = {}) {
  const { saveWorld, teamId } = requireControlledTeam(session);
  const project = startTechnicalDesignProject(saveWorld, teamId, {
    component: input.component,
    focus: input.focus,
    targetSeason: input.targetSeason,
    source: "player",
  });
  dispatchTechnicalEvent(session, {
    type: TECHNICAL_EVENT.DESIGN_STARTED,
    payload: {
      team_id: teamId,
      project_id: project.projectId,
      component: project.component,
      target_season: project.targetSeason,
      duration_months: project.durationMonths,
      cost: project.cost,
      source: "player",
    },
  });
  return developerTechnical(session);
}

export function developerStartManufacturing(session, input = {}) {
  const { saveWorld, teamId } = requireControlledTeam(session);
  const job = startManufacturingJob(saveWorld, teamId, {
    specId: input.specId,
    quantity: input.quantity,
    emergency: input.emergency,
    source: "player",
  });
  dispatchTechnicalEvent(session, {
    type: TECHNICAL_EVENT.MANUFACTURING_STARTED,
    payload: {
      team_id: teamId,
      job_id: job.jobId,
      spec_id: job.specId,
      component: job.component,
      quantity: job.quantity,
      duration_months: job.durationMonths,
      cost: job.cost,
      source: "player",
    },
  });
  return developerTechnical(session);
}

export function developerFitTechnicalSpec(session, input = {}) {
  const { saveWorld, teamId } = requireControlledTeam(session);
  const fitted = fitComponentSpec(saveWorld, teamId, { carSlot: input.carSlot, specId: input.specId });
  dispatchTechnicalEvent(session, {
    type: TECHNICAL_EVENT.COMPONENT_FITTED,
    payload: {
      team_id: teamId,
      car_slot: fitted.carSlot,
      component: fitted.component,
      spec_id: fitted.specId,
      previous_spec_id: fitted.previousSpecId,
      source: "player",
    },
  });
  return developerTechnical(session);
}

export function developerStartFacilityUpgrade(session, facilityId) {
  const { saveWorld, teamId } = requireControlledTeam(session);
  const upgrade = startFacilityUpgrade(saveWorld, teamId, facilityId);
  dispatchTechnicalEvent(session, {
    type: TECHNICAL_EVENT.FACILITY_UPGRADE_STARTED,
    payload: {
      team_id: teamId,
      upgrade_id: upgrade.upgradeId,
      facility_id: upgrade.facilityId,
      from_level: upgrade.fromLevel,
      to_level: upgrade.toLevel,
      duration_months: upgrade.durationMonths,
      cost: upgrade.cost,
      source: "player",
    },
  });
  return developerTechnical(session);
}

export function developerOpenSupplierNegotiation(session, input = {}) {
  const { saveWorld, teamId } = requireControlledTeam(session);
  const negotiation = openSupplierNegotiation(saveWorld, teamId, input.engineId, { source: "player" });
  dispatchTechnicalEvent(session, {
    type: SUPPLIER_EVENT.NEGOTIATION_OPENED,
    payload: { team_id: teamId, negotiation_id: negotiation.negotiationId, engine_id: negotiation.engineId, effective_season: negotiation.effectiveSeason, source: "player" },
  });
  return developerTechnical(session);
}

export function developerSubmitSupplierOffer(session, input = {}) {
  const { saveWorld, teamId } = requireControlledTeam(session);
  const result = submitSupplierOffer(saveWorld, teamId, input.negotiationId, {
    annualValue: input.annualValue,
    durationYears: input.durationYears,
  });
  dispatchTechnicalEvent(session, {
    type: SUPPLIER_EVENT.OFFER_SUBMITTED,
    payload: { team_id: teamId, negotiation_id: input.negotiationId, engine_id: result.negotiation.engineId, annual_value: Number(input.annualValue), duration_years: Number(input.durationYears), source: "player" },
  });
  if (result.status === "accepted") {
    dispatchTechnicalEvent(session, {
      type: SUPPLIER_EVENT.ACCEPTED,
      payload: { team_id: teamId, negotiation_id: input.negotiationId, engine_id: result.deal.engineId, contract_id: result.deal.contractId, effective_season: result.deal.effectiveSeason, annual_value: result.deal.annualValue, source: "player" },
    });
  } else if (result.status === "countered") {
    dispatchTechnicalEvent(session, {
      type: SUPPLIER_EVENT.COUNTERED,
      payload: { team_id: teamId, negotiation_id: input.negotiationId, engine_id: result.negotiation.engineId, annual_value: result.counter.annualValue, duration_years: result.counter.durationYears, source: "player" },
    });
  } else {
    dispatchTechnicalEvent(session, {
      type: SUPPLIER_EVENT.REJECTED,
      payload: { team_id: teamId, negotiation_id: input.negotiationId, engine_id: result.negotiation.engineId, source: "player" },
    });
  }
  return developerTechnical(session);
}

export function developerAcceptSupplierCounter(session, negotiationId) {
  const { saveWorld, teamId } = requireControlledTeam(session);
  const result = acceptSupplierCounter(saveWorld, teamId, negotiationId);
  dispatchTechnicalEvent(session, {
    type: SUPPLIER_EVENT.ACCEPTED,
    payload: { team_id: teamId, negotiation_id: negotiationId, engine_id: result.deal.engineId, contract_id: result.deal.contractId, effective_season: result.deal.effectiveSeason, annual_value: result.deal.annualValue, source: "player_counter_acceptance" },
  });
  return developerTechnical(session);
}

export function developerWithdrawSupplierNegotiation(session, negotiationId) {
  const { saveWorld, teamId } = requireControlledTeam(session);
  const negotiation = withdrawSupplierNegotiation(saveWorld, teamId, negotiationId);
  dispatchTechnicalEvent(session, {
    type: SUPPLIER_EVENT.WITHDRAWN,
    payload: { team_id: teamId, negotiation_id: negotiationId, engine_id: negotiation.engineId, source: "player" },
  });
  return developerTechnical(session);
}

export function developerReplaceWornComponent(session, input = {}) {
  const { saveWorld, teamId } = requireControlledTeam(session);
  const record = replaceWornComponent(saveWorld, teamId, { carSlot: input.carSlot, component: input.component });
  dispatchTechnicalEvent(session, { type: RELIABILITY_EVENT.COMPONENT_REPLACED, payload: { team_id: teamId, car_slot: record.carSlot, component: record.component, spec_id: record.specId, condition: 100, inventory_remaining: record.inventoryRemaining, source: "player" } });
  return developerTechnical(session);
}

export function developerRebuildComponent(session, input = {}) {
  const { saveWorld, teamId } = requireControlledTeam(session);
  const record = rebuildFittedComponent(saveWorld, teamId, { carSlot: input.carSlot, component: input.component });
  dispatchTechnicalEvent(session, { type: RELIABILITY_EVENT.COMPONENT_REBUILT, payload: { team_id: teamId, car_slot: record.carSlot, component: record.component, spec_id: record.specId, condition: record.condition, cost: record.cost, source: "player" } });
  return developerTechnical(session);
}

export function developerServiceEngine(session, carSlot) {
  const { saveWorld, teamId } = requireControlledTeam(session);
  const record = serviceEngineUnit(saveWorld, teamId, carSlot);
  dispatchTechnicalEvent(session, { type: RELIABILITY_EVENT.ENGINE_SERVICED, payload: { team_id: teamId, car_slot: record.carSlot, engine_id: record.engineId, condition: record.condition, cost: record.cost, source: "player" } });
  return developerTechnical(session);
}

export function developerRunPreseasonTest(session, input = {}) {
  const { saveWorld, teamId } = requireControlledTeam(session);
  const result = runPreseasonTest(saveWorld, teamId, { focus: input.focus, source: "player" });
  dispatchTechnicalEvent(session, {
    type: PRESEASON_EVENT.TEST_COMPLETED,
    payload: { team_id: teamId, test_id: result.testId, focus: result.focus, effectiveness: result.effectiveness, reliability_prep_gain: result.reliabilityPrepGain, development_knowledge_gain: result.developmentKnowledgeGain, setup_knowledge_gain: result.setupKnowledgeGain, cost: result.cost, source: "player" },
  });
  return developerTechnical(session);
}
