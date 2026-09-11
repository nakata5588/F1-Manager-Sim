import { listVisibleSponsors } from "../../domain/entityVisibility.js";
import { createRng } from "../../sim/random.js";

export const COMMERCIAL_EVENT = Object.freeze({
  INITIALIZED: "commercial.initialized",
  MARKETABILITY_UPDATED: "commercial.marketability_updated",
  NEGOTIATION_OPENED: "commercial.negotiation_opened",
  OFFER_SUBMITTED: "commercial.offer_submitted",
  NEGOTIATION_COUNTERED: "commercial.negotiation_countered",
  NEGOTIATION_ACCEPTED: "commercial.negotiation_accepted",
  NEGOTIATION_REJECTED: "commercial.negotiation_rejected",
  NEGOTIATION_WITHDRAWN: "commercial.negotiation_withdrawn",
  DEAL_SIGNED: "commercial.deal_signed",
  DEAL_EXPIRED: "commercial.deal_expired",
  RENEWAL_DUE: "commercial.renewal_due",
  ACTIVITY_DUE: "commercial.activity_due",
  ACTIVITY_RESOLVED: "commercial.activity_resolved",
  BONUS_PAID: "commercial.bonus_paid",
  SATISFACTION_CHANGED: "commercial.satisfaction_changed",
});

const TIER = Object.freeze({
  title: { valueScale: 1, activityCommitment: 2, targetPosition: 6 },
  major: { valueScale: 0.56, activityCommitment: 1, targetPosition: 10 },
  partner: { valueScale: 0.24, activityCommitment: 0, targetPosition: null },
});

function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 2) {
  return Number(Number(value ?? 0).toFixed(digits));
}

function seasonOf(saveWorld) {
  return Number(saveWorld.clock?.season ?? saveWorld.world?.season ?? 0);
}

function sponsorId(row) {
  return row?.sponsor_id ?? row?.entity_id ?? row?.id ?? row?.sponsor_name ?? row?.name ?? null;
}

function sponsorName(row) {
  return row?.sponsor_name ?? row?.display_name ?? row?.name ?? sponsorId(row) ?? "Sponsor";
}

function teamId(row) {
  return row?.team_id ?? row?.id ?? null;
}

