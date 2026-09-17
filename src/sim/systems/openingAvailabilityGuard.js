import { EMPLOYMENT_EVENT } from "./employmentMarket.js";

function authoritativeOpeningRows(saveWorld) {
  const season = Number(saveWorld?.clock?.season);
  return (saveWorld?.world?.driverAvailabilitySnapshot1980 ?? [])
    .filter((row) => Number(row?.season ?? season) === season && row?.driver_id);
}

export function applyOpeningDriverAvailability(saveWorld) {
  const rows = authoritativeOpeningRows(saveWorld);
  if (!rows.length) return { applied: false, removed: 0, allowed: null };

  const employment = saveWorld.world?.employment;
  if (!employment?.freeAgents?.drivers) return { applied: false, removed: 0, allowed: null };

  const covered = new Set(rows.map((row) => row.driver_id));
  const explicitlyFree = new Set(rows
    .filter((row) => row.free_driver_1980 === true || String(row.market_availability_status ?? "").toLowerCase() === "free_driver")
    .map((row) => row.driver_id));

  const before = employment.freeAgents.drivers.length;
  employment.freeAgents.drivers = employment.freeAgents.drivers.filter((id) => !covered.has(id) || explicitlyFree.has(id));
  employment.freeAgents.drivers.sort();

  const freeSet = new Set(employment.freeAgents.drivers);
  for (const row of rows) {
    const state = saveWorld.world?.careerState?.drivers?.[row.driver_id];
    if (!state || saveWorld.world?.employment?.drivers?.[row.driver_id]) continue;
    if (freeSet.has(row.driver_id)) {
      state.status = "available";
    } else if (row.employment_status === "returnable_retired_inactive_not_seeking") {
      state.status = "inactive";
    } else if (row.talent_visible && !row.f1_eligible) {
      state.status = "talent";
    } else if (row.f1_eligible) {
      state.status = "external";
    }
  }

  return {
    applied: true,
    removed: Math.max(0, before - employment.freeAgents.drivers.length),
    allowed: explicitlyFree.size,
  };
}

export function createOpeningAvailabilityGuardSystem() {
  return {
    id: "employment.opening-availability-guard",
    eventTypes: [EMPLOYMENT_EVENT.INITIALIZED],
    handle({ saveWorld }) {
      applyOpeningDriverAvailability(saveWorld);
      return null;
    },
  };
}
