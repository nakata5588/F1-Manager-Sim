import { createRng } from "../../sim/random.js";

export const TECHNICAL_EVENT = Object.freeze({
  INITIALIZED: "technical.initialized",
  DESIGN_STARTED: "technical.design_started",
  DESIGN_COMPLETED: "technical.design_completed",
  MANUFACTURING_STARTED: "technical.manufacturing_started",
  MANUFACTURING_COMPLETED: "technical.manufacturing_completed",
  COMPONENT_FITTED: "technical.component_fitted",
  FACILITY_UPGRADE_STARTED: "technical.facility_upgrade_started",
  FACILITY_UPGRADE_COMPLETED: "technical.facility_upgrade_completed",
  NEXT_SEASON_SPEC_RELEASED: "technical.next_season_spec_released",
});

export const TECHNICAL_COMPONENTS = Object.freeze([
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
]);

const FACILITIES = Object.freeze({
  windTunnel: { label: "Wind Tunnel", field: "wind_tunnel_level", discipline: "aero", baseCost: 180000 },
  simulator: { label: "Simulator", field: "simulator_level", discipline: "general", baseCost: 150000 },
  aeroDepartment: { label: "Aero Department", field: "aero_dept_level", discipline: "aero", baseCost: 165000 },
  chassisShop: { label: "Chassis Shop", field: "chassis_shop_level", discipline: "chassis", baseCost: 150000 },
  manufacturing: { label: "Manufacturing", field: "manufacturing_level", legacyField: "manufacturing_leve", discipline: "manufacturing", baseCost: 170000 },
});

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

function teamSourceFacility(saveWorld, teamId) {
  return (saveWorld.world?.facilities ?? []).find((row) => row.team_id === teamId) ?? {};
}

function sourceCar(saveWorld, teamId) {
  return (saveWorld.world?.carStats ?? []).find((row) => row.team_id === teamId) ?? {};
}

function ensureFinance(saveWorld, teamId) {
  const finance = saveWorld.world?.teamState?.[teamId];
  if (!finance) throw new Error(`Team '${teamId}' does not have initialized finances.`);
  return finance;
}

function spend(saveWorld, teamId, amount, reason) {
  const finance = ensureFinance(saveWorld, teamId);
  const cost = Math.max(0, round(amount));
  if (numeric(finance.cash, 0) < cost) throw new Error(`Team '${teamId}' does not have enough cash for ${reason}.`);
  finance.cash = round(numeric(finance.cash, 0) - cost);
  return cost;
}

function ensureHistory(saveWorld) {
  saveWorld.history.technical ??= [];
  return saveWorld.history.technical;
}

function nextId(team, prefix, date) {
  team.sequence = Number(team.sequence ?? 0) + 1;
  return `${prefix}:${team.teamId}:${date}:${team.sequence}`;
}

function normalizeLevel(value, fallback = null) {
  const parsed = numeric(value, fallback);
  if (parsed === null) return null;
  if (parsed > 0 && parsed <= 1) return clamp(parsed * 10, 1, 10);
  return clamp(parsed, 1, 10);
}

function initializeFacilities(saveWorld, teamId) {
  const source = teamSourceFacility(saveWorld, teamId);
  const facilities = {};
  for (const [id, definition] of Object.entries(FACILITIES)) {
    const raw = source[definition.field] ?? (definition.legacyField ? source[definition.legacyField] : null);
    const level = normalizeLevel(raw);
    if (level === null) continue;
    facilities[id] = {
      id,
      label: definition.label,
      level: round(level, 1),
      source: "historical_start_input",
      sourceField: definition.field,
      maintenanceDeltaAnnual: 0,
    };
  }
  if (!facilities.manufacturing) {
    facilities.manufacturing = {
      id: "manufacturing",
      label: FACILITIES.manufacturing.label,
      level: 5,
      source: "derived_gameplay_baseline",
      sourceField: null,
      maintenanceDeltaAnnual: 0,
    };
  }
  return facilities;
}

function initialComponents(saveWorld, teamId) {
  const source = sourceCar(saveWorld, teamId);
  const components = {};
  for (const component of TECHNICAL_COMPONENTS) {
    const value = numeric(source[component]);
    if (value !== null) components[component] = clamp(value, 1, 100);
  }
  return components;
}

