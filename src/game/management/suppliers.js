import { createRng } from "../../sim/random.js";

export const SUPPLIER_EVENT = Object.freeze({
  INITIALIZED: "supplier.initialized",
  NEGOTIATION_OPENED: "supplier.negotiation_opened",
  OFFER_SUBMITTED: "supplier.offer_submitted",
  COUNTERED: "supplier.countered",
  ACCEPTED: "supplier.accepted",
  REJECTED: "supplier.rejected",
  WITHDRAWN: "supplier.withdrawn",
  CONTRACT_ACTIVATED: "supplier.contract_activated",
  AUTO_RENEWED: "supplier.auto_renewed",
});

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 2) {
  return Number(Number(value).toFixed(digits));
}

function normalizeRating(value, fallback = 50) {
  const parsed = numeric(value);
  if (parsed === null) return fallback;
  if (parsed >= 0 && parsed <= 1) return parsed * 100;
  if (parsed >= 1 && parsed <= 10) return parsed * 10;
  return clamp(parsed);
}

function engineId(row) {
  return row?.engine_id ?? row?.engine_package_id ?? row?.id ?? null;
}

function engineName(row) {
  return row?.engine_name ?? row?.name ?? row?.power_unit ?? engineId(row) ?? "Unknown engine";
}

function manufacturer(row) {
  return row?.manufacturer ?? row?.engine_manufacturer ?? row?.supplier_name ?? row?.power_unit ?? engineName(row);
}

function supplierRoot(saveWorld) {
  saveWorld.world.technical ??= { teams: {} };
  saveWorld.world.technical.teams ??= {};
  saveWorld.world.technical.suppliers ??= { teams: {}, sequence: 0 };
  saveWorld.history.suppliers ??= [];
  return saveWorld.world.technical.suppliers;
}

function nextId(saveWorld, prefix, teamId) {
  const root = supplierRoot(saveWorld);
  root.sequence = Number(root.sequence ?? 0) + 1;
  return `${prefix}:${teamId}:${saveWorld.clock?.season}:${root.sequence}`;
}

function sourceSupply(saveWorld, teamId) {
  return (saveWorld.world?.teamEngines ?? []).find((row) => row.team_id === teamId) ?? {};
}

export function engineCatalog(saveWorld) {
  return (saveWorld.world?.engines ?? [])
    .filter((row) => engineId(row))
    .map((row) => ({ ...row, engine_id: engineId(row) }));
}

export function engineById(saveWorld, id) {
  if (!id) return null;
  return engineCatalog(saveWorld).find((row) => row.engine_id === id) ?? null;
}

function explicitAnnualCost(source = {}, engine = {}) {
  for (const value of [
    source.annual_supply_cost,
    source.annual_cost,
    source.engine_cost,
    source.supply_cost,
    source.contract_value,
    engine.annual_supply_cost,
    engine.annual_cost,
    engine.engine_cost,
    engine.supply_cost,
  ]) {
    const parsed = numeric(value);
    if (parsed !== null && parsed >= 0) return parsed;
  }
  return null;
}

function eraCostFactor(season) {
  if (season <= 1985) return 0.78;
  if (season <= 1995) return 0.9;
  if (season <= 2005) return 1;
  if (season <= 2013) return 1.12;
  return 1.28;
}

export function expectedSupplierTerms(saveWorld, teamId, id, options = {}) {
  const engine = engineById(saveWorld, id);
  if (!engine) throw new Error(`Engine supplier '${id}' is not available in the current world.`);
  const season = Number(options.effectiveSeason ?? saveWorld.clock?.season ?? 1980);
  const source = sourceSupply(saveWorld, teamId);
  const explicit = explicitAnnualCost(source.engine_id === id ? source : {}, engine);
  const power = normalizeRating(engine.power ?? engine.power_rating, 50);
  const reliability = normalizeRating(engine.reliability ?? engine.reliability_rating, 65);
  const estimate = Math.max(180000, Math.round((120000 + power * 6500 + reliability * 4500) * eraCostFactor(season)));
  return {
    annualValue: explicit ?? estimate,
    annualValueMode: "currency",
    annualValueSource: explicit !== null ? "historical_or_database_contract_value" : "simulation_estimate",
    durationYears: 2,
    effectiveSeason: season,
    power: round(power, 2),
    reliability: round(reliability, 2),
  };
}

