import { createRng } from "../../sim/random.js";

export const CALENDAR_EVENT = Object.freeze({
  INITIALIZED: "calendar_promoters.initialized",
  SCHEDULE_FINALIZED: "calendar_promoters.schedule_finalized",
});

const OUTCOME_KEYS = new Set([
  "winner_driver_id",
  "winner_team_id",
  "winning_driver_id",
  "winning_team_id",
  "pole_driver_id",
  "fastest_lap_driver_id",
  "race_results",
  "results",
  "classification",
  "podium",
]);

function copy(value) {
  return value == null ? value : structuredClone(value);
}

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function slug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function trackId(row) {
  return row?.track_id ?? row?.circuit_id ?? row?.trackId ?? row?.circuitId ?? null;
}

function trackName(row) {
  return row?.track_name ?? row?.circuit_name ?? row?.name ?? trackId(row) ?? "Circuit";
}

function eventName(row) {
  return row?.gp_name
    ?? row?.grand_prix
    ?? row?.event_name
    ?? row?.race_name
    ?? trackName(row);
}

function baseEventKey(row) {
  if (row?.calendar_event_key) return String(row.calendar_event_key);
  const named = slug(eventName(row));
  if (named) return `gp:${named}`;
  const id = trackId(row);
  return id ? `track:${String(id)}` : "gp:unknown";
}

function normalizedEventRows(rows = []) {
  const seen = new Map();
  return [...rows]
    .sort((a, b) => Number(a?.round ?? 999) - Number(b?.round ?? 999))
    .map((row) => {
      const base = baseEventKey(row);
      const count = Number(seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      const key = count === 1 ? base : `${base}#${count}`;
      return { ...copy(row), calendar_event_key: key };
    });
}

function shiftDateToYear(value, year) {
  const text = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [, monthText, dayText] = text.split("-");
  const month = Number(monthText);
  const day = Number(dayText);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCMonth() !== month - 1) candidate.setUTCDate(0);
  return candidate.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return date;
  return new Date(parsed + days * 86_400_000).toISOString().slice(0, 10);
}

function sanitizedReferenceRow(row) {
  const next = {};
  for (const [key, value] of Object.entries(row ?? {})) {
    if (OUTCOME_KEYS.has(String(key).toLowerCase())) continue;
    next[key] = copy(value);
  }
  return next;
}

function trackRisk(track = {}) {
  for (const field of ["incident_risk", "accident_risk", "safety_risk"]) {
    const raw = numeric(track?.[field]);
    if (raw === null) continue;
    return clamp(raw <= 1 ? raw * 100 : raw, 0, 100);
  }
  return 35;
}

function trackSafetyBaseline(track = {}) {
  for (const field of ["safety_rating", "safety", "safety_score"]) {
    const raw = numeric(track?.[field]);
    if (raw !== null) return clamp(raw <= 1 ? raw * 100 : raw, 0, 100);
  }
  return clamp(78 - trackRisk(track) * 0.28, 45, 88);
}

function findTrack(saveWorld, id) {
  if (!id) return {};
  return [
    ...(saveWorld.world?.tracks ?? []),
    ...(saveWorld.reference?.futureStructure?.tracks ?? []),
  ].find((row) => String(trackId(row)) === String(id)) ?? {};
}

export function calendarEraProfile(seasonInput) {
  const season = Number(seasonInput);
  if (season <= 1967) return { era: "foundational", minRounds: 6, maxRounds: 14, maxAnnualChange: 2, renewalThreshold: 46 };
  if (season <= 1987) return { era: "early-commercial", minRounds: 10, maxRounds: 18, maxAnnualChange: 2, renewalThreshold: 48 };
  if (season <= 1999) return { era: "global-growth", minRounds: 12, maxRounds: 20, maxAnnualChange: 3, renewalThreshold: 49 };
  if (season <= 2016) return { era: "corporate-global", minRounds: 14, maxRounds: 22, maxAnnualChange: 3, renewalThreshold: 50 };
  return { era: "modern-global", minRounds: 16, maxRounds: 26, maxAnnualChange: 4, renewalThreshold: 51 };
}

export function ensureCalendarPromoterState(saveWorld) {
  saveWorld.world.calendarEvolution ??= {
    sequence: 0,
    initializedAt: null,
    contracts: {},
    plans: {},
    seasons: {},
    history: [],
  };
  const state = saveWorld.world.calendarEvolution;
  state.contracts ??= {};
  state.plans ??= {};
  state.seasons ??= {};
  state.history ??= [];
  state.sequence = Math.max(0, Math.floor(numeric(state.sequence, 0)));
  return state;
}