function ensureCarState(saveWorld, teamId, components, date) {
  saveWorld.world.carState ??= {};
  saveWorld.world.carState[teamId] ??= {
    teamId,
    components: structuredClone(components),
    initializedAt: date,
    lastUpdated: date,
  };
  saveWorld.world.carState[teamId].components ??= structuredClone(components);
  return saveWorld.world.carState[teamId];
}

export function ensureTechnicalWorld(saveWorld) {
  saveWorld.world.technical ??= { teams: {} };
  saveWorld.world.technical.teams ??= {};
  ensureHistory(saveWorld);
  return saveWorld.world.technical;
}

export function ensureTechnicalTeam(saveWorld, teamId, date = saveWorld.clock?.date ?? null) {
  const world = ensureTechnicalWorld(saveWorld);
  if (world.teams[teamId]) return world.teams[teamId];
  const components = initialComponents(saveWorld, teamId);
  ensureCarState(saveWorld, teamId, components, date);
  const specs = {};
  const fittedCars = { car1: { components: {} }, car2: { components: {} } };
  for (const [component, rating] of Object.entries(components)) {
    const specId = `initial:${teamId}:${component}`;
    specs[specId] = {
      specId,
      teamId,
      component,
      rating: round(rating),
      gain: 0,
      targetSeason: Number(saveWorld.clock?.season),
      status: "active",
      source: "historical_start_input",
      createdAt: date,
    };
    fittedCars.car1.components[component] = specId;
    fittedCars.car2.components[component] = specId;
  }
  const team = {
    teamId,
    initializedAt: date,
    sequence: 0,
    baseComponents: structuredClone(components),
    specs,
    inventory: {},
    fittedCars,
    designProjects: [],
    manufacturingJobs: [],
    facilities: initializeFacilities(saveWorld, teamId),
    facilityUpgrades: [],
  };
  world.teams[teamId] = team;
  return team;
}

export function initializeTechnicalWorld(saveWorld, date = saveWorld.clock?.date ?? null) {
  let teams = 0;
  for (const row of saveWorld.world?.teams ?? []) {
    if (!row.team_id) continue;
    ensureTechnicalTeam(saveWorld, row.team_id, date);
    teams += 1;
  }
  return teams;
}

function staffRowsForTeam(saveWorld, teamId) {
  const employment = saveWorld.world?.employment?.staff ?? {};
  const ids = new Set(Object.entries(employment)
    .filter(([, assignment]) => assignment?.teamId === teamId && assignment?.status === "employed")
    .map(([id]) => id));
  return (saveWorld.world?.staffRatings ?? []).filter((row) => ids.has(row.staff_id));
}

