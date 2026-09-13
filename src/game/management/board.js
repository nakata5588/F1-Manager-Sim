function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function teamId(row) {
  return row?.team_id ?? row?.id ?? null;
}

function teamName(row) {
  return row?.team_name ?? row?.display_name ?? row?.name ?? teamId(row) ?? "Team";
}

function teamReputation(row, teamState) {
  const raw = Number(teamState?.reputation ?? row?.reputation ?? row?.prestige ?? row?.team_reputation ?? row?.constructor_reputation);
  if (!Number.isFinite(raw)) return 50;
  return clamp(raw <= 10 ? raw * 10 : raw);
}

function constructorPosition(saveWorld, id) {
  const rows = Object.entries(saveWorld.world?.championship?.constructors ?? {})
    .map(([teamIdValue, row]) => ({
      id: teamIdValue,
      points: numeric(row?.countedPoints ?? row?.points, 0),
      wins: numeric(row?.wins, 0),
    }))
    .sort((a, b) => b.points - a.points || b.wins - a.wins || String(a.id).localeCompare(String(b.id)));
  const index = rows.findIndex((row) => String(row.id) === String(id));
  return index >= 0 ? index + 1 : null;
}

function seasonRaceCount(saveWorld) {
  return (saveWorld.history?.races ?? []).filter((row) => Number(row?.season ?? row?.year ?? saveWorld.clock?.season) === Number(saveWorld.clock?.season)).length;
}

function completedDevelopmentProjects(saveWorld, id) {
  return (saveWorld.history?.development ?? []).filter((row) => row?.teamId === id && row?.type === "completed" && Number(String(row.date ?? "").slice(0, 4)) === Number(saveWorld.clock?.season)).length;
}

function objectiveStatus(value, target, lowerIsBetter = false) {
  if (value === null || value === undefined) return "pending";
  if (lowerIsBetter) return value <= target ? "on_track" : "behind";
  return value >= target ? "on_track" : "behind";
}

function initialExpectedPositions(saveWorld) {
  return [...(saveWorld.world?.teams ?? [])]
    .map((row) => ({
      id: teamId(row),
      reputation: teamReputation(row, saveWorld.world?.teamState?.[teamId(row)]),
    }))
    .filter((row) => row.id)
    .sort((a, b) => b.reputation - a.reputation || String(a.id).localeCompare(String(b.id)))
    .reduce((acc, row, index) => {
      acc[row.id] = index + 1;
      return acc;
    }, {});
}

function boardObjectives(saveWorld, id, expected, openingCash) {
  const hasDevelopmentModel = Object.keys(saveWorld.world?.carState?.[id]?.components ?? {}).length > 0;
  return [
    {
      id: "constructors_position",
      kind: "constructors_position",
      label: "Constructors' Championship",
      target: expected,
      targetText: `Finish P${expected} or better`,
      current: null,
      status: "pending",
    },
    {
      id: "financial_stability",
      kind: "financial_stability",
      label: "Financial stability",
      target: openingCash > 0 ? 0.65 : 0,
      targetText: openingCash > 0 ? "Retain at least 65% of season-opening cash" : "Avoid financial distress",
      current: null,
      status: "pending",
    },
    {
      id: "development_delivery",
      kind: "development_delivery",
      label: "Car development",
      target: hasDevelopmentModel ? 1 : 0,
      targetText: hasDevelopmentModel ? "Complete at least one development project" : "No measurable development target",
      current: 0,
      status: hasDevelopmentModel ? "pending" : "not_applicable",
    },
  ];
}

export function ensureBoardState(saveWorld) {
  saveWorld.world.management ??= {};
  saveWorld.world.management.board ??= { teams: {}, nextRequestId: 1 };
  const state = saveWorld.world.management.board;
  state.teams ??= {};
  state.nextRequestId = Math.max(1, Math.round(numeric(state.nextRequestId, 1)));
  return state;
}

