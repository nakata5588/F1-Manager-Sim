import { boardProjection, evaluateBoard, renewBoardSeason } from "./board.js";
import { commercialProjection } from "./commercial.js";
import { preseasonProjection } from "./preseason.js";
import { regulationProjection } from "./regulations.js";
import { supplierProjection } from "./suppliers.js";
import { teamEvolutionProjection } from "./teamEvolution.js";

export const OFFSEASON_EVENT = Object.freeze({
  OPENED: "offseason.opened",
  STAGE_CHANGED: "offseason.stage_changed",
  PLAN_UPDATED: "offseason.plan_updated",
  PLAN_CONFIRMED: "offseason.plan_confirmed",
  SEASON_PREPARED: "offseason.season_prepared",
  COMPLETED: "offseason.completed",
});

const TECHNICAL_FOCUS = new Set(["balanced", "performance", "reliability"]);
const STAFFING_FOCUS = new Set(["retain", "selective", "rebuild"]);
const COMMERCIAL_FOCUS = new Set(["retain", "expand"]);
const FINANCIAL_RISK = new Set(["conservative", "balanced", "aggressive"]);

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function teamName(row) {
  return row?.team_name ?? row?.display_name ?? row?.name ?? row?.team_id ?? "Team";
}

function contractEnd(row) {
  for (const field of ["end_season", "end_year", "contract_until", "contract_end", "year"]) {
    const value = Number(row?.[field]);
    if (Number.isInteger(value)) return value;
  }
  return null;
}

function contractStart(row) {
  for (const field of ["start_season", "start_year", "contract_start", "effective_season"]) {
    const value = Number(row?.[field]);
    if (Number.isInteger(value)) return value;
  }
  return null;
}

function workerContractReadiness(saveWorld, teamId, targetSeason, type) {
  const employment = type === "driver" ? saveWorld.world?.employment?.drivers ?? {} : saveWorld.world?.employment?.staff ?? {};
  const contracts = type === "driver" ? saveWorld.world?.contracts ?? [] : saveWorld.world?.staffContracts ?? [];
  const idField = type === "driver" ? "driver_id" : "staff_id";
  const currentIds = Object.entries(employment)
    .filter(([, row]) => row?.status === "employed" && row?.teamId === teamId)
    .map(([id]) => id);

  const expiring = [];
  for (const id of currentIds) {
    const matching = contracts
      .filter((row) => String(row?.[idField]) === String(id) && String(row?.team_id) === String(teamId))
      .sort((a, b) => numeric(contractStart(b), 0) - numeric(contractStart(a), 0));
    const latest = matching[0] ?? null;
    const end = contractEnd(latest);
    if (end !== null && end < targetSeason) expiring.push(id);
  }

  const futureDeals = contracts.filter((row) => {
    const start = contractStart(row);
    return String(row?.team_id) === String(teamId) && start !== null && start >= targetSeason;
  }).length;

  return {
    employed: currentIds.length,
    expiring,
    futureDeals,
    status: expiring.length ? "action_required" : "ready",
  };
}

function constructorRow(championship, teamId) {
  return (championship?.constructorStandings ?? []).find((row) => String(row.id) === String(teamId)) ?? null;
}

function seasonReview(saveWorld, closingSeason, date) {
  const championship = saveWorld.world?.championship ?? {};
  return {
    season: closingSeason,
    closedAt: date,
    racesCompleted: Number(championship.racesCompleted ?? 0),
    expectedRounds: Number(championship.expectedRounds ?? 0) || null,
    standingsStatus: championship.standingsStatus ?? null,
    driverChampionId: championship.driverChampionId ?? null,
    constructorChampionId: championship.constructorChampionId ?? null,
    driverChampionStatus: championship.driverChampionStatus ?? null,
    constructorChampionStatus: championship.constructorChampionStatus ?? null,
    driverStandings: structuredClone(championship.driverStandings ?? []),
    constructorStandings: structuredClone(championship.constructorStandings ?? []),
  };
}

function defaultPlan(saveWorld, teamId) {
  const finance = saveWorld.world?.teamState?.[teamId] ?? {};
  const status = finance.financialStatus ?? "stable";
  return {
    technicalFocus: "balanced",
    staffingFocus: status === "distressed" ? "rebuild" : "retain",
    commercialFocus: status === "distressed" ? "expand" : "retain",
    financialRisk: status === "distressed" || status === "tight" ? "conservative" : "balanced",
  };
}

function planFor(saveWorld, teamId, source, confirmed) {
  return {
    ...defaultPlan(saveWorld, teamId),
    source,
    confirmed: Boolean(confirmed),
    confirmedAt: confirmed ? saveWorld.clock?.date ?? null : null,
    updatedAt: saveWorld.clock?.date ?? null,
  };
}

