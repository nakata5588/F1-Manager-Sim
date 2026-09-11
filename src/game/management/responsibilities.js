const AREAS = Object.freeze({
  driverRecruitment: { label: "Driver recruitment", defaultOwner: "manager" },
  staffRecruitment: { label: "Staff recruitment", defaultOwner: "manager" },
  scouting: { label: "Scouting", defaultOwner: "manager" },
  carDevelopment: { label: "Car development", defaultOwner: "manager" },
  raceStrategy: { label: "Race strategy", defaultOwner: "manager" },
  finance: { label: "Finances", defaultOwner: "manager" },
  commercial: { label: "Commercial", defaultOwner: "manager" },
});

function controlledTeamIds(saveWorld) {
  return [...(saveWorld.player?.controlledTeamIds ?? [])].map(String);
}

export function ensureResponsibilities(saveWorld) {
  saveWorld.world.management ??= {};
  saveWorld.world.management.responsibilities ??= { teams: {} };
  const state = saveWorld.world.management.responsibilities;
  state.teams ??= {};
  for (const teamId of controlledTeamIds(saveWorld)) {
    state.teams[teamId] ??= {};
    for (const [area, definition] of Object.entries(AREAS)) {
      state.teams[teamId][area] ??= definition.defaultOwner;
    }
  }
  return state;
}

export function responsibilityAreas() {
  return Object.entries(AREAS).map(([id, row]) => ({ id, ...row }));
}

export function responsibilityOwner(saveWorld, teamId, area) {
  const definition = AREAS[area];
  if (!definition) throw new Error(`Unknown management responsibility '${area}'.`);
  const state = ensureResponsibilities(saveWorld);
  return state.teams?.[teamId]?.[area] ?? definition.defaultOwner;
}

export function setResponsibility(saveWorld, teamId, area, owner) {
  if (!AREAS[area]) throw new Error(`Unknown management responsibility '${area}'.`);
  if (!controlledTeamIds(saveWorld).includes(String(teamId))) throw new Error("Responsibilities can only be changed for a controlled team.");
  if (!["manager", "delegated"].includes(String(owner))) throw new Error("Responsibility owner must be 'manager' or 'delegated'.");
  const state = ensureResponsibilities(saveWorld);
  state.teams[teamId] ??= {};
  state.teams[teamId][area] = String(owner);
  return responsibilityProjection(saveWorld, teamId);
}

export function responsibilityProjection(saveWorld, teamId) {
  const state = ensureResponsibilities(saveWorld);
  const assignments = state.teams?.[teamId] ?? {};
  return responsibilityAreas().map((definition) => ({
    ...definition,
    owner: assignments[definition.id] ?? definition.defaultOwner,
  }));
}