export function initializeBoardTeam(saveWorld, id, date = saveWorld.clock?.date) {
  const state = ensureBoardState(saveWorld);
  if (state.teams[id]) return state.teams[id];
  const team = (saveWorld.world?.teams ?? []).find((row) => String(teamId(row)) === String(id)) ?? {};
  const finances = saveWorld.world?.teamState?.[id] ?? {};
  const expected = initialExpectedPositions(saveWorld)[id] ?? Math.max(1, Math.ceil((saveWorld.world?.teams ?? []).length / 2));
  const openingCash = numeric(finances.openingCash, numeric(finances.cash, 0));
  const row = {
    teamId: id,
    teamName: teamName(team),
    season: Number(saveWorld.clock?.season),
    seasonHistory: [],
    confidence: 65,
    status: "stable",
    reviewCount: 0,
    initializedAt: date,
    lastReviewAt: null,
    lastWarningAt: null,
    dismissalRecommended: false,
    objectives: boardObjectives(saveWorld, id, expected, openingCash),
    requests: [],
  };
  state.teams[id] = row;
  return row;
}

export function renewBoardSeason(saveWorld, id, seasonInput = saveWorld.clock?.season, date = saveWorld.clock?.date) {
  const season = Number(seasonInput);
  if (!Number.isInteger(season)) throw new TypeError("Board season must be an integer.");
  const board = initializeBoardTeam(saveWorld, id, date);
  if (Number(board.season) === season) return board;

  const previousPosition = constructorPosition(saveWorld, id);
  board.seasonHistory ??= [];
  board.seasonHistory.push({
    season: Number(board.season ?? season - 1),
    closedAt: date,
    confidence: board.confidence,
    status: board.status,
    objectives: structuredClone(board.objectives ?? []),
    finalConstructorPosition: previousPosition,
  });

  const fieldSize = Math.max(1, (saveWorld.world?.teams ?? []).length);
  const fallback = initialExpectedPositions(saveWorld)[id] ?? Math.max(1, Math.ceil(fieldSize / 2));
  const prior = previousPosition ?? fallback;
  const ambitionDelta = board.confidence >= 78 ? -1 : board.confidence < 42 ? 1 : 0;
  const expected = Math.min(fieldSize, Math.max(1, prior + ambitionDelta));
  const finances = saveWorld.world?.teamState?.[id] ?? {};
  const openingCash = numeric(finances.cash, numeric(finances.openingCash, 0));

  board.season = season;
  board.reviewCount = 0;
  board.lastReviewAt = null;
  board.lastWarningAt = null;
  board.dismissalRecommended = false;
  board.dismissedAt = null;
  board.objectives = boardObjectives(saveWorld, id, expected, openingCash);
  return board;
}

export function boardStatus(confidence) {
  const value = numeric(confidence, 50);
  if (value < 15) return "dismissal_risk";
  if (value < 30) return "at_risk";
  if (value < 45) return "under_pressure";
  if (value < 70) return "stable";
  return "secure";
}

export function evaluateBoard(saveWorld, id, date = saveWorld.clock?.date) {
  const board = initializeBoardTeam(saveWorld, id, date);
  const finances = saveWorld.world?.teamState?.[id] ?? {};
  const raceCount = seasonRaceCount(saveWorld);
  const position = raceCount > 0 ? constructorPosition(saveWorld, id) : null;
  const completed = completedDevelopmentProjects(saveWorld, id);
  const openingCash = numeric(finances.openingCash, 0);
  const cash = numeric(finances.cash, 0);
  const cashRatio = openingCash > 0 ? cash / Math.max(1, openingCash) : null;
  const month = Number(String(date ?? "").slice(5, 7));

  const constructors = board.objectives.find((row) => row.kind === "constructors_position");
  const financial = board.objectives.find((row) => row.kind === "financial_stability");
  const development = board.objectives.find((row) => row.kind === "development_delivery");
  if (constructors) {
    constructors.current = position;
    constructors.status = objectiveStatus(position, constructors.target, true);
  }
  if (financial) {
    financial.current = cashRatio === null ? finances.financialStatus ?? null : Number(cashRatio.toFixed(3));
    financial.status = cashRatio === null
      ? finances.financialStatus === "distressed" ? "behind" : "pending"
      : objectiveStatus(cashRatio, financial.target, false);
  }
  if (development) {
    development.current = completed;
    development.status = development.target === 0 ? "not_applicable" : completed >= development.target ? "on_track" : month >= 10 ? "behind" : "pending";
  }

  let delta = 0;
  const reasons = [];
  if (position !== null && constructors) {
    const gap = position - constructors.target;
    if (gap <= -1) { delta += 3; reasons.push("ahead_of_championship_target"); }
    else if (gap === 0) { delta += 1.5; reasons.push("meeting_championship_target"); }
    else if (gap >= 3) { delta -= 5; reasons.push("well_below_championship_target"); }
    else { delta -= 2; reasons.push("below_championship_target"); }
  }
  if (cashRatio !== null) {
    if (cashRatio >= 0.85) { delta += 1; reasons.push("strong_financial_control"); }
    else if (cashRatio < 0.4) { delta -= 5; reasons.push("severe_financial_decline"); }
    else if (cashRatio < 0.6) { delta -= 2; reasons.push("financial_pressure"); }
  } else if (finances.financialStatus === "distressed") {
    delta -= 4;
    reasons.push("financial_distress");
  }
  if (development?.target > 0 && completed >= development.target) {
    delta += 1;
    reasons.push("development_target_delivered");
  } else if (development?.target > 0 && month >= 10) {
    delta -= 1.5;
    reasons.push("development_target_at_risk");
  }

  const before = board.confidence;
  board.confidence = Number(clamp(before + delta).toFixed(2));
  board.status = boardStatus(board.confidence);
  board.reviewCount += 1;
  board.lastReviewAt = date;
  board.dismissalRecommended = board.reviewCount >= 3 && board.confidence < 15;
  return {
    teamId: id,
    date,
    confidenceBefore: before,
    confidence: board.confidence,
    delta: Number(delta.toFixed(2)),
    status: board.status,
    reasons,
    objectives: structuredClone(board.objectives),
    dismissalRecommended: board.dismissalRecommended,
  };
}

