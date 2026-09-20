import { createRng } from "../random.js";
import { SIM_EVENT } from "../timeEngine.js";
import { responsibilityOwner } from "../../game/management/responsibilities.js";
import {
  TECHNICAL_EVENT,
  advanceTechnicalMonth,
  ensureTechnicalTeam,
  fitComponentSpec,
  initializeTechnicalWorld,
  startFacilityUpgrade,
  startManufacturingJob,
  startTechnicalDesignProject,
  technicalProjection,
  releaseNextSeasonSpecifications,
} from "../../game/management/technical.js";
import { controlledTeamSet } from "./controlState.js";
import { financialPlanningProjection } from "../../game/management/finances.js";
import {
  applyTechnicalEvolutionSeasonTransition,
  initializeTechnicalEvolution,
  preferredTechnicalFacilities,
  rankTechnicalDevelopmentCandidates,
} from "../../game/management/technicalEvolution.js";

export const TEAM_DEVELOPMENT_EVENT = Object.freeze({
  INITIALIZED: TECHNICAL_EVENT.INITIALIZED,
  PROJECT_STARTED: TECHNICAL_EVENT.DESIGN_STARTED,
  PROJECT_COMPLETED: TECHNICAL_EVENT.DESIGN_COMPLETED,
  MANUFACTURING_STARTED: TECHNICAL_EVENT.MANUFACTURING_STARTED,
  MANUFACTURING_COMPLETED: TECHNICAL_EVENT.MANUFACTURING_COMPLETED,
  COMPONENT_FITTED: TECHNICAL_EVENT.COMPONENT_FITTED,
  FACILITY_UPGRADE_STARTED: TECHNICAL_EVENT.FACILITY_UPGRADE_STARTED,
  FACILITY_UPGRADE_COMPLETED: TECHNICAL_EVENT.FACILITY_UPGRADE_COMPLETED,
  NEXT_SEASON_SPEC_RELEASED: TECHNICAL_EVENT.NEXT_SEASON_SPEC_RELEASED,
});

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function controlledTeamMayAutoDevelop(saveWorld, teamId, controlled) {
  if (!controlled.has(String(teamId))) return true;
  try { return responsibilityOwner(saveWorld, teamId, "carDevelopment") === "delegated"; }
  catch { return false; }
}

function developmentComponent(saveWorld, teamId, projection) {
  const focus = developmentFocus(saveWorld, teamId);
  return rankTechnicalDevelopmentCandidates(saveWorld, teamId, projection?.car?.components ?? {}, focus)[0]?.component ?? null;
}

function autoSource(controlled, teamId) {
  return controlled.has(String(teamId)) ? "delegated" : "ai";
}

function seasonStrategy(saveWorld, teamId) {
  const row = saveWorld.world?.technical?.teams?.[teamId]?.seasonStrategy;
  if (!row || Number(row.season) !== Number(saveWorld.clock?.season)) return null;
  return row;
}

function developmentFocus(saveWorld, teamId) {
  const focus = seasonStrategy(saveWorld, teamId)?.technicalFocus;
  return ["balanced", "performance", "reliability"].includes(focus) ? focus : "balanced";
}

function emitStarted(project) {
  return {
    type: TECHNICAL_EVENT.DESIGN_STARTED,
    payload: {
      team_id: project.teamId,
      project_id: project.projectId,
      component: project.component,
      target_season: project.targetSeason,
      duration_months: project.durationMonths,
      cost: project.cost,
      source: project.source,
    },
  };
}

