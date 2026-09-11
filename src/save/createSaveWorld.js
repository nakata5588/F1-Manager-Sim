export function createSaveWorld(historicalSnapshot, options = {}) {
  if (!historicalSnapshot?.season) throw new TypeError("A historical season snapshot is required.");

  const clonedSnapshot = structuredClone(historicalSnapshot);
  const historicalArchive = structuredClone(clonedSnapshot.historicalArchive ?? {
    throughSeason: historicalSnapshot.season - 1,
    cutoff: `${historicalSnapshot.season}-01-01`,
  });
  const futureStructure = structuredClone(clonedSnapshot.futureStructure ?? {
    policy: "hidden_structural_reference_only_no_future_results",
    calendars: {},
    tracks: [],
    rules: [],
    qualifyingRules: [],
    eraSafety: [],
    accidentModel: [],
  });
  const databasePolicy = structuredClone(clonedSnapshot.databasePolicy ?? null);

  // Historical records and structural future references are deliberately kept
  // outside the mutable active world. Future entity pools remain in world so
  // lifecycle systems can make them eligible without consulting the Master DB.
  delete clonedSnapshot.historicalArchive;
  delete clonedSnapshot.futureStructure;

  return {
    meta: {
      schemaVersion: 1,
      sourceSeason: historicalSnapshot.season,
      historicalDatabase: {
        databaseVersion: historicalSnapshot.databaseVersion ?? null,
        sourceChecksum: historicalSnapshot.sourceChecksum ?? null,
      },
      databasePolicy,
      seed: String(options.seed ?? `${historicalSnapshot.season}-default`),
      createdAt: options.createdAt ?? new Date().toISOString(),
    },
    clock: {
      date: options.startDate ?? `${historicalSnapshot.season}-01-01`,
      season: historicalSnapshot.season,
      day: 1,
    },
    reference: {
      futureStructure,
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
