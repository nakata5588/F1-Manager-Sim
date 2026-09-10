export function createSaveWorld(historicalSnapshot, options = {}) {
  if (!historicalSnapshot?.season) throw new TypeError("A historical season snapshot is required.");

  const clonedWorld = structuredClone(historicalSnapshot);
  return {
    meta: {
      schemaVersion: 1,
      sourceSeason: historicalSnapshot.season,
      historicalDatabase: {
        databaseVersion: historicalSnapshot.databaseVersion ?? null,
        sourceChecksum: historicalSnapshot.sourceChecksum ?? null,
      },
      seed: String(options.seed ?? `${historicalSnapshot.season}-default`),
      createdAt: options.createdAt ?? new Date().toISOString(),
    },
    clock: {
      date: options.startDate ?? `${historicalSnapshot.season}-01-01`,
      season: historicalSnapshot.season,
      day: 1,
    },
    world: clonedWorld,
    simulation: {
      nextEventSequence: 0,
      systemState: {},
    },
    history: {
      events: [],
      championships: [],
      transfers: [],
      retirements: [],
      records: [],
    },
  };
}
