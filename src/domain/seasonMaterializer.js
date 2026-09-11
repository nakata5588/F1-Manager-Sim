import { normalizeEntityVisibility } from "./entityVisibility.js";
import { deepFreeze } from "./immutable.js";
import { createSeasonSnapshot as createLegacySeasonSnapshot } from "./seasonSnapshot.js";

function year(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return Number(text.slice(0, 4));
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function rowYear(row) {
  for (const field of ["year", "season", "event_year", "activation_year", "start_year", "contract_start"]) {
    const value = year(row?.[field]);
    if (value !== null) return value;
  }
  for (const field of ["date", "activation_date", "race_date", "start_date"]) {
    const value = year(row?.[field]);
    if (value !== null) return value;
  }
  return null;
}

function typeOf(row) {
  return String(row?.entity_type ?? row?.type ?? "").trim().toLowerCase();
}

function entityId(type, row) {
  if (type === "driver") return row?.driver_id ?? row?.entity_id ?? row?.id ?? null;
  if (type === "team") return row?.team_id ?? row?.entity_id ?? row?.id ?? null;
  if (type === "staff") return row?.staff_id ?? row?.entity_id ?? row?.id ?? null;
  if (type === "sponsor") return row?.sponsor_id ?? row?.entity_id ?? row?.id ?? null;
  return row?.entity_id ?? row?.id ?? null;
}

function canonicalType(type) {
  return ["constructor", "organisation", "organization"].includes(type) ? "team" : type;
}

function firstYear(rows, idField, id) {
  let first = null;
  for (const row of rows ?? []) {
    if (row?.[idField] !== id) continue;
    const value = rowYear(row);
    if (value !== null && (first === null || value < first)) first = value;
  }
  return first;
}

function queueMetadata(type, row, profile = {}) {
  const canonical = canonicalType(type);
  const combined = { ...profile, ...row, entity_type: canonical };
  const visibility = normalizeEntityVisibility(combined, { type: canonical });
  const id = entityId(canonical, combined);
  return {
    ...row,
    entity_type: canonical,
    entity_id: row.entity_id ?? id,
    birth_date: combined.birth_date ?? combined.date_of_birth ?? combined.dob ?? null,
    world_visible_from: visibility.worldVisibleFrom,
    talent_visible_from: visibility.talentVisibleFrom,
    f1_eligible_from: visibility.f1EligibleFrom,
    f1_debut_reference: visibility.f1DebutReference,
    career_end_reference: visibility.careerEndReference,
    visibility_source: visibility.visibilitySource,
  };
}

function profileVisibilityMetadata(type, profile, queueRow = null) {
  const combined = queueRow ? { ...profile, ...queueRow } : profile;
  const visibility = normalizeEntityVisibility(combined, { type });
  return {
    ...profile,
    birth_date: profile.birth_date ?? profile.date_of_birth ?? profile.dob ?? null,
    world_visible_from: visibility.worldVisibleFrom,
    talent_visible_from: visibility.talentVisibleFrom,
    f1_eligible_from: visibility.f1EligibleFrom,
    f1_debut_reference: visibility.f1DebutReference,
    career_end_reference: visibility.careerEndReference,
    visibility_source: visibility.visibilitySource,
  };
}

function queueKey(row) {
  const type = canonicalType(typeOf(row));
  const id = entityId(type, row);
  return type && id ? `${type}:${id}` : null;
}

function mergeQueue(...collections) {
  const merged = new Map();
  for (const collection of collections) {
    for (const raw of collection ?? []) {
      const type = canonicalType(typeOf(raw));
      const key = queueKey(raw);
      if (!key) continue;
      merged.set(key, { ...(merged.get(key) ?? {}), ...raw, entity_type: type });
    }
  }
  return [...merged.values()];
}

function relevantToFuture(row, season) {
  const type = canonicalType(typeOf(row));
  const visibility = normalizeEntityVisibility(row, { type });
  return [visibility.worldVisibleFrom, visibility.talentVisibleFrom, visibility.f1EligibleFrom, visibility.f1DebutReference]
    .some((value) => value !== null && value >= season);
}

function inferredQueue(database, season) {
  const rows = [];
  for (const driver of database.drivers ?? []) {
    const visibility = normalizeEntityVisibility(driver, { type: "driver" });
    if (!driver.driver_id) continue;
    if (![visibility.worldVisibleFrom, visibility.talentVisibleFrom, visibility.f1EligibleFrom, visibility.f1DebutReference]
      .some((value) => value !== null && value >= season)) continue;
    rows.push(queueMetadata("driver", {
      entity_type: "driver",
      entity_id: driver.driver_id,
      name: driver.display_name ?? driver.driver_name ?? null,
      eligible_when_reached: true,
      source: "inferred_from_global_driver_profile",
    }, driver));
  }

  for (const team of database.teams ?? []) {
    if (!team.team_id) continue;
    const first = firstYear(database.teamBrands, "team_id", team.team_id);
    if (first === null || first < season) continue;
    rows.push(queueMetadata("team", {
      entity_type: "team",
      entity_id: team.team_id,
      name: team.team_name ?? null,
      world_visible_from: team.world_visible_from ?? team.known_from ?? first,
      f1_eligible_from: team.f1_eligible_from ?? first,
      eligible_when_reached: true,
      source: "inferred_from_global_team_timeline",
    }, team));
  }

  for (const staff of database.staff ?? []) {
    if (!staff.staff_id) continue;
    const first = firstYear([...(database.staffContracts ?? []), ...(database.staffRatings ?? [])], "staff_id", staff.staff_id);
    const source = { ...staff };
    if (first !== null) {
      source.world_visible_from ??= first;
      source.talent_visible_from ??= first;
      source.f1_eligible_from ??= first;
    }
    const visibility = normalizeEntityVisibility(source, { type: "staff" });
    if (![visibility.worldVisibleFrom, visibility.f1EligibleFrom].some((value) => value !== null && value >= season)) continue;
    rows.push(queueMetadata("staff", {
      entity_type: "staff",
      entity_id: staff.staff_id,
      name: staff.staff_name ?? null,
      world_visible_from: visibility.worldVisibleFrom,
      talent_visible_from: visibility.talentVisibleFrom,
      f1_eligible_from: visibility.f1EligibleFrom,
      eligible_when_reached: true,
      source: "inferred_from_global_staff_timeline",
    }, staff));
  }

  for (const sponsor of database.sponsorCatalog ?? database.sponsors ?? []) {
    if (!sponsor.sponsor_id) continue;
    const first = year(sponsor.world_visible_from ?? sponsor.known_from ?? sponsor.start_year)
      ?? firstYear(database.sponsorContracts, "sponsor_id", sponsor.sponsor_id);
    if (first === null || first < season) continue;
    rows.push(queueMetadata("sponsor", {
      entity_type: "sponsor",
      entity_id: sponsor.sponsor_id,
      name: sponsor.sponsor_name ?? sponsor.sposor_name ?? null,
      world_visible_from: first,
      eligible_when_reached: true,
      source: "inferred_from_global_sponsor_timeline",
    }, sponsor));
  }
  return rows;
}

function historicalDriverProfiles(database, season) {
  const pastIds = new Set();
  for (const collection of [database.contracts, database.driverRatings, database.driverCareer]) {
    for (const row of collection ?? []) {
      const value = rowYear(row);
      if (row.driver_id && value !== null && value < season) pastIds.add(row.driver_id);
    }
  }
  return (database.drivers ?? [])
    .filter((driver) => {
      const visibility = normalizeEntityVisibility(driver, { type: "driver" });
      return pastIds.has(driver.driver_id)
        || (visibility.f1DebutReference !== null && visibility.f1DebutReference < season)
        || (visibility.careerEndReference !== null && visibility.careerEndReference < season);
    })
    .map((driver) => {
      const visibility = normalizeEntityVisibility(driver, { type: "driver" });
      const copy = { ...driver };
      copy.f1_debut_reference = visibility.f1DebutReference;
      if (visibility.careerEndReference !== null && visibility.careerEndReference < season) {
        copy.career_end_reference = visibility.careerEndReference;
      } else {
        delete copy.career_end_reference;
        delete copy.career_end_year;
        delete copy.retirement_year;
        delete copy.last_f1_season;
      }
      if (year(copy.death_date) !== null && year(copy.death_date) >= season) delete copy.death_date;
      return copy;
    });
}

function driverEligibleAtStart(driver, season) {
  const visibility = normalizeEntityVisibility(driver, { type: "driver" });
  if (visibility.f1EligibleFrom === null || visibility.f1EligibleFrom > season) return false;
  if (visibility.careerEndReference !== null && visibility.careerEndReference < season) return false;
  return true;
}

function mergeProfiles(type, primary = [], secondary = []) {
  const merged = new Map();
  for (const row of secondary) {
    const id = entityId(type, row);
    if (id) merged.set(String(id), { ...row });
  }
  for (const row of primary) {
    const id = entityId(type, row);
    if (id) merged.set(String(id), { ...(merged.get(String(id)) ?? {}), ...row });
  }
  return [...merged.values()];
}

function sponsorProfiles(database, season) {
  const current = [];
  const future = [];
  for (const sponsor of database.sponsorCatalog ?? database.sponsors ?? []) {
    const first = year(sponsor.world_visible_from ?? sponsor.known_from ?? sponsor.start_year)
      ?? firstYear(database.sponsorContracts, "sponsor_id", sponsor.sponsor_id);
    const last = year(sponsor.end_year ?? sponsor.visible_until);
    const profile = profileVisibilityMetadata("sponsor", {
      ...sponsor,
      world_visible_from: sponsor.world_visible_from ?? sponsor.known_from ?? first,
    });
    if (first !== null && first > season) future.push(profile);
    else if ((first === null || first <= season) && (last === null || last >= season)) current.push(profile);
  }
  return { current, future };
}

export function createSeasonSnapshot(database, seasonInput) {
  const season = Number(seasonInput);
  if (!Number.isInteger(season)) throw new TypeError("Season year must be an integer.");
  const base = structuredClone(createLegacySeasonSnapshot(database, season));

  const contractedIds = new Set((base.contracts ?? []).map((row) => row.driver_id).filter(Boolean));
  const ratedIds = new Set((base.driverRatings ?? []).map((row) => row.driver_id).filter(Boolean));
  const globalByDriver = new Map((database.drivers ?? []).filter((row) => row.driver_id).map((row) => [row.driver_id, row]));

  base.drivers = (base.drivers ?? [])
    .filter((driver) => contractedIds.has(driver.driver_id) || ratedIds.has(driver.driver_id) || driverEligibleAtStart(globalByDriver.get(driver.driver_id) ?? driver, season))
    .map((driver) => profileVisibilityMetadata("driver", driver));

  const activeDriverIds = new Set(base.drivers.map((row) => row.driver_id));
  const activeStaffIds = new Set((base.staff ?? []).map((row) => row.staff_id));
  const activeTeamIds = new Set((base.teams ?? []).map((row) => row.team_id));

  const explicitQueue = (database.futureEntities ?? database.availabilityTimeline ?? [])
    .filter((row) => entityId(canonicalType(typeOf(row)), row) && relevantToFuture(row, season));
  const queue = mergeQueue(base.futureEntities, inferredQueue(database, season), explicitQueue)
    .map((row) => {
      const type = canonicalType(typeOf(row));
      const id = entityId(type, row);
      const sourceCollection = type === "driver" ? database.drivers
        : type === "team" ? database.teams
          : type === "staff" ? database.staff
            : type === "sponsor" ? (database.sponsorCatalog ?? database.sponsors)
              : [];
      const profile = (sourceCollection ?? []).find((candidate) => entityId(type, candidate) === id) ?? {};
      return queueMetadata(type, row, profile);
    });

  const queueByTypeId = new Map(queue.map((row) => [`${canonicalType(typeOf(row))}:${row.entity_id}`, row]));
  const futureDriverIds = new Set(queue.filter((row) => typeOf(row) === "driver").map((row) => row.entity_id));
  const futureStaffIds = new Set(queue.filter((row) => typeOf(row) === "staff").map((row) => row.entity_id));
  const futureTeamIds = new Set(queue.filter((row) => typeOf(row) === "team").map((row) => row.entity_id));

  base.futureEntities = queue;
  base.futureDrivers = mergeProfiles("driver", base.futureDrivers, database.drivers)
    .filter((row) => futureDriverIds.has(row.driver_id) && !activeDriverIds.has(row.driver_id))
    .map((row) => profileVisibilityMetadata("driver", row, queueByTypeId.get(`driver:${row.driver_id}`)));
  base.futureStaff = mergeProfiles("staff", base.futureStaff, database.staff)
    .filter((row) => futureStaffIds.has(row.staff_id) && !activeStaffIds.has(row.staff_id))
    .map((row) => profileVisibilityMetadata("staff", row, queueByTypeId.get(`staff:${row.staff_id}`)));
  base.futureTeams = mergeProfiles("team", base.futureTeams, database.teams)
    .filter((row) => futureTeamIds.has(row.team_id) && !activeTeamIds.has(row.team_id))
    .map((row) => profileVisibilityMetadata("team", row, queueByTypeId.get(`team:${row.team_id}`)));

  const sponsors = sponsorProfiles(database, season);
  if (sponsors.current.length || sponsors.future.length) {
    base.sponsors = sponsors.current;
    base.sponsorCatalog = sponsors.current;
    base.futureSponsors = sponsors.future;
  }

  base.historicalArchive ??= { throughSeason: season - 1, cutoff: `${season}-01-01` };
  base.historicalArchive.drivers = historicalDriverProfiles(database, season);
  base.visibilityPolicy = {
    runtimeExistence: "future pools may contain hidden entities",
    playerVisibility: "selectors_only_after_world_or_talent_visibility",
    f1MarketEligibility: "f1_eligible_from_only",
    f1DebutReference: "historical_reference_not_visibility_boundary",
    careerEndReference: "historical_reference_not_scripted_retirement",
  };

  return deepFreeze(base);
}
