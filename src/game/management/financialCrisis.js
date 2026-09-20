import { createRng } from "../../sim/random.js";
import { financialPlanningProjection, refreshFinancialPlanningState } from "./finances.js";

const STAGE_ORDER = Object.freeze({
  stable: 0,
  watch: 1,
  warning: 2,
  spending_freeze: 3,
  emergency: 4,
  administration: 5,
});

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value) {
  return Math.round(Number(value ?? 0) * 100) / 100;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function teamProfile(saveWorld, teamId) {
  return (saveWorld.world?.teams ?? []).find((row) => String(row?.team_id ?? row?.id ?? "") === String(teamId)) ?? {};
}

function teamName(saveWorld, teamId) {
  const row = teamProfile(saveWorld, teamId);
  return row.team_name ?? row.display_name ?? row.name ?? teamId;
}

function teamReputation(saveWorld, teamId) {
  const finance = saveWorld.world?.teamState?.[teamId] ?? {};
  const team = teamProfile(saveWorld, teamId);
  const raw = numeric(finance.reputation ?? team.reputation ?? team.prestige, 50);
  if (raw <= 1) return raw * 100;
  if (raw <= 10) return raw * 10;
  return clamp(raw, 0, 100);
}

function nextId(saveWorld, prefix) {
  const state = ensureFinancialCrisisState(saveWorld);
  state.sequence = Number(state.sequence ?? 0) + 1;
  return `${prefix}:${String(state.sequence).padStart(6, "0")}`;
}

function ownershipSeed(saveWorld, teamId, generation = 0) {
  const rng = createRng(`${saveWorld.meta?.seed}|ownership|${teamId}|${generation}`);
  const reputation = teamReputation(saveWorld, teamId);
  const supportIndex = clamp(Math.round(34 + rng.next() * 44 + reputation * 0.18), 20, 95);
  const patienceIndex = clamp(Math.round(38 + rng.next() * 45 + reputation * 0.12), 20, 95);
  const riskAppetite = clamp(Math.round(30 + rng.next() * 55), 15, 90);
  return { supportIndex, patienceIndex, riskAppetite };
}

function ownershipModel(saveWorld, teamId) {
  const row = teamProfile(saveWorld, teamId);
  const explicit = row.ownership_model ?? row.owner_type ?? row.ownership_type ?? null;
  if (explicit) return String(explicit);
  const manufacturer = row.manufacturer ?? row.constructor_type ?? row.team_type ?? null;
  if (manufacturer && /manufacturer|works|factory/i.test(String(manufacturer))) return "manufacturer_backed";
  return "incumbent_private_ownership";
}

function initialOwnership(saveWorld, teamId) {
  const indices = ownershipSeed(saveWorld, teamId, 0);
  const openingCash = Math.max(0, numeric(saveWorld.world?.teamState?.[teamId]?.openingCash, 0));
  return {
    ownershipId: `ownership:${teamId}:opening`,
    teamId,
    generation: 0,
    model: ownershipModel(saveWorld, teamId),
    displayLabel: "Incumbent ownership",
    acquiredAt: saveWorld.clock?.date ?? null,
    acquiredSeason: Number(saveWorld.clock?.season),
    source: "derived_gameplay_ownership_profile",
    supportIndex: indices.supportIndex,
    patienceIndex: indices.patienceIndex,
    riskAppetite: indices.riskAppetite,
    supportBudget: roundMoney(Math.max(250_000, openingCash * (0.35 + indices.supportIndex / 100))),
    supportUsed: 0,
  };
}

export function ensureFinancialCrisisState(saveWorld) {
  saveWorld.world.financialCrisis ??= {
    sequence: 0,
    initializedAt: null,
    teams: {},
    inactiveTeams: {},
    ownershipChanges: [],
    interventions: [],
  };
  const state = saveWorld.world.financialCrisis;
  state.teams ??= {};
  state.inactiveTeams ??= {};
  state.ownershipChanges ??= [];
  state.interventions ??= [];
  state.sequence = Math.max(0, Math.round(numeric(state.sequence, 0)));
  saveWorld.history.financialCrises ??= [];
  saveWorld.history.ownership ??= [];
  return state;
}

export function ensureFinancialCrisisTeam(saveWorld, teamId, date = saveWorld.clock?.date) {
  const state = ensureFinancialCrisisState(saveWorld);
  if (state.teams[teamId]) return state.teams[teamId];
  const row = {
    teamId,
    stage: "stable",
    stageSince: date ?? null,
    distressMonths: 0,
    negativeCashMonths: 0,
    recoveryMonths: 0,
    administrationMonths: 0,
    spendingFreeze: false,
    freezeReason: null,
    debtPrincipal: 0,
    debtAnnualRate: 0.11,
    debtTermMonths: 48,
    debtPaymentsMade: 0,
    lastInterventionAt: null,
    lastOwnerFundingAt: null,
    lastBridgeFinanceAt: null,
    lastOwnershipReviewAt: null,
    saleMandate: false,
    withdrawalRequested: false,
    deferredCommitments: 0,
    owner: initialOwnership(saveWorld, teamId),
    lastAssessment: null,
  };
  state.teams[teamId] = row;
  return row;
}

export function initializeFinancialCrisisWorld(saveWorld, date = saveWorld.clock?.date) {
  const state = ensureFinancialCrisisState(saveWorld);
  state.initializedAt ??= date ?? null;
  let created = 0;
  for (const team of saveWorld.world?.teams ?? []) {
    const teamId = team?.team_id ?? team?.id;
    if (!teamId || state.teams[teamId]) continue;
    ensureFinancialCrisisTeam(saveWorld, teamId, date);
    created += 1;
  }
  return { created, total: Object.keys(state.teams).length };
}

function deriveStage(row, finance) {
  const risk = finance?.riskLevel ?? "stable";
  const cash = numeric(finance?.cash, 0);
  if (risk === "stable" && cash >= 0 && row.distressMonths === 0) return "stable";
  if (risk === "tight" && cash >= 0 && row.distressMonths < 2) return "watch";
  if (row.negativeCashMonths >= 6 || row.distressMonths >= 10) return "administration";
  if (row.negativeCashMonths >= 3 || row.distressMonths >= 6) return "emergency";
  if (row.negativeCashMonths >= 2 || row.distressMonths >= 4) return "spending_freeze";
  if (cash < 0 || risk === "critical" || row.distressMonths >= 2) return "warning";
  return "watch";
}

export function assessFinancialCrisisMonth(saveWorld, teamId, date = saveWorld.clock?.date) {
  const row = ensureFinancialCrisisTeam(saveWorld, teamId, date);
  const finance = financialPlanningProjection(saveWorld, teamId);
  if (!finance) return { teamId, before: row.stage, after: row.stage, changed: false, finance: null };
  const distressed = ["critical", "distressed"].includes(finance.riskLevel);
  const negative = numeric(finance.cash, 0) < 0;

  if (distressed || negative) {
    row.distressMonths = Number(row.distressMonths ?? 0) + 1;
    row.recoveryMonths = 0;
  } else if (finance.riskLevel === "tight") {
    row.distressMonths = Math.max(0, Number(row.distressMonths ?? 0) - 1);
    row.recoveryMonths = 0;
  } else {
    row.distressMonths = 0;
    row.recoveryMonths = Number(row.recoveryMonths ?? 0) + 1;
  }
  row.negativeCashMonths = negative ? Number(row.negativeCashMonths ?? 0) + 1 : 0;

  const before = row.stage ?? "stable";
  const after = deriveStage(row, finance);
  if (after === "administration") row.administrationMonths = Number(row.administrationMonths ?? 0) + 1;
  else row.administrationMonths = 0;

  if (STAGE_ORDER[after] >= STAGE_ORDER.spending_freeze) {
    row.spendingFreeze = true;
    row.freezeReason = "financial_crisis";
  } else if (after === "stable" && row.recoveryMonths >= 2) {
    row.spendingFreeze = false;
    row.freezeReason = null;
    row.saleMandate = false;
    row.withdrawalRequested = false;
  }

  row.stage = after;
  if (before !== after) row.stageSince = date ?? null;
  row.lastAssessment = {
    date: date ?? null,
    riskLevel: finance.riskLevel,
    cash: finance.cash,
    reserveTarget: finance.reserveTarget,
    runwayMonths: finance.runwayMonths,
    monthlyNet: finance.monthlyNet,
  };

  saveWorld.history.financialCrises.push({
    date: date ?? null,
    season: Number(saveWorld.clock?.season),
    type: "crisis_assessment",
    teamId,
    beforeStage: before,
    afterStage: after,
    distressMonths: row.distressMonths,
    negativeCashMonths: row.negativeCashMonths,
    cash: finance.cash,
    riskLevel: finance.riskLevel,
  });

  return { teamId, before, after, changed: before !== after, finance, crisis: structuredClone(row) };
}

function recordIntervention(saveWorld, teamId, type, input = {}) {
  const state = ensureFinancialCrisisState(saveWorld);
  const row = {
    id: nextId(saveWorld, "finance-intervention"),
    date: input.date ?? saveWorld.clock?.date ?? null,
    season: Number(saveWorld.clock?.season),
    teamId,
    type,
    source: input.source ?? "simulation",
    amount: input.amount === null || input.amount === undefined ? null : roundMoney(input.amount),
    debtAdded: input.debtAdded === null || input.debtAdded === undefined ? 0 : roundMoney(input.debtAdded),
    approved: input.approved !== false,
    reason: input.reason ?? null,
  };
  state.interventions.push(row);
  saveWorld.history.financialCrises.push(structuredClone(row));
  return row;
}

function supportHeadroom(row) {
  return Math.max(0, numeric(row?.owner?.supportBudget, 0) - numeric(row?.owner?.supportUsed, 0));
}

function targetLiquidity(saveWorld, teamId) {
  const plan = financialPlanningProjection(saveWorld, teamId);
  if (!plan) return 250_000;
  return Math.max(150_000, plan.reserveTarget * 0.75, plan.monthlyExpenses * 2.5);
}

export function attemptOwnerFunding(saveWorld, teamId, options = {}) {
  const row = ensureFinancialCrisisTeam(saveWorld, teamId, options.date);
  const finance = saveWorld.world?.teamState?.[teamId];
  if (!finance) return { approved: false, reason: "finances_unavailable", amount: 0 };
  const available = supportHeadroom(row);
  if (available <= 0) return { approved: false, reason: "owner_support_exhausted", amount: 0 };

  const support = numeric(row.owner?.supportIndex, 50);
  const patience = numeric(row.owner?.patienceIndex, 50);
  const prior = ensureFinancialCrisisState(saveWorld).interventions
    .filter((item) => item.teamId === teamId && item.type === "owner_funding" && item.approved).length;
  const rng = createRng(`${saveWorld.meta?.seed}|${options.date ?? saveWorld.clock?.date}|owner-support|${teamId}|${prior}`);
  const chance = clamp(0.18 + support / 160 + patience / 350 - prior * 0.13, 0.08, 0.92);
  if (options.force !== true && rng.next() >= chance) {
    const intervention = recordIntervention(saveWorld, teamId, "owner_funding", {
      date: options.date,
      source: options.source,
      approved: false,
      reason: "owner_declined_additional_capital",
    });
    row.lastOwnerFundingAt = options.date ?? saveWorld.clock?.date ?? null;
    return { approved: false, reason: intervention.reason, amount: 0, intervention };
  }

  const cash = numeric(finance.cash, 0);
  const needed = Math.max(0, targetLiquidity(saveWorld, teamId) - cash);
  const amount = roundMoney(Math.min(available, Math.max(100_000, needed)));
  if (amount <= 0) return { approved: false, reason: "no_liquidity_gap", amount: 0 };
  finance.cash = roundMoney(cash + amount);
  row.owner.supportUsed = roundMoney(numeric(row.owner.supportUsed, 0) + amount);
  row.lastOwnerFundingAt = options.date ?? saveWorld.clock?.date ?? null;
  row.lastInterventionAt = row.lastOwnerFundingAt;
  const intervention = recordIntervention(saveWorld, teamId, "owner_funding", {
    date: options.date,
    source: options.source,
    amount,
    reason: "owner_capital_injection",
  });
  refreshFinancialPlanningState(saveWorld, teamId);
  return { approved: true, amount, intervention };
}

export function arrangeBridgeFinance(saveWorld, teamId, options = {}) {
  const row = ensureFinancialCrisisTeam(saveWorld, teamId, options.date);
  const finance = saveWorld.world?.teamState?.[teamId];
  if (!finance) return { approved: false, amount: 0, reason: "finances_unavailable" };
  const plan = financialPlanningProjection(saveWorld, teamId);
  const cash = numeric(finance.cash, 0);
  const target = Math.max(100_000, (plan?.monthlyExpenses ?? 0) * 2, (plan?.reserveTarget ?? 0) * 0.45);
  const amount = roundMoney(Math.max(125_000, target - cash));
  const reputation = teamReputation(saveWorld, teamId);
  const crisisPremium = row.stage === "administration" ? 0.06 : row.stage === "emergency" ? 0.04 : 0.025;
  const annualRate = clamp(0.065 + crisisPremium + (60 - reputation) / 1000, 0.07, 0.2);

  finance.cash = roundMoney(cash + amount);
  row.debtPrincipal = roundMoney(numeric(row.debtPrincipal, 0) + amount);
  row.debtAnnualRate = Number(annualRate.toFixed(4));
  row.debtTermMonths = row.stage === "administration" ? 60 : 48;
  row.lastBridgeFinanceAt = options.date ?? saveWorld.clock?.date ?? null;
  row.lastInterventionAt = row.lastBridgeFinanceAt;
  const intervention = recordIntervention(saveWorld, teamId, "bridge_finance", {
    date: options.date,
    source: options.source,
    amount,
    debtAdded: amount,
    reason: options.reason ?? "emergency_liquidity",
  });
  refreshFinancialPlanningState(saveWorld, teamId);
  return { approved: true, amount, annualRate: row.debtAnnualRate, intervention };
}

export function monthlyCrisisDebtService(saveWorld, teamId) {
  const row = ensureFinancialCrisisTeam(saveWorld, teamId);
  const principal = Math.max(0, numeric(row.debtPrincipal, 0));
  if (principal <= 0) return { total: 0, interest: 0, principal: 0 };
  const rate = clamp(numeric(row.debtAnnualRate, 0.11), 0, 0.3);
  const interest = principal * rate / 12;
  const term = Math.max(12, numeric(row.debtTermMonths, 48));
  const principalPayment = Math.min(principal, principal / term);
  return {
    total: roundMoney(interest + principalPayment),
    interest: roundMoney(interest),
    principal: roundMoney(principalPayment),
  };
}

export function applyCrisisDebtService(saveWorld, teamId, payment, date = saveWorld.clock?.date) {
  const row = ensureFinancialCrisisTeam(saveWorld, teamId, date);
  const principalPaid = Math.min(Math.max(0, numeric(payment?.principal, 0)), Math.max(0, numeric(row.debtPrincipal, 0)));
  if (principalPaid <= 0 && numeric(payment?.interest, 0) <= 0) return row;
  row.debtPrincipal = roundMoney(Math.max(0, numeric(row.debtPrincipal, 0) - principalPaid));
  row.debtPaymentsMade = Number(row.debtPaymentsMade ?? 0) + 1;
  row.lastDebtServiceAt = date ?? null;
  return row;
}

export function mandateOwnershipSale(saveWorld, teamId, source = "crisis_response") {
  const row = ensureFinancialCrisisTeam(saveWorld, teamId);
  row.saleMandate = true;
  row.lastOwnershipReviewAt = saveWorld.clock?.date ?? null;
  recordIntervention(saveWorld, teamId, "ownership_sale_mandate", {
    source,
    reason: "seek_new_capital",
  });
  return structuredClone(row);
}

export function attemptOwnershipRescue(saveWorld, teamId, options = {}) {
  const row = ensureFinancialCrisisTeam(saveWorld, teamId, options.date);
  const finance = saveWorld.world?.teamState?.[teamId];
  if (!finance) return { acquired: false, reason: "finances_unavailable" };
  const state = ensureFinancialCrisisState(saveWorld);
  const generation = Number(row.owner?.generation ?? 0) + 1;
  const reputation = teamReputation(saveWorld, teamId);
  const activeTeams = saveWorld.world?.teams?.length ?? 0;
  const rng = createRng(`${saveWorld.meta?.seed}|${options.date ?? saveWorld.clock?.date}|ownership-rescue|${teamId}|${generation}`);
  const gridScarcityBonus = activeTeams <= 12 ? 0.16 : activeTeams <= 15 ? 0.08 : 0;
  const chance = clamp(0.22 + reputation / 180 + gridScarcityBonus + (row.saleMandate ? 0.14 : 0), 0.2, 0.92);
  row.lastOwnershipReviewAt = options.date ?? saveWorld.clock?.date ?? null;
  if (options.force !== true && rng.next() >= chance) {
    recordIntervention(saveWorld, teamId, "ownership_review", {
      date: options.date,
      source: options.source,
      approved: false,
      reason: "no_buyer_completed_due_diligence",
    });
    return { acquired: false, reason: "no_buyer_completed_due_diligence" };
  }

  const previousOwner = structuredClone(row.owner);
  const indices = ownershipSeed(saveWorld, teamId, generation);
  const acquisitionId = nextId(saveWorld, "ownership-change");
  const plan = financialPlanningProjection(saveWorld, teamId);
  const cash = numeric(finance.cash, 0);
  const injection = roundMoney(Math.max(
    250_000,
    (plan?.monthlyExpenses ?? 0) * 4,
    (plan?.reserveTarget ?? 0) - cash,
    Math.max(0, numeric(finance.openingCash, 0)) * 0.4,
  ));
  const debtBefore = Math.max(0, numeric(row.debtPrincipal, 0));
  const refinanced = roundMoney(debtBefore * (0.3 + rng.next() * 0.25));
  row.debtPrincipal = roundMoney(Math.max(0, debtBefore - refinanced));
  finance.cash = roundMoney(cash + injection);
  row.owner = {
    ownershipId: acquisitionId,
    teamId,
    generation,
    model: rng.next() < 0.38 ? "strategic_investment_group" : rng.next() < 0.68 ? "private_investment_consortium" : "manufacturer_partner_group",
    displayLabel: `Ownership group ${generation + 1}`,
    acquiredAt: options.date ?? saveWorld.clock?.date ?? null,
    acquiredSeason: Number(saveWorld.clock?.season),
    source: "save_world_ownership_change",
    supportIndex: indices.supportIndex,
    patienceIndex: indices.patienceIndex,
    riskAppetite: indices.riskAppetite,
    supportBudget: roundMoney(Math.max(350_000, injection * (1.2 + indices.supportIndex / 100))),
    supportUsed: 0,
  };
  row.saleMandate = false;
  row.withdrawalRequested = false;
  row.negativeCashMonths = 0;
  row.distressMonths = Math.max(0, Number(row.distressMonths ?? 0) - 4);
  row.administrationMonths = 0;
  row.stage = "warning";
  row.stageSince = options.date ?? saveWorld.clock?.date ?? null;
  row.spendingFreeze = true;
  row.freezeReason = "post_acquisition_restructuring";
  row.lastInterventionAt = row.stageSince;

  const ownershipChange = {
    id: acquisitionId,
    date: row.stageSince,
    season: Number(saveWorld.clock?.season),
    teamId,
    teamName: teamName(saveWorld, teamId),
    previousOwnershipId: previousOwner?.ownershipId ?? null,
    newOwnershipId: row.owner.ownershipId,
    previousModel: previousOwner?.model ?? null,
    newModel: row.owner.model,
    capitalInjection: injection,
    debtRefinanced: refinanced,
    source: options.source ?? "financial_crisis_resolution",
  };
  state.ownershipChanges.push(ownershipChange);
  saveWorld.history.ownership.push(structuredClone(ownershipChange));
  recordIntervention(saveWorld, teamId, "ownership_recapitalization", {
    date: row.stageSince,
    source: options.source,
    amount: injection,
    reason: "new_owner_recapitalization",
  });
  refreshFinancialPlanningState(saveWorld, teamId);
  return { acquired: true, ownershipChange, capitalInjection: injection, debtRefinanced: refinanced };
}

export function setFinancialCrisisCostFreeze(saveWorld, teamId, source = "crisis_response") {
  const row = ensureFinancialCrisisTeam(saveWorld, teamId);
  row.spendingFreeze = true;
  row.freezeReason = source;
  row.deferredCommitments = Number(row.deferredCommitments ?? 0) + 1;
  recordIntervention(saveWorld, teamId, "spending_freeze", {
    source,
    reason: "protect_liquidity",
  });
  return structuredClone(row);
}

export function submitFinancialCrisisResponse(saveWorld, teamId, action, options = {}) {
  const row = ensureFinancialCrisisTeam(saveWorld, teamId);
  const allowed = new Set(["freeze_spending", "seek_owner_support", "seek_investor", "voluntary_withdrawal"]);
  if (!allowed.has(action)) throw new Error(`Unsupported financial-crisis response '${action}'.`);
  if (action === "voluntary_withdrawal" && !["emergency", "administration"].includes(row.stage)) {
    throw new Error("Voluntary withdrawal is only available during an emergency or administration.");
  }
  return {
    type: "financial_crisis.response_submitted",
    date: options.date ?? saveWorld.clock?.date ?? null,
    payload: {
      team_id: teamId,
      action,
      source: options.source ?? "manager",
    },
  };
}

export function financialCrisisProjection(saveWorld, teamId) {
  if (!teamId) return null;
  const row = ensureFinancialCrisisTeam(saveWorld, teamId);
  return {
    teamId,
    stage: row.stage,
    stageSince: row.stageSince,
    distressMonths: row.distressMonths,
    negativeCashMonths: row.negativeCashMonths,
    administrationMonths: row.administrationMonths,
    spendingFreeze: row.spendingFreeze,
    freezeReason: row.freezeReason,
    debtPrincipal: roundMoney(row.debtPrincipal),
    debtAnnualRate: numeric(row.debtAnnualRate, 0),
    debtService: monthlyCrisisDebtService(saveWorld, teamId),
    saleMandate: Boolean(row.saleMandate),
    withdrawalRequested: Boolean(row.withdrawalRequested),
    owner: structuredClone(row.owner),
    lastAssessment: structuredClone(row.lastAssessment),
    availableResponses: ["stable", "watch"].includes(row.stage)
      ? []
      : ["freeze_spending", "seek_owner_support", "seek_investor", ...(["emergency", "administration"].includes(row.stage) ? ["voluntary_withdrawal"] : [])],
  };
}
