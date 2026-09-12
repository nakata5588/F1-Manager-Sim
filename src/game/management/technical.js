import { createRng } from "../../sim/random.js";
import { preseasonDevelopmentBonus } from "./preseason.js";

export const TECHNICAL_COMPONENTS = Object.freeze([
  "chassis_spec",
  "aero_spec",
  "gearbox_spec",
  "suspension_spec",
  "brakes_spec",
  "cooling_spec",
]);

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

const FACILITY_SOURCE_FIELDS = Object.freeze({
  windTunnel: ["wind_tunnel_level", "wind_tunnel", "windTunnel"],
  simulator: ["simulator_level", "simulator"],
  aeroDepartment: ["aero_dept_level", "aero_department_level", "aeroDepartment"],
  chassisShop: ["chassis_shop_level", "chassis_department_level", "chassisShop"],
  manufacturing: ["manufacturing_level", "factory_level", "manufacturing"],
});

const FACILITY_LABELS = Object.freeze({
  windTunnel: "Wind Tunnel",
  simulator: "Simulator",
  aeroDepartment: "Aero Department",
  chassisShop: "Chassis Shop",
  manufacturing: "Manufacturing",
});

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 2) {
  return Number(Number(value).toFixed(digits));
}

function sourceCar(saveWorld, teamId) {
  const season = Number(saveWorld.clock?.season);
  return (saveWorld.world?.carStats ?? []).find((row) => row.team_id === teamId && (!Number(row.year) || Number(row.year) === season))
    ?? (saveWorld.world?.carStats ?? []).find((row) => row.team_id === teamId)
    ?? {};
}

function sourceFacility(saveWorld, teamId) {
  const season = Number(saveWorld.clock?.season);
  return (saveWorld.world?.facilities ?? []).find((row) => row.team_id === teamId && (!Number(row.year) || Number(row.year) === season))
    ?? (saveWorld.world?.facilities ?? []).find((row) => row.team_id === teamId)
    ?? {};
}

function sourceLevel(row, fields) {
  for (const field of fields) {
    const value = numeric(row?.[field]);
    if (value !== null) return { value: clamp(value, 0, 10), sourceField: field };
  }
  return null;
}

function initialComponents(car) {
  const result = {};
  for (const component of TECHNICAL_COMPONENTS) {
    const value = numeric(car?.[component]);
    if (value !== null) result[component] = clamp(value, 1, 100);
  }
  return result;
}

function facilityState(saveWorld, teamId) {
  const row = sourceFacility(saveWorld, teamId);
  const facilities = {};
  for (const [id, fields] of Object.entries(FACILITY_SOURCE_FIELDS)) {
    const sourced = sourceLevel(row, fields);
    const fallback = id === "manufacturing" ? 5 : id === "simulator" ? 5 : 4;
    facilities[id] = {
      id,
      label: FACILITY_LABELS[id],
      level: sourced?.value ?? fallback,
      source: sourced ? "historical_start_input" : "derived_gameplay_baseline",
      sourceField: sourced?.sourceField ?? null,
      maintenanceDeltaAnnual: 0,
    };
  }
  return facilities;
}

function ensureHistory(saveWorld) {
  saveWorld.history.development ??= [];
  saveWorld.history.technical ??= [];
}

function initialSpec(teamId, component, rating, season, date) {
  return {
    specId: `initial:${teamId}:${component}`,
    teamId,
    component,
    rating: round(rating),
    gain: 0,
    targetSeason: season,
    status: "active",
    source: "historical_starting_car",
    createdAt: date,
  };
}

export function ensureTechnicalWorld(saveWorld) {
  saveWorld.world.technical ??= { teams: {} };
  saveWorld.world.technical.teams ??= {};
  saveWorld.world.carState ??= {};
  ensureHistory(saveWorld);
  return saveWorld.world.technical;
}

export function ensureTechnicalTeam(saveWorld, teamId, date = saveWorld.clock?.date) {
  const world = ensureTechnicalWorld(saveWorld);
  if (world.teams[teamId]) return world.teams[teamId];
  const components = initialComponents(sourceCar(saveWorld, teamId));
  const specs = {};
  const fittedCars = { car1: { components: {} }, car2: { components: {} } };
  for (const [component, rating] of Object.entries(components)) {
    const spec = initialSpec(teamId, component, rating, Number(saveWorld.clock?.season), date);
    specs[spec.specId] = spec;
    fittedCars.car1.components[component] = spec.specId;
    fittedCars.car2.components[component] = spec.specId;
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
    facilities: facilityState(saveWorld, teamId),
    facilityUpgrades: [],
  };
  world.teams[teamId] = team;
  saveWorld.world.carState[teamId] = {
    teamId,
    components: structuredClone(components),
    initializedAt: date,
    lastUpdated: date,
    source: "historical_starting_car",
  };
  return team;
}

