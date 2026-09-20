import {
  arrangeBridgeFinance,
  assessFinancialCrisisMonth,
  attemptOwnerFunding,
  attemptOwnershipRescue,
  ensureFinancialCrisisState,
  ensureFinancialCrisisTeam,
  initializeFinancialCrisisWorld,
  mandateOwnershipSale,
  setFinancialCrisisCostFreeze,
} from "../../game/management/financialCrisis.js";
import { exitTeam, TEAM_EVOLUTION_EVENT } from "../../game/management/teamEvolution.js";
import { regulationPackage } from "../../game/management/regulations.js";
import { SIM_EVENT } from "../timeEngine.js";
import { TEAM_FINANCE_EVENT } from "./teamEconomy.js";
import { EMPLOYMENT_EVENT } from "./employmentMarket.js";
import { controlledTeamSet } from "./controlState.js";

export const FINANCIAL_CRISIS_EVENT = Object.freeze({
  INITIALIZED: "financial_crisis.initialized",
  STAGE_CHANGED: "financial_crisis.stage_changed",
  SPENDING_FREEZE: "financial_crisis.spending_freeze",
  OWNER_FUNDING: "financial_crisis.owner_funding",
  BRIDGE_FINANCE: "financial_crisis.bridge_finance",
  OWNERSHIP_CHANGED: "financial_crisis.ownership_changed",
  RESPONSE_REQUIRED: "financial_crisis.response_required",
  RESPONSE_SUBMITTED: "financial_crisis.response_submitted",
  RESPONSE_RESOLVED: "financial_crisis.response_resolved",
  ADMINISTRATION: "financial_crisis.administration",
  RECOVERED: "financial_crisis.recovered",
  WITHDRAWAL_BLOCKED: "financial_crisis.withdrawal_blocked",
});

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function monthIndex(date) {
  const year = Number(String(date ?? "").slice(0, 4));
  const month = Number(String(date ?? "").slice(5, 7));
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  return year * 12 + month;
}

function monthsSince(date, current) {
  const from = monthIndex(date);
  const to = monthIndex(current);
  return from === null || to === null ? Infinity : Math.max(0, to - from);
}

function minimumGrid(saveWorld) {
  return Number(regulationPackage(saveWorld)?.grid?.minTeams ?? 10);
}

function canExitTeam(saveWorld) {
  return (saveWorld.world?.teams?.length ?? 0) > minimumGrid(saveWorld);
}

function fundingEvent(result, teamId, source) {
  if (!result?.approved) return null;
  return {
    type: FINANCIAL_CRISIS_EVENT.OWNER_FUNDING,
    payload: {
      team_id: teamId,
      amount: result.amount,
      intervention_id: result.intervention?.id ?? null,
      source,
    },
  };
}

function bridgeEvent(result, teamId, source) {
  if (!result?.approved) return null;
  return {
    type: FINANCIAL_CRISIS_EVENT.BRIDGE_FINANCE,
    payload: {
      team_id: teamId,
      amount: result.amount,
      annual_rate: result.annualRate,
      intervention_id: result.intervention?.id ?? null,
      source,
    },
  };
}

function ownershipEvent(result, teamId, source) {
  if (!result?.acquired) return null;
  return {
    type: FINANCIAL_CRISIS_EVENT.OWNERSHIP_CHANGED,
    payload: {
      team_id: teamId,
      ownership_change_id: result.ownershipChange?.id ?? null,
      previous_ownership_id: result.ownershipChange?.previousOwnershipId ?? null,
      new_ownership_id: result.ownershipChange?.newOwnershipId ?? null,
      previous_model: result.ownershipChange?.previousModel ?? null,
      new_model: result.ownershipChange?.newModel ?? null,
      capital_injection: result.capitalInjection,
      debt_refinanced: result.debtRefinanced,
      source,
    },
  };
}

