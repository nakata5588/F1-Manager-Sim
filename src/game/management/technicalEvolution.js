import { regulationPackage } from "./regulations.js";

const DISCIPLINES = Object.freeze({
  aero: {
    label: "Aerodynamics",
    components: ["aero_spec"],
    facilities: ["windTunnel", "aeroDepartment"],
  },
  chassis: {
    label: "Chassis",
    components: ["chassis_spec", "suspension_spec"],
    facilities: ["chassisShop"],
  },
  mechanical: {
    label: "Mechanical Systems",
    components: ["gearbox_spec", "brakes_spec"],
    facilities: ["chassisShop", "manufacturing"],
  },
  powertrain_integration: {
    label: "Powertrain Integration",
    components: ["cooling_spec", "electronics_spec", "turbo_spec", "kers_spec", "ers_mgu_k", "ers_mgu_h", "battery_pack"],
    facilities: ["manufacturing"],
  },
  reliability: {
    label: "Reliability",
    components: [],
    facilities: ["manufacturing", "chassisShop"],
  },
});

const RELIABILITY_SENSITIVE = new Set([
  "gearbox_spec",
  "brakes_spec",
  "cooling_spec",
  "electronics_spec",
  "turbo_spec",
  "kers_spec",
  "ers_mgu_k",
  "ers_mgu_h",
  "battery_pack",
]);

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 3) {
  return Number(Number(value).toFixed(digits));
}

function componentMap(saveWorld, teamId) {
  const technical = saveWorld.world?.technical?.teams?.[teamId];
  if (technical?.baseComponents && Object.keys(technical.baseComponents).length) return technical.baseComponents;
  const dynamic = saveWorld.world?.carState?.[teamId]?.components;
  if (dynamic && Object.keys(dynamic).length) return dynamic;
  return (saveWorld.world?.carStats ?? []).find((row) => String(row.team_id ?? row.id ?? "") === String(teamId)) ?? {};
}

function valuesForDiscipline(components, discipline) {
  const definition = DISCIPLINES[discipline];
  if (!definition) return [];
  return definition.components
    .map((component) => numeric(components?.[component]))
    .filter((value) => value !== null);
}