function teamReputation(saveWorld, teamId) {
  const state = saveWorld.world?.teamState?.[teamId] ?? {};
  const team = (saveWorld.world?.teams ?? []).find((row) => row.team_id === teamId) ?? {};
  const brand = (saveWorld.world?.teamBrands ?? []).find((row) => row.team_id === teamId) ?? {};
  return normalizeRating(state.reputation ?? brand.reputation ?? team.reputation, 50);
}

export function supplierInterest(saveWorld, teamId, id) {
  const engine = engineById(saveWorld, id);
  if (!engine) return { score: 0, level: "unavailable", reasons: ["Supplier is not available."] };
  const team = supplierRoot(saveWorld).teams?.[teamId];
  const currentId = team?.active?.engineId ?? sourceSupply(saveWorld, teamId).engine_id ?? null;
  const performance = normalizeRating(engine.power ?? engine.power_rating, 50) * 0.52
    + normalizeRating(engine.reliability ?? engine.reliability_rating, 65) * 0.48;
  const reputation = teamReputation(saveWorld, teamId);
  const loyalty = currentId === id ? 8 : 0;
  const score = clamp(62 + (reputation - performance) * 0.28 + loyalty, 5, 95);
  const reasons = [];
  if (loyalty) reasons.push("Existing supplier relationship improves interest.");
  if (reputation >= performance) reasons.push("Team reputation supports the supplier proposal.");
  else reasons.push("Supplier quality is above the team's current reputation level.");
  return {
    score: round(score, 1),
    level: score >= 72 ? "high" : score >= 48 ? "medium" : score >= 30 ? "low" : "very_low",
    reasons,
  };
}

function initialSupplierContract(saveWorld, teamId, date) {
  const source = sourceSupply(saveWorld, teamId);
  const id = source.engine_id ?? source.engine_package_id ?? null;
  if (!id) return null;
  const engine = engineById(saveWorld, id) ?? source;
  const explicit = explicitAnnualCost(source, engine);
  const season = Number(saveWorld.clock?.season);
  return {
    contractId: `historical:${season}:${teamId}:${id}`,
    teamId,
    engineId: id,
    engineName: engineName(engine),
    manufacturer: manufacturer(engine),
    startSeason: season,
    endSeason: season,
    effectiveSeason: season,
    annualValueMode: explicit !== null ? "currency" : "abstract_index",
    annualValue: explicit,
    annualValueIndex: explicit === null ? 50 : null,
    valueSource: explicit !== null ? "historical_or_database_contract_value" : "historical_assignment_value_unknown",
    source: "historical_season_assignment",
    signedAt: date,
    status: "active",
  };
}

export function ensureSupplierTeam(saveWorld, teamId, date = saveWorld.clock?.date ?? null) {
  const root = supplierRoot(saveWorld);
  if (root.teams[teamId]) return root.teams[teamId];
  root.teams[teamId] = {
    teamId,
    active: initialSupplierContract(saveWorld, teamId, date),
    futureDeal: null,
    negotiations: [],
    initializedAt: date,
  };
  return root.teams[teamId];
}

export function initializeSupplierWorld(saveWorld, date = saveWorld.clock?.date ?? null) {
  let teams = 0;
  for (const row of saveWorld.world?.teams ?? []) {
    if (!row.team_id) continue;
    ensureSupplierTeam(saveWorld, row.team_id, date);
    teams += 1;
  }
  return teams;
}

export function activeSupplierContract(saveWorld, teamId) {
  const state = saveWorld.world?.technical?.suppliers?.teams?.[teamId];
  return state?.active ? structuredClone(state.active) : null;
}

export function activeEngineForTeam(saveWorld, teamId) {
  const dynamic = saveWorld.world?.technical?.suppliers?.teams?.[teamId]?.active?.engineId ?? null;
  const staticId = sourceSupply(saveWorld, teamId).engine_id ?? sourceSupply(saveWorld, teamId).engine_package_id ?? null;
  return engineById(saveWorld, dynamic ?? staticId) ?? {};
}

export function listSupplierMarket(saveWorld, teamId) {
  return engineCatalog(saveWorld).map((engine) => {
    const terms = expectedSupplierTerms(saveWorld, teamId, engine.engine_id, { effectiveSeason: Number(saveWorld.clock?.season) + 1 });
    const interest = supplierInterest(saveWorld, teamId, engine.engine_id);
    return {
      engineId: engine.engine_id,
      engineName: engineName(engine),
      manufacturer: manufacturer(engine),
      power: terms.power,
      reliability: terms.reliability,
      interest,
      expectedTerms: terms,
      current: activeSupplierContract(saveWorld, teamId)?.engineId === engine.engine_id,
    };
  }).sort((a, b) => (b.power + b.reliability) - (a.power + a.reliability) || a.engineName.localeCompare(b.engineName));
}

