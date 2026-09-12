import { deepFreeze } from "../domain/immutable.js";
import { loadHistoricalSeason } from "../domain/historicalWorld.js";
import {
  mergeDatabaseOwnedSeasonFields,
  normalizeSeasonDatabaseSnapshot,
} from "./databaseManagementMaterializer.js";
import { mergeDatabaseTechnicalFields } from "./databaseTechnicalMaterializer.js";

export const SEASON_DATABASE_FORMAT = "f1-manager-sim-season-database";
export const SEASON_DATABASE_SCHEMA_VERSION = 1;

function mergeById(primary = [], secondary = [], idFields = []) {
  const keyFor = (row) => {
    for (const field of idFields) if (row?.[field]) return `${field}:${row[field]}`;
    return null;
  };
  const merged = new Map();
  for (const row of secondary) {
    const key = keyFor(row);
    if (key) merged.set(key, structuredClone(row));
  }
  for (const row of primary) {
    const key = keyFor(row);
    if (key) merged.set(key, { ...(merged.get(key) ?? {}), ...structuredClone(row) });
  }
  return [...merged.values()];
}

export function mergeSeasonBoundaryReferences(activeSnapshot, globalSnapshot) {
  if (!activeSnapshot?.season || !globalSnapshot?.season) throw new TypeError("Both active and Global snapshots are required.");
  if (Number(activeSnapshot.season) !== Number(globalSnapshot.season)) {
    throw new Error(`Cannot merge season ${activeSnapshot.season} with Global season ${globalSnapshot.season}.`);
  }

  const managementOwned = mergeDatabaseOwnedSeasonFields(activeSnapshot, globalSnapshot);
  const databaseOwned = mergeDatabaseTechnicalFields(managementOwned, globalSnapshot);

  return deepFreeze({
    ...databaseOwned,
    databasePolicy: structuredClone(globalSnapshot.databasePolicy ?? activeSnapshot.databasePolicy ?? null),
    historicalArchive: structuredClone(globalSnapshot.historicalArchive ?? activeSnapshot.historicalArchive ?? null),
    futureStructure: structuredClone(globalSnapshot.futureStructure ?? activeSnapshot.futureStructure ?? null),
    futureEntities: mergeById(activeSnapshot.futureEntities, globalSnapshot.futureEntities, ["entity_id", "id"]),
    futureDrivers: mergeById(activeSnapshot.futureDrivers, globalSnapshot.futureDrivers, ["driver_id"]),
    futureStaff: mergeById(activeSnapshot.futureStaff, globalSnapshot.futureStaff, ["staff_id"]),
    futureTeams: mergeById(activeSnapshot.futureTeams, globalSnapshot.futureTeams, ["team_id"]),
    futureSponsors: mergeById(activeSnapshot.futureSponsors, globalSnapshot.futureSponsors, ["sponsor_id"]),
    visibilityPolicy: structuredClone(globalSnapshot.visibilityPolicy ?? activeSnapshot.visibilityPolicy ?? null),
    boundarySources: {
      activeSeasonState: activeSnapshot.databaseVersion ?? activeSnapshot.sourcePackage?.databaseVersion ?? "season_snapshot",
      historicalAndFutureReference: globalSnapshot.databaseVersion ?? "global_database",
      databaseOwnedManagementContext: globalSnapshot.databaseVersion ?? "global_database",
      databaseOwnedTechnicalContext: globalSnapshot.databaseVersion ?? "global_database",
      policy: "season_state_plus_global_history_boundary",
    },
  });
}

export function createSeasonDatabasePayload(globalDatabase, season, options = {}) {
  const globalSnapshot = loadHistoricalSeason(globalDatabase, season, {
    allowWarnings: options.allowWarnings ?? true,
  });
  const snapshot = options.activeSnapshot
    ? mergeSeasonBoundaryReferences(options.activeSnapshot, globalSnapshot)
    : globalSnapshot;

  return deepFreeze({
    format: SEASON_DATABASE_FORMAT,
    schemaVersion: SEASON_DATABASE_SCHEMA_VERSION,
    season: snapshot.season,
    databaseVersion: snapshot.databaseVersion ?? globalSnapshot.databaseVersion ?? null,
    sourceChecksum: snapshot.sourceChecksum ?? globalSnapshot.sourceChecksum ?? null,
    createdAt: options.createdAt ?? null,
    policy: snapshot.databasePolicy ?? null,
    snapshot,
  });
}

export function validateSeasonDatabasePayload(payload) {
  const issues = [];
  if (payload?.format !== SEASON_DATABASE_FORMAT) issues.push(`format must be '${SEASON_DATABASE_FORMAT}'.`);
  if (Number(payload?.schemaVersion) !== SEASON_DATABASE_SCHEMA_VERSION) {
    issues.push(`schemaVersion must be ${SEASON_DATABASE_SCHEMA_VERSION}.`);
  }
  if (!Number.isInteger(Number(payload?.season))) issues.push("season must be an integer.");
  if (!payload?.snapshot || Number(payload.snapshot.season) !== Number(payload?.season)) {
    issues.push("snapshot season must match payload season.");
  }
  if (payload?.snapshot?.historicalArchive?.throughSeason !== Number(payload?.season) - 1) {
    issues.push("historicalArchive must end immediately before the selected season.");
  }
  if (payload?.snapshot?.futureStructure && Object.hasOwn(payload.snapshot.futureStructure, "raceResults")) {
    issues.push("futureStructure must never contain historical future race results.");
  }
  if (issues.length) {
    const error = new Error(`Season Database validation failed: ${issues.join(" ")}`);
    error.issues = issues;
    throw error;
  }
  return { ok: true, season: Number(payload.season) };
}

export function loadSeasonDatabasePayload(payload) {
  validateSeasonDatabasePayload(payload);
  return deepFreeze(normalizeSeasonDatabaseSnapshot(payload.snapshot));
}