function preparationStatus(saveWorld, teamId, closingSeason, targetSeason) {
  const supplier = supplierProjection(saveWorld, teamId);
  const commercial = commercialProjection(saveWorld, teamId);
  const technical = saveWorld.world?.technical?.teams?.[teamId] ?? null;
  const regulations = regulationProjection(saveWorld);
  const evolution = teamEvolutionProjection(saveWorld);
  const drivers = workerContractReadiness(saveWorld, teamId, targetSeason, "driver");
  const staff = workerContractReadiness(saveWorld, teamId, targetSeason, "staff");
  const currentSupplierCovers = Number(supplier?.active?.endSeason ?? -Infinity) >= targetSeason;
  const futureSupplierCovers = Number(supplier?.futureDeal?.effectiveSeason ?? Infinity) <= targetSeason
    && Number(supplier?.futureDeal?.endSeason ?? targetSeason) >= targetSeason;
  const sponsorDeals = (commercial?.activeDeals ?? []).filter((row) => Number(row.endSeason ?? closingSeason) >= targetSeason);
  const futureSpecs = Object.values(technical?.specs ?? {}).filter((row) => Number(row.targetSeason) === targetSeason && ["future", "ready_for_manufacture", "active"].includes(row.status));
  const activeFutureDesigns = (technical?.designProjects ?? []).filter((row) => row.status === "active" && Number(row.targetSeason) === targetSeason);
  const targetProposals = (regulations?.openProposals ?? []).filter((row) => Number(row.targetSeason) === targetSeason);
  const targetApplications = (evolution?.applications ?? []).filter((row) => Number(row.targetSeason) === targetSeason && ["pending", "accepted"].includes(row.status));
  const preseason = Number(saveWorld.clock?.season) === targetSeason ? preseasonProjection(saveWorld, teamId) : null;

  return {
    contracts: {
      drivers,
      staff,
      status: drivers.status === "action_required" || staff.status === "action_required" ? "action_required" : "ready",
    },
    supplier: {
      activeEngineId: supplier?.active?.engineId ?? null,
      activeEndSeason: supplier?.active?.endSeason ?? null,
      futureDeal: structuredClone(supplier?.futureDeal ?? null),
      status: currentSupplierCovers || futureSupplierCovers ? "ready" : "action_required",
    },
    commercial: {
      activeDeals: commercial?.activeDeals?.length ?? 0,
      dealsCoveringTargetSeason: sponsorDeals.length,
      monthlySponsorIncome: commercial?.monthlySponsorIncome ?? 0,
      status: sponsorDeals.length ? "ready" : "watch",
    },
    governance: {
      openTargetSeasonProposals: targetProposals.length,
      targetSeasonEntryApplications: targetApplications.length,
      status: targetProposals.length || targetApplications.some((row) => row.status === "pending") ? "pending" : "ready",
    },
    nextSeasonCar: {
      completedTargetSeasonSpecs: futureSpecs.length,
      activeTargetSeasonDesigns: activeFutureDesigns.length,
      status: futureSpecs.length || activeFutureDesigns.length ? "prepared" : "baseline_only",
    },
    preseason: preseason
      ? {
          windowOpen: preseason.windowOpen,
          sessionsCompleted: preseason.sessionsCompleted,
          maxSessions: preseason.maxSessions,
          reliabilityPrep: preseason.reliabilityPrep,
          developmentKnowledge: preseason.developmentKnowledge,
          status: preseason.windowOpen ? "open" : "closed",
        }
      : { status: "not_open", sessionsCompleted: 0, maxSessions: 3 },
  };
}

function stageFor(saveWorld, cycle) {
  if (!cycle || cycle.status === "completed") return "completed";
  const currentSeason = Number(saveWorld.clock?.season);
  const month = Number(String(saveWorld.clock?.date ?? "").slice(5, 7));
  if (currentSeason >= cycle.targetSeason) return "preseason";
  if (month >= 12) return "final_checks";
  if (month >= 11) return "planning";
  return "season_review";
}

export function ensureOffseasonState(saveWorld) {
  saveWorld.world.management ??= {};
  saveWorld.world.management.offseason ??= {
    current: null,
    history: [],
    nextCycleId: 1,
  };
  const state = saveWorld.world.management.offseason;
  state.history ??= [];
  state.nextCycleId = Math.max(1, Math.floor(numeric(state.nextCycleId, 1)));
  return state;
}