function nextSequence(state) {
  state.sequence = Number(state.sequence ?? 0) + 1;
  return state.sequence;
}

function contractId(eventKey, season, sequence) {
  return `promoter-contract:${slug(eventKey) || "event"}:${season}:${String(sequence).padStart(4, "0")}`;
}

function promoterId(eventKey) {
  return `promoter:${slug(eventKey) || "event"}`;
}

function createContract(saveWorld, state, row, season, input = {}) {
  const key = row.calendar_event_key ?? baseEventKey(row);
  const rng = createRng(`${saveWorld.meta?.seed ?? "calendar"}|${season}|${key}|promoter-contract`);
  const track = findTrack(saveWorld, trackId(row));
  const sequence = nextSequence(state);
  const previous = state.contracts[key] ?? null;
  const contract = {
    contractId: contractId(key, season, sequence),
    eventKey: key,
    promoterId: previous?.promoterId ?? promoterId(key),
    promoterName: previous?.promoterName ?? `${eventName(row)} Promoter`,
    trackId: trackId(row),
    eventName: eventName(row),
    status: "active",
    startSeason: season,
    endSeason: season + Math.max(1, Number(input.termSeasons ?? rng.int(1, 4))),
    commercialHealth: clamp(
      numeric(input.commercialHealth, numeric(previous?.commercialHealth, 58 + rng.int(0, 25))),
      30,
      95,
    ),
    promoterStability: clamp(
      numeric(input.promoterStability, numeric(previous?.promoterStability, 56 + rng.int(0, 28))),
      25,
      96,
    ),
    safetyConfidence: clamp(
      numeric(input.safetyConfidence, numeric(previous?.safetyConfidence, trackSafetyBaseline(track))),
      30,
      98,
    ),
    provenance: input.provenance ?? "save_world_simulation_promoter_contract",
    lastReviewedSeason: season,
    lastDecision: input.lastDecision ?? "contract_created",
    lastEventRow: sanitizedReferenceRow(row),
  };
  state.contracts[key] = contract;
  return contract;
}

export function initializeCalendarPromoters(saveWorld, date = saveWorld.clock?.date ?? null) {
  const state = ensureCalendarPromoterState(saveWorld);
  if (state.initializedAt) return state;
  const season = Number(saveWorld.clock?.season ?? saveWorld.world?.season);
  state.initializedAt = date;
  for (const row of normalizedEventRows(saveWorld.world?.calendar ?? [])) {
    const key = row.calendar_event_key;
    if (!state.contracts[key]) {
      createContract(saveWorld, state, row, season, {
        provenance: "career_start_calendar_promoter_baseline",
        lastDecision: "career_start_active_event",
      });
    }
  }
  state.seasons[String(season)] = {
    season,
    status: "active_starting_calendar",
    finalizedAt: date,
    appliedAt: date,
    raceCount: Array.isArray(saveWorld.world?.calendar) ? saveWorld.world.calendar.length : 0,
    eventKeys: normalizedEventRows(saveWorld.world?.calendar ?? []).map((row) => row.calendar_event_key),
    added: [],
    dropped: [],
    renewed: [],
    source: "historical_starting_calendar",
  };
  return state;
}

function contractScore(saveWorld, contract, season, purpose = "renewal") {
  const track = findTrack(saveWorld, contract?.trackId);
  const rng = createRng(`${saveWorld.meta?.seed ?? "calendar"}|${season}|${contract?.eventKey}|${purpose}`);
  const riskPenalty = trackRisk(track) * 0.16;
  return clamp(
    numeric(contract?.commercialHealth, 60) * 0.38
      + numeric(contract?.promoterStability, 60) * 0.34
      + numeric(contract?.safetyConfidence, 70) * 0.28
      - riskPenalty
      + (rng.next() - 0.5) * 18,
    0,
    100,
  );
}