export function openSupplierNegotiation(saveWorld, teamId, id, input = {}) {
  const state = ensureSupplierTeam(saveWorld, teamId);
  if (!engineById(saveWorld, id)) throw new Error(`Engine supplier '${id}' is not available.`);
  if (state.futureDeal) throw new Error("A future engine-supplier deal is already agreed.");
  const open = state.negotiations.find((row) => row.status === "open" || row.status === "countered");
  if (open) throw new Error("Only one engine-supplier negotiation can be active at a time.");
  const effectiveSeason = Math.max(Number(saveWorld.clock.season) + 1, Number(input.effectiveSeason ?? 0));
  const expected = expectedSupplierTerms(saveWorld, teamId, id, { effectiveSeason });
  const negotiation = {
    negotiationId: nextId(saveWorld, "supplier-negotiation", teamId),
    teamId,
    engineId: id,
    engineName: engineName(engineById(saveWorld, id)),
    manufacturer: manufacturer(engineById(saveWorld, id)),
    status: "open",
    openedAt: saveWorld.clock.date,
    source: input.source ?? "player",
    effectiveSeason,
    expectedTerms: expected,
    offers: [],
    counter: null,
  };
  state.negotiations.push(negotiation);
  return structuredClone(negotiation);
}

function agreedDeal(saveWorld, negotiation, terms, source) {
  const durationYears = clamp(Math.round(numeric(terms.durationYears, 2)), 1, 4);
  const engine = engineById(saveWorld, negotiation.engineId) ?? {};
  return {
    contractId: nextId(saveWorld, "supplier-contract", negotiation.teamId),
    teamId: negotiation.teamId,
    engineId: negotiation.engineId,
    engineName: engineName(engine),
    manufacturer: manufacturer(engine),
    effectiveSeason: negotiation.effectiveSeason,
    startSeason: negotiation.effectiveSeason,
    endSeason: negotiation.effectiveSeason + durationYears - 1,
    durationYears,
    annualValueMode: "currency",
    annualValue: Math.max(0, round(numeric(terms.annualValue, 0))),
    annualValueIndex: null,
    valueSource: "simulation_negotiation",
    source,
    signedAt: saveWorld.clock.date,
    status: "future",
  };
}

export function submitSupplierOffer(saveWorld, teamId, negotiationId, input = {}) {
  const state = ensureSupplierTeam(saveWorld, teamId);
  const negotiation = state.negotiations.find((row) => row.negotiationId === negotiationId);
  if (!negotiation || !["open", "countered"].includes(negotiation.status)) throw new Error("Supplier negotiation is not open.");
  const expected = negotiation.expectedTerms;
  const annualValue = Math.max(0, numeric(input.annualValue, expected.annualValue));
  const durationYears = clamp(Math.round(numeric(input.durationYears, expected.durationYears)), 1, 4);
  const offer = { annualValue: round(annualValue), durationYears, submittedAt: saveWorld.clock.date };
  negotiation.offers.push(offer);
  negotiation.counter = null;

  const interest = supplierInterest(saveWorld, teamId, negotiation.engineId).score;
  const ratio = expected.annualValue > 0 ? annualValue / expected.annualValue : 1;
  const rng = createRng(`${saveWorld.meta.seed}|${negotiation.negotiationId}|${negotiation.offers.length}|supplier-offer`);
  const acceptanceThreshold = clamp(0.93 + (55 - interest) * 0.0018 + (rng.next() - 0.5) * 0.025, 0.86, 1.04);

  if (interest >= 28 && ratio >= acceptanceThreshold) {
    const deal = agreedDeal(saveWorld, negotiation, offer, negotiation.source ?? "player");
    state.futureDeal = deal;
    negotiation.status = "accepted";
    negotiation.agreedDeal = structuredClone(deal);
    saveWorld.history.suppliers.push({ date: saveWorld.clock.date, type: "supplier_agreement", ...structuredClone(deal) });
    return { status: "accepted", negotiation: structuredClone(negotiation), deal: structuredClone(deal) };
  }

  if (interest >= 24 && ratio >= acceptanceThreshold * 0.76) {
    const counterValue = Math.max(annualValue, Math.round(expected.annualValue * Math.max(0.96, acceptanceThreshold)));
    negotiation.status = "countered";
    negotiation.counter = {
      annualValue: counterValue,
      durationYears: Math.max(durationYears, expected.durationYears),
      createdAt: saveWorld.clock.date,
    };
    return { status: "countered", negotiation: structuredClone(negotiation), counter: structuredClone(negotiation.counter) };
  }

  negotiation.status = "rejected";
  negotiation.closedAt = saveWorld.clock.date;
  return { status: "rejected", negotiation: structuredClone(negotiation) };
}

