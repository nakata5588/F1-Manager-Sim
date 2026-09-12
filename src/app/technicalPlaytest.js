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
