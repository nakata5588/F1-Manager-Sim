export const FINANCIAL_STRATEGIES = Object.freeze({
  conservative: { reserveMonths: 3, reserveRatio: 0.12, recurringToleranceMonths: 8 },
  balanced: { reserveMonths: 2, reserveRatio: 0.08, recurringToleranceMonths: 5 },
  aggressive: { reserveMonths: 1, reserveRatio: 0.04, recurringToleranceMonths: 3 },
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

function financeModel(saveWorld, teamId) {
  return (saveWorld.world?.financeModels ?? saveWorld.world?.seasonPack?.financeModels ?? [])
    .find((row) => String(row?.team_id ?? "") === String(teamId ?? "")) ?? {};
}

function modelMonthlyBurn(model) {
  return numeric(model.estimated_monthly_operating_burn_units)
    ?? (numeric(model.estimated_monthly_operating_burn_m) === null
      ? null
      : numeric(model.estimated_monthly_operating_burn_m) * 1_000_000);
}

function modelSponsorIncome(model) {
  const annual = numeric(model.estimated_sponsor_income_units)
    ?? (numeric(model.estimated_sponsor_income_m) === null
      ? null
      : numeric(model.estimated_sponsor_income_m) * 1_000_000);
  return annual === null ? null : annual / 12;
}

function inferredStrategy(saveWorld, teamId) {
  const explicit = saveWorld.world?.teamState?.[teamId]?.financialPlanning?.strategy;
  if (FINANCIAL_STRATEGIES[explicit]) return explicit;

  const offseason = saveWorld.world?.technical?.teams?.[teamId]?.seasonStrategy?.financialRisk;
  if (FINANCIAL_STRATEGIES[offseason]) return offseason;

  const aggression = numeric(financeModel(saveWorld, teamId)?.cost_control_aggression, 50);
  if (aggression >= 68) return "conservative";
  if (aggression <= 32) return "aggressive";
  return "balanced";
}

export function ensureFinancialPlanningState(saveWorld, teamId) {
  const finance = saveWorld.world?.teamState?.[teamId];
  if (!finance) throw new Error(`Team '${teamId}' does not have initialized finances.`);
  finance.financialPlanning ??= {
    strategy: inferredStrategy(saveWorld, teamId),
    updatedAt: saveWorld.clock?.date ?? null,
    source: "save_world_financial_policy",
  };
  if (!FINANCIAL_STRATEGIES[finance.financialPlanning.strategy]) {
    finance.financialPlanning.strategy = inferredStrategy(saveWorld, teamId);
  }
  return finance.financialPlanning;
}

function recurringValues(saveWorld, teamId) {
  const finance = saveWorld.world?.teamState?.[teamId] ?? {};
  const model = financeModel(saveWorld, teamId);
  const hasClosedMonth = Boolean(
    (finance.lastExpenseBreakdown && Object.keys(finance.lastExpenseBreakdown).length)
      || (finance.lastIncomeBreakdown && Object.keys(finance.lastIncomeBreakdown).length)
      || Number(finance.monthlyExpenses) > 0
      || Number(finance.monthlyIncome) > 0
  );
  const income = hasClosedMonth
    ? numeric(finance.monthlyIncome, 0)
    : numeric(finance.projectedMonthlyIncome, modelSponsorIncome(model) ?? 0);
  const expenses = hasClosedMonth
    ? numeric(finance.monthlyExpenses, 0)
    : numeric(finance.projectedMonthlyExpenses, modelMonthlyBurn(model) ?? 0);
  return {
    income: Math.max(0, income ?? 0),
    expenses: Math.max(0, expenses ?? 0),
    net: (income ?? 0) - (expenses ?? 0),
    source: hasClosedMonth ? "save_world_monthly_close" : modelMonthlyBurn(model) !== null ? "gameplay_finance_model_estimate" : "save_world_opening_state",
  };
}

function strategyConfig(saveWorld, teamId) {
  const strategy = ensureFinancialPlanningState(saveWorld, teamId).strategy;
  return { strategy, ...FINANCIAL_STRATEGIES[strategy] };
}

export function financialPlanningProjection(saveWorld, teamId) {
  if (!teamId) return null;
  const finance = saveWorld.world?.teamState?.[teamId];
  if (!finance) return null;
  const policy = strategyConfig(saveWorld, teamId);
  const recurring = recurringValues(saveWorld, teamId);
  const cash = numeric(finance.cash, 0);
  const openingCash = Math.max(0, numeric(finance.openingCash, cash));
  const reserveTarget = Math.max(
    50_000,
    openingCash * policy.reserveRatio,
    recurring.expenses * policy.reserveMonths,
  );
  const monthlyBurn = Math.max(0, recurring.expenses - recurring.income);
  const runwayMonths = monthlyBurn > 0 ? Math.max(0, cash) / monthlyBurn : null;
  const availableToCommit = Math.max(0, cash - reserveTarget);
  const breakdown = finance.lastExpenseBreakdown ?? {};
  const payroll = numeric(breakdown.driverSalaries, 0) + numeric(breakdown.staffSalaries, 0);
  const sponsors = numeric(finance.lastIncomeBreakdown?.sponsors, recurring.income);
  const salaryBurden = recurring.expenses > 0 ? payroll / recurring.expenses : null;
  const sponsorCoverage = recurring.expenses > 0 ? sponsors / recurring.expenses : null;

  let riskLevel = "stable";
  if (cash < 0 || (runwayMonths !== null && runwayMonths < 2)) riskLevel = "critical";
  else if (cash < reserveTarget || (runwayMonths !== null && runwayMonths < 4)) riskLevel = "distressed";
  else if (recurring.net < 0 || (runwayMonths !== null && runwayMonths < policy.recurringToleranceMonths)) riskLevel = "tight";

  return {
    teamId,
    strategy: policy.strategy,
    cash: roundMoney(cash),
    openingCash: roundMoney(openingCash),
    monthlyIncome: roundMoney(recurring.income),
    monthlyExpenses: roundMoney(recurring.expenses),
    monthlyNet: roundMoney(recurring.net),
    annualizedNet: roundMoney(recurring.net * 12),
    reserveTarget: roundMoney(reserveTarget),
    availableToCommit: roundMoney(availableToCommit),
    runwayMonths: runwayMonths === null ? null : Number(runwayMonths.toFixed(2)),
    salaryBurden: salaryBurden === null ? null : Number(salaryBurden.toFixed(4)),
    sponsorCoverage: sponsorCoverage === null ? null : Number(sponsorCoverage.toFixed(4)),
    riskLevel,
    recurringSource: recurring.source,
    expenseBreakdown: structuredClone(finance.lastExpenseBreakdown ?? {}),
    incomeBreakdown: structuredClone(finance.lastIncomeBreakdown ?? {}),
    model: {
      dataStatus: financeModel(saveWorld, teamId)?.data_status ?? null,
      costControlAggression: numeric(financeModel(saveWorld, teamId)?.cost_control_aggression, null),
      estimatedMonthlyBurn: roundMoney(modelMonthlyBurn(financeModel(saveWorld, teamId)) ?? 0),
    },
  };
}

export function refreshFinancialPlanningState(saveWorld, teamId) {
  const finance = saveWorld.world?.teamState?.[teamId];
  if (!finance) return null;
  const projection = financialPlanningProjection(saveWorld, teamId);
  finance.financialRisk = projection.riskLevel;
  finance.reserveTarget = projection.reserveTarget;
  finance.availableToCommit = projection.availableToCommit;
  finance.runwayMonths = projection.runwayMonths;
  finance.financialStatus = projection.riskLevel === "critical" ? "distressed" : projection.riskLevel;
  finance.financialPlanning.updatedAt = saveWorld.clock?.date ?? null;
  return projection;
}

export function setFinancialStrategy(saveWorld, teamId, strategy) {
  if (!FINANCIAL_STRATEGIES[strategy]) throw new Error(`Unknown financial strategy '${strategy}'.`);
  const state = ensureFinancialPlanningState(saveWorld, teamId);
  state.strategy = strategy;
  state.updatedAt = saveWorld.clock?.date ?? null;
  state.source = "manager_or_ai_strategy";
  refreshFinancialPlanningState(saveWorld, teamId);
  return financialPlanningProjection(saveWorld, teamId);
}

export function assessFinancialCommitment(saveWorld, teamId, input = {}) {
  const projection = financialPlanningProjection(saveWorld, teamId);
  if (!projection) {
    return { allowed: false, reason: "finances_unavailable", teamId, upfront: 0, monthlyAdded: 0 };
  }
  const upfront = Math.max(0, numeric(input.upfront ?? input.amount, 0));
  const monthlyAdded = Math.max(0, numeric(input.monthlyAdded, 0));
  const crisis = saveWorld.world?.financialCrisis?.teams?.[teamId] ?? null;
  const crisisEssentialKinds = new Set(["reliability", "supplier_contract", "mandatory_supplier", "emergency_repair"]);
  const crisisFreeze = crisis?.spendingFreeze === true
    && !crisisEssentialKinds.has(String(input.kind ?? "general"))
    && input.allowCrisisFreeze !== true;
  const allowReserveBreach = input.allowReserveBreach === true;
  const strictRecurring = input.strictRecurring === true;
  const cashAfter = projection.cash - upfront;
  const projectedMonthlyNet = projection.monthlyNet - monthlyAdded;
  const projectedBurn = Math.max(0, -projectedMonthlyNet);
  const runwayAfter = projectedBurn > 0 ? Math.max(0, cashAfter) / projectedBurn : null;
  const reserveBreach = cashAfter < projection.reserveTarget;
  const cashShortfall = cashAfter < 0;
  const recurringRisk = strictRecurring
    && runwayAfter !== null
    && runwayAfter < FINANCIAL_STRATEGIES[projection.strategy].recurringToleranceMonths;

  let reason = "affordable";
  if (crisisFreeze) reason = "financial_crisis_spending_freeze";
  else if (cashShortfall) reason = "insufficient_cash";
  else if (reserveBreach && !allowReserveBreach) reason = "cash_reserve_breach";
  else if (recurringRisk && !allowReserveBreach) reason = "recurring_commitment_too_risky";

  return {
    allowed: reason === "affordable",
    reason,
    kind: input.kind ?? "general",
    teamId,
    strategy: projection.strategy,
    upfront: roundMoney(upfront),
    monthlyAdded: roundMoney(monthlyAdded),
    cashBefore: projection.cash,
    cashAfter: roundMoney(cashAfter),
    reserveTarget: projection.reserveTarget,
    reserveBreach,
    crisisFreeze,
    crisisStage: crisis?.stage ?? null,
    projectedMonthlyNet: roundMoney(projectedMonthlyNet),
    runwayAfter: runwayAfter === null ? null : Number(runwayAfter.toFixed(2)),
  };
}

export function assertFinancialCommitment(saveWorld, teamId, input = {}) {
  const assessment = assessFinancialCommitment(saveWorld, teamId, input);
  if (!assessment.allowed) {
    const label = input.label ?? input.kind ?? "this commitment";
    if (assessment.reason === "insufficient_cash") {
      throw new Error(`Team '${teamId}' does not have enough cash for ${label}.`);
    }
    if (assessment.reason === "cash_reserve_breach") {
      throw new Error(`Team '${teamId}' cannot fund ${label} without breaching its ${assessment.strategy} cash reserve.`);
    }
    if (assessment.reason === "financial_crisis_spending_freeze") {
      throw new Error(`Team '${teamId}' cannot approve ${label} while a financial-crisis spending freeze is active.`);
    }
    throw new Error(`Team '${teamId}' cannot responsibly afford ${label} under its current financial plan.`);
  }
  return assessment;
}

export function financeModelMonthlyBurn(saveWorld, teamId) {
  return modelMonthlyBurn(financeModel(saveWorld, teamId));
}