export function initializeTechnicalWorld(saveWorld, date = saveWorld.clock?.date) {
  let created = 0;
  for (const row of saveWorld.world?.teams ?? []) {
    if (!row?.team_id) continue;
    const before = Boolean(saveWorld.world?.technical?.teams?.[row.team_id]);
    ensureTechnicalTeam(saveWorld, row.team_id, date);
    if (!before) created += 1;
  }
  return created;
}

function designEfficiency(saveWorld, teamId, component) {
  const staffAssignments = saveWorld.world?.employment?.staff ?? {};
  const staffIds = Object.entries(staffAssignments)
    .filter(([, assignment]) => assignment?.teamId === teamId && assignment?.status === "employed")
    .map(([id]) => id);
  const staffValues = [];
  for (const staffId of staffIds) {
    const row = (saveWorld.world?.staffRatings ?? []).find((candidate) => candidate.staff_id === staffId) ?? {};
    for (const field of component === "aero_spec" ? ["aerodynamics", "design", "technical"] : ["technical", "engineering", "design"]) {
      const value = numeric(row[field]);
      if (value !== null) staffValues.push(value <= 10 ? value * 10 : value);
    }
  }
  const staff = staffValues.length ? staffValues.reduce((sum, value) => sum + value, 0) / staffValues.length : 50;
  const team = ensureTechnicalTeam(saveWorld, teamId);
  const facilityIds = component === "aero_spec" ? ["windTunnel", "aeroDepartment"] : ["chassisShop", "simulator"];
  const facilities = facilityIds.map((id) => numeric(team.facilities[id]?.level, 5) * 10).reduce((sum, value) => sum + value, 0) / facilityIds.length;
  const driverValues = [];
  for (const [driverId, assignment] of Object.entries(saveWorld.world?.employment?.drivers ?? {})) {
    if (assignment?.teamId !== teamId || assignment?.status !== "employed") continue;
    const row = (saveWorld.world?.driverRatings ?? []).find((candidate) => candidate.driver_id === driverId) ?? {};
    for (const field of ["technical_feedback", "car_development_impact"]) {
      const value = numeric(row[field]);
      if (value !== null) driverValues.push(value <= 10 ? value * 10 : value);
    }
  }
  const drivers = driverValues.length ? driverValues.reduce((sum, value) => sum + value, 0) / driverValues.length : 50;
  return clamp(staff * 0.45 + facilities * 0.35 + drivers * 0.2, 20, 100);
}

function activeComponentRating(team, component) {
  const ratings = ["car1", "car2"]
    .map((slot) => team.specs[team.fittedCars?.[slot]?.components?.[component]]?.rating)
    .map((value) => numeric(value))
    .filter((value) => value !== null);
  if (!ratings.length) return numeric(team.baseComponents?.[component], 50);
  return ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
}

function currentComponentRating(team, component) {
  return activeComponentRating(team, component);
}

function updateCarProjection(saveWorld, teamId) {
  const team = ensureTechnicalTeam(saveWorld, teamId);
  const components = {};
  for (const component of Object.keys(team.baseComponents)) components[component] = round(currentComponentRating(team, component));
  saveWorld.world.carState[teamId] ??= { teamId, components: {}, source: "technical_save_world" };
  saveWorld.world.carState[teamId].components = components;
  saveWorld.world.carState[teamId].lastUpdated = saveWorld.clock?.date ?? null;
  saveWorld.world.carState[teamId].source = "technical_save_world";
  return components;
}

function spend(saveWorld, teamId, amount, label) {
  const finance = saveWorld.world?.teamState?.[teamId];
  if (!finance) throw new Error(`Team '${teamId}' does not have initialized finances.`);
  const cost = Math.max(0, round(amount));
  if (numeric(finance.cash, 0) < cost) throw new Error(`The team does not have enough cash for ${label}.`);
  finance.cash = round(numeric(finance.cash, 0) - cost);
  return cost;
}

function designCost(currentRating, efficiency, focus, targetSeason) {
  const ratingFactor = Math.max(0.7, currentRating / 65);
  const focusFactor = focus === "performance" ? 1.24 : focus === "reliability" ? 1.12 : 1;
  const futureFactor = targetSeason > 0 ? 1.18 : 1;
  return round((65000 + ratingFactor * 45000 + efficiency * 900) * focusFactor * futureFactor);
}

