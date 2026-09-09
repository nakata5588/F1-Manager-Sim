export function createSaveWorld(historicalSnapshot, options = {}) {
  if (!historicalSnapshot?.season) throw new TypeError("A historical season snapshot is required.");

  const clonedWorld = structuredClone(historicalSnapshot);
  return {
    meta: {
      schemaVersion: 1,
      sourceSeason: historicalSnapshot.season,
      seed: String(options.seed ?? `${historicalSnapshot.season}-default`),
      createdAt: options.createdAt ?? new Date().toISOString(),
    },
    clock: {
      date: options.startDate ?? `${historicalSnapshot.season}-01-01`,
      season: historicalSnapshot.season,
      day: 1,
    },
    world: clonedWorld,
    history: {
      events: [],
      championships: [],
      transfers: [],
      records: [],
    },
  };
}