function evolveContract(saveWorld, contract, season) {
  const rng = createRng(`${saveWorld.meta?.seed ?? "calendar"}|${season}|${contract.eventKey}|annual-health`);
  contract.commercialHealth = clamp(numeric(contract.commercialHealth, 60) + (rng.next() - 0.48) * 7, 25, 98);
  contract.promoterStability = clamp(numeric(contract.promoterStability, 60) + (rng.next() - 0.5) * 6, 20, 98);
  const track = findTrack(saveWorld, contract.trackId);
  const safetyTarget = trackSafetyBaseline(track);
  contract.safetyConfidence = clamp(
    numeric(contract.safetyConfidence, safetyTarget) * 0.88 + safetyTarget * 0.12 + (rng.next() - 0.5) * 4,
    25,
    99,
  );
  contract.lastReviewedSeason = season;
  return contract;
}

function referenceCalendar(saveWorld, season) {
  const rows = saveWorld.reference?.futureStructure?.calendars?.[String(season)];
  return Array.isArray(rows) ? normalizedEventRows(rows.map(sanitizedReferenceRow)) : [];
}

function inactiveContractCandidates(state) {
  return Object.values(state.contracts ?? {})
    .filter((row) => row?.status !== "active" && row?.lastEventRow)
    .map((row) => ({
      ...copy(row.lastEventRow),
      calendar_event_key: row.eventKey,
      candidate_source: "previous_calendar_event",
    }));
}

function calendarRoundBounds(profile, previousCount) {
  const minimum = previousCount >= profile.minRounds
    ? profile.minRounds
    : Math.max(1, previousCount - profile.maxAnnualChange);
  const maximum = previousCount <= profile.maxRounds
    ? profile.maxRounds
    : previousCount + profile.maxAnnualChange;
  return { minimum, maximum };
}

function desiredRaceCount(saveWorld, season, previousCount, referenceCount, options = {}) {
  const profile = calendarEraProfile(season);
  const bounds = calendarRoundBounds(profile, previousCount);
  if (Number.isInteger(Number(options.targetRaceCount))) {
    return clamp(Math.round(Number(options.targetRaceCount)), bounds.minimum, bounds.maximum);
  }
  const rng = createRng(`${saveWorld.meta?.seed ?? "calendar"}|${season}|calendar-size`);
  const structuralSignal = referenceCount > 0
    ? previousCount * 0.72 + referenceCount * 0.28
    : previousCount;
  const roll = rng.next();
  const randomStep = roll < 0.18 ? -1 : roll > 0.82 ? 1 : 0;
  const raw = Math.round(structuralSignal + randomStep);
  return clamp(
    raw,
    Math.max(bounds.minimum, previousCount - profile.maxAnnualChange),
    Math.min(bounds.maximum, previousCount + profile.maxAnnualChange),
  );
}

function matchReference(referenceRows, row, usedKeys = new Set()) {
  const eventKey = row?.calendar_event_key;
  const exact = referenceRows.find((candidate) => candidate.calendar_event_key === eventKey && !usedKeys.has(candidate.calendar_event_key));
  if (exact) return exact;
  const id = trackId(row);
  if (!id) return null;
  return referenceRows.find((candidate) => String(trackId(candidate)) === String(id) && !usedKeys.has(candidate.calendar_event_key)) ?? null;
}

function candidateScore(saveWorld, state, row, season, inReference) {
  const key = row.calendar_event_key ?? baseEventKey(row);
  const previous = state.contracts[key];
  const rng = createRng(`${saveWorld.meta?.seed ?? "calendar"}|${season}|${key}|candidate`);
  const commercial = numeric(previous?.commercialHealth, 54 + rng.int(0, 25));
  const stability = numeric(previous?.promoterStability, 52 + rng.int(0, 28));
  const safety = numeric(previous?.safetyConfidence, trackSafetyBaseline(findTrack(saveWorld, trackId(row))));
  return commercial * 0.34 + stability * 0.28 + safety * 0.25 + (inReference ? 12 : 0) + rng.next() * 12;
}

function uniqueCandidates(rows = []) {
  const result = [];
  const seen = new Set();
  for (const row of rows) {
    const key = row.calendar_event_key ?? baseEventKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...copy(row), calendar_event_key: key });
  }
  return result;
}

function dynamicGpId(row, season, index) {
  const key = slug(row.calendar_event_key ?? baseEventKey(row)) || `round-${index + 1}`;
  return `${season}:${String(index + 1).padStart(2, "0")}:${key}`;
}

