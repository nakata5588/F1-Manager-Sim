import { ensureTechnicalWorld } from "./technical.js";
import { ensureRegulationState } from "./regulations.js";

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum = 1, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 3) {
  return Number(Number(value).toFixed(digits));
}

function median(values, fallback = 50) {
  const numbers = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!numbers.length) return fallback;
  const middle = Math.floor(numbers.length / 2);
  return numbers.length % 2 ? numbers[middle] : (numbers[middle - 1] + numbers[middle]) / 2;
}

function fittedSpec(team, carSlot, component) {
  const id = team?.fittedCars?.[carSlot]?.components?.[component];
  return id ? team.specs?.[id] ?? null : null;
}

function fieldCenters(teams) {
  const byComponent = new Map();
  const reliabilityByComponent = new Map();
  for (const team of Object.values(teams ?? {})) {
    for (const carSlot of ["car1", "car2"]) {
      for (const component of Object.keys(team?.fittedCars?.[carSlot]?.components ?? {})) {
        const spec = fittedSpec(team, carSlot, component);
        const rating = numeric(spec?.rating);
        const reliability = numeric(spec?.reliabilityRating ?? spec?.reliabilityReference);
        if (rating !== null) (byComponent.get(component) ?? byComponent.set(component, []).get(component)).push(rating);
        if (reliability !== null) (reliabilityByComponent.get(component) ?? reliabilityByComponent.set(component, []).get(component)).push(reliability);
      }
    }
  }
  const centers = {};
  const reliabilityCenters = {};
  for (const [component, values] of byComponent.entries()) centers[component] = median(values, 50);
  for (const [component, values] of reliabilityByComponent.entries()) reliabilityCenters[component] = median(values, 70);
  return { centers, reliabilityCenters };
}

function refreshCarProjection(saveWorld, team) {
  saveWorld.world.carState ??= {};
  const projection = saveWorld.world.carState[team.teamId] ??= { teamId: team.teamId, components: {} };
  projection.components ??= {};
  const components = new Set([
    ...Object.keys(team.baseComponents ?? {}),
    ...Object.keys(team.fittedCars?.car1?.components ?? {}),
    ...Object.keys(team.fittedCars?.car2?.components ?? {}),
  ]);
  for (const component of components) {
    const ratings = ["car1", "car2"]
      .map((slot) => numeric(fittedSpec(team, slot, component)?.rating))
      .filter((value) => value !== null);
    if (ratings.length) projection.components[component] = round(ratings.reduce((sum, value) => sum + value, 0) / ratings.length, 4);
  }
  projection.lastUpdated = saveWorld.clock?.date ?? null;
  projection.source = "regulation_transition_projection";
}

export function applyTechnicalRegulationTransition(saveWorld, seasonInput, options = {}) {
  const season = Number(seasonInput ?? saveWorld.clock?.season);
  const regulation = ensureRegulationState(saveWorld).currentPackage?.technical ?? {};
  const carryoverRetention = Math.min(1, Math.max(0.25, numeric(regulation.carryoverRetention, 0.86)));
  const reliabilityRetention = Math.min(1, Math.max(0.25, numeric(regulation.reliabilityRetention, 0.9)));
  const teams = ensureTechnicalWorld(saveWorld).teams ?? {};
  const { centers, reliabilityCenters } = fieldCenters(teams);
  const affected = [];

  for (const team of Object.values(teams)) {
    let adjustedSpecs = 0;
    for (const spec of Object.values(team.specs ?? {})) {
      const targetSeason = Number(spec.targetSeason ?? season - 1);
      if (targetSeason >= season) continue;
      if (spec.lastRegulationTransitionSeason && Number(spec.lastRegulationTransitionSeason) >= season) continue;
      const center = numeric(centers[spec.component], 50);
      const previousRating = numeric(spec.rating, center);
      spec.rating = round(clamp(center + (previousRating - center) * carryoverRetention), 3);
      const previousReliability = numeric(spec.reliabilityRating ?? spec.reliabilityReference);
      if (previousReliability !== null) {
        const reliabilityCenter = numeric(reliabilityCenters[spec.component], 70);
        spec.reliabilityRating = round(clamp(reliabilityCenter + (previousReliability - reliabilityCenter) * reliabilityRetention), 3);
        spec.reliabilitySource = "regulation_transition";
      }
      spec.lastRegulationTransitionSeason = season;
      spec.regulationCarryoverRetention = carryoverRetention;
      spec.regulationReliabilityRetention = reliabilityRetention;
      adjustedSpecs += 1;
    }
    if (!adjustedSpecs) continue;
    refreshCarProjection(saveWorld, team);
    affected.push({ teamId: team.teamId, adjustedSpecs });
  }

  saveWorld.history.governance ??= [];
  const record = {
    date: saveWorld.clock?.date ?? null,
    type: "technical_regulation_transition",
    season,
    carryoverRetention,
    reliabilityRetention,
    affectedTeams: affected.length,
    affectedSpecs: affected.reduce((sum, row) => sum + row.adjustedSpecs, 0),
    source: options.source ?? "regulation_package",
  };
  saveWorld.history.governance.push(record);
  return { ...record, teams: affected };
}