function emitManufacturing(job) {
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

function emitFit(record, source) {
  return { type: TECHNICAL_EVENT.COMPONENT_FITTED, payload: { team_id: record.teamId, car_slot: record.carSlot, component: record.component, spec_id: record.specId, previous_spec_id: record.previousSpecId, source } };
}

function autoManufactureAndFit(saveWorld, teamId, source) {
  const output = [];
  let projection = technicalProjection(saveWorld, teamId);
  const team = ensureTechnicalTeam(saveWorld, teamId);

  for (const spec of projection.specifications
    .filter((row) => row.status === "ready_for_manufacture")
    .sort((a, b) => Number(b.rating) - Number(a.rating))) {
    const alreadyQueued = team.manufacturingJobs.some((job) => job.status === "active" && job.specId === spec.specId);
    if (spec.inventory < 2 && !alreadyQueued && projection.manufacturing.active.length < projection.manufacturing.capacity) {
      try {
        const job = startManufacturingJob(saveWorld, teamId, { specId: spec.specId, quantity: 2, source });
        output.push(emitManufacturing(job));
        projection = technicalProjection(saveWorld, teamId);
      } catch {
        // AI/delegated technical departments may legitimately defer production
        // when finances or manufacturing capacity are insufficient.
      }
    }
  }

  projection = technicalProjection(saveWorld, teamId);
  for (const spec of projection.specifications
    .filter((row) => Number(row.inventory) > 0)
    .sort((a, b) => Number(b.rating) - Number(a.rating))) {
    for (const carSlot of ["car1", "car2"]) {
      const currentId = projection.car.fittedCars?.[carSlot]?.components?.[spec.component];
      const current = team.specs?.[currentId];
      if (Number(current?.rating ?? -Infinity) >= Number(spec.rating) || Number(team.inventory?.[spec.specId]?.available ?? 0) < 1) continue;
      try {
        const fitted = fitComponentSpec(saveWorld, teamId, { carSlot, specId: spec.specId });
        output.push(emitFit(fitted, source));
        projection = technicalProjection(saveWorld, teamId);
      } catch {
        break;
      }
    }
  }
  return output;
}

function maybeStartAiFacilityUpgrade(saveWorld, event, teamId, source) {
  const financial = financialPlanningProjection(saveWorld, teamId);
  if (!financial || ["critical", "distressed"].includes(financial.riskLevel) || financial.availableToCommit < 100000) return null;
  const projection = technicalProjection(saveWorld, teamId);
  if (projection.facilityUpgrades.some((row) => row.status === "active")) return null;
  const preferred = preferredTechnicalFacilities(saveWorld, teamId);
  const preference = new Map(preferred.map((id, index) => [id, index]));
  const candidates = projection.facilities
    .filter((row) => row.availabilityStatus !== "unavailable_future_technology" && Number.isFinite(Number(row.level)) && Number(row.level) < 10)
    .sort((a, b) => {
      const pa = preference.has(a.id) ? preference.get(a.id) : 99;
      const pb = preference.has(b.id) ? preference.get(b.id) : 99;
      return pa - pb || Number(a.level) - Number(b.level) || a.id.localeCompare(b.id);
    });
  if (!candidates.length) return null;
  const rng = createRng(`${saveWorld.meta.seed}|${event.date}|facility-upgrade|${teamId}`);
  if (rng.next() > 0.04) return null;
  try {
    const upgrade = startFacilityUpgrade(saveWorld, teamId, candidates[0].id);
    return {
      type: TECHNICAL_EVENT.FACILITY_UPGRADE_STARTED,
      payload: { team_id: teamId, upgrade_id: upgrade.upgradeId, facility_id: upgrade.facilityId, from_level: upgrade.fromLevel, to_level: upgrade.toLevel, duration_months: upgrade.durationMonths, cost: upgrade.cost, source },
    };
  } catch {
    return null;
  }
}

function startAiProjects(saveWorld, event, options) {
  const controlled = controlledTeamSet(saveWorld, options.controlledTeamIds ?? []);
  const output = [];
  for (const row of saveWorld.world?.teams ?? []) {
    const teamId = row.team_id;
    if (!teamId || !controlledTeamMayAutoDevelop(saveWorld, teamId, controlled)) continue;
    const source = autoSource(controlled, teamId);
    output.push(...autoManufactureAndFit(saveWorld, teamId, source));

    const projection = technicalProjection(saveWorld, teamId);
    if (!projection.design.active.length) {
      const component = developmentComponent(saveWorld, teamId, projection);
      const financial = financialPlanningProjection(saveWorld, teamId);
      const minimumRoom = Math.max(numeric(options.minimumCashReserve, 100000) * 0.5, 50000);
      if (component && financial && !["critical", "distressed"].includes(financial.riskLevel) && financial.availableToCommit > minimumRoom) {
        try {
          const project = startTechnicalDesignProject(saveWorld, teamId, {
            component,
            focus: developmentFocus(saveWorld, teamId),
            targetSeason: "current",
            durationMonths: options.projectDurationMonths,
            source,
          });
          output.push(emitStarted(project));
        } catch {
          // A project may be unaffordable after another monthly transaction.
        }
      }
    }

    const upgrade = maybeStartAiFacilityUpgrade(saveWorld, event, teamId, source);
    if (upgrade) output.push(upgrade);
  }
  return output;
}

export function createTeamDevelopmentSystem(options = {}) {
  return {
    id: "team.development",
    eventTypes: [SIM_EVENT.CAREER_STARTED, SIM_EVENT.MONTH_STARTED, SIM_EVENT.SEASON_STARTED],
    handle({ saveWorld, event }) {
      if (event.type === SIM_EVENT.CAREER_STARTED) {
        const teams = initializeTechnicalWorld(saveWorld, event.date);
        const identities = initializeTechnicalEvolution(saveWorld);
        return { type: TECHNICAL_EVENT.INITIALIZED, payload: { teams, technical_identities: identities } };
      }
      if (event.type === SIM_EVENT.SEASON_STARTED) {
        const season = event.payload?.season ?? saveWorld.clock.season;
        applyTechnicalEvolutionSeasonTransition(saveWorld, season);
        return releaseNextSeasonSpecifications(saveWorld, season)
          .map((row) => ({ type: TECHNICAL_EVENT.NEXT_SEASON_SPEC_RELEASED, payload: { team_id: row.teamId, spec_id: row.specId, component: row.component, target_season: row.targetSeason } }));
      }
      const progressed = advanceTechnicalMonth(saveWorld, event.date);
      return [...progressed, ...startAiProjects(saveWorld, event, options)];
    },
  };
}