function scheduleDates(selected, referenceRows, previousRows, season) {
  const referenceByKey = new Map(referenceRows.map((row) => [row.calendar_event_key, row]));
  const previousByKey = new Map(previousRows.map((row) => [row.calendar_event_key, row]));
  const start = `${season}-03-01`;
  const end = `${season}-12-15`;
  const minimumGapDays = selected.length > 1
    ? Math.max(3, Math.min(14, Math.floor(260 / (selected.length - 1))))
    : 7;
  let lastDate = null;

  return selected.map((row, index) => {
    const ref = referenceByKey.get(row.calendar_event_key);
    const prior = previousByKey.get(row.calendar_event_key);
    const remaining = selected.length - index - 1;
    const fallback = addDays(start, index * minimumGapDays);
    let date = shiftDateToYear(
      ref?.race_date ?? ref?.date ?? prior?.race_date ?? prior?.date,
      season,
    ) ?? fallback;

    const earliest = lastDate ? addDays(lastDate, minimumGapDays) : `${season}-01-01`;
    const latest = addDays(end, -remaining * minimumGapDays);
    if (date < earliest) date = earliest;
    if (date > latest) date = latest;
    if (Number(date.slice(0, 4)) !== season) date = latest;

    lastDate = date;
    return date;
  });
}

function recordDecision(state, input) {
  state.history.push({ ...copy(input), sequence: nextSequence(state) });
  if (state.history.length > 250) state.history.splice(0, state.history.length - 250);
}

