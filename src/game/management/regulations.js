export const REGULATION_EVENT = Object.freeze({
  INITIALIZED: "regulation.initialized",
  PROPOSAL_OPENED: "regulation.proposal_opened",
  VOTE_CAST: "regulation.vote_cast",
  PROPOSAL_RESOLVED: "regulation.proposal_resolved",
  PACKAGE_ENACTED: "regulation.package_enacted",
  TECHNICAL_TRANSITION_APPLIED: "regulation.technical_transition_applied",
});

const OUTCOME_KEYS = new Set([
  "winner", "winner_driver_id", "winner_team_id", "champion", "championship_position",
  "result", "results", "classification", "points_scored", "race_winner", "podium",
]);

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 3) {
  return Number(Number(value).toFixed(digits));
}

function copy(value) {
  return structuredClone(value);
}

export function regulationEraProfile(seasonInput) {
  const season = Number(seasonInput);
  if (season < 1968) {
    return {
      era: "constructors-era",
      defaultTechnicalCarryover: 0.92,
      defaultReliabilityCarryover: 0.94,
      generatedChangeIntensity: 0.05,
      voteThreshold: 0.5,
    };
  }
  if (season <= 1987) {
    return {
      era: "early-commercial",
      defaultTechnicalCarryover: 0.86,
      defaultReliabilityCarryover: 0.9,
      generatedChangeIntensity: 0.1,
      voteThreshold: 0.5,
    };
  }
  if (season <= 2005) {
    return {
      era: "global-expansion",
      defaultTechnicalCarryover: 0.82,
      defaultReliabilityCarryover: 0.88,
      generatedChangeIntensity: 0.13,
      voteThreshold: 0.5,
    };
  }
  if (season <= 2016) {
    return {
      era: "corporate-global",
      defaultTechnicalCarryover: 0.78,
      defaultReliabilityCarryover: 0.86,
      generatedChangeIntensity: 0.15,
      voteThreshold: 0.5,
    };
  }
  return {
    era: "modern-regulated",
    defaultTechnicalCarryover: 0.74,
    defaultReliabilityCarryover: 0.84,
    generatedChangeIntensity: 0.17,
    voteThreshold: 0.5,
  };
}

function startingPackage(saveWorld) {
  const season = Number(saveWorld.clock?.season ?? saveWorld.world?.season);
  const era = regulationEraProfile(season);
  const teamCount = Math.max(1, saveWorld.world?.teams?.length ?? 0);
  const sourceRules = saveWorld.world?.rules && typeof saveWorld.world.rules === "object"
    ? copy(saveWorld.world.rules)
    : {};
  return {
    season,
    technical: {
      carryoverRetention: era.defaultTechnicalCarryover,
      reliabilityRetention: era.defaultReliabilityCarryover,
      developmentEfficiencyModifier: 1,
      manufacturingCostModifier: 1,
      source: "derived_gameplay_regulation_baseline",
    },
    grid: {
      minTeams: Math.min(10, teamCount),
      maxTeams: Math.max(teamCount, Math.min(18, teamCount + 3)),
      source: "derived_gameplay_regulation_baseline",
    },
    sporting: {
      sourceRulePatch: sourceRules,
      source: Object.keys(sourceRules).length ? "historical_start_rules" : "no_source_rules",
    },
    provenance: {
      era: era.era,
      source: "career_start_materialization",
      historicalFutureRulesMandatory: false,
    },
  };
}

export function ensureRegulationState(saveWorld) {
  saveWorld.world.governance ??= {};
  saveWorld.world.governance.regulations ??= {
    sequence: 0,
    initializedAt: null,
    currentPackage: null,
    proposals: [],
    enacted: [],
    appliedProposalIds: [],
  };
  saveWorld.history.governance ??= [];
  return saveWorld.world.governance.regulations;
}

export function initializeRegulationState(saveWorld, date = saveWorld.clock?.date ?? null) {
  const state = ensureRegulationState(saveWorld);
  if (state.currentPackage) return state;
  state.initializedAt = date;
  state.currentPackage = startingPackage(saveWorld);
  saveWorld.history.governance.push({
    date,
    type: "regulation_initialized",
    season: Number(saveWorld.clock?.season),
    package: copy(state.currentPackage),
  });
  return state;
}

function nextProposalId(saveWorld) {
  const state = ensureRegulationState(saveWorld);
  state.sequence = Number(state.sequence ?? 0) + 1;
  return `regulation:${Number(saveWorld.clock?.season)}:${state.sequence}`;
}

function sanitizeRulePatch(row) {
  const patch = {};
  for (const [key, value] of Object.entries(row ?? {})) {
    const lower = String(key).toLowerCase();
    if (OUTCOME_KEYS.has(lower)) continue;
    if (["year", "season", "id", "rule_id", "source", "source_status"].includes(lower)) continue;
    if (value === undefined) continue;
    patch[key] = copy(value);
  }
  return patch;
}