export function submitBoardRequest(saveWorld, id, kind) {
  const board = initializeBoardTeam(saveWorld, id);
  const allowed = new Set(["development_budget", "staff_capacity"]);
  if (!allowed.has(kind)) throw new Error(`Unsupported board request '${kind}'.`);
  if (board.requests.some((row) => row.status === "pending")) throw new Error("A board request is already pending.");
  const state = ensureBoardState(saveWorld);
  const request = {
    id: `board-request:${String(state.nextRequestId++).padStart(4, "0")}`,
    teamId: id,
    kind,
    status: "pending",
    submittedAt: saveWorld.clock?.date ?? null,
  };
  board.requests.push(request);
  return structuredClone(request);
}

export function resolveBoardRequest(saveWorld, requestId) {
  const state = ensureBoardState(saveWorld);
  const board = Object.values(state.teams).find((row) => row.requests?.some((request) => request.id === requestId));
  const request = board?.requests?.find((row) => row.id === requestId);
  if (!board || !request) throw new Error(`Board request '${requestId}' does not exist.`);
  if (request.status !== "pending") return structuredClone(request);
  const finances = saveWorld.world?.teamState?.[board.teamId] ?? {};
  const confidence = numeric(board.confidence, 50);
  const cash = numeric(finances.cash, 0);
  const opening = numeric(finances.openingCash, cash);
  const approved = confidence >= 52 && finances.financialStatus !== "distressed";
  request.status = approved ? "approved" : "rejected";
  request.resolvedAt = saveWorld.clock?.date ?? null;
  request.reason = approved ? "board_confidence_supports_request" : "insufficient_board_support";
  if (approved && request.kind === "development_budget") {
    const amount = Math.max(25000, Math.round(Math.max(opening, cash, 0) * 0.05));
    request.value = amount;
    if (saveWorld.world?.teamState?.[board.teamId]) saveWorld.world.teamState[board.teamId].cash = cash + amount;
  }
  if (approved && request.kind === "staff_capacity") {
    board.staffCapacityBonus = numeric(board.staffCapacityBonus, 0) + 1;
    request.value = 1;
  }
  return structuredClone(request);
}

export function boardProjection(saveWorld, id) {
  const board = initializeBoardTeam(saveWorld, id);
  return {
    teamId: board.teamId,
    teamName: board.teamName,
    season: board.season ?? Number(saveWorld.clock?.season),
    confidence: board.confidence,
    status: board.status,
    reviewCount: board.reviewCount,
    lastReviewAt: board.lastReviewAt,
    objectives: structuredClone(board.objectives),
    requests: structuredClone(board.requests),
    staffCapacityBonus: numeric(board.staffCapacityBonus, 0),
    seasonHistory: structuredClone(board.seasonHistory ?? []),
  };
}