function designDuration(efficiency, focus) {
  const base = efficiency >= 78 ? 1 : efficiency >= 55 ? 2 : 3;
  return Math.max(1, base + (focus === "performance" ? 1 : 0));
}

function normalizeTargetSeason(saveWorld, value) {
  const current = Number(saveWorld.clock?.season);
  if (value === undefined || value === null || value === "current") return current;
  if (value === "next") return current + 1;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < current || parsed > current + 1) throw new Error("Technical projects may currently target only the current or next season.");
  return parsed;
}

function normalizeFocus(value) {
  return ["balanced", "performance", "reliability"].includes(value) ? value : "balanced";
}

export function startTechnicalDesignProject(saveWorld, teamId, input = {}) {
  const team = ensureTechnicalTeam(saveWorld, teamId);
  const component = input.component;
  if (!component || !Object.hasOwn(team.baseComponents, component)) throw new Error(`Component '${component}' is not available on this car.`);
  if (team.designProjects.some((row) => row.status === "active")) throw new Error("This team already has an active design project.");
  const targetSeason = normalizeTargetSeason(saveWorld, input.targetSeason);
  const focus = normalizeFocus(input.focus);
  const efficiency = designEfficiency(saveWorld, teamId, component);
  const currentRating = currentComponentRating(team, component);
  const cost = spend(saveWorld, teamId, designCost(currentRating, efficiency, focus, targetSeason > Number(saveWorld.clock.season) ? 1 : 0), "design work");
  const durationMonths = Math.max(1, Math.round(numeric(input.durationMonths, designDuration(efficiency, focus))));
  const project = {
    projectId: `design:${teamId}:${String(++team.sequence).padStart(4, "0")}`,
    teamId,
    component,
    focus,
    targetSeason,
    status: "active",
    source: input.source ?? "player",
    startedAt: saveWorld.clock?.date ?? null,
    durationMonths,
    progressMonths: 0,
    efficiency: round(efficiency),
    baseRating: round(currentRating),
    cost,
  };
  team.designProjects.push(project);
  ensureHistory(saveWorld);
  saveWorld.history.development.push({ date: saveWorld.clock?.date ?? null, type: "started", teamId, projectId: project.projectId, component, targetSeason, cost });
  return structuredClone(project);
}

function developmentGain(saveWorld, project) {
  const rng = createRng(`${saveWorld.meta.seed}|${project.projectId}|gain`);
  const quality = project.efficiency / 100;
  const uncertainty = 0.72 + rng.next() * 0.56;
  const focus = project.focus === "performance" ? 1.28 : project.focus === "reliability" ? 0.84 : 1;
  const preseason = preseasonDevelopmentBonus(saveWorld, project.teamId, project.targetSeason);
  return round(clamp((1.1 + quality * 3.2) * uncertainty * focus * (1 + preseason), 0.4, 6.5));
}

function reliabilityGain(saveWorld, project) {
  const rng = createRng(`${saveWorld.meta.seed}|${project.projectId}|reliability`);
  const quality = project.efficiency / 100;
  const focus = project.focus === "reliability" ? 1.4 : project.focus === "performance" ? 0.82 : 1;
  return round(clamp((0.8 + quality * 3.1) * (0.84 + rng.next() * 0.32) * focus, 0.3, 6));
}

function completeDesign(saveWorld, team, project, date) {
  const gain = developmentGain(saveWorld, project);
  const reliability = reliabilityGain(saveWorld, project);
  project.status = "completed";
  project.completedAt = date;
  project.gain = gain;
  project.reliabilityGain = reliability;
  const specId = `spec:${project.teamId}:${project.component}:${String(++team.sequence).padStart(4, "0")}`;
  const currentSeason = Number(saveWorld.clock?.season);
  const baseReliability = numeric(team.specs?.[team.fittedCars?.car1?.components?.[project.component]]?.reliabilityRating, 75);
  const spec = {
    specId,
    teamId: project.teamId,
    component: project.component,
    rating: round(clamp(project.baseRating + gain, 1, 100)),
    gain,
    reliabilityRating: round(clamp(baseReliability + reliability, 1, 100)),
    reliabilityGain: reliability,
    focus: project.focus,
    targetSeason: project.targetSeason,
    status: project.targetSeason > currentSeason ? "future" : "ready_for_manufacture",
    source: "simulation_design",
    projectId: project.projectId,
    createdAt: date,
  };
  team.specs[specId] = spec;
  saveWorld.history.development.push({ date, type: "completed", teamId: project.teamId, projectId: project.projectId, component: project.component, targetSeason: project.targetSeason, gain, reliabilityGain: reliability, specId });
  return { type: TECHNICAL_EVENT.DESIGN_COMPLETED, payload: { team_id: project.teamId, project_id: project.projectId, component: project.component, spec_id: specId, target_season: project.targetSeason, gain, reliability_gain: reliability, rating: spec.rating } };
}