function normalizeChanges(changes = {}) {
  const output = {};
  if (changes.technical && typeof changes.technical === "object") {
    output.technical = {};
    for (const field of ["carryoverRetention", "reliabilityRetention", "developmentEfficiencyModifier", "manufacturingCostModifier"]) {
      const value = numeric(changes.technical[field]);
      if (value === null) continue;
      output.technical[field] = field.endsWith("Retention") ? clamp(value, 0.25, 1) : clamp(value, 0.5, 1.5);
    }
  }
  if (changes.grid && typeof changes.grid === "object") {
    output.grid = {};
    const minimum = numeric(changes.grid.minTeams);
    const maximum = numeric(changes.grid.maxTeams);
    if (minimum !== null) output.grid.minTeams = Math.max(6, Math.round(minimum));
    if (maximum !== null) output.grid.maxTeams = Math.max(6, Math.round(maximum));
  }
  if (changes.sporting && typeof changes.sporting === "object") {
    output.sporting = {
      sourceRulePatch: sanitizeRulePatch(changes.sporting.sourceRulePatch ?? changes.sporting),
    };
  }
  return output;
}

export function openRegulationProposal(saveWorld, input = {}) {
  const state = initializeRegulationState(saveWorld);
  const targetSeason = Math.max(Number(saveWorld.clock?.season) + 1, Number(input.targetSeason ?? 0));
  const duplicateKey = input.referenceKey ?? input.proposalKey ?? null;
  if (duplicateKey) {
    const existing = state.proposals.find((row) => row.referenceKey === duplicateKey && Number(row.targetSeason) === targetSeason);
    if (existing) return copy(existing);
  }
  const proposal = {
    proposalId: nextProposalId(saveWorld),
    proposalKey: input.proposalKey ?? null,
    referenceKey: duplicateKey,
    title: input.title ?? "Regulation proposal",
    category: input.category ?? "technical",
    targetSeason,
    openedAt: saveWorld.clock?.date ?? null,
    closesAt: input.closesAt ?? `${Number(saveWorld.clock?.season)}-11-01`,
    source: input.source ?? "simulation_generated",
    provenance: input.provenance ?? "simulation_policy",
    rationale: input.rationale ?? null,
    changes: normalizeChanges(input.changes),
    threshold: clamp(numeric(input.threshold, regulationEraProfile(targetSeason).voteThreshold), 0.34, 0.75),
    status: "open",
    votes: {},
    resolution: null,
  };
  state.proposals.push(proposal);
  saveWorld.history.governance.push({
    date: proposal.openedAt,
    type: "regulation_proposal_opened",
    proposalId: proposal.proposalId,
    targetSeason,
    category: proposal.category,
    source: proposal.source,
    provenance: proposal.provenance,
  });
  return copy(proposal);
}

export function openHistoricalReferenceProposal(saveWorld, targetSeason, referenceRow, index = 0) {
  if (!referenceRow || typeof referenceRow !== "object") return null;
  const patch = sanitizeRulePatch(referenceRow);
  if (!Object.keys(patch).length) return null;
  const referenceId = referenceRow.rule_id ?? referenceRow.id ?? `${targetSeason}:${index}`;
  return openRegulationProposal(saveWorld, {
    proposalKey: `historical-reference:${referenceId}`,
    referenceKey: `historical-reference:${referenceId}`,
    title: `Regulation review for ${targetSeason}`,
    category: "sporting_reference",
    targetSeason,
    source: "historical_reference_hidden",
    provenance: "reference_not_mandatory_outcome",
    rationale: "A future historical rule is available as governance reference. The career may accept, reject or diverge from it.",
    changes: { sporting: { sourceRulePatch: patch } },
  });
}

export function castRegulationVote(saveWorld, proposalId, voterId, choice, input = {}) {
  const state = initializeRegulationState(saveWorld);
  const proposal = state.proposals.find((row) => row.proposalId === proposalId);
  if (!proposal) throw new Error(`Regulation proposal '${proposalId}' was not found.`);
  if (proposal.status !== "open") throw new Error("Regulation proposal is no longer open for voting.");
  const normalized = String(choice ?? "").toLowerCase();
  if (!["yes", "no", "abstain"].includes(normalized)) throw new Error("Vote must be yes, no or abstain.");
  proposal.votes[String(voterId)] = {
    voterId: String(voterId),
    choice: normalized,
    source: input.source ?? "player",
    castAt: saveWorld.clock?.date ?? null,
    reason: input.reason ?? null,
  };
  return copy(proposal.votes[String(voterId)]);
}

export function regulationVoteSummary(proposal, eligibleVoterIds = []) {
  const votes = Object.values(proposal?.votes ?? {});
  const yes = votes.filter((row) => row.choice === "yes").length;
  const no = votes.filter((row) => row.choice === "no").length;
  const abstain = votes.filter((row) => row.choice === "abstain").length;
  const eligible = Math.max(eligibleVoterIds.length, votes.length, 1);
  return {
    eligible,
    cast: votes.length,
    yes,
    no,
    abstain,
    yesShareEligible: round(yes / eligible),
    yesShareDecided: yes + no > 0 ? round(yes / (yes + no)) : 0,
  };
}