export function acceptSupplierCounter(saveWorld, teamId, negotiationId) {
  const state = ensureSupplierTeam(saveWorld, teamId);
  const negotiation = state.negotiations.find((row) => row.negotiationId === negotiationId);
  if (!negotiation || negotiation.status !== "countered" || !negotiation.counter) throw new Error("No supplier counter-offer is available.");
  const deal = agreedDeal(saveWorld, negotiation, negotiation.counter, negotiation.source ?? "player");
  state.futureDeal = deal;
  negotiation.status = "accepted";
  negotiation.agreedDeal = structuredClone(deal);
  negotiation.closedAt = saveWorld.clock.date;
  saveWorld.history.suppliers.push({ date: saveWorld.clock.date, type: "supplier_agreement", ...structuredClone(deal) });
  return { status: "accepted", negotiation: structuredClone(negotiation), deal: structuredClone(deal) };
}

export function withdrawSupplierNegotiation(saveWorld, teamId, negotiationId) {
  const state = ensureSupplierTeam(saveWorld, teamId);
  const negotiation = state.negotiations.find((row) => row.negotiationId === negotiationId);
  if (!negotiation || !["open", "countered"].includes(negotiation.status)) throw new Error("Supplier negotiation is not open.");
  negotiation.status = "withdrawn";
  negotiation.closedAt = saveWorld.clock.date;
  return structuredClone(negotiation);
}

export function activateSupplierSeason(saveWorld, season = Number(saveWorld.clock?.season), date = saveWorld.clock?.date ?? null) {
  const root = supplierRoot(saveWorld);
  const events = [];
  for (const row of saveWorld.world?.teams ?? []) {
    const teamId = row.team_id;
    if (!teamId) continue;
    const state = ensureSupplierTeam(saveWorld, teamId, date);
    if (state.futureDeal && Number(state.futureDeal.effectiveSeason) <= Number(season)) {
      state.active = { ...structuredClone(state.futureDeal), status: "active", activatedAt: date };
      state.futureDeal = null;
      saveWorld.history.suppliers.push({ date, type: "supplier_contract_activated", ...structuredClone(state.active) });
      events.push({ type: SUPPLIER_EVENT.CONTRACT_ACTIVATED, payload: { team_id: teamId, engine_id: state.active.engineId, contract_id: state.active.contractId, end_season: state.active.endSeason } });
      continue;
    }
    if (state.active && Number(state.active.endSeason) < Number(season)) {
      const previous = state.active;
      state.active = {
        ...structuredClone(previous),
        contractId: nextId(saveWorld, "supplier-continuity", teamId),
        startSeason: Number(season),
        effectiveSeason: Number(season),
        endSeason: Number(season),
        source: "simulation_continuity_renewal",
        valueSource: previous.annualValueMode === "currency" ? previous.valueSource : "continuity_value_unknown",
        signedAt: date,
        activatedAt: date,
        status: "active",
      };
      saveWorld.history.suppliers.push({ date, type: "supplier_auto_renewal", ...structuredClone(state.active) });
      events.push({ type: SUPPLIER_EVENT.AUTO_RENEWED, payload: { team_id: teamId, engine_id: state.active.engineId, contract_id: state.active.contractId, end_season: state.active.endSeason } });
    }
  }
  return events;
}

export function technicalSupplierMonthlyCost(saveWorld, teamId) {
  const state = saveWorld.world?.technical?.suppliers?.teams?.[teamId];
  const contract = state?.active ?? null;
  if (!contract || contract.annualValueMode !== "currency") return 0;
  return round(Math.max(0, numeric(contract.annualValue, 0)) / 12);
}

export function supplierProjection(saveWorld, teamId) {
  if (!teamId) return null;
  const state = ensureSupplierTeam(saveWorld, teamId);
  return {
    active: structuredClone(state.active),
    futureDeal: structuredClone(state.futureDeal),
    negotiations: structuredClone(state.negotiations.slice(-12)),
    market: listSupplierMarket(saveWorld, teamId),
  };
}
