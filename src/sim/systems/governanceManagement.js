import {
  REGULATION_EVENT,
  applyEnactedRegulations,
  castRegulationVote,
  initializeRegulationState,
  listRegulationProposals,
  openHistoricalReferenceProposal,
  openRegulationProposal,
  regulationPackage,
  resolveRegulationProposal,
} from "../../game/management/regulations.js";
import { applyTechnicalRegulationTransition } from "../../game/management/regulationImpact.js";
import {
  TEAM_EVOLUTION_EVENT,
  activateAcceptedTeamEntry,
  decideTeamEntryApplication,
  exitTeam,
  initializeTeamEvolutionState,
  listTeamEntryCandidates,
  submitTeamEntryApplication,
  teamEvolutionProjection,
  updateTeamDistress,
} from "../../game/management/teamEvolution.js";
import { createRng } from "../random.js";
import { SIM_EVENT } from "../timeEngine.js";
import { EMPLOYMENT_EVENT } from "./employmentMarket.js";
import { controlledTeamSet } from "./controlState.js";

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function currentTeams(saveWorld) {
  return (saveWorld.world?.teams ?? []).map((row) => row.team_id).filter(Boolean);
}

function ruleYear(row) {
  const value = Number(row?.year ?? row?.season ?? row?.effective_season ?? row?.start_year);
  return Number.isInteger(value) ? value : null;
}

function futureRuleReferences(saveWorld, targetSeason) {
  return (saveWorld.reference?.futureStructure?.rules ?? [])
    .filter((row) => ruleYear(row) === Number(targetSeason));
}

function fieldPerformance(saveWorld) {
  const rows = [];
  for (const team of saveWorld.world?.teams ?? []) {
    const components = saveWorld.world?.carState?.[team.team_id]?.components ?? {};
    const values = Object.values(components).map(Number).filter(Number.isFinite);
    if (!values.length) continue;
    rows.push({ teamId: team.team_id, score: values.reduce((sum, value) => sum + value, 0) / values.length });
  }
  rows.sort((a, b) => b.score - a.score || a.teamId.localeCompare(b.teamId));
  return rows;
}

function generatedTechnicalProposal(saveWorld, targetSeason) {
  const key = `generated-technical:${targetSeason}`;
  const existing = listRegulationProposals(saveWorld, { targetSeason }).find((row) => row.proposalKey === key);
  if (existing) return null;
  const current = regulationPackage(saveWorld);
  const performance = fieldPerformance(saveWorld);
  const spread = performance.length > 1 ? performance[0].score - performance.at(-1).score : 0;
  const rng = createRng(`${saveWorld.meta.seed}|${targetSeason}|regulation-generated`);
  if (rng.next() > 0.72) return null;
  const currentRetention = numeric(current.technical?.carryoverRetention, 0.86);
  const currentReliability = numeric(current.technical?.reliabilityRetention, 0.9);
  const parityPressure = Math.min(0.14, Math.max(0, spread - 8) * 0.008);
  const direction = rng.next();
  const changes = direction < 0.65
    ? {
        technical: {
          carryoverRetention: Math.max(0.55, currentRetention - 0.04 - parityPressure),
          reliabilityRetention: Math.max(0.65, currentReliability - parityPressure * 0.35),
        },
      }
    : {
        technical: {
          carryoverRetention: Math.min(0.96, currentRetention + 0.04),
          developmentEfficiencyModifier: Math.min(1.2, numeric(current.technical?.developmentEfficiencyModifier, 1) + 0.04),
        },
      };
  return openRegulationProposal(saveWorld, {
    proposalKey: key,
    referenceKey: key,
    title: direction < 0.65 ? `Technical reset package ${targetSeason}` : `Technical continuity package ${targetSeason}`,
    category: "technical",
    targetSeason,
    source: "simulation_generated",
    provenance: "dynamic_governance",
    rationale: direction < 0.65
      ? "Competitive spread and technical change pressure produced a proposed reduction in carry-over."
      : "Teams proposed greater technical continuity and development freedom.",
    changes,
  });
}

function regulationEventsFromProposal(proposal) {
  if (!proposal) return [];
  return [{
    type: REGULATION_EVENT.PROPOSAL_OPENED,
    payload: {
      proposal_id: proposal.proposalId,
      title: proposal.title,
      category: proposal.category,
      target_season: proposal.targetSeason,
      source: proposal.source,
      provenance: proposal.provenance,
    },
  }];
}

function openAnnualProposals(saveWorld, targetSeason) {
  const events = [];
  const references = futureRuleReferences(saveWorld, targetSeason);
  references.forEach((row, index) => events.push(...regulationEventsFromProposal(openHistoricalReferenceProposal(saveWorld, targetSeason, row, index))));
  events.push(...regulationEventsFromProposal(generatedTechnicalProposal(saveWorld, targetSeason)));
  return events;
}

