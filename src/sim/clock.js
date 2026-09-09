const DAY_MS = 24 * 60 * 60 * 1000;

export function advanceDay(saveWorld) {
  const current = new Date(`${saveWorld.clock.date}T00:00:00Z`);
  if (Number.isNaN(current.getTime())) throw new TypeError("Save-world clock date is invalid.");
  const next = new Date(current.getTime() + DAY_MS);
  saveWorld.clock.date = next.toISOString().slice(0, 10);
  saveWorld.clock.day += 1;
  saveWorld.clock.season = next.getUTCFullYear();
  return saveWorld.clock;
}
