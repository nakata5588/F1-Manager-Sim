import { entityVisibilityState } from "../../domain/entityVisibility.js";
import { createRng } from "../random.js";
import { SIM_EVENT } from "../timeEngine.js";
import { ageOnDate, registerCareerProfile } from "./careerLifecycle.js";

export const TALENT_EVENT = Object.freeze({
  PIPELINE_INITIALIZED: "talent.pipeline_initialized",
  COHORT_GENERATED: "talent.cohort_generated",
  FEEDER_SEASON_COMPLETED: "talent.feeder_season_completed",
});

const FIRST_NAMES = [
  "Adrian", "Alex", "Andre", "Bruno", "Carlos", "Daniel", "Emil", "Felix",
  "Henrik", "Julian", "Leo", "Luca", "Marco", "Marek", "Matteo", "Miguel",
  "Nico", "Paulo", "Rafael", "Stefan", "Tomas", "Victor",
];

const LAST_NAMES = [
  "Alves", "Costa", "Duarte", "Ferraz", "Keller", "Kovac", "Lambert", "Laurent",
  "Martin", "Moretti", "Navarro", "Pereira", "Rinaldi", "Rossi", "Santos", "Silva",
  "Varela", "Vogel", "Weber", "Velen",
];

const DRIVER_ATTRIBUTES = [
  "pace",
  "qualifying",
  "start_launch",
  "racecraft",
  "wet_skill",
  "consistency",
  "tire_management",
  "race_intelligence",
  "technical_feedback",
  "adaptability",
  "mentality",
  "aggression",
  "pressure_handling",
  "team_player",
  "car_development_impact",
];

function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 2) {
  return Number(Number(value).toFixed(digits));
}

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

export function ensureTalentPipelineState(saveWorld) {
  saveWorld.world ??= {};
  saveWorld.world.management ??= {};
  saveWorld.world.management.talentPipeline ??= {
    version: 1,
    nextGeneratedDriverSerial: 1,
    generatedSeasons: [],
    generatedDriverIds: [],
    cohorts: [],
    feederHistory: [],
  };
  const state = saveWorld.world.management.talentPipeline;
  state.version = Math.max(1, Number(state.version ?? 1));
  state.nextGeneratedDriverSerial = Math.max(1, Number(state.nextGeneratedDriverSerial ?? 1));
  state.generatedSeasons ??= [];
  state.generatedDriverIds ??= [];
  state.cohorts ??= [];
  state.feederHistory ??= [];
  return state;
}

function activeTeamCount(saveWorld) {
  const inactive = new Set(saveWorld.world?.teamEvolution?.inactiveTeamIds ?? []);
  const teams = (saveWorld.world?.teams ?? []).filter((row) => {
    const id = row?.team_id ?? row?.id;
    return id && !inactive.has(id);
  });
  return Math.max(1, teams.length || 10);
}

function cohortSize(saveWorld, options = {}) {
  const explicit = Number(options.cohortSize);
  if (Number.isInteger(explicit) && explicit >= 0) return explicit;
  return clamp(Math.round(activeTeamCount(saveWorld) / 4), 3, 6);
}

function nationalityPool(saveWorld) {
  const values = [];
  for (const row of saveWorld.world?.drivers ?? []) {
    const value = text(row?.nationality ?? row?.country ?? row?.country_code);
    if (value) values.push(value);
  }
  for (const row of saveWorld.world?.teams ?? []) {
    const value = text(row?.nationality ?? row?.country ?? row?.country_code);
    if (value) values.push(value);
  }
  return values.length
    ? values
    : ["British", "French", "Italian", "Brazilian", "Argentine", "Australian"];
}

function allDriverIds(saveWorld) {
  return new Set([
    ...(saveWorld.world?.drivers ?? []),
    ...(saveWorld.world?.futureDrivers ?? []),
  ].map((row) => String(row?.driver_id ?? row?.id ?? "")).filter(Boolean));
}

function allDriverNames(saveWorld) {
  return new Set([
    ...(saveWorld.world?.drivers ?? []),
    ...(saveWorld.world?.futureDrivers ?? []),
  ].map((row) => text(row?.display_name ?? row?.driver_name ?? row?.name).toLowerCase()).filter(Boolean));
}

