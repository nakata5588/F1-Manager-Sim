function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 3) {
  return Number(Number(value ?? 0).toFixed(digits));
}

function emptyDriverSeason(season) {
  return {
    season: Number(season),
    raceStarts: 0,
    raceFinishes: 0,
    practiceWindows: 0,
    qualifyingStarts: 0,
    testingSessions: 0,
    testingMileage: 0,
    performanceSamples: 0,
    teammatePerformanceDeltaTotal: 0,
    teammateQualifyingDeltaTotal: 0,
    teamEnvironmentMonths: 0,
    teamEnvironmentTotal: 0,
    coachingMonths: 0,
    coachingTotal: 0,
    mentoringMonths: 0,
    mentoringTotal: 0,
    injuryDays: 0,
    injuryBurden: 0,
    seriousInjuries: 0,
    careerThreateningInjuries: 0,
  };
}

function emptyStaffSeason(season) {
  return {
    season: Number(season),
    employedMonths: 0,
    raceWeekends: 0,
    testSessions: 0,
    departmentMonths: 0,
    departmentEffectivenessTotal: 0,
    workloadFactorTotal: 0,
    peerLearningMonths: 0,
    peerLearningTotal: 0,
  };
}

export function ensureDevelopmentState(saveWorld) {
  saveWorld.world ??= {};
  saveWorld.world.developmentState ??= {
    drivers: {},
    staff: {},
    history: [],
    initializedAt: null,
  };
  const state = saveWorld.world.developmentState;
  state.drivers ??= {};
  state.staff ??= {};
  state.history ??= [];
  saveWorld.history ??= {};
  saveWorld.history.development ??= [];
  return state;
}

export function ensureDriverDevelopmentSeason(saveWorld, driverId, season = saveWorld.clock?.season) {
  const state = ensureDevelopmentState(saveWorld);
  const targetSeason = Number(season);
  const current = state.drivers[driverId];
  if (!current || Number(current.season) !== targetSeason) {
    state.drivers[driverId] = emptyDriverSeason(targetSeason);
  }
  return state.drivers[driverId];
}

export function ensureStaffDevelopmentSeason(saveWorld, staffId, season = saveWorld.clock?.season) {
  const state = ensureDevelopmentState(saveWorld);
  const targetSeason = Number(season);
  const current = state.staff[staffId];
  if (!current || Number(current.season) !== targetSeason) {
    state.staff[staffId] = emptyStaffSeason(targetSeason);
  }
  return state.staff[staffId];
}

export function driverDevelopmentEvidence(saveWorld, driverId, season = null) {
  const row = ensureDevelopmentState(saveWorld).drivers?.[driverId];
  if (!row) return emptyDriverSeason(season ?? saveWorld.clock?.season);
  if (season !== null && Number(row.season) !== Number(season)) return emptyDriverSeason(season);
  const samples = Math.max(0, numeric(row.performanceSamples));
  const environmentMonths = Math.max(0, numeric(row.teamEnvironmentMonths));
  const coachingMonths = Math.max(0, numeric(row.coachingMonths));
  const mentoringMonths = Math.max(0, numeric(row.mentoringMonths));
  return {
    ...structuredClone(row),
    averageTeammatePerformanceDelta: samples ? round(numeric(row.teammatePerformanceDeltaTotal) / samples) : 0,
    averageTeammateQualifyingDelta: samples ? round(numeric(row.teammateQualifyingDeltaTotal) / samples) : 0,
    averageTeamEnvironment: environmentMonths ? round(numeric(row.teamEnvironmentTotal) / environmentMonths) : 1,
    averageCoaching: coachingMonths ? round(numeric(row.coachingTotal) / coachingMonths) : 50,
    averageMentoring: mentoringMonths ? round(numeric(row.mentoringTotal) / mentoringMonths) : 0,
  };
}

export function staffDevelopmentEvidence(saveWorld, staffId, season = null) {
  const row = ensureDevelopmentState(saveWorld).staff?.[staffId];
  if (!row) return emptyStaffSeason(season ?? saveWorld.clock?.season);
  if (season !== null && Number(row.season) !== Number(season)) return emptyStaffSeason(season);
  const departmentMonths = Math.max(0, numeric(row.departmentMonths));
  const peerMonths = Math.max(0, numeric(row.peerLearningMonths));
  return {
    ...structuredClone(row),
    averageDepartmentEffectiveness: departmentMonths ? round(numeric(row.departmentEffectivenessTotal) / departmentMonths) : 1,
    averageWorkloadFactor: departmentMonths ? round(numeric(row.workloadFactorTotal) / departmentMonths) : 1,
    averagePeerLearning: peerMonths ? round(numeric(row.peerLearningTotal) / peerMonths) : 0,
  };
}

export function archiveDevelopmentSeason(saveWorld, season, date = saveWorld.clock?.date) {
  const state = ensureDevelopmentState(saveWorld);
  const target = Number(season);
  if (!Number.isFinite(target)) return null;
  if (state.history.some((row) => Number(row.season) === target)) return null;
  const drivers = Object.fromEntries(Object.entries(state.drivers)
    .filter(([, row]) => Number(row?.season) === target)
    .map(([id]) => [id, driverDevelopmentEvidence(saveWorld, id, target)]));
  const staff = Object.fromEntries(Object.entries(state.staff)
    .filter(([, row]) => Number(row?.season) === target)
    .map(([id]) => [id, staffDevelopmentEvidence(saveWorld, id, target)]));
  const archive = { season: target, date: date ?? null, drivers, staff };
  state.history.push(structuredClone(archive));
  saveWorld.history.development.push({
    date: date ?? null,
    season: target,
    type: "development_season_archived",
    drivers: Object.keys(drivers).length,
    staff: Object.keys(staff).length,
  });
  return archive;
}

export function resetDevelopmentSeason(saveWorld, season, date = saveWorld.clock?.date) {
  const state = ensureDevelopmentState(saveWorld);
  const target = Number(season);
  for (const driverId of Object.keys(saveWorld.world?.careerState?.drivers ?? {})) {
    state.drivers[driverId] = emptyDriverSeason(target);
  }
  for (const staffId of Object.keys(saveWorld.world?.careerState?.staff ?? {})) {
    state.staff[staffId] = emptyStaffSeason(target);
  }
  state.currentSeason = target;
  state.lastResetAt = date ?? null;
  return state;
}

export function developmentProjection(saveWorld, type, id) {
  if (type === "driver") return driverDevelopmentEvidence(saveWorld, id);
  if (type === "staff") return staffDevelopmentEvidence(saveWorld, id);
  return null;
}
