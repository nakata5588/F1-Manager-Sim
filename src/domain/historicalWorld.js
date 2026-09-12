import { materializeDatabaseManagementBlocks } from "../data/databaseManagementMaterializer.js";
import {
  hasTechnicalDatabaseContext,
  materializeDatabaseTechnicalBlocks,
} from "../data/databaseTechnicalMaterializer.js";
import { deepFreeze } from "./immutable.js";
import { createSeasonSnapshot } from "./seasonMaterializer.js";

const ACCEPTED = new Set(["READY", "READY_WITH_WARNINGS"]);

function hasManagementDatabaseContext(database) {
  return Boolean(
    database?.driverMarketProfileByYear
    || database?.contractTerms
    || database?.initialInboxEventsBySeason
    || database?.peopleDataPolicy
    || database?.sourceLockedFactRegister
    || database?.relationshipSourcePack1980,
  );
}

export function getSeasonReadiness(database, year) {
  return database?.manifest?.readiness?.[String(Number(year))] ?? null;
}

export function listSupportedSeasons(database) {
  const explicit = database?.manifest?.supportedSeasons;
  if (Array.isArray(explicit)) return [...explicit].map(Number).filter(Number.isInteger).sort((a, b) => a - b);

  return Object.entries(database?.manifest?.readiness ?? {})
    .filter(([, status]) => ACCEPTED.has(status))
    .map(([year]) => Number(year))
    .filter(Number.isInteger)
    .sort((a, b) => a - b);
}

export function loadHistoricalSeason(database, year, options = {}) {
  const season = Number(year);
  if (!Number.isInteger(season)) throw new TypeError("Season year must be an integer.");

  const readiness = getSeasonReadiness(database, season);
  if (!readiness) {
    throw new Error(`Season ${season} has no readiness result in this historical database.`);
  }
  if (readiness === "BLOCKED") {
    throw new Error(`Season ${season} is blocked by historical database validation.`);
  }
  if (readiness === "READY_WITH_WARNINGS" && options.allowWarnings === false) {
    throw new Error(`Season ${season} is only READY_WITH_WARNINGS and warnings are not allowed.`);
  }
  if (!ACCEPTED.has(readiness)) {
    throw new Error(`Season ${season} has unsupported readiness status ${JSON.stringify(readiness)}.`);
  }

  const snapshot = createSeasonSnapshot(database, season);
  const managementContext = hasManagementDatabaseContext(database);
  const technicalContext = hasTechnicalDatabaseContext(database);
  if (!managementContext && !technicalContext) return snapshot;

  const enriched = {
    ...structuredClone(snapshot),
    ...(managementContext ? materializeDatabaseManagementBlocks(database, season, snapshot) : {}),
    ...(technicalContext ? materializeDatabaseTechnicalBlocks(database, season) : {}),
  };

  // Candidate rebuilds may publish an explicit top-level release identity while
  // preserving the immutable source-workbook identity inside manifest.
  // The Season Definition should identify the candidate release, not silently
  // fall back to an older embedded manifest release label.
  if (database.databaseVersion) enriched.databaseVersion = database.databaseVersion;

  return deepFreeze(enriched);
}