export function planDynamicCalendar(saveWorld, seasonInput, options = {}) {
  const season = Number(seasonInput);
  if (!Number.isInteger(season)) throw new TypeError("Target calendar season must be an integer.");
  initializeCalendarPromoters(saveWorld, options.date ?? saveWorld.clock?.date ?? null);
  const state = ensureCalendarPromoterState(saveWorld);
  if (state.plans[String(season)] && options.force !== true) return copy(state.plans[String(season)]);

  const previousRows = normalizedEventRows(options.previousCalendar ?? saveWorld.world?.calendar ?? []);
  if (!previousRows.length) throw new Error("Dynamic calendar planning requires an existing calendar template.");
  const referenceRows = referenceCalendar(saveWorld, season);
  const profile = calendarEraProfile(season);
  const desired = desiredRaceCount(saveWorld, season, previousRows.length, referenceRows.length, options);
  const roundBounds = calendarRoundBounds(profile, previousRows.length);
  const retained = [];
  const dropped = [];
  const renewed = [];
  const usedReferenceKeys = new Set();

  for (const row of previousRows) {
    const key = row.calendar_event_key;
    let contract = state.contracts[key] ?? createContract(saveWorld, state, row, season - 1, {
      provenance: "legacy_calendar_promoter_baseline",
    });
    evolveContract(saveWorld, contract, season);
    const ref = matchReference(referenceRows, row, usedReferenceKeys);
    if (ref) usedReferenceKeys.add(ref.calendar_event_key);

    const contractCoversSeason = Number(contract.endSeason ?? season - 1) >= season;
    const score = contractScore(saveWorld, contract, season, "renewal");
    const forcedThreshold = numeric(options.renewalThreshold);
    const threshold = forcedThreshold ?? profile.renewalThreshold;
    const referenceSupport = ref ? 4 : 0;
    const renew = contractCoversSeason || score + referenceSupport >= threshold;

    if (renew) {
      if (!contractCoversSeason) {
        const rng = createRng(`${saveWorld.meta?.seed ?? "calendar"}|${season}|${key}|renewal-term`);
        contract.startSeason = season;
        contract.endSeason = season + rng.int(1, 4);
        contract.lastDecision = "renewed";
        renewed.push({ eventKey: key, eventName: eventName(row), trackId: trackId(row), score: Number(score.toFixed(2)), endSeason: contract.endSeason });
        recordDecision(state, { season, date: options.date ?? saveWorld.clock?.date ?? null, type: "contract_renewed", eventKey: key, trackId: trackId(row), score: Number(score.toFixed(2)), endSeason: contract.endSeason });
      } else {
        contract.lastDecision = "continued_under_contract";
      }
      contract.status = "active";
      contract.lastEventRow = sanitizedReferenceRow(ref ?? row);
      retained.push({ ...copy(ref ?? row), calendar_event_key: key, planner_score: score, retained_from_previous: true });
    } else {
      contract.status = "inactive";
      contract.lastDecision = "not_renewed";
      contract.lastEventRow = sanitizedReferenceRow(row);
      dropped.push({ eventKey: key, eventName: eventName(row), trackId: trackId(row), score: Number(score.toFixed(2)), reason: score < threshold ? "promoter_viability" : "calendar_balance" });
      recordDecision(state, { season, date: options.date ?? saveWorld.clock?.date ?? null, type: "event_dropped", eventKey: key, trackId: trackId(row), score: Number(score.toFixed(2)), reason: "promoter_viability" });
    }
  }

  const retainedKeys = new Set(retained.map((row) => row.calendar_event_key));
  const referenceCandidates = referenceRows
    .filter((row) => !retainedKeys.has(row.calendar_event_key))
    .map((row) => ({ ...row, candidate_source: "historical_structure_reference" }));
  const candidates = uniqueCandidates([...referenceCandidates, ...inactiveContractCandidates(state)])
    .filter((row) => !retainedKeys.has(row.calendar_event_key))
    .map((row) => ({
      row,
      score: candidateScore(saveWorld, state, row, season, row.candidate_source === "historical_structure_reference"),
    }))
    .sort((a, b) => b.score - a.score || String(a.row.calendar_event_key).localeCompare(String(b.row.calendar_event_key)));

  const selected = [...retained];
  const added = [];
  const maximumTarget = Math.min(roundBounds.maximum, Math.max(desired, roundBounds.minimum));
  for (const candidate of candidates) {
    if (selected.length >= maximumTarget) break;
    const row = candidate.row;
    const key = row.calendar_event_key;
    const contract = createContract(saveWorld, state, row, season, {
      commercialHealth: state.contracts[key]?.commercialHealth,
      promoterStability: state.contracts[key]?.promoterStability,
      safetyConfidence: state.contracts[key]?.safetyConfidence,
      provenance: row.candidate_source === "historical_structure_reference"
        ? "simulation_contract_from_historical_structure_candidate"
        : "simulation_promoter_return",
      lastDecision: "calendar_entry_awarded",
    });
    contract.status = "active";
    contract.lastEventRow = sanitizedReferenceRow(row);
    selected.push({ ...copy(row), planner_score: candidate.score, added_for_season: true });
    retainedKeys.add(key);
    const addition = {
      eventKey: key,
      eventName: eventName(row),
      trackId: trackId(row),
      score: Number(candidate.score.toFixed(2)),
      source: row.candidate_source ?? "candidate",
      contractEndSeason: contract.endSeason,
    };
    added.push(addition);
    recordDecision(state, { season, date: options.date ?? saveWorld.clock?.date ?? null, type: "event_added", ...addition });
  }

  if (selected.length < roundBounds.minimum) {
    for (const row of previousRows) {
      if (selected.length >= roundBounds.minimum) break;
      if (retainedKeys.has(row.calendar_event_key)) continue;
      let contract = state.contracts[row.calendar_event_key];
      if (!contract || contract.status !== "active") {
        contract = createContract(saveWorld, state, row, season, {
          provenance: "calendar_continuity_rescue_contract",
          lastDecision: "calendar_continuity_rescue",
          termSeasons: 1,
        });
      }
      contract.status = "active";
      selected.push({ ...copy(row), calendar_event_key: row.calendar_event_key, planner_score: 0, continuity_rescue: true });
      retainedKeys.add(row.calendar_event_key);
      added.push({ eventKey: row.calendar_event_key, eventName: eventName(row), trackId: trackId(row), score: 0, source: "calendar_continuity_rescue", contractEndSeason: contract.endSeason });
    }
  }

  const referenceOrder = new Map(referenceRows.map((row, index) => [row.calendar_event_key, Number(row.round ?? index + 1)]));
  const previousOrder = new Map(previousRows.map((row, index) => [row.calendar_event_key, Number(row.round ?? index + 1)]));
  selected.sort((a, b) => {
    const aOrder = referenceOrder.has(a.calendar_event_key)
      ? referenceOrder.get(a.calendar_event_key) * 10
      : (previousOrder.get(a.calendar_event_key) ?? 999) * 10 + 5;
    const bOrder = referenceOrder.has(b.calendar_event_key)
      ? referenceOrder.get(b.calendar_event_key) * 10
      : (previousOrder.get(b.calendar_event_key) ?? 999) * 10 + 5;
    return aOrder - bOrder || String(a.calendar_event_key).localeCompare(String(b.calendar_event_key));
  });

  const dates = scheduleDates(selected, referenceRows, previousRows, season);
  const calendar = selected.map((row, index) => {
    const key = row.calendar_event_key;
    const contract = state.contracts[key] ?? createContract(saveWorld, state, row, season);
    const source = sanitizedReferenceRow(row);
    delete source.planner_score;
    delete source.retained_from_previous;
    delete source.added_for_season;
    delete source.continuity_rescue;
    delete source.candidate_source;
    return {
      ...source,
      source_gp_id: source.source_gp_id ?? source.gp_id ?? source.race_id ?? null,
      gp_id: dynamicGpId(row, season, index),
      year: season,
      season,
      round: index + 1,
      race_date: dates[index],
      generated: true,
      historical_structure_reference: row.candidate_source === "historical_structure_reference" || referenceOrder.has(key),
      generation_source: "dynamic_calendar_promoter_system",
      calendar_event_key: key,
      promoter_id: contract.promoterId,
      promoter_contract_id: contract.contractId,
    };
  });

  const plan = {
    season,
    plannedAt: options.date ?? saveWorld.clock?.date ?? null,
    appliedAt: null,
    status: "finalized",
    source: "dynamic_calendar_promoter_system",
    referencePolicy: "historical_future_calendar_is_candidate_not_script",
    previousRaceCount: previousRows.length,
    referenceRaceCount: referenceRows.length,
    targetRaceCount: desired,
    raceCount: calendar.length,
    era: profile.era,
    minimumViableRounds: roundBounds.minimum,
    maximumViableRounds: roundBounds.maximum,
    calendar,
    eventKeys: calendar.map((row) => row.calendar_event_key),
    added,
    dropped,
    renewed,
  };
  state.plans[String(season)] = copy(plan);
  state.seasons[String(season)] = {
    season,
    status: "planned",
    finalizedAt: plan.plannedAt,
    appliedAt: null,
    raceCount: plan.raceCount,
    targetRaceCount: plan.targetRaceCount,
    referenceRaceCount: plan.referenceRaceCount,
    minimumViableRounds: plan.minimumViableRounds,
    maximumViableRounds: plan.maximumViableRounds,
    eventKeys: copy(plan.eventKeys),
    added: copy(added),
    dropped: copy(dropped),
    renewed: copy(renewed),
    source: plan.source,
  };
  recordDecision(state, {
    season,
    date: plan.plannedAt,
    type: "schedule_finalized",
    raceCount: plan.raceCount,
    targetRaceCount: plan.targetRaceCount,
    referenceRaceCount: plan.referenceRaceCount,
    added: added.map((row) => row.eventKey),
    dropped: dropped.map((row) => row.eventKey),
  });
  return copy(plan);
}

