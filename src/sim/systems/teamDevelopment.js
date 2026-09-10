import { createRng } from "../random.js";
import { SIM_EVENT } from "../timeEngine.js";

export const TEAM_DEVELOPMENT_EVENT = Object.freeze({
  INITIALIZED: "team.development_initialized",
  PROJECT_STARTED: "team.development_project_started",
  PROJECT_COMPLETED: "team.development_project_completed",
});

const COMPONENTS = [
  "chassis_spec",
  "aero_spec",
  "gearbox_spec",
  "suspension_spec",
  "brakes_spec",
  "cooling_spec",
  "electronics_spec",
  "turbo_spec",
  "kers_spec",
  "ers_mgu_k",
  "ers_mgu_h",
  "battery_pack",
];

function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function ensureState(saveWorld) {
  saveWorld.world.carState ??= {};
  saveWorld.world.development ??= { projects: [] };
  saveWorld.world.development.projects ??= [];
  saveWorld.history.development ??= [];
  return saveWorld.world.development;
}

function initializeCars(saveWorld, date) {
  ensureState(saveWorld);
  let created = 0;
  for (const team of saveWorld.world?.teams ?? []) {
    const teamId = team.team_id;
    if (!teamId || saveWorld.world.carState[teamId]) continue;
    const source = (saveWorld.world?.carStats ?? []).find((row) => row.team_id === teamId) ?? {};
    const components = {};
    for (const field of COMPONENTS) {
      const value = numeric(source[field]);
      if (value !== null) components[field] = value;
    }
    saveWorld.world.carState[teamId] = {
      teamId,
      components,
      initializedAt: date,
      lastUpdated: date,
    };
    created += 1;
  }
  return created;
}

function facilityEfficiency(saveWorld, teamId) {
  const row = (saveWorld.world?.facilities ?? []).find((item) => item.team_id === teamId) ?? {};
  const values = [
    row.wind_tunnel_level,
    row.simulator_level,
    row.aero_dept_level,
    row.chassis_shop_level,
    row.manufacturing_level,
    row.manufacturing_leve,
  ].map((value) => numeric(value)).filter((value) => value !== null);
  if (!values.length) return 0.5;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return clamp(average / 10, 0, 1);
}

function weakestComponent(carState) {
  return Object.entries(carState?.components ?? {})
    .filter(([, value]) => Number.isFinite(Number(value)))
    .sort((a, b) => Number(a[1]) - Number(b[1]) || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

function activeProjectFor(development, teamId) {
  return development.projects.find((project) => project.teamId === teamId && project.status === "active") ?? null;
}

function completeProjects(saveWorld, event) {
  const development = ensureState(saveWorld);
  const output = [];
  for (const project of development.projects) {
    if (project.status !== "active") continue;
    project.monthsRemaining -= 1;
    if (project.monthsRemaining > 0) continue;

    const car = saveWorld.world.carState?.[project.teamId];
    const before = numeric(car?.components?.[project.component]);
    if (before !== null) {
      car.components[project.component] = round(clamp(before + project.targetGain, 1, 100));
      car.lastUpdated = event.date;
    }
    project.status = "completed";
    project.completedAt = event.date;
    const record = {
      date: event.date,
      teamId: project.teamId,
      projectId: project.projectId,
      component: project.component,
      gain: project.targetGain,
      result: before === null ? null : car.components[project.component],
    };
    saveWorld.history.development.push({ ...record, type: "completed" });
    output.push({ type: TEAM_DEVELOPMENT_EVENT.PROJECT_COMPLETED, payload: record });
  }
  return output;
}

function startAiProjects(saveWorld, event, options) {
  const development = ensureState(saveWorld);
  const controlled = new Set(options.controlledTeamIds ?? []);
  const output = [];

  for (const team of saveWorld.world?.teams ?? []) {
    const teamId = team.team_id;
    if (!teamId || controlled.has(teamId) || activeProjectFor(development, teamId)) continue;
    const finances = saveWorld.world?.teamState?.[teamId];
    const car = saveWorld.world?.carState?.[teamId];
    const component = weakestComponent(car);
    if (!finances || !component) continue;

    const cash = numeric(finances.cash, 0);
    const reserve = Math.max(numeric(options.minimumCashReserve, 100000), numeric(finances.openingCash, 0) * 0.08);
    const spendable = cash - reserve;
    if (spendable <= 50000) continue;

    const rng = createRng(`${saveWorld.meta.seed}|${event.date}|team-development|${teamId}`);
    const cost = round(Math.min(spendable * 0.12, Math.max(50000, cash * 0.02)));
    if (cost <= 0 || cash - cost < reserve) continue;

    const efficiency = facilityEfficiency(saveWorld, teamId);
    const targetGain = round(0.35 + efficiency * 0.55 + rng.next() * 0.45);
    const fixedDuration = numeric(options.projectDurationMonths);
    const duration = fixedDuration !== null
      ? Math.max(1, Math.round(fixedDuration))
      : efficiency >= 0.75 ? 2 : efficiency >= 0.4 ? 3 : 4;
    const project = {
      projectId: `${event.date}:${teamId}:${component}:${event.sequence}`,
      teamId,
      component,
      cost,
      targetGain,
      durationMonths: duration,
      monthsRemaining: duration,
      startedAt: event.date,
      status: "active",
      source: "ai",
    };
    finances.cash = round(cash - cost);
    finances.lastDevelopmentSpend = cost;
    development.projects.push(project);
    saveWorld.history.development.push({
      date: event.date,
      type: "started",
      teamId,
      projectId: project.projectId,
      component,
      cost,
      targetGain,
      durationMonths: duration,
    });
    output.push({ type: TEAM_DEVELOPMENT_EVENT.PROJECT_STARTED, payload: { ...project } });
  }
  return output;
}

export function createTeamDevelopmentSystem(options = {}) {
  return {
    id: "team.development",
    eventTypes: [SIM_EVENT.CAREER_STARTED, SIM_EVENT.MONTH_STARTED],
    handle({ saveWorld, event }) {
      if (event.type === SIM_EVENT.CAREER_STARTED) {
        const teams = initializeCars(saveWorld, event.date);
        return { type: TEAM_DEVELOPMENT_EVENT.INITIALIZED, payload: { teams } };
      }
      const completed = completeProjects(saveWorld, event);
      const started = startAiProjects(saveWorld, event, options);
      return [...completed, ...started];
    },
  };
}
