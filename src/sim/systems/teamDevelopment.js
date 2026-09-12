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

function weakestComponent(projection) {
  return Object.entries(projection?.car?.components ?? {})
    .filter(([, value]) => Number.isFinite(Number(value)))
    .sort((a, b) => Number(a[1]) - Number(b[1]) || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

function autoSource(controlled, teamId) {
  return controlled.has(String(teamId)) ? "delegated" : "ai";
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
  const finance = saveWorld.world?.teamState?.[teamId];
  const cash = numeric(finance?.cash, 0);
  const opening = Math.max(1, numeric(finance?.openingCash, 0));
  if (cash < Math.max(2_000_000, opening * 1.2)) return null;
  const projection = technicalProjection(saveWorld, teamId);
  if (projection.facilityUpgrades.some((row) => row.status === "active")) return null;
  const candidates = projection.facilities.filter((row) => Number(row.level) < 10).sort((a, b) => Number(a.level) - Number(b.level) || a.id.localeCompare(b.id));
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
      const component = weakestComponent(projection);
      const finance = saveWorld.world?.teamState?.[teamId];
      const cash = numeric(finance?.cash, 0);
      const reserve = Math.max(numeric(options.minimumCashReserve, 100000), numeric(finance?.openingCash, 0) * 0.08);
      if (component && cash > reserve + 50000) {
        try {
          const project = startTechnicalDesignProject(saveWorld, teamId, {
            component,
            focus: "balanced",
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
        return { type: TECHNICAL_EVENT.INITIALIZED, payload: { teams } };
      }
      if (event.type === SIM_EVENT.SEASON_STARTED) {
        return releaseNextSeasonSpecifications(saveWorld, event.payload?.season ?? saveWorld.clock.season)
          .map((row) => ({ type: TECHNICAL_EVENT.NEXT_SEASON_SPEC_RELEASED, payload: { team_id: row.teamId, spec_id: row.specId, component: row.component, target_season: row.targetSeason } }));
      }
      const progressed = advanceTechnicalMonth(saveWorld, event.date);
      return [...progressed, ...startAiProjects(saveWorld, event, options)];
    },
  };
}