function exitEvents(saveWorld, teamId, reason) {
  if (!canExitTeam(saveWorld)) {
    return [{
      type: FINANCIAL_CRISIS_EVENT.WITHDRAWAL_BLOCKED,
      payload: {
        team_id: teamId,
        reason: "minimum_grid_protection",
        minimum_teams: minimumGrid(saveWorld),
      },
    }];
  }
  const exited = exitTeam(saveWorld, teamId, { reason });
  const output = [{
    type: TEAM_EVOLUTION_EVENT.TEAM_EXITED,
    payload: {
      team_id: teamId,
      season: Number(saveWorld.clock?.season),
      reason: exited.reason,
      released_workers: exited.releasedWorkers,
      financial_crisis: true,
    },
  }];
  for (const worker of exited.released ?? []) {
    output.push({
      type: EMPLOYMENT_EVENT.FREE_AGENT,
      payload: {
        worker_type: worker.type,
        worker_id: worker.id,
        reason: "financial_crisis_team_exit",
      },
    });
  }
  return output;
}

function responseRequired(event, assessment) {
  return {
    type: FINANCIAL_CRISIS_EVENT.RESPONSE_REQUIRED,
    payload: {
      team_id: assessment.teamId,
      stage: assessment.after,
      cash: assessment.finance?.cash ?? null,
      monthly_net: assessment.finance?.monthlyNet ?? null,
      runway_months: assessment.finance?.runwayMonths ?? null,
      distress_months: assessment.crisis?.distressMonths ?? 0,
      negative_cash_months: assessment.crisis?.negativeCashMonths ?? 0,
      source_event_id: event.id,
    },
  };
}

function applyResponse(saveWorld, event) {
  const teamId = event.payload?.team_id ?? null;
  const action = event.payload?.action ?? null;
  if (!teamId || !action) return null;
  const row = ensureFinancialCrisisTeam(saveWorld, teamId, event.date);
  const source = event.payload?.source ?? "manager";
  const output = [];

  if (action === "freeze_spending") {
    setFinancialCrisisCostFreeze(saveWorld, teamId, source);
    output.push({
      type: FINANCIAL_CRISIS_EVENT.SPENDING_FREEZE,
      payload: { team_id: teamId, stage: row.stage, source },
    });
  } else if (action === "seek_owner_support") {
    const result = attemptOwnerFunding(saveWorld, teamId, { date: event.date, source });
    const emitted = fundingEvent(result, teamId, source);
    if (emitted) output.push(emitted);
  } else if (action === "seek_investor") {
    mandateOwnershipSale(saveWorld, teamId, source);
    const result = attemptOwnershipRescue(saveWorld, teamId, { date: event.date, source });
    const emitted = ownershipEvent(result, teamId, source);
    if (emitted) output.push(emitted);
  } else if (action === "voluntary_withdrawal") {
    row.withdrawalRequested = true;
    output.push(...exitEvents(saveWorld, teamId, "voluntary_financial_withdrawal"));
  }

  output.push({
    type: FINANCIAL_CRISIS_EVENT.RESPONSE_RESOLVED,
    payload: {
      team_id: teamId,
      action,
      stage: row.stage,
      source,
    },
  });
  return output;
}

