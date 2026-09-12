import { getSeasonReadiness } from "../domain/historicalWorld.js";
import { createSaveWorld } from "../save/createSaveWorld.js";
import {
  loadSeasonDatabasePayload,
  validateSeasonDatabasePayload,
} from "./seasonDatabase.js";

const ACCEPTED_READINESS = new Set(["READY", "READY_WITH_WARNINGS"]);

function text(value) {
  return value === null || value === undefined ? null : String(value);
}

function sourceIdentity(payload) {
  return {
    format: payload?.format ?? null,
    schemaVersion: Number(payload?.schemaVersion ?? 0),
    season: Number(payload?.season),
    releaseName: payload?.releaseName ?? null,
    databaseVersion: payload?.databaseVersion ?? payload?.snapshot?.databaseVersion ?? null,
    sourceChecksum: payload?.sourceChecksum ?? payload?.snapshot?.sourceChecksum ?? null,
  };
}

export function validateSeasonDatabaseAgainstGlobal(payload, globalDatabase, options = {}) {
  validateSeasonDatabasePayload(payload);
  const issues = [];
  const identity = sourceIdentity(payload);
  const manifest = globalDatabase?.manifest ?? null;

  if (!manifest) {
    issues.push("Global Database manifest is required for source compatibility validation.");
  } else {
    // Rebuild candidates may carry a top-level release identity while the
    // manifest continues to describe the immutable master/source lineage.
    // Prefer the explicit release identity when present, but keep the source
    // checksum anchored to the manifest source hash unless the Global Database
    // publishes an explicit sourceChecksum of its own.
    const globalVersion = text(globalDatabase?.databaseVersion ?? manifest.databaseVersion);
    const globalChecksum = text(globalDatabase?.sourceChecksum ?? manifest.sourceSha256);
    if (globalVersion && identity.databaseVersion && globalVersion !== text(identity.databaseVersion)) {
      issues.push(`Season Database version ${identity.databaseVersion} does not match Global Database ${globalVersion}.`);
    }
    if (globalChecksum && identity.sourceChecksum && globalChecksum !== text(identity.sourceChecksum)) {
      issues.push("Season Database sourceChecksum does not match Global Database source identity.");
    }

    const readiness = getSeasonReadiness(globalDatabase, identity.season);
    if (!ACCEPTED_READINESS.has(readiness)) {
      issues.push(`Global Database season ${identity.season} is not career-ready (${readiness ?? "NO_READINESS"}).`);
    }
    if (readiness === "READY_WITH_WARNINGS" && options.allowWarnings === false) {
      issues.push(`Global Database season ${identity.season} is only READY_WITH_WARNINGS.`);
    }

    if (Array.isArray(manifest.supportedSeasons)
      && !manifest.supportedSeasons.map(Number).includes(identity.season)) {
      issues.push(`Global Database does not declare season ${identity.season} as supported.`);
    }
  }

  const snapshotVersion = text(payload?.snapshot?.databaseVersion);
  const snapshotChecksum = text(payload?.snapshot?.sourceChecksum);
  if (identity.databaseVersion && snapshotVersion && text(identity.databaseVersion) !== snapshotVersion) {
    issues.push("Season Database payload databaseVersion does not match its snapshot databaseVersion.");
  }
  if (identity.sourceChecksum && snapshotChecksum && text(identity.sourceChecksum) !== snapshotChecksum) {
    issues.push("Season Database payload sourceChecksum does not match its snapshot sourceChecksum.");
  }

  if (issues.length) {
    const error = new Error(`Season Database / Global Database compatibility failed: ${issues.join(" ")}`);
    error.issues = issues;
    throw error;
  }

  return {
    ok: true,
    season: identity.season,
    databaseVersion: identity.databaseVersion,
    sourceChecksum: identity.sourceChecksum,
  };
}

export function createCareerFromSeasonDatabase(payload, options = {}) {
  validateSeasonDatabasePayload(payload);
  if (options.globalDatabase) {
    validateSeasonDatabaseAgainstGlobal(payload, options.globalDatabase, {
      allowWarnings: options.allowWarnings ?? true,
    });
  }

  const snapshot = loadSeasonDatabasePayload(payload);
  const saveWorld = createSaveWorld(snapshot, {
    seed: options.seed ?? `${snapshot.season}-career`,
    startDate: options.startDate ?? `${snapshot.season}-01-01`,
    createdAt: options.createdAt,
  });
  const identity = sourceIdentity(payload);

  saveWorld.meta.seasonDatabase = {
    format: identity.format,
    schemaVersion: identity.schemaVersion,
    season: identity.season,
    releaseName: identity.releaseName,
    databaseVersion: identity.databaseVersion,
    sourceChecksum: identity.sourceChecksum,
  };
  saveWorld.meta.careerBootstrap = {
    source: "season_database",
    historicalBoundary: "past_history_present_world_hidden_future_structure",
    futureOutcomesAuthoritative: false,
    globalCompatibilityValidated: Boolean(options.globalDatabase),
  };

  return saveWorld;
}