function average(values, fallback = null) {
  if (!values.length) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function openingFamiliarity(saveWorld, teamId) {
  const components = componentMap(saveWorld, teamId);
  const all = Object.entries(components)
    .filter(([key]) => key.endsWith("_spec"))
    .map(([, value]) => numeric(value))
    .filter((value) => value !== null);
  const overall = average(all, 50);
  const disciplines = {};

  for (const [id, definition] of Object.entries(DISCIPLINES)) {
    if (id === "reliability") {
      disciplines[id] = {
        id,
        label: definition.label,
        familiarity: 1,
        openingRelativeStrength: 0,
        completedProjects: 0,
        lastProjectAt: null,
      };
      continue;
    }
    const values = valuesForDiscipline(components, id);
    const disciplineAverage = average(values, overall);
    const relative = disciplineAverage - overall;
    disciplines[id] = {
      id,
      label: definition.label,
      familiarity: round(clamp(1 + relative / 180, 0.94, 1.06)),
      openingRelativeStrength: round(relative, 2),
      completedProjects: 0,
      lastProjectAt: null,
    };
  }
  return disciplines;
}

export function technicalDisciplineForComponent(component) {
  for (const [id, definition] of Object.entries(DISCIPLINES)) {
    if (definition.components.includes(component)) return id;
  }
  return "mechanical";
}

function evolutionWorld(saveWorld) {
  saveWorld.world ??= {};
  saveWorld.world.technical ??= { teams: {} };
  saveWorld.world.technical.teams ??= {};
  saveWorld.world.technical.evolution ??= {
    teams: {},
    history: [],
  };
  saveWorld.world.technical.evolution.teams ??= {};
  saveWorld.world.technical.evolution.history ??= [];
  saveWorld.history ??= {};
  saveWorld.history.technicalEvolution ??= [];
  return saveWorld.world.technical.evolution;
}

function conceptLabel(disciplines) {
  const performance = Object.values(disciplines)
    .filter((row) => row.id !== "reliability")
    .sort((a, b) => b.familiarity - a.familiarity || a.id.localeCompare(b.id));
  const reliability = disciplines.reliability;
  if (reliability?.familiarity >= 1.065 && reliability.familiarity >= (performance[0]?.familiarity ?? 1) + 0.012) {
    return "reliability_led";
  }
  const first = performance[0];
  const second = performance[1];
  if (first && first.familiarity >= 1.025 && first.familiarity - (second?.familiarity ?? 1) >= 0.012) {
    return `${first.id}_led`;
  }
  return "balanced";
}

function snapshot(identity, date, type, extra = {}) {
  return {
    date,
    season: identity.currentSeason,
    teamId: identity.teamId,
    type,
    concept: conceptLabel(identity.disciplines),
    disciplines: Object.fromEntries(
      Object.entries(identity.disciplines).map(([id, row]) => [id, {
        familiarity: row.familiarity,
        completedProjects: row.completedProjects,
      }]),
    ),
    ...extra,
  };
}

export function ensureTechnicalIdentity(saveWorld, teamId) {
  const state = evolutionWorld(saveWorld);
  const id = String(teamId);
  if (state.teams[id]) return state.teams[id];

  const identity = {
    teamId: id,
    initializedAt: saveWorld.clock?.date ?? null,
    currentSeason: Number(saveWorld.clock?.season),
    disciplines: openingFamiliarity(saveWorld, id),
    totalCompletedProjects: 0,
    focusHistory: { balanced: 0, performance: 0, reliability: 0 },
    seasonTransitions: [],
    lastProjectAt: null,
    provenance: "derived_gameplay_technical_identity",
  };
  state.teams[id] = identity;
  const record = snapshot(identity, saveWorld.clock?.date ?? null, "identity_initialized", {
    provenance: "opening_relative_car_strengths",
  });
  state.history.push(record);
  saveWorld.history.technicalEvolution.push(structuredClone(record));
  return identity;
}

export function initializeTechnicalEvolution(saveWorld) {
  let teams = 0;
  for (const row of saveWorld.world?.teams ?? []) {
    const teamId = row.team_id ?? row.id;
    if (!teamId) continue;
    ensureTechnicalIdentity(saveWorld, teamId);
    teams += 1;
  }
  return teams;
}

function regulationDevelopmentModifier(saveWorld) {
  const value = numeric(regulationPackage(saveWorld)?.technical?.developmentEfficiencyModifier, 1);
  return clamp(value, 0.5, 1.5);
}

export function technicalManufacturingCostModifier(saveWorld) {
  const value = numeric(regulationPackage(saveWorld)?.technical?.manufacturingCostModifier, 1);
  return clamp(value, 0.5, 1.5);
}

export function technicalDevelopmentModifier(saveWorld, teamId, component, focus = "balanced") {
  const identity = ensureTechnicalIdentity(saveWorld, teamId);
  const disciplineId = technicalDisciplineForComponent(component);
  const discipline = identity.disciplines[disciplineId] ?? { familiarity: 1 };
  const reliability = identity.disciplines.reliability ?? { familiarity: 1 };
  const projectFamiliarity = focus === "reliability"
    ? discipline.familiarity * 0.72 + reliability.familiarity * 0.28
    : discipline.familiarity;
  const regulation = regulationDevelopmentModifier(saveWorld);
  return {
    discipline: disciplineId,
    familiarity: round(projectFamiliarity),
    identityModifier: round(clamp(projectFamiliarity, 0.9, 1.12)),
    regulationModifier: round(regulation),
    totalModifier: round(clamp(projectFamiliarity * regulation, 0.72, 1.28)),
  };
}

export function recordTechnicalProjectCompletion(saveWorld, teamId, project, realizedGain = 0) {
  const identity = ensureTechnicalIdentity(saveWorld, teamId);
  const disciplineId = project?.technicalDiscipline ?? technicalDisciplineForComponent(project?.component);
  const discipline = identity.disciplines[disciplineId];
  if (!discipline) return technicalIdentityProjection(saveWorld, teamId);

  const gain = Math.max(0, numeric(realizedGain, 0));
  const focus = ["balanced", "performance", "reliability"].includes(project?.focus) ? project.focus : "balanced";
  const learning = clamp(0.004 + Math.min(0.015, gain * 0.005) + (focus === "performance" ? 0.002 : 0), 0.004, 0.021);
  discipline.familiarity = round(clamp(discipline.familiarity + learning, 0.9, 1.14));
  discipline.completedProjects += 1;
  discipline.lastProjectAt = project?.completedAt ?? saveWorld.clock?.date ?? null;

  if (focus === "reliability") {
    const reliability = identity.disciplines.reliability;
    reliability.familiarity = round(clamp(reliability.familiarity + 0.006 + Math.min(0.01, gain * 0.003), 0.9, 1.14));
    reliability.completedProjects += 1;
    reliability.lastProjectAt = discipline.lastProjectAt;
  }

  identity.totalCompletedProjects += 1;
  identity.focusHistory[focus] = Number(identity.focusHistory[focus] ?? 0) + 1;
  identity.lastProjectAt = discipline.lastProjectAt;

  const record = snapshot(identity, discipline.lastProjectAt, "project_learning", {
    projectId: project?.projectId ?? null,
    component: project?.component ?? null,
    discipline: disciplineId,
    focus,
    realizedGain: round(gain, 2),
    learning: round(learning),
  });
  const state = evolutionWorld(saveWorld);
  state.history.push(record);
  saveWorld.history.technicalEvolution.push(structuredClone(record));
  return technicalIdentityProjection(saveWorld, teamId);
}

export function applyTechnicalEvolutionSeasonTransition(saveWorld, seasonInput) {
  const season = Number(seasonInput ?? saveWorld.clock?.season);
  const carryover = clamp(numeric(regulationPackage(saveWorld)?.technical?.carryoverRetention, 1), 0.25, 1);
  const developmentModifier = regulationDevelopmentModifier(saveWorld);
  const state = evolutionWorld(saveWorld);
  const transitioned = [];

  for (const team of saveWorld.world?.teams ?? []) {
    const teamId = String(team.team_id ?? team.id ?? "");
    if (!teamId) continue;
    const identity = ensureTechnicalIdentity(saveWorld, teamId);
    if (Number(identity.currentSeason) >= season) continue;

    const before = Object.fromEntries(
      Object.entries(identity.disciplines).map(([id, row]) => [id, row.familiarity]),
    );
    for (const row of Object.values(identity.disciplines)) {
      row.familiarity = round(clamp(1 + (row.familiarity - 1) * carryover, 0.9, 1.14));
    }
    identity.currentSeason = season;
    const transition = {
      season,
      date: saveWorld.clock?.date ?? null,
      carryoverRetention: round(carryover),
      developmentEfficiencyModifier: round(developmentModifier),
      before,
      after: Object.fromEntries(
        Object.entries(identity.disciplines).map(([id, row]) => [id, row.familiarity]),
      ),
    };
    identity.seasonTransitions.push(transition);
    const record = snapshot(identity, transition.date, "season_transition", transition);
    state.history.push(record);
    saveWorld.history.technicalEvolution.push(structuredClone(record));
    transitioned.push({ teamId, ...transition });
  }
  return transitioned;
}

function experienceLabel(familiarity) {
  if (familiarity >= 1.07) return "signature";
  if (familiarity >= 1.025) return "established";
  if (familiarity <= 0.94) return "rebuilding";
  if (familiarity <= 0.98) return "developing";
  return "balanced";
}

export function technicalIdentityProjection(saveWorld, teamId) {
  if (!teamId) return null;
  const identity = ensureTechnicalIdentity(saveWorld, teamId);
  const strategy = saveWorld.world?.technical?.teams?.[teamId]?.seasonStrategy ?? null;
  const disciplines = Object.values(identity.disciplines)
    .map((row) => ({
      id: row.id,
      label: row.label,
      familiarity: row.familiarity,
      experienceIndex: Math.round(row.familiarity * 100),
      status: experienceLabel(row.familiarity),
      completedProjects: row.completedProjects,
      lastProjectAt: row.lastProjectAt,
      openingRelativeStrength: row.openingRelativeStrength,
    }))
    .sort((a, b) => b.familiarity - a.familiarity || a.label.localeCompare(b.label));
  const strongest = disciplines.filter((row) => row.familiarity > 1.015).slice(0, 2);
  const developing = [...disciplines].sort((a, b) => a.familiarity - b.familiarity || a.label.localeCompare(b.label)).filter((row) => row.familiarity < 0.99).slice(0, 2);
  const regulations = regulationPackage(saveWorld)?.technical ?? {};

  return {
    teamId: String(teamId),
    season: Number(saveWorld.clock?.season),
    concept: conceptLabel(identity.disciplines),
    currentSeasonFocus: strategy?.technicalFocus ?? "balanced",
    totalCompletedProjects: identity.totalCompletedProjects,
    focusHistory: structuredClone(identity.focusHistory),
    disciplines,
    strengths: strongest,
    developing,
    regulationContext: {
      carryoverRetention: numeric(regulations.carryoverRetention, 1),
      developmentEfficiencyModifier: numeric(regulations.developmentEfficiencyModifier, 1),
      manufacturingCostModifier: numeric(regulations.manufacturingCostModifier, 1),
    },
    recentTransitions: structuredClone(identity.seasonTransitions.slice(-4)),
    provenance: identity.provenance,
  };
}

export function rankTechnicalDevelopmentCandidates(saveWorld, teamId, components = {}, focus = "balanced") {
  const identity = ensureTechnicalIdentity(saveWorld, teamId);
  return Object.entries(components)
    .filter(([, rating]) => numeric(rating) !== null)
    .map(([component, rating]) => {
      const disciplineId = technicalDisciplineForComponent(component);
      const familiarity = identity.disciplines[disciplineId]?.familiarity ?? 1;
      const need = clamp((100 - numeric(rating, 50)) / 100, 0, 1);
      const continuity = clamp((familiarity - 0.9) / 0.24, 0, 1);
      const reliabilityNeed = RELIABILITY_SENSITIVE.has(component) ? 1 : 0;
      let score;
      if (focus === "performance") score = need * 0.58 + continuity * 0.42;
      else if (focus === "reliability") score = need * 0.62 + reliabilityNeed * 0.28 + continuity * 0.1;
      else score = need * 0.82 + continuity * 0.18;
      return {
        component,
        discipline: disciplineId,
        rating: numeric(rating, 50),
        familiarity: round(familiarity),
        score: round(score, 5),
      };
    })
    .sort((a, b) => b.score - a.score || a.rating - b.rating || a.component.localeCompare(b.component));
}

export function preferredTechnicalFacilities(saveWorld, teamId) {
  const identity = ensureTechnicalIdentity(saveWorld, teamId);
  const concept = conceptLabel(identity.disciplines);
  const discipline = concept.endsWith("_led") ? concept.replace(/_led$/, "") : null;
  const preferred = discipline && DISCIPLINES[discipline]?.facilities?.length
    ? DISCIPLINES[discipline].facilities
    : ["manufacturing", "windTunnel", "aeroDepartment", "chassisShop"];
  return [...new Set(preferred)];
}

export { DISCIPLINES as TECHNICAL_DISCIPLINES };
