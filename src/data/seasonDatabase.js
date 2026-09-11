import { deepFreeze } from "../domain/immutable.js";
import { loadHistoricalSeason } from "../domain/historicalWorld.js";

export const SEASON_DATABASE_FORMAT = "f1-manager-sim-season-database";
export const SEASON_DATABASE_SCHEMA_VERSION = 1;

export function createSeasonDatabasePayload(globalDatabase, season, options = {}) {
  const snapshot = loadHistoricalSeason(globalDatabase, season, {
    allowWarnings: options.allowWarnings ?? true,
  });

  return deepFreeze({
    format: SEASON_DATABASE_FORMAT,
    schemaVersion: SEASON_DATABASE_SCHEMA_VERSION,
    season: snapshot.season,
    databaseVersion: snapshot.databaseVersion ?? null,
    sourceChecksum: snapshot.sourceChecksum ?? null,
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
  return deepFreeze(structuredClone(payload.snapshot));
}
