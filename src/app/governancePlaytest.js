import {
  castRegulationVote,
  listRegulationProposals,
  regulationProjection,
} from "../game/management/regulations.js";
import {
  rebrandTeam,
  teamEvolutionProjection,
} from "../game/management/teamEvolution.js";

function requireSession(session) {
  if (!session || typeof session.requireCareer !== "function") throw new TypeError("A DeveloperPlaytestSession is required.");
  return session.requireCareer();
}

function controlledTeamId(session, saveWorld) {
  return saveWorld.player?.controlledTeamIds?.[0] ?? session.controlledTeamId ?? null;
}

export function developerGovernance(session) {
  const saveWorld = requireSession(session);
  const teamId = controlledTeamId(session, saveWorld);
  const regulations = regulationProjection(saveWorld);
  const evolution = teamEvolutionProjection(saveWorld);
  return {
    season: Number(saveWorld.clock?.season),
    date: saveWorld.clock?.date ?? null,
    controlledTeamId: teamId,
    regulations: {
      ...regulations,
      openProposals: regulations.openProposals.map((proposal) => ({
        ...proposal,
        controlledTeamVote: teamId ? proposal.votes?.[teamId] ?? null : null,
      })),
    },
    teamEvolution: evolution,
  };
}

export function developerCastGovernanceVote(session, proposalId, choice) {
  const saveWorld = requireSession(session);
  const teamId = controlledTeamId(session, saveWorld);
  if (!teamId) throw new Error("The manager is currently unemployed and cannot cast a team vote.");
  const proposal = listRegulationProposals(saveWorld).find((row) => row.proposalId === proposalId);
  if (!proposal) throw new Error(`Regulation proposal '${proposalId}' was not found.`);
  const vote = castRegulationVote(saveWorld, proposalId, teamId, choice, { source: "player" });
  return { vote, governance: developerGovernance(session) };
}

export function developerRebrandControlledTeam(session, displayName) {
  const saveWorld = requireSession(session);
  const teamId = controlledTeamId(session, saveWorld);
  if (!teamId) throw new Error("The manager is currently unemployed and cannot rebrand a team.");
  const rebrand = rebrandTeam(saveWorld, teamId, displayName, { source: "developer_playtest" });
  return { rebrand, governance: developerGovernance(session) };
}