export function resolveRegulationProposal(saveWorld, proposalId, eligibleVoterIds = [], input = {}) {
  const state = initializeRegulationState(saveWorld);
  const proposal = state.proposals.find((row) => row.proposalId === proposalId);
  if (!proposal) throw new Error(`Regulation proposal '${proposalId}' was not found.`);
  if (proposal.status !== "open") return copy(proposal);
  const summary = regulationVoteSummary(proposal, eligibleVoterIds);
  const requiredYes = Math.max(1, Math.ceil(summary.eligible * proposal.threshold));
  const regulatorTieBreak = input.regulatorTieBreak === "yes" || input.regulatorTieBreak === "no"
    ? input.regulatorTieBreak
    : null;
  let accepted = summary.yes >= requiredYes && summary.yes > summary.no;
  if (summary.yes === summary.no && regulatorTieBreak) accepted = regulatorTieBreak === "yes";
  proposal.status = accepted ? "accepted" : "rejected";
  proposal.resolvedAt = saveWorld.clock?.date ?? null;
  proposal.resolution = {
    accepted,
    requiredYes,
    regulatorTieBreak,
    ...summary,
  };
  if (accepted) state.enacted.push({
    proposalId: proposal.proposalId,
    targetSeason: proposal.targetSeason,
    changes: copy(proposal.changes),
    source: proposal.source,
    provenance: proposal.provenance,
    enactedAt: proposal.resolvedAt,
    applied: false,
  });
  saveWorld.history.governance.push({
    date: proposal.resolvedAt,
    type: "regulation_proposal_resolved",
    proposalId: proposal.proposalId,
    targetSeason: proposal.targetSeason,
    accepted,
    vote: copy(proposal.resolution),
  });
  return copy(proposal);
}

function mergePackage(current, changes, season) {
  const next = copy(current);
  next.season = season;
  if (changes.technical) next.technical = { ...next.technical, ...copy(changes.technical), source: "simulation_governance" };
  if (changes.grid) next.grid = { ...next.grid, ...copy(changes.grid), source: "simulation_governance" };
  if (changes.sporting) {
    next.sporting = {
      ...next.sporting,
      sourceRulePatch: {
        ...(next.sporting?.sourceRulePatch ?? {}),
        ...(changes.sporting.sourceRulePatch ?? {}),
      },
      source: "simulation_governance",
    };
  }
  next.provenance = {
    ...(next.provenance ?? {}),
    source: "simulation_governance",
    historicalFutureRulesMandatory: false,
  };
  return next;
}

export function applyEnactedRegulations(saveWorld, seasonInput) {
  const state = initializeRegulationState(saveWorld);
  const season = Number(seasonInput ?? saveWorld.clock?.season);
  const applied = [];
  for (const enactment of state.enacted
    .filter((row) => !row.applied && Number(row.targetSeason) <= season)
    .sort((a, b) => Number(a.targetSeason) - Number(b.targetSeason) || String(a.proposalId).localeCompare(String(b.proposalId)))) {
    state.currentPackage = mergePackage(state.currentPackage, enactment.changes, season);
    enactment.applied = true;
    enactment.appliedAt = saveWorld.clock?.date ?? null;
    state.appliedProposalIds.push(enactment.proposalId);
    applied.push(copy(enactment));
  }
  state.currentPackage.season = season;
  const sportingPatch = state.currentPackage?.sporting?.sourceRulePatch ?? {};
  if (Object.keys(sportingPatch).length) {
    const existing = saveWorld.world.rules && typeof saveWorld.world.rules === "object" && !Array.isArray(saveWorld.world.rules)
      ? saveWorld.world.rules
      : {};
    saveWorld.world.rules = { ...existing, ...copy(sportingPatch), year: season, season };
  }
  return applied;
}

export function regulationPackage(saveWorld) {
  return copy(initializeRegulationState(saveWorld).currentPackage);
}

export function listRegulationProposals(saveWorld, options = {}) {
  const state = initializeRegulationState(saveWorld);
  return state.proposals
    .filter((row) => !options.status || row.status === options.status)
    .filter((row) => !options.targetSeason || Number(row.targetSeason) === Number(options.targetSeason))
    .map(copy);
}

export function regulationProjection(saveWorld) {
  const state = initializeRegulationState(saveWorld);
  return {
    currentPackage: copy(state.currentPackage),
    openProposals: state.proposals.filter((row) => row.status === "open").map(copy),
    resolvedProposals: state.proposals.filter((row) => row.status !== "open").slice(-12).map(copy),
    enacted: state.enacted.slice(-12).map(copy),
  };
}