function nextGeneratedId(saveWorld, season) {
  const state = ensureTalentPipelineState(saveWorld);
  const ids = allDriverIds(saveWorld);
  while (true) {
    const serial = state.nextGeneratedDriverSerial++;
    const id = `gen_drv_${season}_${String(serial).padStart(4, "0")}`;
    if (!ids.has(id)) return { id, serial };
  }
}

function generatedName(saveWorld, rng, serial) {
  const names = allDriverNames(saveWorld);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidate = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
    if (!names.has(candidate.toLowerCase())) return candidate;
  }
  return `${rng.pick(FIRST_NAMES) ?? "Driver"} ${rng.pick(LAST_NAMES) ?? "Talent"} ${serial}`;
}

function birthDateFor(rng, season, age) {
  const year = Number(season) - age;
  const month = rng.int(1, 12);
  const day = rng.int(1, 28);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function generatedRating(rng, driverId, season) {
  const currentAbility = rng.int(34, 53);
  const potentialAbility = clamp(currentAbility + rng.int(19, 42) + (rng.next() > 0.93 ? rng.int(2, 6) : 0), 58, 97);
  const reputation = rng.int(8, 24);
  const value = (bias = 0, spread = 14) => clamp(Math.round(currentAbility + bias + (rng.next() - 0.5) * spread), 15, 88);
  const rating = {
    driver_id: driverId,
    year: Number(season),
    current_ability: currentAbility,
    potential_ability: potentialAbility,
    reputation,
    source: "simulation_generated",
    provenance: "save_world_generated_talent",
  };
  for (const field of DRIVER_ATTRIBUTES) rating[field] = value();
  rating.wet_skill = value(0, 22);
  rating.consistency = value(2, 18);
  rating.technical_feedback = value(-1, 18);
  rating.adaptability = value(1, 20);
  rating.pressure_handling = value(0, 20);
  rating.aggression = clamp(value(4, 26), 20, 88);
  rating.crash_likelihood = clamp(Math.round(58 - rating.consistency * 0.42 + rating.aggression * 0.22 + (rng.next() - 0.5) * 14), 6, 70);
  return rating;
}

function feederTier(age, currentAbility) {
  if (age !== null && age <= 15 && currentAbility < 46) return "national_junior";
  if (currentAbility < 54) return "formula_three";
  if (currentAbility < 67) return "formula_two";
  return "international_formula";
}

function generatedProfile(saveWorld, season, rng) {
  const { id, serial } = nextGeneratedId(saveWorld, season);
  const age = rng.int(15, 16);
  const birthDate = birthDateFor(rng, season, age);
  const birthYear = Number(birthDate.slice(0, 4));
  const worldVisibleFrom = Number(season) + 1;
  const talentVisibleFrom = Number(season) + 2;
  const f1EligibleFrom = Math.max(talentVisibleFrom, birthYear + 18);
  const name = generatedName(saveWorld, rng, serial);
  const nationality = rng.pick(nationalityPool(saveWorld)) ?? null;
  const rating = generatedRating(rng, id, season);
  const profile = {
    driver_id: id,
    display_name: name,
    driver_name: name,
    birth_date: birthDate,
    nationality,
    generated: true,
    source: "simulation_generated",
    provenance: "save_world_generated_talent",
    generation_season: Number(season),
    world_visible_from: worldVisibleFrom,
    talent_visible_from: talentVisibleFrom,
    f1_eligible_from: f1EligibleFrom,
  };
  const entity = {
    entity_type: "driver",
    entity_id: id,
    name,
    generated: true,
    source: "simulation_generated",
    provenance: "save_world_generated_talent",
    generation_season: Number(season),
    world_visible_from: worldVisibleFrom,
    talent_visible_from: talentVisibleFrom,
    f1_eligible_from: f1EligibleFrom,
    eligible_when_reached: true,
    state_at_start: "simulation_generated_junior",
    simulation_rule: "talent_pipeline_generated_driver",
  };
  return { profile, entity, rating, age };
}

export function generateTalentCohort(saveWorld, season, options = {}) {
  const year = Number(season);
  if (!Number.isInteger(year)) throw new TypeError("Talent cohort season must be an integer year.");
  const state = ensureTalentPipelineState(saveWorld);
  if (state.generatedSeasons.includes(year)) {
    return state.cohorts.find((row) => Number(row.season) === year) ?? null;
  }

  saveWorld.world.futureDrivers ??= [];
  saveWorld.world.futureEntities ??= [];
  saveWorld.world.driverRatings ??= [];
  const rng = createRng(`${saveWorld.meta?.seed ?? "career"}|talent-cohort|${year}`);
  const count = cohortSize(saveWorld, options);
  const ids = [];

  for (let index = 0; index < count; index += 1) {
    const generated = generatedProfile(saveWorld, year, rng);
    saveWorld.world.futureDrivers.push(generated.profile);
    saveWorld.world.futureEntities.push(generated.entity);
    saveWorld.world.driverRatings.push(generated.rating);
    const career = registerCareerProfile(saveWorld, "driver", generated.profile, {
      status: "junior",
      date: saveWorld.clock?.date ?? `${year}-01-01`,
    });
    career.generated = true;
    career.pipelineStatus = "junior";
    career.feederTier = feederTier(generated.age, generated.rating.current_ability);
    ids.push(generated.profile.driver_id);
  }

  const cohort = {
    season: year,
    createdAt: saveWorld.clock?.date ?? null,
    count: ids.length,
    driverIds: ids,
    source: "simulation_generated",
  };
  state.generatedSeasons.push(year);
  state.generatedSeasons.sort((a, b) => a - b);
  state.generatedDriverIds.push(...ids);
  state.generatedDriverIds = [...new Set(state.generatedDriverIds)].sort();
  state.cohorts.push(cohort);
  state.cohorts.sort((a, b) => Number(a.season) - Number(b.season));
  return structuredClone(cohort);
}

function ratingFor(saveWorld, driverId) {
  return (saveWorld.world?.driverRatings ?? []).find((row) => String(row?.driver_id) === String(driverId)) ?? {};
}

function generatedProfileFor(saveWorld, driverId) {
  return (saveWorld.world?.futureDrivers ?? []).find((row) => String(row?.driver_id) === String(driverId))
    ?? (saveWorld.world?.drivers ?? []).find((row) => String(row?.driver_id) === String(driverId))
    ?? null;
}

function feederPerformance(saveWorld, driverId, season, date) {
  const profile = generatedProfileFor(saveWorld, driverId);
  const state = saveWorld.world?.careerState?.drivers?.[driverId];
  if (!profile || !state || state.status === "retired") return null;
  if (saveWorld.world?.employment?.drivers?.[driverId]?.status === "employed") return null;

  const age = ageOnDate(profile, date);
  if (age !== null && age > 23) return null;
  state.age = age;
  const rating = ratingFor(saveWorld, driverId);
  const currentAbility = numeric(state.currentAbility ?? rating.current_ability, 40);
  const consistency = numeric(state.attributes?.consistency ?? rating.consistency, currentAbility);
  const racecraft = numeric(state.attributes?.racecraft ?? rating.racecraft, currentAbility);
  const pressure = numeric(state.attributes?.pressure_handling ?? rating.pressure_handling, currentAbility);
  const tier = feederTier(age, currentAbility);
  const rng = createRng(`${saveWorld.meta?.seed ?? "career"}|feeder|${season}|${driverId}`);
  const performanceIndex = round(clamp(
    currentAbility * 0.62
      + consistency * 0.14
      + racecraft * 0.14
      + pressure * 0.10
      + (rng.next() - 0.5) * 16,
    1,
    100,
  ));
  const events = rng.int(8, 12);
  const wins = clamp(Math.round(Math.max(0, performanceIndex - 51) / 13 + rng.next() * 1.4), 0, events);
  const podiums = clamp(wins + Math.round(Math.max(0, performanceIndex - 43) / 11 + rng.next() * 1.8), wins, events);

  state.pipelineStatus = "junior";
  state.feederTier = tier;
  state.feederLastSeason = Number(season);
  state.form = round(clamp(numeric(state.form, 0) + (performanceIndex - 50) * 0.28, -25, 25));
  state.morale = round(clamp(numeric(state.morale, 50) + (performanceIndex - 50) * 0.10, 20, 90));
  state.lastUpdated = date;

  return {
    season: Number(season),
    date,
    driverId,
    tier,
    age,
    performanceIndex,
    events,
    wins,
    podiums,
    currentAbilityBeforeDevelopment: round(currentAbility),
    source: "simulation",
  };
}

export function advanceGeneratedTalent(saveWorld, season, date = saveWorld.clock?.date) {
  const state = ensureTalentPipelineState(saveWorld);
  const year = Number(season);
  const existing = new Set(state.feederHistory.filter((row) => Number(row.season) === year).map((row) => String(row.driverId)));
  const records = [];
  for (const driverId of state.generatedDriverIds) {
    if (existing.has(String(driverId))) continue;
    const record = feederPerformance(saveWorld, driverId, year, date);
    if (record) records.push(record);
  }

  const byTier = new Map();
  for (const record of records) {
    const rows = byTier.get(record.tier) ?? [];
    rows.push(record);
    byTier.set(record.tier, rows);
  }
  for (const rows of byTier.values()) {
    rows.sort((a, b) => b.performanceIndex - a.performanceIndex || a.driverId.localeCompare(b.driverId));
    rows.forEach((row, index) => {
      row.tierRank = index + 1;
      row.fieldSize = rows.length;
    });
  }

  state.feederHistory.push(...records);
  state.feederHistory.sort((a, b) => Number(a.season) - Number(b.season) || String(a.driverId).localeCompare(String(b.driverId)));
  return structuredClone(records);
}

export function talentPipelineSummary(saveWorld, options = {}) {
  const state = ensureTalentPipelineState(saveWorld);
  const season = Number(options.season ?? saveWorld.clock?.season ?? saveWorld.world?.season);
  const visibility = { hidden: 0, world_visible: 0, talent_visible: 0, f1_eligible: 0 };
  const tiers = {};
  for (const driverId of state.generatedDriverIds) {
    const profile = generatedProfileFor(saveWorld, driverId);
    if (!profile) continue;
    const status = entityVisibilityState(profile, season, { type: "driver" });
    visibility[status] = Number(visibility[status] ?? 0) + 1;
    const tier = saveWorld.world?.careerState?.drivers?.[driverId]?.feederTier;
    if (tier) tiers[tier] = Number(tiers[tier] ?? 0) + 1;
  }
  return {
    generatedDrivers: state.generatedDriverIds.length,
    cohorts: state.cohorts.length,
    latestCohortSeason: state.cohorts.at(-1)?.season ?? null,
    feederRecords: state.feederHistory.length,
    visibility,
    tiers,
  };
}

export function createTalentPipelineSystem(options = {}) {
  return {
    id: "career.talent-pipeline",
    eventTypes: [SIM_EVENT.CAREER_STARTED, SIM_EVENT.SEASON_STARTED],
    handle({ saveWorld, event }) {
      const season = Number(event.payload?.season ?? saveWorld.clock?.season);
      ensureTalentPipelineState(saveWorld);

      if (event.type === SIM_EVENT.CAREER_STARTED) {
        const cohort = generateTalentCohort(saveWorld, season, options);
        return [
          {
            type: TALENT_EVENT.PIPELINE_INITIALIZED,
            payload: { season, generatedDrivers: cohort?.count ?? 0 },
          },
          ...(cohort?.count ? [{ type: TALENT_EVENT.COHORT_GENERATED, payload: { season, count: cohort.count, driver_ids: cohort.driverIds } }] : []),
        ];
      }

      const feeder = advanceGeneratedTalent(saveWorld, season, event.date);
      const cohort = generateTalentCohort(saveWorld, season, options);
      const output = [];
      if (feeder.length) {
        output.push({
          type: TALENT_EVENT.FEEDER_SEASON_COMPLETED,
          payload: { season, drivers: feeder.length },
        });
      }
      if (cohort?.count) {
        output.push({
          type: TALENT_EVENT.COHORT_GENERATED,
          payload: { season, count: cohort.count, driver_ids: cohort.driverIds },
        });
      }
      return output;
    },
  };
}
