export function controlledTeamSet(saveWorld, configuredTeamIds = []) {
  const dynamic = saveWorld.player?.controlledTeamIds;
  const source = Array.isArray(dynamic) ? dynamic : configuredTeamIds;
  return new Set(source.map(String));
}

export function isTeamPlayerControlled(saveWorld, teamId, configuredTeamIds = []) {
  if (teamId === null || teamId === undefined) return false;
  return controlledTeamSet(saveWorld, configuredTeamIds).has(String(teamId));
}