function ratingAverage(rows, fields, fallback = 50) {
  const values = [];
  for (const row of rows) {
    for (const field of fields) {
      const value = numeric(row?.[field]);
      if (value !== null) values.push(value <= 10 ? value * 10 : value);
    }
  }
  if (!values.length) return fallback;
  return clamp(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function driverFeedback(saveWorld, teamId) {
  const employment = saveWorld.world?.employment?.drivers ?? {};
  const ids = new Set(Object.entries(employment)
    .filter(([, assignment]) => assignment?.teamId === teamId && assignment?.status === "employed")
    .map(([id]) => id));
  const rows = (saveWorld.world?.driverRatings ?? []).filter((row) => ids.has(row.driver_id));
  return ratingAverage(rows, ["technical_feedback", "car_development_impact", "adaptability"], 50);
}

function staffEfficiency(saveWorld, teamId, component) {
  const rows = staffRowsForTeam(saveWorld, teamId);
  const fields = component === "aero_spec"
    ? ["aero", "aerodynamics", "design", "technical"]
    : ["technical", "design", "engineering", "mechanics", "reliability"];
  return ratingAverage(rows, fields, 50) / 100;
}

function facilityLevel(team, id, fallback = 5) {
  return numeric(team.facilities?.[id]?.level, fallback);
}

function designFacilityEfficiency(team, component) {
  const levels = component === "aero_spec"
    ? [facilityLevel(team, "windTunnel"), facilityLevel(team, "aeroDepartment")]
    : [facilityLevel(team, "chassisShop"), facilityLevel(team, "simulator")];
  return clamp(levels.reduce((sum, level) => sum + level, 0) / levels.length / 10, 0.2, 1);
}

function fittedRating(team, carSlot, component) {
  const specId = team.fittedCars?.[carSlot]?.components?.[component];
  return numeric(team.specs?.[specId]?.rating);
}

function currentComponentRating(team, component) {
  const values = [fittedRating(team, "car1", component), fittedRating(team, "car2", component)].filter((value) => value !== null);
  if (!values.length) return numeric(team.baseComponents?.[component], 50);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function activeDesign(team) {
  return team.designProjects.find((project) => project.status === "active") ?? null;
}

function componentLabel(component) {
  return String(component).replace(/_spec$/, "").replaceAll("_", " ");
}

export function startTechnicalDesignProject(saveWorld, teamId, input = {}) {
  const team = ensureTechnicalTeam(saveWorld, teamId);
  const component = String(input.component ?? "");
  if (!TECHNICAL_COMPONENTS.includes(component) || numeric(team.baseComponents?.[component]) === null) {
    throw new Error(`Component '${component}' is not available for this team's current-era car.`);
  }
  if (activeDesign(team)) throw new Error("Only one active design project is supported per team in Phase 36.");
  const season = Number(saveWorld.clock?.season);
  const targetSeason = input.targetSeason === "next" || Number(input.targetSeason) > season ? season + 1 : season;
  const focus = ["balanced", "performance", "reliability"].includes(input.focus) ? input.focus : "balanced";
  const baseRating = currentComponentRating(team, component);
  const staff = staffEfficiency(saveWorld, teamId, component);
  const facility = designFacilityEfficiency(team, component);
  const feedback = driverFeedback(saveWorld, teamId) / 100;
  const complexity = focus === "performance" ? 1.15 : focus === "reliability" ? 0.9 : 1;
  const cost = Math.max(35000, round((45000 + baseRating * 1800) * complexity * (targetSeason > season ? 1.12 : 1)));
  spend(saveWorld, teamId, cost, `${componentLabel(component)} design`);
  const id = nextId(team, "design", saveWorld.clock.date);
  const rng = createRng(`${saveWorld.meta.seed}|${id}|${component}|${focus}`);
  const potential = 0.45 + staff * 0.55 + facility * 0.45 + feedback * 0.22;
  const focusGain = focus === "performance" ? 0.35 : focus === "reliability" ? -0.08 : 0.12;
  const targetGain = round(clamp(potential + focusGain + (rng.next() - 0.5) * 0.34, 0.25, 2.6));
  const risk = round(clamp(0.32 - staff * 0.12 - facility * 0.10 + (focus === "performance" ? 0.16 : 0), 0.03, 0.55), 3);
  const computedDuration = clamp(Math.round(5 - staff * 1.3 - facility * 1.2 + complexity), 1, 6);
  const durationMonths = Math.max(1, Math.round(numeric(input.durationMonths, computedDuration)));
  const project = {
    projectId: id,
    teamId,
    component,
    focus,
    targetSeason,
    cost,
    source: input.source ?? "player",
    status: "active",
    startedAt: saveWorld.clock.date,
    durationMonths,
    monthsRemaining: durationMonths,
    targetGain,
    risk,
    staffEfficiency: round(staff, 3),
    facilityEfficiency: round(facility, 3),
    driverFeedback: round(feedback, 3),
  };
  team.designProjects.push(project);
  ensureHistory(saveWorld).push({ date: saveWorld.clock.date, type: "design_started", ...structuredClone(project) });
  return structuredClone(project);
}

function completeDesign(saveWorld, team, project, date) {
  const baseRating = currentComponentRating(team, project.component);
  const rng = createRng(`${saveWorld.meta.seed}|${project.projectId}|complete`);
  const penalty = rng.next() < project.risk ? 0.35 + rng.next() * 0.35 : 1;
  const realizedGain = round(project.targetGain * penalty);
  const specId = nextId(team, "spec", date);
  const spec = {
    specId,
    teamId: team.teamId,
    component: project.component,
    rating: round(clamp(baseRating + realizedGain, 1, 100)),
    gain: realizedGain,
    targetSeason: project.targetSeason,
    status: project.targetSeason > Number(saveWorld.clock.season) ? "future" : "ready_for_manufacture",
    source: "simulation_design",
    createdAt: date,
    projectId: project.projectId,
  };
  team.specs[specId] = spec;
  project.status = "completed";
  project.completedAt = date;
  project.specId = specId;
  project.realizedGain = realizedGain;
  ensureHistory(saveWorld).push({ date, type: "design_completed", teamId: team.teamId, projectId: project.projectId, specId, component: project.component, gain: realizedGain, targetSeason: project.targetSeason });
  return spec;
}

function manufacturingCapacity(team) {
  return Math.max(1, 1 + Math.floor(facilityLevel(team, "manufacturing") / 4));
}

function activeManufacturing(team) {
  return team.manufacturingJobs.filter((job) => job.status === "active");
}

export function startManufacturingJob(saveWorld, teamId, input = {}) {
  const team = ensureTechnicalTeam(saveWorld, teamId);
  const spec = team.specs?.[input.specId];
  if (!spec) throw new Error(`Technical specification '${input.specId}' does not exist.`);
  if (spec.status === "future" || Number(spec.targetSeason) > Number(saveWorld.clock.season)) {
    throw new Error("This specification belongs to a future-season car and cannot be manufactured yet.");
  }
  if (activeManufacturing(team).length >= manufacturingCapacity(team)) throw new Error("Manufacturing capacity is fully allocated.");
  const quantity = clamp(Math.round(numeric(input.quantity, 1)), 1, 4);
  const emergency = Boolean(input.emergency);
  const level = facilityLevel(team, "manufacturing");
  const unitCost = Math.max(9000, round((12000 + spec.rating * 420) * (emergency ? 1.45 : 1)));
  const cost = spend(saveWorld, teamId, unitCost * quantity, `${componentLabel(spec.component)} manufacturing`);
  const computedDuration = emergency ? 1 : level >= 8 ? 1 : level >= 5 ? 2 : 3;
  const durationMonths = Math.max(1, Math.round(numeric(input.durationMonths, computedDuration)));
  const job = {
    jobId: nextId(team, "manufacture", saveWorld.clock.date),
    teamId,
    specId: spec.specId,
    component: spec.component,
    quantity,
    unitCost,
    cost,
    emergency,
    source: input.source ?? "player",
    status: "active",
    startedAt: saveWorld.clock.date,
    durationMonths,
    monthsRemaining: durationMonths,
  };
  team.manufacturingJobs.push(job);
  ensureHistory(saveWorld).push({ date: saveWorld.clock.date, type: "manufacturing_started", ...structuredClone(job) });
  return structuredClone(job);
}

function completeManufacturing(saveWorld, team, job, date) {
  const inventory = team.inventory[job.specId] ??= { specId: job.specId, available: 0 };
  inventory.available += job.quantity;
  job.status = "completed";
  job.completedAt = date;
  ensureHistory(saveWorld).push({ date, type: "manufacturing_completed", teamId: team.teamId, jobId: job.jobId, specId: job.specId, quantity: job.quantity, available: inventory.available });
  return inventory.available;
}

function refreshCarStateFromFitment(saveWorld, team, date) {
  const car = ensureCarState(saveWorld, team.teamId, team.baseComponents, date);
  const components = {};
  for (const component of Object.keys(team.baseComponents)) {
    components[component] = round(currentComponentRating(team, component));
  }
  car.components = components;
  car.lastUpdated = date;
}

export function fitComponentSpec(saveWorld, teamId, input = {}) {
  const team = ensureTechnicalTeam(saveWorld, teamId);
  const carSlot = input.carSlot === "car2" ? "car2" : "car1";
  const spec = team.specs?.[input.specId];
  if (!spec || spec.status === "future") throw new Error("The selected specification is not available for fitting.");
  const inventory = team.inventory?.[spec.specId];
  if (!inventory || inventory.available < 1) throw new Error("No manufactured unit of this specification is available.");
  const component = spec.component;
  const previousSpecId = team.fittedCars[carSlot].components[component] ?? null;
  inventory.available -= 1;
  if (previousSpecId) {
    const returned = team.inventory[previousSpecId] ??= { specId: previousSpecId, available: 0 };
    returned.available += 1;
  }
  team.fittedCars[carSlot].components[component] = spec.specId;
  spec.status = "active";
  refreshCarStateFromFitment(saveWorld, team, saveWorld.clock.date);
  const record = { date: saveWorld.clock.date, teamId, carSlot, component, specId: spec.specId, previousSpecId };
  ensureHistory(saveWorld).push({ ...record, type: "component_fitted" });
  return record;
}

export function startFacilityUpgrade(saveWorld, teamId, facilityId) {
  const team = ensureTechnicalTeam(saveWorld, teamId);
  const facility = team.facilities?.[facilityId];
  const definition = FACILITIES[facilityId];
  if (!facility || !definition) throw new Error(`Facility '${facilityId}' is not available for this team/era.`);
  if (team.facilityUpgrades.some((row) => row.facilityId === facilityId && row.status === "active")) throw new Error("This facility already has an active upgrade.");
  if (facility.level >= 10) throw new Error("This facility is already at the maximum supported level.");
  const fromLevel = facility.level;
  const toLevel = Math.min(10, fromLevel + 1);
  const cost = spend(saveWorld, teamId, definition.baseCost * (0.65 + fromLevel * 0.22), `${facility.label} upgrade`);
  const durationMonths = Math.max(2, Math.round(2 + fromLevel * 0.65));
  const upgrade = {
    upgradeId: nextId(team, "facility", saveWorld.clock.date),
    teamId,
    facilityId,
    fromLevel,
    toLevel,
    cost,
    status: "active",
    startedAt: saveWorld.clock.date,
    durationMonths,
    monthsRemaining: durationMonths,
    source: "simulation_upgrade",
  };
  team.facilityUpgrades.push(upgrade);
  ensureHistory(saveWorld).push({ date: saveWorld.clock.date, type: "facility_upgrade_started", ...structuredClone(upgrade) });
  return structuredClone(upgrade);
}

function completeFacilityUpgrade(saveWorld, team, upgrade, date) {
  const facility = team.facilities[upgrade.facilityId];
  facility.level = upgrade.toLevel;
  facility.source = "save_world_upgraded";
  facility.maintenanceDeltaAnnual = round(numeric(facility.maintenanceDeltaAnnual, 0) + upgrade.cost * 0.035);
  upgrade.status = "completed";
  upgrade.completedAt = date;
  ensureHistory(saveWorld).push({ date, type: "facility_upgrade_completed", teamId: team.teamId, upgradeId: upgrade.upgradeId, facilityId: upgrade.facilityId, level: facility.level });
  return facility.level;
}

export function releaseNextSeasonSpecifications(saveWorld, season = Number(saveWorld.clock.season)) {
  const released = [];
  for (const team of Object.values(ensureTechnicalWorld(saveWorld).teams)) {
    for (const spec of Object.values(team.specs)) {
      if (spec.status !== "future" || Number(spec.targetSeason) > Number(season)) continue;
      spec.status = "ready_for_manufacture";
      released.push({ teamId: team.teamId, specId: spec.specId, component: spec.component, targetSeason: spec.targetSeason });
    }
  }
  return released;
}

export function advanceTechnicalMonth(saveWorld, date = saveWorld.clock.date) {
  const events = [];
  for (const team of Object.values(ensureTechnicalWorld(saveWorld).teams)) {
    for (const project of team.designProjects) {
      if (project.status !== "active") continue;
      project.monthsRemaining -= 1;
      if (project.monthsRemaining > 0) continue;
      const spec = completeDesign(saveWorld, team, project, date);
      events.push({ type: TECHNICAL_EVENT.DESIGN_COMPLETED, payload: { team_id: team.teamId, project_id: project.projectId, spec_id: spec.specId, component: spec.component, rating: spec.rating, gain: spec.gain, target_season: spec.targetSeason } });
    }
    for (const job of team.manufacturingJobs) {
      if (job.status !== "active") continue;
      job.monthsRemaining -= 1;
      if (job.monthsRemaining > 0) continue;
      const available = completeManufacturing(saveWorld, team, job, date);
      events.push({ type: TECHNICAL_EVENT.MANUFACTURING_COMPLETED, payload: { team_id: team.teamId, job_id: job.jobId, spec_id: job.specId, component: job.component, quantity: job.quantity, available } });
    }
    for (const upgrade of team.facilityUpgrades) {
      if (upgrade.status !== "active") continue;
      upgrade.monthsRemaining -= 1;
      if (upgrade.monthsRemaining > 0) continue;
      const level = completeFacilityUpgrade(saveWorld, team, upgrade, date);
      events.push({ type: TECHNICAL_EVENT.FACILITY_UPGRADE_COMPLETED, payload: { team_id: team.teamId, upgrade_id: upgrade.upgradeId, facility_id: upgrade.facilityId, level } });
    }
  }
  return events;
}

export function technicalFacilityMaintenanceAnnual(saveWorld, teamId) {
  const team = ensureTechnicalTeam(saveWorld, teamId);
  return round(Object.values(team.facilities).reduce((sum, row) => sum + numeric(row.maintenanceDeltaAnnual, 0), 0));
}

function driverCarSlot(saveWorld, teamId, driverId) {
  const entries = (saveWorld.world?.raceEntryState?.current ?? [])
    .filter((entry) => entry.teamId === teamId)
    .sort((a, b) => Number(a.carNumber ?? 999) - Number(b.carNumber ?? 999) || String(a.driverId).localeCompare(String(b.driverId)));
  const index = entries.findIndex((entry) => entry.driverId === driverId);
  return index === 1 ? "car2" : "car1";
}

export function technicalCarComponentsForDriver(saveWorld, teamId, driverId, currentTeamComponents = null) {
  const team = ensureTechnicalWorld(saveWorld).teams?.[teamId];
  const current = currentTeamComponents ?? saveWorld.world?.carState?.[teamId]?.components ?? sourceCar(saveWorld, teamId);
  if (!team) return structuredClone(current);
  const slot = driverCarSlot(saveWorld, teamId, driverId);
  const result = structuredClone(current);
  for (const component of Object.keys(team.baseComponents ?? {})) {
    const slotRating = fittedRating(team, slot, component);
    const averageRating = currentComponentRating(team, component);
    const currentValue = numeric(current?.[component]);
    if (slotRating !== null && averageRating !== null && currentValue !== null) {
      result[component] = round(clamp(currentValue + (slotRating - averageRating), 1, 100), 4);
    }
  }
  return result;
}

export function technicalProjection(saveWorld, teamId) {
  if (!teamId) return null;
  const team = ensureTechnicalTeam(saveWorld, teamId);
  const activeDesigns = team.designProjects.filter((row) => row.status === "active");
  const activeManufacturing = team.manufacturingJobs.filter((row) => row.status === "active");
  const readySpecs = Object.values(team.specs).filter((row) => row.status === "ready_for_manufacture" || row.status === "active");
  return {
    teamId,
    car: {
      components: structuredClone(saveWorld.world?.carState?.[teamId]?.components ?? {}),
      fittedCars: structuredClone(team.fittedCars),
    },
    design: {
      active: structuredClone(activeDesigns),
      completed: structuredClone(team.designProjects.filter((row) => row.status === "completed").slice(-12)),
      availableComponents: Object.keys(team.baseComponents),
    },
    specifications: readySpecs.map((spec) => ({ ...structuredClone(spec), inventory: numeric(team.inventory?.[spec.specId]?.available, 0) })),
    manufacturing: {
      capacity: manufacturingCapacity(team),
      active: structuredClone(activeManufacturing),
      inventory: structuredClone(team.inventory),
    },
    facilities: Object.values(team.facilities).map((row) => ({ ...structuredClone(row), upgrade: team.facilityUpgrades.find((upgrade) => upgrade.facilityId === row.id && upgrade.status === "active") ?? null })),
    facilityUpgrades: structuredClone(team.facilityUpgrades.slice(-12)),
  };
}

export function technicalSummary(saveWorld, teamId) {
  if (!teamId) return { activeDesigns: 0, manufacturingJobs: 0, readySpecs: 0, facilityUpgrades: 0 };
  const team = ensureTechnicalTeam(saveWorld, teamId);
  return {
    activeDesigns: team.designProjects.filter((row) => row.status === "active").length,
    manufacturingJobs: team.manufacturingJobs.filter((row) => row.status === "active").length,
    readySpecs: Object.values(team.specs).filter((row) => row.status === "ready_for_manufacture").length,
    facilityUpgrades: team.facilityUpgrades.filter((row) => row.status === "active").length,
  };
}