export function openOffseasonCycle(saveWorld, options = {}) {
  const state = ensureOffseasonState(saveWorld);
  const closingSeason = Number(options.closingSeason ?? saveWorld.clock?.season);
  if (!Number.isInteger(closingSeason)) throw new TypeError("Closing season must be an integer.");
  if (state.current && Number(state.current.closingSeason) === closingSeason && state.current.status !== "completed") return state.current;

  const targetSeason = closingSeason + 1;
  const controlled = new Set((options.controlledTeamIds ?? saveWorld.player?.controlledTeamIds ?? []).map(String));
  const teams = {};
  for (const team of saveWorld.world?.teams ?? []) {
    const id = team.team_id;
    if (!id) continue;
    const playerControlled = controlled.has(String(id));
    teams[id] = {
      teamId: id,
      teamName: teamName(team),
      controlled: playerControlled,
      plan: planFor(saveWorld, id, playerControlled ? "player_pending" : "ai_default", !playerControlled),
      preparation: preparationStatus(saveWorld, id, closingSeason, targetSeason),
    };
  }

  const cycle = {
    cycleId: `offseason:${closingSeason}:${String(state.nextCycleId++).padStart(3, "0")}`,
    closingSeason,
    targetSeason,
    openedAt: options.date ?? saveWorld.clock?.date ?? null,
    status: "open",
    stage: "season_review",
    stageHistory: [{ stage: "season_review", date: options.date ?? saveWorld.clock?.date ?? null }],
    review: seasonReview(saveWorld, closingSeason, options.date ?? saveWorld.clock?.date),
    teams,
    transitionAt: null,
    completedAt: null,
  };
  state.current = cycle;
  return cycle;
}

export function refreshOffseasonCycle(saveWorld, date = saveWorld.clock?.date) {
  const cycle = ensureOffseasonState(saveWorld).current;
  if (!cycle || cycle.status === "completed") return { cycle, stageChanged: false };
  for (const [teamId, row] of Object.entries(cycle.teams ?? {})) {
    row.preparation = preparationStatus(saveWorld, teamId, cycle.closingSeason, cycle.targetSeason);
  }
  const nextStage = stageFor(saveWorld, cycle);
  const changed = nextStage !== cycle.stage;
  if (changed) {
    cycle.stage = nextStage;
    cycle.stageHistory.push({ stage: nextStage, date });
  }
  return { cycle, stageChanged: changed };
}

export function setOffseasonPlan(saveWorld, teamId, input = {}) {
  const cycle = ensureOffseasonState(saveWorld).current;
  const row = cycle?.teams?.[teamId];
  if (!cycle || cycle.status === "completed") throw new Error("There is no active offseason planning cycle.");
  if (!row) throw new Error(`Team '${teamId}' is not part of the active offseason cycle.`);
  if (!row.controlled) throw new Error("Only a player-controlled team plan may be changed manually.");

  const next = { ...row.plan };
  if (input.technicalFocus !== undefined) {
    if (!TECHNICAL_FOCUS.has(input.technicalFocus)) throw new Error("Unsupported technical focus.");
    next.technicalFocus = input.technicalFocus;
  }
  if (input.staffingFocus !== undefined) {
    if (!STAFFING_FOCUS.has(input.staffingFocus)) throw new Error("Unsupported staffing focus.");
    next.staffingFocus = input.staffingFocus;
  }
  if (input.commercialFocus !== undefined) {
    if (!COMMERCIAL_FOCUS.has(input.commercialFocus)) throw new Error("Unsupported commercial focus.");
    next.commercialFocus = input.commercialFocus;
  }
  if (input.financialRisk !== undefined) {
    if (!FINANCIAL_RISK.has(input.financialRisk)) throw new Error("Unsupported financial risk profile.");
    next.financialRisk = input.financialRisk;
  }
  next.source = "player";
  next.confirmed = false;
  next.confirmedAt = null;
  next.updatedAt = saveWorld.clock?.date ?? null;
  row.plan = next;
  return structuredClone(next);
}

export function confirmOffseasonPlan(saveWorld, teamId, options = {}) {
  const cycle = ensureOffseasonState(saveWorld).current;
  const row = cycle?.teams?.[teamId];
  if (!cycle || cycle.status === "completed") throw new Error("There is no active offseason planning cycle.");
  if (!row) throw new Error(`Team '${teamId}' is not part of the active offseason cycle.`);
  row.plan.confirmed = true;
  row.plan.confirmedAt = options.date ?? saveWorld.clock?.date ?? null;
  row.plan.source = options.source ?? (row.controlled ? "player" : row.plan.source ?? "ai_default");
  return structuredClone(row.plan);
}

function resetFinanceForSeason(saveWorld, teamId, season, date) {
  const finance = saveWorld.world?.teamState?.[teamId];
  if (!finance) return null;
  if (Number(finance.openingCashSeason) === Number(season)) return finance;
  finance.seasonOpeningHistory ??= [];
  if (finance.openingCashSeason !== undefined || finance.openingCash !== undefined) {
    finance.seasonOpeningHistory.push({
      season: Number(finance.openingCashSeason ?? season - 1),
      openingCash: numeric(finance.openingCash, 0),
      closingCash: numeric(finance.cash, 0),
      closedAt: date,
    });
  }
  finance.openingCash = numeric(finance.cash, 0);
  finance.openingCashSeason = Number(season);
  finance.monthlyIncome = 0;
  finance.monthlyExpenses = 0;
  finance.monthlyNet = 0;
  return finance;
}