function maybeAutomaticIntervention(saveWorld, event, assessment, controlled) {
  const teamId = assessment.teamId;
  const row = ensureFinancialCrisisTeam(saveWorld, teamId, event.date);
  const stage = row.stage;
  const isControlled = controlled.has(String(teamId));
  const output = [];

  if (["spending_freeze", "emergency", "administration"].includes(stage) && row.freezeReason !== "financial_crisis") {
    setFinancialCrisisCostFreeze(saveWorld, teamId, "financial_crisis");
    output.push({
      type: FINANCIAL_CRISIS_EVENT.SPENDING_FREEZE,
      payload: { team_id: teamId, stage, source: "board_crisis_policy" },
    });
  }

  if (stage === "spending_freeze" && !isControlled && row.distressMonths >= 5 && monthsSince(row.lastOwnerFundingAt, event.date) >= 6) {
    const result = attemptOwnerFunding(saveWorld, teamId, { date: event.date, source: "ai_team_crisis_policy" });
    const emitted = fundingEvent(result, teamId, "ai_team_crisis_policy");
    if (emitted) output.push(emitted);
  }

  if (stage === "emergency") {
    const ownerDue = monthsSince(row.lastOwnerFundingAt, event.date) >= 6;
    let ownerApproved = false;
    if (ownerDue && (!isControlled || row.negativeCashMonths >= 4)) {
      const result = attemptOwnerFunding(saveWorld, teamId, {
        date: event.date,
        source: isControlled ? "owner_emergency_intervention" : "ai_team_crisis_policy",
      });
      ownerApproved = result.approved === true;
      const emitted = fundingEvent(result, teamId, isControlled ? "owner_emergency_intervention" : "ai_team_crisis_policy");
      if (emitted) output.push(emitted);
    }
    if (!ownerApproved && monthsSince(row.lastBridgeFinanceAt, event.date) >= 5 && row.negativeCashMonths >= 4) {
      const result = arrangeBridgeFinance(saveWorld, teamId, {
        date: event.date,
        source: isControlled ? "board_emergency_finance" : "ai_team_crisis_policy",
      });
      const emitted = bridgeEvent(result, teamId, isControlled ? "board_emergency_finance" : "ai_team_crisis_policy");
      if (emitted) output.push(emitted);
    }
  }

  if (stage === "administration") {
    output.push({
      type: FINANCIAL_CRISIS_EVENT.ADMINISTRATION,
      payload: {
        team_id: teamId,
        administration_months: row.administrationMonths,
        debt_principal: row.debtPrincipal,
      },
    });

    if (!row.saleMandate && (!isControlled || row.administrationMonths >= 2)) {
      mandateOwnershipSale(saveWorld, teamId, isControlled ? "administrator_sale_process" : "ai_team_crisis_policy");
    }
    if (row.saleMandate && monthsSince(row.lastOwnershipReviewAt, event.date) >= 1) {
      const result = attemptOwnershipRescue(saveWorld, teamId, {
        date: event.date,
        source: isControlled ? "administrator_sale_process" : "ai_team_crisis_policy",
      });
      const emitted = ownershipEvent(result, teamId, isControlled ? "administrator_sale_process" : "ai_team_crisis_policy");
      if (emitted) output.push(emitted);
    }

    const refreshed = ensureFinancialCrisisTeam(saveWorld, teamId, event.date);
    if (!isControlled && refreshed.stage === "administration" && refreshed.administrationMonths >= 4) {
      output.push(...exitEvents(saveWorld, teamId, "financial_administration_unresolved"));
    } else if (isControlled && refreshed.withdrawalRequested) {
      output.push(...exitEvents(saveWorld, teamId, "voluntary_financial_withdrawal"));
    }
  }

  return output;
}

function processMonth(saveWorld, event, controlled) {
  const teamId = event.payload?.teamId ?? event.payload?.team_id ?? null;
  if (!teamId || !saveWorld.world?.teamState?.[teamId]) return null;
  const assessment = assessFinancialCrisisMonth(saveWorld, teamId, event.date);
  const output = [];

  if (assessment.changed) {
    output.push({
      type: FINANCIAL_CRISIS_EVENT.STAGE_CHANGED,
      payload: {
        team_id: teamId,
        previous_stage: assessment.before,
        stage: assessment.after,
        distress_months: assessment.crisis?.distressMonths ?? 0,
        negative_cash_months: assessment.crisis?.negativeCashMonths ?? 0,
        cash: assessment.finance?.cash ?? null,
        risk_level: assessment.finance?.riskLevel ?? null,
      },
    });
    if (assessment.after === "stable") {
      output.push({
        type: FINANCIAL_CRISIS_EVENT.RECOVERED,
        payload: { team_id: teamId, previous_stage: assessment.before },
      });
    } else if (controlled.has(String(teamId)) && !["watch"].includes(assessment.after)) {
      output.push(responseRequired(event, assessment));
    }
  }

  output.push(...maybeAutomaticIntervention(saveWorld, event, assessment, controlled));
  return output;
}

export function createFinancialCrisisSystem(options = {}) {
  return {
    id: "team.financial-crisis",
    eventTypes: [
      SIM_EVENT.CAREER_STARTED,
      TEAM_FINANCE_EVENT.MONTH_CLOSED,
      FINANCIAL_CRISIS_EVENT.RESPONSE_SUBMITTED,
    ],
    handle({ saveWorld, event }) {
      const controlled = controlledTeamSet(saveWorld, options.controlledTeamIds ?? []);
      if (event.type === SIM_EVENT.CAREER_STARTED) {
        const summary = initializeFinancialCrisisWorld(saveWorld, event.date);
        return { type: FINANCIAL_CRISIS_EVENT.INITIALIZED, payload: summary };
      }
      if (event.type === FINANCIAL_CRISIS_EVENT.RESPONSE_SUBMITTED) {
        return applyResponse(saveWorld, event);
      }
      return processMonth(saveWorld, event, controlled);
    },
  };
}