function teamCarScore(saveWorld, teamId) {
  return fieldPerformance(saveWorld).find((row) => row.teamId === teamId)?.score ?? 50;
}

function automaticVote(saveWorld, proposal, teamId) {
  const current = regulationPackage(saveWorld);
  const field = fieldPerformance(saveWorld);
  const medianScore = field.length ? [...field].sort((a, b) => a.score - b.score)[Math.floor(field.length / 2)].score : 50;
  const own = teamCarScore(saveWorld, teamId);
  let support = 50;
  const proposedRetention = numeric(proposal.changes?.technical?.carryoverRetention);
  if (proposedRetention !== null) {
    const currentRetention = numeric(current.technical?.carryoverRetention, 0.86);
    const strongerReset = proposedRetention < currentRetention;
    if (strongerReset) support += own < medianScore ? 24 : -22;
    else support += own >= medianScore ? 18 : -10;
  }
  const proposedMaxTeams = numeric(proposal.changes?.grid?.maxTeams);
  if (proposedMaxTeams !== null) support += proposedMaxTeams > numeric(current.grid?.maxTeams, 18) ? (own < medianScore ? 8 : -6) : 0;
  if (proposal.category === "sporting_reference") support += 2;
  const finance = saveWorld.world?.teamState?.[teamId] ?? {};
  if (finance.financialStatus === "distressed") support -= 8;
  const rng = createRng(`${saveWorld.meta.seed}|${proposal.proposalId}|vote|${teamId}`);
  support += (rng.next() - 0.5) * 22;
  return support >= 54 ? "yes" : support <= 44 ? "no" : "abstain";
}

function castAiVotes(saveWorld, controlled) {
  const events = [];
  for (const proposal of listRegulationProposals(saveWorld, { status: "open" })) {
    for (const teamId of currentTeams(saveWorld)) {
      if (controlled.has(String(teamId)) || proposal.votes?.[teamId]) continue;
      const choice = automaticVote(saveWorld, proposal, teamId);
      const vote = castRegulationVote(saveWorld, proposal.proposalId, teamId, choice, { source: "ai_team" });
      events.push({
        type: REGULATION_EVENT.VOTE_CAST,
        payload: { proposal_id: proposal.proposalId, voter_id: teamId, choice: vote.choice, source: vote.source },
      });
    }
  }
  return events;
}

function resolveAnnualProposals(saveWorld) {
  const teamIds = currentTeams(saveWorld);
  const events = [];
  for (const proposal of listRegulationProposals(saveWorld, { status: "open" })) {
    const rng = createRng(`${saveWorld.meta.seed}|${proposal.proposalId}|regulator-tiebreak`);
    const resolved = resolveRegulationProposal(saveWorld, proposal.proposalId, teamIds, {
      regulatorTieBreak: rng.next() >= 0.5 ? "yes" : "no",
    });
    events.push({
      type: REGULATION_EVENT.PROPOSAL_RESOLVED,
      payload: {
        proposal_id: resolved.proposalId,
        target_season: resolved.targetSeason,
        accepted: resolved.status === "accepted",
        resolution: resolved.resolution,
      },
    });
  }
  return events;
}

function maybeSubmitEntryApplication(saveWorld, targetSeason) {
  const projection = teamEvolutionProjection(saveWorld);
  if (projection.grid.activeTeams >= projection.grid.maxTeams) return null;
  const pending = projection.applications.some((row) => row.status === "pending" && Number(row.targetSeason) === Number(targetSeason));
  if (pending) return null;
  const candidate = projection.candidates[0];
  if (!candidate) return null;
  const rng = createRng(`${saveWorld.meta.seed}|${targetSeason}|entry-application|${candidate.teamId}`);
  if (candidate.readiness + rng.next() * 18 < 55) return null;
  return submitTeamEntryApplication(saveWorld, candidate.teamId, { targetSeason, source: "ai_candidate_application" });
}

function decidePendingEntries(saveWorld, targetSeason) {
  const projection = teamEvolutionProjection(saveWorld);
  let slots = Math.max(0, projection.grid.maxTeams - projection.grid.activeTeams);
  const events = [];
  const pending = projection.applications
    .filter((row) => row.status === "pending" && Number(row.targetSeason) === Number(targetSeason))
    .sort((a, b) => Number(b.readiness) - Number(a.readiness) || a.teamId.localeCompare(b.teamId));
  for (const application of pending) {
    const rng = createRng(`${saveWorld.meta.seed}|${application.applicationId}|entry-decision`);
    const accepted = slots > 0 && Number(application.readiness) + rng.next() * 16 >= 58;
    const decided = decideTeamEntryApplication(saveWorld, application.applicationId, accepted, {
      source: "governance_entry_review",
      reason: accepted ? "Grid capacity and application readiness support entry." : "Entry threshold or grid capacity was not met.",
    });
    if (accepted) slots -= 1;
    events.push({
      type: accepted ? TEAM_EVOLUTION_EVENT.ENTRY_ACCEPTED : TEAM_EVOLUTION_EVENT.ENTRY_REJECTED,
      payload: { application_id: decided.applicationId, team_id: decided.teamId, target_season: decided.targetSeason, readiness: decided.readiness },
    });
  }
  return events;
}