export function prepareNewSeasonFromOffseason(saveWorld, seasonInput, options = {}) {
  const season = Number(seasonInput);
  if (!Number.isInteger(season)) throw new TypeError("Target season must be an integer.");
  const state = ensureOffseasonState(saveWorld);
  const cycle = state.current;
  const prepared = [];

  for (const team of saveWorld.world?.teams ?? []) {
    const id = team.team_id;
    if (!id) continue;
    const row = cycle?.teams?.[id] ?? {
      teamId: id,
      teamName: teamName(team),
      controlled: false,
      plan: planFor(saveWorld, id, "season_start_default", true),
      preparation: {},
    };
    if (!row.plan.confirmed) confirmOffseasonPlan(saveWorld, id, { source: "auto_carried_at_season_start", date: options.date });
    const finance = resetFinanceForSeason(saveWorld, id, season, options.date ?? saveWorld.clock?.date);
    const board = renewBoardSeason(saveWorld, id, season, options.date ?? saveWorld.clock?.date);
    const technical = saveWorld.world?.technical?.teams?.[id];
    if (technical) {
      technical.seasonStrategy = {
        season,
        technicalFocus: row.plan.technicalFocus,
        staffingFocus: row.plan.staffingFocus,
        commercialFocus: row.plan.commercialFocus,
        financialRisk: row.plan.financialRisk,
        source: row.plan.source,
        appliedAt: options.date ?? saveWorld.clock?.date ?? null,
      };
    }
    prepared.push({
      teamId: id,
      openingCash: finance?.openingCash ?? null,
      boardTarget: board.objectives?.find((objective) => objective.kind === "constructors_position")?.target ?? null,
      strategy: technical?.seasonStrategy ? structuredClone(technical.seasonStrategy) : null,
    });
  }

  if (cycle && Number(cycle.targetSeason) === season) {
    cycle.transitionAt = options.date ?? saveWorld.clock?.date ?? null;
    cycle.stage = "preseason";
    if (cycle.stageHistory.at(-1)?.stage !== "preseason") cycle.stageHistory.push({ stage: "preseason", date: cycle.transitionAt });
    refreshOffseasonCycle(saveWorld, cycle.transitionAt);
  }
  return prepared;
}

export function completeOffseasonCycle(saveWorld, date = saveWorld.clock?.date) {
  const state = ensureOffseasonState(saveWorld);
  const cycle = state.current;
  if (!cycle || cycle.status === "completed") return cycle;
  cycle.status = "completed";
  cycle.stage = "completed";
  cycle.completedAt = date;
  cycle.stageHistory.push({ stage: "completed", date });
  for (const [teamId, row] of Object.entries(cycle.teams ?? {})) {
    row.preparation = preparationStatus(saveWorld, teamId, cycle.closingSeason, cycle.targetSeason);
  }
  state.history.push(structuredClone(cycle));
  return cycle;
}

export function offseasonProjection(saveWorld, teamId = null) {
  const state = ensureOffseasonState(saveWorld);
  const cycle = state.current;
  if (!cycle) return { active: false, current: null, history: structuredClone(state.history.slice(-5)) };
  const row = teamId ? cycle.teams?.[teamId] ?? null : null;
  const reviewTeam = teamId ? constructorRow(cycle.review, teamId) : null;
  const board = teamId && saveWorld.world?.management?.board?.teams?.[teamId] ? boardProjection(saveWorld, teamId) : null;
  return {
    active: cycle.status !== "completed",
    current: {
      cycleId: cycle.cycleId,
      closingSeason: cycle.closingSeason,
      targetSeason: cycle.targetSeason,
      openedAt: cycle.openedAt,
      status: cycle.status,
      stage: cycle.stage,
      transitionAt: cycle.transitionAt,
      completedAt: cycle.completedAt,
      stageHistory: structuredClone(cycle.stageHistory),
      review: structuredClone(cycle.review),
      team: row ? {
        ...structuredClone(row),
        finalConstructorPosition: reviewTeam?.position ?? null,
        finalConstructorPoints: reviewTeam?.points ?? null,
        board,
      } : null,
    },
    history: structuredClone(state.history.slice(-5)),
  };
}

export function finalBoardReviews(saveWorld, teamIds, date = saveWorld.clock?.date) {
  const reviews = [];
  for (const teamId of teamIds ?? []) {
    try { reviews.push(evaluateBoard(saveWorld, teamId, date)); }
    catch { /* a manager may have moved or become unemployed during the final round */ }
  }
  return reviews;
}
