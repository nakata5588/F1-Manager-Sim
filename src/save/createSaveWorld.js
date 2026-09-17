import { extractDatabaseReferenceContext } from "../data/databaseManagementMaterializer.js";
import {
  applyDatabaseOpeningState,
  extractDatabaseAuditReferenceContext,
} from "../data/databaseOpeningState.js";
import {
  extractTechnicalReferenceContext,
  initializeTechnicalStartingState,
} from "../data/databaseTechnicalMaterializer.js";

export function createSaveWorld(historicalSnapshot, options = {}) {
  if (!historicalSnapshot?.season) throw new TypeError("A historical season snapshot is required.");

  const clonedSnapshot = structuredClone(historicalSnapshot);
  const historicalArchive = structuredClone(clonedSnapshot.historicalArchive ?? []);
  const futureStructure = structuredClone(clonedSnapshot.futureStructure ?? {
    policy: "hidden_structural_reference_only_no_future_results",
    calendars: {},
    tracks: [],
    rules: [],
    qualifyingRules: [],
    eraSafety: [],
    accidentModel: [],
  });
  const hiddenExternalDriverMarket = structuredClone(clonedSnapshot.externalDriverMarket ?? []);
  const visibilityPolicy = structuredClone(clonedSnapshot.visibilityPolicy ?? null);
  const databasePolicy = structuredClone(clonedSnapshot.databasePolicy ?? null);
  const startDate = options.startDate ?? `${historicalSnapshot.season}-01-01`;

  // Database opening baselines must become active starting state before any
  // simulation system sees the career. This is where season-scoped finance,
  // period-correct circuit geometry and derived track/weather seeds are applied.
  const openingState = applyDatabaseOpeningState(clonedSnapshot);

  // Database technical rows are immutable starting/reference inputs. Materialize
  // the mutable fitted-car state before moving those source rows out of world.
  initializeTechnicalStartingState(clonedSnapshot, startDate);
  const databaseContext = {
    ...extractDatabaseReferenceContext(clonedSnapshot),
    ...extractTechnicalReferenceContext(clonedSnapshot),
    ...extractDatabaseAuditReferenceContext(clonedSnapshot),
  };
  const hasDatabaseContext = Object.keys(databaseContext).length > 0;

  // Historical records and structural/reference future data are deliberately
  // kept outside the mutable active world. Future identity pools remain in
  // world because lifecycle systems need them, but player-facing systems must
  // consume visibility selectors rather than those raw arrays.
  delete clonedSnapshot.historicalArchive;
  delete clonedSnapshot.futureStructure;
  delete clonedSnapshot.externalDriverMarket;

  return {
    meta: {
      schemaVersion: 1,
      sourceSeason: historicalSnapshot.season,
      historicalDatabase: {
        databaseVersion: historicalSnapshot.databaseVersion ?? null,
        sourceChecksum: historicalSnapshot.sourceChecksum ?? null,
      },
      databaseOpeningState: openingState,
      databasePolicy,
      seed: String(options.seed ?? `${historicalSnapshot.season}-default`),
      createdAt: options.createdAt ?? new Date().toISOString(),
    },
    clock: {
      date: startDate,
      season: historicalSnapshot.season,
      day: 1,
    },
    reference: {
      futureStructure,
      hiddenExternalDriverMarket,
      visibilityPolicy,
      ...(hasDatabaseContext ? { databaseContext } : {}),
      uiAccessPolicy: "player_facing_code_must_use_visibility_selectors",
      policy: "not_player_history_and_not_authoritative_outcomes",
    },
    world: clonedSnapshot,
    simulation: {
      nextEventSequence: 0,
      systemState: {},
    },
    history: {
      preCareer: historicalArchive,
      events: [],
      seasons: [],
      races: [],
      championships: [],
      transfers: [],
      retirements: [],
      finances: [],
      development: [],
      records: [],
    },
  };
}