export function calendarPlanFor(saveWorld, seasonInput) {
  const state = ensureCalendarPromoterState(saveWorld);
  return copy(state.plans[String(Number(seasonInput))] ?? null);
}

export function applyCalendarPlan(saveWorld, seasonInput, date = saveWorld.clock?.date ?? null) {
  const season = Number(seasonInput);
  const state = ensureCalendarPromoterState(saveWorld);
  const plan = state.plans[String(season)];
  if (!plan) return null;
  plan.appliedAt = date;
  const summary = state.seasons[String(season)];
  if (summary) {
    summary.appliedAt = date;
    summary.status = "active";
  }
  return copy(plan);
}

export function calendarPromoterProjection(saveWorld) {
  const state = ensureCalendarPromoterState(saveWorld);
  const contracts = Object.values(state.contracts ?? {})
    .map(copy)
    .sort((a, b) => String(a.eventName).localeCompare(String(b.eventName)));
  return {
    initializedAt: state.initializedAt,
    activeContracts: contracts.filter((row) => row.status === "active"),
    inactiveContracts: contracts.filter((row) => row.status !== "active"),
    plans: Object.values(state.plans ?? {}).map((row) => ({
      season: row.season,
      plannedAt: row.plannedAt,
      appliedAt: row.appliedAt,
      status: row.status,
      raceCount: row.raceCount,
      targetRaceCount: row.targetRaceCount,
      referenceRaceCount: row.referenceRaceCount,
      added: copy(row.added),
      dropped: copy(row.dropped),
      renewed: copy(row.renewed),
    })),
    seasons: Object.values(state.seasons ?? {}).map(copy),
    recentHistory: state.history.slice(-30).map(copy),
  };
}