function entryVacancyEvents(result) {
  return (result?.vacancies ?? []).map((vacancy) => ({
    type: EMPLOYMENT_EVENT.VACANCY_OPENED,
    payload: {
      vacancy_id: vacancy.vacancyId,
      worker_type: vacancy.type,
      team_id: vacancy.teamId,
      role: vacancy.role,
      reason: "team_entry",
    },
  }));
}

function applySeasonGovernance(saveWorld, event, options) {
  const season = Number(event.payload?.season ?? saveWorld.clock?.season);
  const controlled = controlledTeamSet(saveWorld, options.controlledTeamIds ?? []);
  const output = [];
  const applied = applyEnactedRegulations(saveWorld, season);
  for (const row of applied) output.push({
    type: REGULATION_EVENT.PACKAGE_ENACTED,
    payload: { proposal_id: row.proposalId, season, source: row.source, provenance: row.provenance },
  });
  if (season > Number(saveWorld.meta?.sourceSeason ?? season)) {
    const transition = applyTechnicalRegulationTransition(saveWorld, season);
    output.push({ type: REGULATION_EVENT.TECHNICAL_TRANSITION_APPLIED, payload: transition });
  }

  const distress = updateTeamDistress(saveWorld, [...controlled]);
  if (distress.length) {
    const id = distress[0];
    const rng = createRng(`${saveWorld.meta.seed}|${season}|team-exit|${id}`);
    if (rng.next() < 0.45) {
      const exited = exitTeam(saveWorld, id, { reason: "multi_season_financial_distress" });
      output.push({ type: TEAM_EVOLUTION_EVENT.TEAM_EXITED, payload: { team_id: id, season, reason: exited.reason, released_workers: exited.releasedWorkers } });
      for (const worker of exited.released ?? []) output.push({ type: EMPLOYMENT_EVENT.FREE_AGENT, payload: { worker_type: worker.type, worker_id: worker.id, reason: "team_exit" } });
    }
  }

  const applications = teamEvolutionProjection(saveWorld).applications
    .filter((row) => row.status === "accepted" && Number(row.targetSeason) <= season);
  for (const application of applications) {
    const activated = activateAcceptedTeamEntry(saveWorld, application.applicationId);
    output.push({ type: TEAM_EVOLUTION_EVENT.ENTRY_ACCEPTED, payload: { application_id: application.applicationId, team_id: activated.teamId, season, activated: true } });
    output.push(...entryVacancyEvents(activated));
  }
  return output;
}

export function createGovernanceManagementSystem(options = {}) {
  return {
    id: "world.governance",
    eventTypes: [SIM_EVENT.CAREER_STARTED, SIM_EVENT.MONTH_STARTED, SIM_EVENT.SEASON_STARTED],
    handle({ saveWorld, event }) {
      const controlled = controlledTeamSet(saveWorld, options.controlledTeamIds ?? []);
      if (event.type === SIM_EVENT.CAREER_STARTED) {
        initializeRegulationState(saveWorld, event.date);
        initializeTeamEvolutionState(saveWorld, event.date);
        return [
          { type: REGULATION_EVENT.INITIALIZED, payload: { season: Number(saveWorld.clock.season), teams: currentTeams(saveWorld).length } },
          { type: TEAM_EVOLUTION_EVENT.INITIALIZED, payload: { season: Number(saveWorld.clock.season), teams: currentTeams(saveWorld).length } },
        ];
      }
      if (event.type === SIM_EVENT.SEASON_STARTED) return applySeasonGovernance(saveWorld, event, options);

      const month = Number(event.payload?.month ?? String(event.date).slice(5, 7));
      const targetSeason = Number(saveWorld.clock.season) + 1;
      const output = [];
      if (month === 7) output.push(...openAnnualProposals(saveWorld, targetSeason));
      if (month === 8) {
        const application = maybeSubmitEntryApplication(saveWorld, targetSeason);
        if (application) output.push({ type: TEAM_EVOLUTION_EVENT.ENTRY_APPLICATION, payload: { application_id: application.applicationId, team_id: application.teamId, target_season: targetSeason, readiness: application.readiness } });
      }
      output.push(...castAiVotes(saveWorld, controlled));
      if (month === 10) output.push(...decidePendingEntries(saveWorld, targetSeason));
      if (month === 11) output.push(...resolveAnnualProposals(saveWorld));
      return output;
    },
  };
}