function manufacturingCapacity(team) {
  const level = numeric(team.facilities?.manufacturing?.level, 5);
  return Math.max(1, Math.floor(level / 3) + 1);
}

function manufacturingDuration(team, quantity, emergency) {
  const level = numeric(team.facilities?.manufacturing?.level, 5);
  const normal = Math.max(1, Math.ceil(quantity / Math.max(1, Math.floor(level / 3) + 1)));
  return emergency ? 1 : normal;
}

export function startManufacturingJob(saveWorld, teamId, input = {}) {
  const team = ensureTechnicalTeam(saveWorld, teamId);
  const spec = team.specs?.[input.specId];
  if (!spec) throw new Error(`Specification '${input.specId}' does not exist.`);
  if (spec.status === "future") throw new Error("A future-season specification cannot be manufactured before its target season.");
  if (Number(spec.targetSeason) > Number(saveWorld.clock?.season)) throw new Error("A future-season specification cannot be manufactured before its target season.");
  const active = team.manufacturingJobs.filter((row) => row.status === "active");
  if (active.length >= manufacturingCapacity(team)) throw new Error("Manufacturing capacity is fully allocated.");
  const quantity = Math.max(1, Math.min(6, Math.round(numeric(input.quantity, 1))));
  const emergency = Boolean(input.emergency);
  const unitCost = round(18000 + numeric(spec.rating, 50) * 620);
  const cost = spend(saveWorld, teamId, unitCost * quantity * (emergency ? 1.55 : 1), "manufacturing");
  const job = {
    jobId: `mfg:${teamId}:${String(++team.sequence).padStart(4, "0")}`,
    teamId,
    specId: spec.specId,
    component: spec.component,
    quantity,
    emergency,
    source: input.source ?? "player",
    status: "active",
    startedAt: saveWorld.clock?.date ?? null,
    durationMonths: manufacturingDuration(team, quantity, emergency),
    progressMonths: 0,
    cost,
  };
  team.manufacturingJobs.push(job);
  return structuredClone(job);
}

function completeManufacturing(saveWorld, team, job, date) {
  job.status = "completed";
  job.completedAt = date;
  team.inventory[job.specId] ??= { specId: job.specId, available: 0, source: "simulation_manufacturing" };
  team.inventory[job.specId].available += job.quantity;
  saveWorld.history.technical.push({ date, type: "manufacturing_completed", teamId: job.teamId, jobId: job.jobId, specId: job.specId, quantity: job.quantity, available: team.inventory[job.specId].available });
  return { type: TECHNICAL_EVENT.MANUFACTURING_COMPLETED, payload: { team_id: job.teamId, job_id: job.jobId, spec_id: job.specId, component: job.component, quantity: job.quantity, available: team.inventory[job.specId].available } };
}

function fittedRating(team, carSlot, component) {
  const specId = team.fittedCars?.[carSlot]?.components?.[component];
  return numeric(team.specs?.[specId]?.rating);
}

export function fitComponentSpec(saveWorld, teamId, input = {}) {
  const team = ensureTechnicalTeam(saveWorld, teamId);
  const carSlot = ["car1", "car2"].includes(input.carSlot) ? input.carSlot : null;
  if (!carSlot) throw new Error("carSlot must be 'car1' or 'car2'.");
  const spec = team.specs?.[input.specId];
  if (!spec) throw new Error(`Specification '${input.specId}' does not exist.`);
  if (Number(spec.targetSeason) > Number(saveWorld.clock?.season) || spec.status === "future") throw new Error("A future-season specification cannot be fitted before its target season.");
  const stock = team.inventory?.[spec.specId];
  if (!stock || numeric(stock.available, 0) < 1) throw new Error("No manufactured unit is available for this specification.");
  const previousSpecId = team.fittedCars[carSlot].components?.[spec.component] ?? null;
  stock.available -= 1;
  if (previousSpecId && previousSpecId !== spec.specId) {
    const previousReturnable = saveWorld.world?.reliability?.teams?.[teamId]?.cars?.[carSlot]?.components?.[spec.component]?.returnable !== false;
    team.inventory[previousSpecId] ??= { specId: previousSpecId, available: 0, source: "returned_from_car" };
    if (previousReturnable) team.inventory[previousSpecId].available += 1;
  }
  team.fittedCars[carSlot].components[spec.component] = spec.specId;
  spec.status = "active";
  updateCarProjection(saveWorld, teamId);
  const result = { teamId, carSlot, component: spec.component, specId: spec.specId, previousSpecId, date: saveWorld.clock?.date ?? null };
  saveWorld.history.technical.push({ type: "component_fitted", ...structuredClone(result) });
  return result;
}

