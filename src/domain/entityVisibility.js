function integerYear(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  const text = String(value).trim();
  if (/^\d{4}$/.test(text)) return Number(text);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return Number(text.slice(0, 4));
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function firstYear(entity, fields) {
  for (const field of fields) {
    const year = integerYear(entity?.[field]);
    if (year !== null) return year;
  }
  return null;
}

export function normalizeEntityVisibility(entity = {}, options = {}) {
  const type = String(options.type ?? entity.entity_type ?? entity.type ?? "").trim().toLowerCase();
  const birthDate = entity.birth_date ?? entity.date_of_birth ?? entity.dob ?? null;
  const birthYear = firstYear(entity, ["birth_date", "date_of_birth", "dob", "birth_year", "year_of_birth"]);

  const explicitWorldVisible = firstYear(entity, [
    "world_visible_from",
    "known_from",
    "world_visibility_year",
    "world_activation_year",
    "world_activation_date",
  ]);
  const explicitTalentVisible = firstYear(entity, [
    "talent_visible_from",
    "scouting_visible_from",
    "talent_activation_year",
    "talent_pool_entry_year",
  ]);
  const legacyActivation = firstYear(entity, [
    "activation_year",
    "world_or_talent_activation_year",
    "event_year",
  ]);
  const debutReference = firstYear(entity, [
    "f1_debut_reference",
    "f1_debut_reference_year",
    "next_reference_f1_entry_year",
    "reference_entry_year",
    "historical_entry_year",
    "f1_rookie_season",
  ]);
  const careerEndReference = firstYear(entity, [
    "career_end_reference",
    "historical_last_f1_year",
    "historical_exit_reference",
    "career_end_year",
    "retirement_year",
    "last_f1_season",
  ]);
  const explicitF1Eligible = firstYear(entity, [
    "f1_eligible_from",
    "f1_eligibility_year",
    "eligible_from",
  ]);

  let worldVisibleFrom = explicitWorldVisible ?? explicitTalentVisible ?? legacyActivation;
  let talentVisibleFrom = explicitTalentVisible ?? worldVisibleFrom;
  let f1EligibleFrom = explicitF1Eligible;
  let visibilitySource = "explicit";

  if (worldVisibleFrom === null && type === "driver" && birthYear !== null) {
    worldVisibleFrom = birthYear;
    visibilitySource = "birth_fallback";
  }

  if (talentVisibleFrom === null) talentVisibleFrom = worldVisibleFrom;

  if (f1EligibleFrom === null) {
    if (legacyActivation !== null) {
      // v0.7/v0.8 compatibility: their combined activation field historically
      // powered both lifecycle and market entry. Newer data should set the
      // dedicated fields instead.
      f1EligibleFrom = legacyActivation;
      visibilitySource = explicitWorldVisible !== null || explicitTalentVisible !== null
        ? "explicit_visibility_legacy_eligibility"
        : "legacy_combined_activation";
    } else if (explicitWorldVisible !== null && type !== "driver") {
      // Non-driver legacy entities often only have a single availability date.
      f1EligibleFrom = explicitWorldVisible;
      visibilitySource = "world_visibility_eligibility_fallback";
    } else if (debutReference !== null) {
      // Last-resort compatibility only. Historical F1 debut is not the semantic
      // visibility boundary; it prevents early market leakage when an old driver
      // row has no dedicated eligibility metadata at all.
      f1EligibleFrom = debutReference;
      if (worldVisibleFrom === null) worldVisibleFrom = debutReference;
      if (talentVisibleFrom === null) talentVisibleFrom = debutReference;
      visibilitySource = "legacy_f1_debut_fallback";
    }
  }

  return {
    type,
    birthDate,
    birthYear,
    worldVisibleFrom,
    talentVisibleFrom,
    f1EligibleFrom,
    f1DebutReference: debutReference,
    careerEndReference,
    visibilitySource,
  };
}

export function entityVisibilityState(entity, season, options = {}) {
  const year = integerYear(season);
  if (year === null) return "hidden";
  const visibility = normalizeEntityVisibility(entity, options);
  if (visibility.worldVisibleFrom !== null && year < visibility.worldVisibleFrom) return "hidden";
  if (visibility.worldVisibleFrom === null) return "hidden";
  if (visibility.talentVisibleFrom !== null && year >= visibility.talentVisibleFrom) {
    if (visibility.f1EligibleFrom !== null && year >= visibility.f1EligibleFrom) return "f1_eligible";
    return "talent_visible";
  }
  return "world_visible";
}

export function isEntityVisibleInSeason(entity, season, options = {}) {
  return entityVisibilityState(entity, season, options) !== "hidden";
}

export function isEntityTalentVisibleInSeason(entity, season, options = {}) {
  const state = entityVisibilityState(entity, season, options);
  return state === "talent_visible" || state === "f1_eligible";
}

export function isEntityF1EligibleInSeason(entity, season, options = {}) {
  return entityVisibilityState(entity, season, options) === "f1_eligible";
}

const HIDDEN_REFERENCE_FIELDS = new Set([
  "activation_year",
  "world_or_talent_activation_year",
  "world_activation_year",
  "world_activation_date",
  "talent_activation_year",
  "talent_pool_entry_year",
  "event_year",
  "world_visible_from",
  "known_from",
  "talent_visible_from",
  "scouting_visible_from",
  "f1_eligible_from",
  "f1_eligibility_year",
  "eligible_from",
  "f1_debut_reference",
  "f1_debut_reference_year",
  "next_reference_f1_entry_year",
  "reference_entry_year",
  "historical_entry_year",
  "f1_rookie_season",
  "career_end_reference",
  "historical_last_f1_year",
  "historical_exit_reference",
  "career_end_year",
  "retirement_year",
  "last_f1_season",
  "death_date",
  "simulation_rule",
]);

function safeProjection(entity, state) {
  const projected = Object.fromEntries(
    Object.entries(entity ?? {}).filter(([key]) => !HIDDEN_REFERENCE_FIELDS.has(String(key).toLowerCase())),
  );
  projected.visibility_state = state;
  return projected;
}

function idFor(type, row) {
  if (type === "driver") return row?.driver_id ?? row?.entity_id ?? row?.id ?? null;
  if (type === "team") return row?.team_id ?? row?.entity_id ?? row?.id ?? null;
  if (type === "staff") return row?.staff_id ?? row?.entity_id ?? row?.id ?? null;
  if (type === "sponsor") return row?.sponsor_id ?? row?.entity_id ?? row?.id ?? row?.sponsor_name ?? row?.name ?? null;
  return row?.entity_id ?? row?.id ?? null;
}

function mergeCollections(type, ...collections) {
  const merged = new Map();
  for (const collection of collections) {
    for (const row of collection ?? []) {
      const id = idFor(type, row);
      if (!id) continue;
      merged.set(String(id), { ...(merged.get(String(id)) ?? {}), ...row });
    }
  }
  return [...merged.values()];
}

function futureQueueByType(saveWorld, type) {
  const aliases = type === "team" ? new Set(["team", "constructor", "organisation", "organization"]) : new Set([type]);
  return (saveWorld.world?.futureEntities ?? []).filter((row) => aliases.has(String(row.entity_type ?? row.type ?? "").toLowerCase()));
}

function queueMetadata(type, profile, queue) {
  const id = idFor(type, profile);
  if (!id) return profile;
  const match = queue.find((row) => String(row.entity_id ?? row.id ?? "") === String(id));
  return match ? { ...profile, ...match } : profile;
}

function visibleProfiles(saveWorld, type, live, future, options = {}) {
  const season = Number(options.season ?? saveWorld.clock?.season ?? saveWorld.world?.season);
  const queue = futureQueueByType(saveWorld, type);
  const liveIds = new Set((live ?? []).map((row) => String(idFor(type, row) ?? "")).filter(Boolean));
  return mergeCollections(type, live, future)
    .map((row) => queueMetadata(type, row, queue))
    .map((row) => {
      const id = String(idFor(type, row) ?? "");
      const calculated = entityVisibilityState(row, season, { type });
      // Anything already promoted into the authoritative live world is visible
      // regardless of missing legacy metadata. Future pools never receive this
      // override and remain subject to their visibility dates.
      const state = liveIds.has(id) && calculated === "hidden" ? "f1_eligible" : calculated;
      return { row, state };
    })
    .filter(({ state }) => state !== "hidden")
    .filter(({ state }) => options.requireF1Eligible !== true || state === "f1_eligible")
    .filter(({ state }) => options.requireTalentVisible !== true || ["talent_visible", "f1_eligible"].includes(state))
    .map(({ row, state }) => safeProjection(row, state));
}

export function listVisibleDrivers(saveWorld, options = {}) {
  return visibleProfiles(saveWorld, "driver", saveWorld.world?.drivers, saveWorld.world?.futureDrivers, options);
}

export function listVisibleTeams(saveWorld, options = {}) {
  return visibleProfiles(saveWorld, "team", saveWorld.world?.teams, saveWorld.world?.futureTeams, options);
}

export function listVisibleStaff(saveWorld, options = {}) {
  return visibleProfiles(saveWorld, "staff", saveWorld.world?.staff, saveWorld.world?.futureStaff, options);
}

export function listVisibleSponsors(saveWorld, options = {}) {
  const live = saveWorld.world?.sponsors ?? saveWorld.world?.sponsorCatalog ?? saveWorld.world?.seasonPack?.sponsors ?? [];
  return visibleProfiles(saveWorld, "sponsor", live, saveWorld.world?.futureSponsors, options);
}