function addDays(dateText, days) {
  const date = new Date(`${String(dateText ?? "").slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) return String(dateText ?? "").slice(0, 10);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function activeInSeason(row, season) {
  const start = numeric(row?.contract_start ?? row?.start_year ?? row?.start_season ?? row?.year, null);
  const end = numeric(row?.contract_until ?? row?.end_year ?? row?.end_season ?? row?.year, null);
  if (start !== null && season < start) return false;
  if (end !== null && season > end) return false;
  return true;
}

export function commercialEraProfile(seasonValue) {
  const season = Number(seasonValue);
  if (season < 1968) return { id: "pre-sponsorship", titleSlots: 0, majorSlots: 1, partnerSlots: 2, activityIntensity: 0, valueScale: 0.25 };
  if (season < 1988) return { id: "early-commercial", titleSlots: 1, majorSlots: 2, partnerSlots: 4, activityIntensity: 0.6, valueScale: 0.8 };
  if (season < 2006) return { id: "global-expansion", titleSlots: 1, majorSlots: 3, partnerSlots: 6, activityIntensity: 0.85, valueScale: 1 };
  if (season < 2017) return { id: "corporate-global", titleSlots: 1, majorSlots: 4, partnerSlots: 8, activityIntensity: 1, valueScale: 1.15 };
  return { id: "digital-global", titleSlots: 1, majorSlots: 5, partnerSlots: 10, activityIntensity: 1.2, valueScale: 1.3 };
}

export function ensureCommercialState(saveWorld) {
  saveWorld.world.management ??= {};
  saveWorld.world.management.commercial ??= {};
  const state = saveWorld.world.management.commercial;
  state.teams ??= {};
  state.negotiations ??= [];
  state.activities ??= [];
  state.nextDealId = Math.max(1, Number(state.nextDealId ?? 1));
  state.nextNegotiationId = Math.max(1, Number(state.nextNegotiationId ?? 1));
  state.nextActivityId = Math.max(1, Number(state.nextActivityId ?? 1));
  saveWorld.history.commercial ??= [];
  saveWorld.history.finances ??= [];
  return state;
}

function teamRow(saveWorld, id) {
  return (saveWorld.world?.teams ?? []).find((row) => String(teamId(row)) === String(id)) ?? {};
}

function sponsorModel(saveWorld, id) {
  return (saveWorld.world?.sponsorModels ?? saveWorld.world?.seasonPack?.sponsorModels ?? [])
    .find((row) => String(row.team_id ?? "") === String(id)) ?? {};
}

function financeModel(saveWorld, id) {
  return (saveWorld.world?.financeModels ?? saveWorld.world?.seasonPack?.financeModels ?? [])
    .find((row) => String(row.team_id ?? "") === String(id)) ?? {};
}

function portfolioEstimate(saveWorld, id) {
  const sponsor = sponsorModel(saveWorld, id);
  const finance = financeModel(saveWorld, id);
  const units = numeric(sponsor.estimated_annual_value_units ?? sponsor.estimated_sponsor_income_units, null)
    ?? numeric(finance.estimated_sponsor_income_units, null);
  if (units !== null) return { value: units, source: "gameplay_model_estimate" };
  const millions = numeric(sponsor.estimated_annual_value_m ?? sponsor.estimated_sponsor_income_m, null)
    ?? numeric(finance.estimated_sponsor_income_m, null);
  return millions === null
    ? { value: null, source: "unavailable" }
    : { value: millions * 1_000_000, source: "gameplay_model_estimate" };
}

function explicitAnnualValue(row) {
  for (const field of ["annual_income", "annual_value", "annual_fee", "value", "contract_value"]) {
    const value = numeric(row?.[field], null);
    if (value !== null) return { value, source: `historical_contract:${field}` };
  }
  for (const field of ["monthly_fee", "monthly_income"]) {
    const value = numeric(row?.[field], null);
    if (value !== null) return { value: value * 12, source: `historical_contract:${field}` };
  }
  return { value: null, source: "unavailable" };
}

function tierFrom(row) {
  const value = String(row?.tier ?? row?.sponsor_tier ?? row?.role ?? row?.sponsor_type ?? "").toLowerCase();
  if (value.includes("title")) return "title";
  if (value.includes("major") || value.includes("primary") || value.includes("main")) return "major";
  return "partner";
}

function categoryFrom(row, id) {
  const raw = row?.category ?? row?.sponsor_category ?? row?.industry ?? row?.sector ?? null;
  return raw ? String(raw).trim().toLowerCase() : `uncategorized:${id}`;
}

function sponsorRows(saveWorld) {
  const byId = new Map();
  const live = saveWorld.world?.sponsorCatalog ?? saveWorld.world?.sponsors ?? [];
  for (const row of [...live, ...listVisibleSponsors(saveWorld, { requireF1Eligible: true })]) {
    const id = sponsorId(row);
    if (id) byId.set(String(id), { ...(byId.get(String(id)) ?? {}), ...row });
  }
  for (const contract of saveWorld.world?.sponsorContracts ?? []) {
    const id = sponsorId(contract);
    if (!id) continue;
    byId.set(String(id), {
      sponsor_id: id,
      sponsor_name: sponsorName(contract),
      ...(byId.get(String(id)) ?? {}),
      ...contract,
    });
  }
  return [...byId.values()];
}

function sponsorProfile(saveWorld, id) {
  const source = sponsorRows(saveWorld).find((row) => String(sponsorId(row)) === String(id)) ?? { sponsor_id: id, sponsor_name: id };
  const explicit = numeric(source.reputation ?? source.prestige ?? source.brand_strength ?? source.marketability, null);
  const rng = createRng(`${saveWorld.meta?.seed}|sponsor-profile|${id}`);
  return {
    id: String(id),
    name: sponsorName(source),
    category: categoryFrom(source, id),
    categoryLabel: String(source.category ?? source.sponsor_category ?? source.industry ?? source.sector ?? "Unknown"),
    country: source.country ?? source.nationality ?? source.home_country ?? source.market ?? null,
    prestige: explicit === null ? round(38 + rng.next() * 45) : clamp(explicit <= 10 ? explicit * 10 : explicit),
    source: explicit === null ? "simulation_profile" : "historical_reference",
  };
}

function teamReputation(saveWorld, id) {
  const source = teamRow(saveWorld, id);
  const dynamic = saveWorld.world?.teamState?.[id] ?? {};
  const value = numeric(dynamic.reputation ?? source.reputation ?? source.prestige ?? source.team_reputation ?? source.constructor_reputation, 50);
  return clamp(value <= 10 ? value * 10 : value);
}

function constructorPosition(saveWorld, id) {
  const table = saveWorld.world?.championship?.constructors ?? {};
  const ordered = Object.entries(table)
    .map(([team, row]) => ({ team, points: numeric(row.countedPoints ?? row.points, 0) }))
    .sort((a, b) => b.points - a.points || a.team.localeCompare(b.team));
  const index = ordered.findIndex((row) => String(row.team) === String(id));
  return index < 0 ? null : index + 1;
}

function driverReputation(saveWorld, id) {
  const state = saveWorld.world?.careerState?.drivers?.[id] ?? {};
  const rating = (saveWorld.world?.driverRatings ?? []).find((row) => String(row.driver_id) === String(id)) ?? {};
  const profile = (saveWorld.world?.drivers ?? []).find((row) => String(row.driver_id ?? row.id) === String(id)) ?? {};
  const value = numeric(state.reputation ?? rating.reputation ?? profile.reputation ?? state.currentAbility ?? rating.current_ability ?? profile.current_ability, 50);
  return clamp(value <= 10 ? value * 10 : value);
}

function recentDriverPositions(saveWorld, id) {
  return [...(saveWorld.history?.races ?? [])].slice(-5)
    .map((race) => (race.classification ?? []).find((row) => String(row.driverId ?? row.driver_id) === String(id)))
    .filter(Boolean)
    .map((row) => Number(row.position))
    .filter(Number.isFinite);
}

export function driverMarketability(saveWorld, driverId) {
  const positions = recentDriverPositions(saveWorld, driverId);
  const reputation = driverReputation(saveWorld, driverId);
  const wins = positions.filter((position) => position === 1).length;
  const podiums = positions.filter((position) => position <= 3).length;
  const confidence = numeric(saveWorld.world?.management?.people?.drivers?.[driverId]?.mentality?.confidence, 50);
  return round(clamp(reputation * 0.7 + wins * 7 + podiums * 2.5 + (confidence - 50) * 0.08, 5, 100));
}

function teamDriverMarketability(saveWorld, id) {
  const values = Object.entries(saveWorld.world?.employment?.drivers ?? {})
    .filter(([, assignment]) => String(assignment?.teamId ?? "") === String(id) && assignment?.status === "employed")
    .map(([driverId]) => driverMarketability(saveWorld, driverId));
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 40;
}

function recentTeamPerformance(saveWorld, id) {
  const races = [...(saveWorld.history?.races ?? [])].slice(-5);
  if (!races.length) return 50;
  const values = races.map((race) => {
    const positions = (race.classification ?? [])
      .filter((row) => String(row.teamId ?? row.team_id) === String(id))
      .map((row) => Number(row.position))
      .filter(Number.isFinite);
    return positions.length ? clamp(100 - (Math.min(...positions) - 1) * 5, 20, 100) : 30;
  });
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function commercialFacility(saveWorld, id) {
  const row = (saveWorld.world?.facilities ?? []).find((item) => String(item.team_id ?? "") === String(id)) ?? {};
  for (const field of ["hospitality", "commercial", "commercial_facility", "brand_facility", "marketing"]) {
    const value = numeric(row[field], null);
    if (value !== null) return clamp(value <= 10 ? value * 10 : value);
  }
  return 50;
}

export function calculateTeamMarketability(saveWorld, id) {
  const position = constructorPosition(saveWorld, id);
  const championship = position === null ? 50 : clamp(95 - (position - 1) * 6, 20, 95);
  const estimate = portfolioEstimate(saveWorld, id);
  const modelSignal = estimate.value === null ? 0 : clamp(Math.log10(Math.max(1, estimate.value)) * 2 - 10, -5, 10);
  return round(clamp(
    teamReputation(saveWorld, id) * 0.36
      + teamDriverMarketability(saveWorld, id) * 0.24
      + recentTeamPerformance(saveWorld, id) * 0.16
      + championship * 0.14
      + commercialFacility(saveWorld, id) * 0.1
      + modelSignal,
    5,
    100,
  ));
}

function teamState(saveWorld, id) {
  const state = ensureCommercialState(saveWorld);
  state.teams[id] ??= {
    teamId: id,
    marketability: calculateTeamMarketability(saveWorld, id),
    activeDeals: [],
    initializedAt: saveWorld.clock?.date ?? null,
    lastMarketabilityUpdate: saveWorld.clock?.date ?? null,
  };
  return state.teams[id];
}

function historicalDeal(saveWorld, id, row, index, total, date) {
  const state = ensureCommercialState(saveWorld);
  const season = seasonOf(saveWorld);
  const sid = String(sponsorId(row) ?? `historical:${id}:${index + 1}`);
  const profile = sponsorProfile(saveWorld, sid);
  const exact = explicitAnnualValue(row);
  const estimate = portfolioEstimate(saveWorld, id);
  const annualValue = exact.value ?? (estimate.value !== null && total > 0 ? estimate.value / total : null);
  const tier = tierFrom(row);
  return {
    id: `sponsor-deal:${String(state.nextDealId++).padStart(5, "0")}`,
    sponsorId: sid,
    sponsorName: profile.name,
    teamId: id,
    tier,
    category: profile.category,
    categoryLabel: profile.categoryLabel,
    annualValue: annualValue === null ? null : round(annualValue),
    valueSource: exact.value !== null ? exact.source : annualValue !== null ? estimate.source : "abstract_only",
    startSeason: numeric(row.contract_start ?? row.start_year ?? row.start_season ?? row.year, season),
    endSeason: numeric(row.contract_until ?? row.end_year ?? row.end_season ?? row.year, season),
    satisfaction: 65,
    status: "active",
    source: "historical_start_contract",
    activationCommitment: 0,
    activationsCompleted: 0,
    performanceBonusRate: 0,
    targetPosition: TIER[tier]?.targetPosition ?? null,
    signedAt: date,
  };
}

export function initializeCommercialTeam(saveWorld, id, date = saveWorld.clock?.date) {
  const team = teamState(saveWorld, id);
  if (team.historicalStartLoaded) return team;
  const rows = (saveWorld.world?.sponsorContracts ?? [])
    .filter((row) => String(row.team_id ?? "") === String(id) && activeInSeason(row, seasonOf(saveWorld)));
  for (const [index, row] of rows.entries()) team.activeDeals.push(historicalDeal(saveWorld, id, row, index, rows.length, date));
  team.historicalStartLoaded = true;
  team.marketability = calculateTeamMarketability(saveWorld, id);
  team.lastMarketabilityUpdate = date;
  return team;
}

export function initializeCommercialWorld(saveWorld, date = saveWorld.clock?.date) {
  ensureCommercialState(saveWorld);
  let teams = 0;
  let deals = 0;
  for (const row of saveWorld.world?.teams ?? []) {
    const id = teamId(row);
    if (!id) continue;
    const team = initializeCommercialTeam(saveWorld, String(id), date);
    teams += 1;
    deals += team.activeDeals.length;
  }
  return { teams, deals };
}

function activeDeals(saveWorld, id, season = seasonOf(saveWorld)) {
  return (teamState(saveWorld, id).activeDeals ?? [])
    .filter((deal) => deal.status === "active" && season >= deal.startSeason && season <= deal.endSeason);
}

export function commercialMonthlySponsorIncome(saveWorld, id, season = seasonOf(saveWorld)) {
  const team = ensureCommercialState(saveWorld).teams?.[id];
  if (!team?.historicalStartLoaded) return null;
  return round(activeDeals(saveWorld, id, season).reduce((sum, deal) => sum + numeric(deal.annualValue, 0) / 12, 0));
}

function capacity(season, tier) {
  const era = commercialEraProfile(season);
  return tier === "title" ? era.titleSlots : tier === "major" ? era.majorSlots : era.partnerSlots;
}

function tierCount(saveWorld, id, tier, ignoreDealId = null) {
  return activeDeals(saveWorld, id).filter((deal) => deal.id !== ignoreDealId && deal.tier === tier).length;
}

function categoryConflict(saveWorld, id, profile, ignoreDealId = null) {
  if (String(profile.category).startsWith("uncategorized:")) return false;
  return activeDeals(saveWorld, id).some((deal) => deal.id !== ignoreDealId && deal.category === profile.category);
}

function sponsorAlreadyActive(saveWorld, id, sid) {
  return activeDeals(saveWorld, id).some((deal) => String(deal.sponsorId) === String(sid));
}

function sponsorActiveTeams(saveWorld, sid) {
  return Object.keys(ensureCommercialState(saveWorld).teams)
    .filter((id) => activeDeals(saveWorld, id).some((deal) => String(deal.sponsorId) === String(sid))).length;
}

export function evaluateSponsorInterest(saveWorld, sid, id, options = {}) {
  const profile = sponsorProfile(saveWorld, sid);
  const marketability = calculateTeamMarketability(saveWorld, id);
  const team = teamRow(saveWorld, id);
  const teamCountry = team.country ?? team.nationality ?? null;
  const countryFit = profile.country && teamCountry && String(profile.country).toLowerCase() === String(teamCountry).toLowerCase() ? 7 : 0;
  const conflict = categoryConflict(saveWorld, id, profile, options.ignoreDealId) ? -100 : 0;
  const saturation = sponsorActiveTeams(saveWorld, sid) * 4;
  const tierDemand = options.tier === "title" ? 10 : options.tier === "major" ? 4 : 0;
  const score = clamp(44 + (marketability - 50) * 0.72 + (profile.prestige - 50) * 0.08 + countryFit - tierDemand - saturation + conflict);
  return {
    score: round(score),
    level: score >= 78 ? "very_interested" : score >= 62 ? "interested" : score >= 46 ? "open" : score >= 30 ? "reluctant" : "not_interested",
    reasons: [
      ...(marketability >= 70 ? ["strong_team_marketability"] : []),
      ...(marketability < 40 ? ["weak_team_marketability"] : []),
      ...(countryFit ? ["national_market_fit"] : []),
      ...(conflict < 0 ? ["category_conflict"] : []),
      ...(saturation >= 8 ? ["sponsor_portfolio_saturated"] : []),
    ],
  };
}

function baseSponsorValue(saveWorld, sid, id, tier) {
  const profile = sponsorProfile(saveWorld, sid);
  const marketability = calculateTeamMarketability(saveWorld, id);
  const era = commercialEraProfile(seasonOf(saveWorld));
  const estimate = portfolioEstimate(saveWorld, id);
  const openingCash = numeric(saveWorld.world?.teamState?.[id]?.openingCash, 1_000_000);
  const portfolioBase = estimate.value ?? Math.max(120_000, openingCash * 0.3);
  return round(Math.max(
    10_000,
    portfolioBase
      * (TIER[tier]?.valueScale ?? TIER.partner.valueScale)
      * (0.72 + profile.prestige / 180)
      * (0.62 + marketability / 130)
      * era.valueScale,
  ));
}

export function expectedSponsorTerms(saveWorld, sid, id, tier = "partner") {
  if (!TIER[tier]) throw new Error(`Unknown sponsor tier '${tier}'.`);
  const era = commercialEraProfile(seasonOf(saveWorld));
  const activationCommitment = Math.round((TIER[tier].activityCommitment ?? 0) * era.activityIntensity);
  return {
    tier,
    annualValue: baseSponsorValue(saveWorld, sid, id, tier),
    durationYears: tier === "title" ? 2 : 1,
    upfrontPercent: tier === "title" ? 12 : tier === "major" ? 8 : 0,
    performanceBonusPercent: tier === "title" ? 12 : tier === "major" ? 7 : 0,
    activationCommitment,
  };
}

export function listSponsorMarket(saveWorld, id, options = {}) {
  initializeCommercialTeam(saveWorld, id);
  const tier = options.tier ?? "partner";
  const query = String(options.query ?? "").trim().toLowerCase();
  return sponsorRows(saveWorld)
    .map((row) => sponsorProfile(saveWorld, sponsorId(row)))
    .filter((profile) => profile.id)
    .filter((profile) => !query || `${profile.name} ${profile.categoryLabel} ${profile.country ?? ""}`.toLowerCase().includes(query))
    .filter((profile) => options.includeActive === true || !sponsorAlreadyActive(saveWorld, id, profile.id))
    .map((profile) => ({
      ...profile,
      interest: evaluateSponsorInterest(saveWorld, profile.id, id, { tier }),
      expectedTerms: expectedSponsorTerms(saveWorld, profile.id, id, tier),
      categoryConflict: categoryConflict(saveWorld, id, profile),
      activeTeams: sponsorActiveTeams(saveWorld, profile.id),
      season: seasonOf(saveWorld),
    }))
    .sort((a, b) => b.interest.score - a.interest.score || b.prestige - a.prestige || a.name.localeCompare(b.name));
}

export function openSponsorNegotiation(saveWorld, input = {}) {
  const state = ensureCommercialState(saveWorld);
  const id = String(input.teamId ?? "").trim();
  const sid = String(input.sponsorId ?? "").trim();
  const tier = String(input.tier ?? "partner").trim();
  if (!id || !sid) throw new Error("teamId and sponsorId are required.");
  if (!TIER[tier]) throw new Error(`Unknown sponsor tier '${tier}'.`);
  initializeCommercialTeam(saveWorld, id);
  const renewing = input.renewDealId ?? null;
  if (tierCount(saveWorld, id, tier, renewing) >= capacity(seasonOf(saveWorld), tier)) throw new Error(`No ${tier} sponsorship slot is available.`);
  const profile = sponsorProfile(saveWorld, sid);
  if (categoryConflict(saveWorld, id, profile, renewing)) throw new Error(`Sponsor category '${profile.categoryLabel}' conflicts with an active partner.`);
  const duplicate = state.negotiations.find((row) => row.teamId === id && row.sponsorId === sid && ["open", "countered"].includes(row.status));
  if (duplicate) return structuredClone(duplicate);
  const negotiation = {
    id: `sponsor-negotiation:${String(state.nextNegotiationId++).padStart(5, "0")}`,
    teamId: id,
    sponsorId: sid,
    sponsorName: profile.name,
    category: profile.category,
    categoryLabel: profile.categoryLabel,
    tier,
    status: "open",
    openedAt: saveWorld.clock?.date ?? null,
    expiresAt: addDays(saveWorld.clock?.date, 14),
    interest: evaluateSponsorInterest(saveWorld, sid, id, { tier, ignoreDealId: renewing }),
    expectedTerms: expectedSponsorTerms(saveWorld, sid, id, tier),
    offers: [],
    renewDealId: renewing,
  };
  state.negotiations.push(negotiation);
  return structuredClone(negotiation);
}

function normalizeOffer(negotiation, input = {}) {
  const expected = negotiation.expectedTerms;
  return {
    tier: negotiation.tier,
    annualValue: Math.max(0, numeric(input.annualValue, expected.annualValue)),
    durationYears: Math.max(1, Math.min(5, Math.round(numeric(input.durationYears, expected.durationYears)))),
    upfrontPercent: clamp(numeric(input.upfrontPercent, expected.upfrontPercent), 0, 40),
    performanceBonusPercent: clamp(numeric(input.performanceBonusPercent, expected.performanceBonusPercent), 0, 40),
    activationCommitment: Math.max(0, Math.min(8, Math.round(numeric(input.activationCommitment, expected.activationCommitment)))),
  };
}

function offerScore(saveWorld, negotiation, terms) {
  const expected = negotiation.expectedTerms;
  const ratio = expected.annualValue > 0 ? terms.annualValue / expected.annualValue : 1;
  const valueEffect = -Math.max(0, ratio - 1) * 48 + Math.max(0, 1 - ratio) * 14;
  const activationEffect = (terms.activationCommitment - expected.activationCommitment) * 3.5;
  const durationEffect = terms.durationYears === expected.durationYears ? 4 : -Math.abs(terms.durationYears - expected.durationYears) * 2;
  const rng = createRng(`${saveWorld.meta?.seed}|sponsor-offer|${negotiation.id}|${negotiation.offers.length}|${saveWorld.clock?.date}`);
  return negotiation.interest.score + valueEffect + activationEffect + durationEffect + (rng.next() - 0.5) * 8;
}

export function submitSponsorOfferEvent(saveWorld, negotiationId, input = {}) {
  const negotiation = ensureCommercialState(saveWorld).negotiations.find((row) => row.id === negotiationId);
  if (!negotiation) throw new Error(`Sponsor negotiation '${negotiationId}' does not exist.`);
  if (negotiation.status !== "open") throw new Error(`Sponsor negotiation '${negotiationId}' is not open.`);
  const terms = normalizeOffer(negotiation, input);
  const score = offerScore(saveWorld, negotiation, terms);
  negotiation.offers.push({ ...terms, score: round(score), submittedAt: saveWorld.clock?.date ?? null });
  if (score >= 64) {
    negotiation.status = "accepted";
    negotiation.agreedTerms = terms;
    negotiation.closedAt = saveWorld.clock?.date ?? null;
    return { type: COMMERCIAL_EVENT.NEGOTIATION_ACCEPTED, payload: { negotiation_id: negotiation.id, team_id: negotiation.teamId, sponsor_id: negotiation.sponsorId, sponsor_name: negotiation.sponsorName } };
  }
  if (score >= 46) {
    negotiation.status = "countered";
    negotiation.counterTerms = {
      ...terms,
      annualValue: round(Math.min(terms.annualValue, negotiation.expectedTerms.annualValue * 0.98)),
      durationYears: negotiation.expectedTerms.durationYears,
      activationCommitment: Math.max(terms.activationCommitment, negotiation.expectedTerms.activationCommitment),
    };
    return { type: COMMERCIAL_EVENT.NEGOTIATION_COUNTERED, payload: { negotiation_id: negotiation.id, team_id: negotiation.teamId, sponsor_id: negotiation.sponsorId, sponsor_name: negotiation.sponsorName } };
  }
  negotiation.status = "rejected";
  negotiation.closedAt = saveWorld.clock?.date ?? null;
  return { type: COMMERCIAL_EVENT.NEGOTIATION_REJECTED, payload: { negotiation_id: negotiation.id, team_id: negotiation.teamId, sponsor_id: negotiation.sponsorId, sponsor_name: negotiation.sponsorName } };
}

export function acceptSponsorCounterEvent(saveWorld, negotiationId) {
  const negotiation = ensureCommercialState(saveWorld).negotiations.find((row) => row.id === negotiationId);
  if (!negotiation || negotiation.status !== "countered" || !negotiation.counterTerms) throw new Error(`Sponsor negotiation '${negotiationId}' has no counter-offer.`);
  negotiation.status = "accepted";
  negotiation.agreedTerms = { ...negotiation.counterTerms };
  negotiation.closedAt = saveWorld.clock?.date ?? null;
  return { type: COMMERCIAL_EVENT.NEGOTIATION_ACCEPTED, payload: { negotiation_id: negotiation.id, team_id: negotiation.teamId, sponsor_id: negotiation.sponsorId, sponsor_name: negotiation.sponsorName } };
}

export function withdrawSponsorNegotiationEvent(saveWorld, negotiationId) {
  const negotiation = ensureCommercialState(saveWorld).negotiations.find((row) => row.id === negotiationId);
  if (!negotiation) throw new Error(`Sponsor negotiation '${negotiationId}' does not exist.`);
  if (["open", "countered"].includes(negotiation.status)) {
    negotiation.status = "withdrawn";
    negotiation.closedAt = saveWorld.clock?.date ?? null;
  }
  return { type: COMMERCIAL_EVENT.NEGOTIATION_WITHDRAWN, payload: { negotiation_id: negotiation.id, team_id: negotiation.teamId, sponsor_id: negotiation.sponsorId, sponsor_name: negotiation.sponsorName } };
}

export function activateSponsorDeal(saveWorld, negotiationId, options = {}) {
  const state = ensureCommercialState(saveWorld);
  const negotiation = state.negotiations.find((row) => row.id === negotiationId);
  if (!negotiation || negotiation.status !== "accepted" || !negotiation.agreedTerms) throw new Error(`Accepted sponsor negotiation '${negotiationId}' does not exist.`);
  if (negotiation.dealId) {
    return structuredClone(teamState(saveWorld, negotiation.teamId).activeDeals.find((row) => row.id === negotiation.dealId));
  }
  const profile = sponsorProfile(saveWorld, negotiation.sponsorId);
  if (categoryConflict(saveWorld, negotiation.teamId, profile, negotiation.renewDealId)) throw new Error(`Sponsor category '${profile.categoryLabel}' conflicts with an active partner.`);
  if (negotiation.renewDealId) {
    const previous = teamState(saveWorld, negotiation.teamId).activeDeals.find((row) => row.id === negotiation.renewDealId);
    if (previous) {
      previous.status = "superseded";
      previous.closedAt = options.date ?? saveWorld.clock?.date ?? null;
    }
  }
  const terms = negotiation.agreedTerms;
  const season = seasonOf(saveWorld);
  const deal = {
    id: `sponsor-deal:${String(state.nextDealId++).padStart(5, "0")}`,
    sponsorId: negotiation.sponsorId,
    sponsorName: negotiation.sponsorName,
    teamId: negotiation.teamId,
    tier: negotiation.tier,
    category: negotiation.category,
    categoryLabel: negotiation.categoryLabel,
    annualValue: round(terms.annualValue),
    valueSource: "simulation_negotiation",
    startSeason: season,
    endSeason: season + terms.durationYears - 1,
    satisfaction: 68,
    status: "active",
    source: options.source ?? "player_negotiation",
    activationCommitment: terms.activationCommitment,
    activationsCompleted: 0,
    performanceBonusRate: terms.performanceBonusPercent / 100,
    targetPosition: TIER[negotiation.tier]?.targetPosition ?? null,
    signedAt: options.date ?? saveWorld.clock?.date ?? null,
  };
  teamState(saveWorld, negotiation.teamId).activeDeals.push(deal);
  negotiation.dealId = deal.id;

  const upfront = round(deal.annualValue * (terms.upfrontPercent / 100));
  const finance = saveWorld.world?.teamState?.[deal.teamId];
  if (finance && upfront > 0) finance.cash = round(numeric(finance.cash, 0) + upfront);
  saveWorld.history.commercial.push({ date: options.date ?? saveWorld.clock?.date ?? null, type: "deal_signed", dealId: deal.id, teamId: deal.teamId, sponsorId: deal.sponsorId, annualValue: deal.annualValue, upfront });
  if (upfront > 0) saveWorld.history.finances.push({ date: options.date ?? saveWorld.clock?.date ?? null, season, type: "sponsor_upfront", teamId: deal.teamId, sponsorId: deal.sponsorId, income: upfront, closingCash: finance?.cash ?? null });
  return structuredClone(deal);
}

export function listSponsorNegotiations(saveWorld, options = {}) {
  return ensureCommercialState(saveWorld).negotiations
    .filter((row) => !options.teamId || row.teamId === options.teamId)
    .filter((row) => !options.status || row.status === options.status)
    .map((row) => structuredClone(row));
}

export function updateCommercialMarketability(saveWorld, id, date = saveWorld.clock?.date) {
  const team = initializeCommercialTeam(saveWorld, id, date);
  const before = team.marketability;
  team.marketability = calculateTeamMarketability(saveWorld, id);
  team.lastMarketabilityUpdate = date;
  return { teamId: id, before, marketability: team.marketability, delta: round(team.marketability - before) };
}

export function expireCommercialDeals(saveWorld, date = saveWorld.clock?.date) {
  const expired = [];
  const season = seasonOf(saveWorld);
  for (const team of Object.values(ensureCommercialState(saveWorld).teams)) {
    for (const deal of team.activeDeals ?? []) {
      if (deal.status === "active" && deal.endSeason < season) {
        deal.status = "expired";
        deal.expiredAt = date;
        expired.push(structuredClone(deal));
      }
    }
  }
  return expired;
}

export function createSponsorActivity(saveWorld, dealId, date = saveWorld.clock?.date) {
  const state = ensureCommercialState(saveWorld);
  const deal = Object.values(state.teams).flatMap((team) => team.activeDeals ?? []).find((row) => row.id === dealId);
  if (!deal || deal.status !== "active") return null;
  const season = seasonOf(saveWorld);
  const rows = state.activities.filter((row) => row.dealId === dealId && row.season === season && row.status !== "cancelled");
  if (rows.length >= deal.activationCommitment) return null;
  const pending = rows.find((row) => row.status === "pending");
  if (pending) return structuredClone(pending);
  const activity = {
    id: `sponsor-activity:${String(state.nextActivityId++).padStart(5, "0")}`,
    dealId,
    teamId: deal.teamId,
    sponsorId: deal.sponsorId,
    sponsorName: deal.sponsorName,
    season,
    status: "pending",
    createdAt: date,
    marketabilityReward: deal.tier === "title" ? 2 : 1,
    satisfactionReward: deal.tier === "title" ? 4 : 3,
    satisfactionPenalty: deal.tier === "title" ? 8 : 5,
  };
  state.activities.push(activity);
  return structuredClone(activity);
}

export function resolveSponsorActivity(saveWorld, activityId, fulfilled, date = saveWorld.clock?.date) {
  const state = ensureCommercialState(saveWorld);
  const activity = state.activities.find((row) => row.id === activityId);
  if (!activity || activity.status !== "pending") throw new Error(`Pending sponsor activity '${activityId}' does not exist.`);
  const deal = state.teams?.[activity.teamId]?.activeDeals?.find((row) => row.id === activity.dealId);
  if (!deal) throw new Error(`Sponsor deal '${activity.dealId}' does not exist.`);
  activity.status = fulfilled ? "fulfilled" : "skipped";
  activity.resolvedAt = date;
  if (fulfilled) {
    deal.activationsCompleted += 1;
    deal.satisfaction = round(clamp(deal.satisfaction + activity.satisfactionReward));
    state.teams[activity.teamId].marketability = round(clamp(state.teams[activity.teamId].marketability + activity.marketabilityReward));
  } else {
    deal.satisfaction = round(clamp(deal.satisfaction - activity.satisfactionPenalty));
  }
  saveWorld.history.commercial.push({ date, type: "sponsor_activity", activityId, dealId: deal.id, teamId: deal.teamId, sponsorId: deal.sponsorId, fulfilled: Boolean(fulfilled), satisfaction: deal.satisfaction });
  return { activity: structuredClone(activity), deal: structuredClone(deal) };
}

export function raceCommercialConsequences(saveWorld, classification = [], date = saveWorld.clock?.date) {
  const output = [];
  const raceCount = Math.max(1, (saveWorld.world?.calendar ?? []).length || 16);
  for (const [id, team] of Object.entries(ensureCommercialState(saveWorld).teams)) {
    const positions = classification
      .filter((row) => String(row.teamId ?? row.team_id) === String(id))
      .map((row) => Number(row.position))
      .filter(Number.isFinite);
    if (!positions.length) continue;
    const best = Math.min(...positions);
    for (const deal of activeDeals(saveWorld, id)) {
      const targetMet = deal.targetPosition !== null && best <= deal.targetPosition;
      deal.satisfaction = round(clamp(deal.satisfaction + (targetMet ? 2.5 : best <= 10 ? 0.5 : -0.75)));
      let bonus = 0;
      if (targetMet && deal.performanceBonusRate > 0 && deal.annualValue) {
        bonus = round((deal.annualValue * deal.performanceBonusRate) / raceCount);
        const finance = saveWorld.world?.teamState?.[id];
        if (finance) finance.cash = round(numeric(finance.cash, 0) + bonus);
        saveWorld.history.finances.push({ date, season: seasonOf(saveWorld), type: "sponsor_performance_bonus", teamId: id, sponsorId: deal.sponsorId, income: bonus, closingCash: finance?.cash ?? null });
      }
      saveWorld.history.commercial.push({ date, type: "race_sponsor_review", dealId: deal.id, teamId: id, sponsorId: deal.sponsorId, bestPosition: best, targetMet, satisfaction: deal.satisfaction, bonus });
      output.push({ dealId: deal.id, teamId: id, sponsorId: deal.sponsorId, targetMet, satisfaction: deal.satisfaction, bonus });
    }
    team.marketability = calculateTeamMarketability(saveWorld, id);
    team.lastMarketabilityUpdate = date;
  }
  return output;
}

export function commercialProjection(saveWorld, id) {
  const team = initializeCommercialTeam(saveWorld, id);
  const season = seasonOf(saveWorld);
  const era = commercialEraProfile(season);
  return {
    teamId: id,
    season,
    era,
    marketability: team.marketability,
    monthlySponsorIncome: commercialMonthlySponsorIncome(saveWorld, id, season) ?? 0,
    activeDeals: activeDeals(saveWorld, id, season).map((deal) => ({ ...structuredClone(deal), renewalEligible: deal.endSeason <= season + 1 })),
    negotiations: listSponsorNegotiations(saveWorld, { teamId: id }),
    pendingActivities: ensureCommercialState(saveWorld).activities.filter((row) => row.teamId === id && row.status === "pending").map((row) => structuredClone(row)),
    slotUsage: {
      title: { used: tierCount(saveWorld, id, "title"), capacity: era.titleSlots },
      major: { used: tierCount(saveWorld, id, "major"), capacity: era.majorSlots },
      partner: { used: tierCount(saveWorld, id, "partner"), capacity: era.partnerSlots },
    },
  };
}

export function commercialSummary(saveWorld, id) {
  if (!id) return { marketability: null, activeDeals: 0, monthlySponsorIncome: 0, openNegotiations: 0, pendingActivities: 0 };
  const projection = commercialProjection(saveWorld, id);
  return {
    marketability: projection.marketability,
    activeDeals: projection.activeDeals.length,
    monthlySponsorIncome: projection.monthlySponsorIncome,
    openNegotiations: projection.negotiations.filter((row) => ["open", "countered"].includes(row.status)).length,
    pendingActivities: projection.pendingActivities.length,
  };
}