function normalizeFacilityId(id) {
  if (!FACILITY_SOURCE_FIELDS[id]) throw new Error(`Facility '${id}' is not supported by the technical system.`);
  return id;
}

export function startFacilityUpgrade(saveWorld, teamId, facilityIdInput) {
  const team = ensureTechnicalTeam(saveWorld, teamId);
  const facilityId = normalizeFacilityId(facilityIdInput);
  const facility = team.facilities[facilityId];
  if (team.facilityUpgrades.some((row) => row.facilityId === facilityId && row.status === "active")) throw new Error(`${facility.label} already has an active upgrade.`);
  if (facility.level >= 10) throw new Error(`${facility.label} is already at the supported maximum.`);
  const toLevel = facility.level + 1;
  const cost = spend(saveWorld, teamId, 120000 + toLevel * toLevel * 38000, `${facility.label} upgrade`);
  const durationMonths = Math.max(2, Math.ceil(toLevel / 3));
  const upgrade = {
    upgradeId: `facility:${teamId}:${String(++team.sequence).padStart(4, "0")}`,
    teamId,
    facilityId,
    fromLevel: facility.level,
    toLevel,
    status: "active",
    startedAt: saveWorld.clock?.date ?? null,
    durationMonths,
    progressMonths: 0,
    cost,
  };
  team.facilityUpgrades.push(upgrade);
  return structuredClone(upgrade);
}

function completeFacilityUpgrade(saveWorld, team, upgrade, date) {
  upgrade.status = "completed";
  upgrade.completedAt = date;
  const facility = team.facilities[upgrade.facilityId];
  facility.level = upgrade.toLevel;
  facility.maintenanceDeltaAnnual = round(numeric(facility.maintenanceDeltaAnnual, 0) + 18000 * upgrade.toLevel);
  saveWorld.history.technical.push({ date, type: "facility_upgrade_completed", teamId: team.teamId, facilityId: facility.id, toLevel: facility.level, maintenanceDeltaAnnual: facility.maintenanceDeltaAnnual });
  return { type: TECHNICAL_EVENT.FACILITY_UPGRADE_COMPLETED, payload: { team_id: team.teamId, upgrade_id: upgrade.upgradeId, facility_id: facility.id, to_level: facility.level, maintenance_delta_annual: facility.maintenanceDeltaAnnual } };
}

export function releaseNextSeasonSpecifications(saveWorld, season = Number(saveWorld.clock.season)) {
  const released = [];
  for (const team of Object.values(ensureTechnicalWorld(saveWorld).teams)) {
    for (const spec of Object.values(team.specs)) {
      if (spec.status !== "future" || Number(spec.targetSeason) !== Number(season)) continue;
      spec.status = "ready_for_manufacture";
      spec.releasedAt = saveWorld.clock?.date ?? null;
      released.push(structuredClone(spec));
    }
  }
  return released;
}

export function advanceTechnicalMonth(saveWorld, date = saveWorld.clock?.date) {
  const events = [];
  for (const team of Object.values(ensureTechnicalWorld(saveWorld).teams)) {
    for (const project of team.designProjects.filter((row) => row.status === "active")) {
      project.progressMonths += 1;
      if (project.progressMonths >= project.durationMonths) events.push(completeDesign(saveWorld, team, project, date));
    }
    for (const job of team.manufacturingJobs.filter((row) => row.status === "active")) {
      job.progressMonths += 1;
      if (job.progressMonths >= job.durationMonths) events.push(completeManufacturing(saveWorld, team, job, date));
    }
    for (const upgrade of team.facilityUpgrades.filter((row) => row.status === "active")) {
      upgrade.progressMonths += 1;
      if (upgrade.progressMonths >= upgrade.durationMonths) events.push(completeFacilityUpgrade(saveWorld, team, upgrade, date));
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
  // Player-owned future specifications are safe to expose here: they are Save World
  // research outcomes, not hidden historical future data. Manufacturing/fitment still
  // reject them until their target season is active.
  const visibleSpecs = Object.values(team.specs).filter((row) => ["ready_for_manufacture", "active", "future"].includes(row.status));
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
    specifications: visibleSpecs.map((spec) => ({ ...structuredClone(spec), inventory: numeric(team.inventory?.[spec.specId]?.available, 0) })),
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
