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
  title: { value: 1.0, activityCommitment: 2, targetPosition: 6 },
  major: { value: 0.56, activityCommitment: 1, targetPosition: 10 },
  partner: { value: 0.24, activityCommitment: 0, targetPosition: null },
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

function normalizedSeason(saveWorld) {
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

function isActiveInSeason(row, season) {
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
  if (season < 2006) return { id: "global-expansion", titleSlots: 1, majorSlots: 3, partnerSlots: 6, activityIntensity: 0.85, valueScale: 1.0 };
  if (season < 2017) return { id: "corporate-global", titleSlots: 1, majorSlots: 4, partnerSlots: 8, activityIntensity: 1.0, valueScale: 1.15 };
  return { id: "digital-global", titleSlots: 1, majorSlots: 5, partnerSlots: 10, activityIntensity: 1.2, valueScale: 1.3 };
}

export function ensureCommercialState(saveWorld) {
  saveWorld.world.management ??= {};
  saveWorld.world.management.commercial ??= {
    teams: {},
    negotiations: [],
    activities: [],
    nextDealId: 1,
    nextNegotiationId: 1,
    nextActivityId: 1,
  };
  const state = saveWorld.world.management.commercial;
  state.teams ??= {};
  state.negotiations ??= [];
  state.activities ??= [];
  state.nextDealId = Math.max(1, Number(state.nextDealId ?? 1));
  state.nextNegotiationId = Math.max(1, Number(state.nextNegotiationId ?? 1));
  state.nextActivityId = Math.max(1, Number(state.nextActivityId ?? 1));
  saveWorld.history.commercial ??= [];
  return state;
}

function sponsorModelForTeam(saveWorld, id) {
  return (saveWorld.world?.sponsorModels ?? saveWorld.world?.seasonPack?.sponsorModels ?? [])
    .find((row) => String(row.team_id ?? "") === String(id)) ?? {};
}

function financeModelForTeam(saveWorld, id) {
  return (saveWorld.world?.financeModels ?? saveWorld.world?.seasonPack?.financeModels ?? [])
    .find((row) => String(row.team_id ?? "") === String(id)) ?? {};
}

function teamPortfolioEstimate(saveWorld, id) {
  const sponsorModel = sponsorModelForTeam(saveWorld, id);
  const financeModel = financeModelForTeam(saveWorld, id);
  const internal = numeric(sponsorModel.estimated_annual_value_units ?? sponsorModel.estimated_sponsor_income_units, null)
    ?? numeric(financeModel.estimated_sponsor_income_units, null);
  if (internal !== null) return { value: internal, source: "gameplay_model_estimate" };
  const millions = numeric(sponsorModel.estimated_annual_value_m ?? sponsorModel.estimated_sponsor_income_m, null)
    ?? numeric(financeModel.estimated_sponsor_income_m, null);
  if (millions !== null) return { value: millions * 1_000_000, source: "gameplay_model_estimate" };
  return { value: null, source: "unavailable" };
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

function contractTier(row) {
  const raw = String(row?.tier ?? row?.sponsor_tier ?? row?.role ?? row?.sponsor_type ?? "").toLowerCase();
  if (raw.includes("title")) return "title";
  if (raw.includes("major") || raw.includes("primary") || raw.includes("main")) return "major";
  return "partner";
}

function categoryForSponsor(row, id) {
  const raw = row?.category ?? row?.sponsor_category ?? row?.industry ?? row?.sector ?? null;
  return raw ? String(raw).trim().toLowerCase() : `uncategorized:${id}`;
}

function countryForSponsor(row) {
  return row?.country ?? row?.nationality ?? row?.home_country ?? row?.market ?? null;
}

function teamRow(saveWorld, id) {
  return (saveWorld.world?.teams ?? []).find((row) => String(teamId(row)) === String(id)) ?? {};
}

function teamReputation(saveWorld, id) {
  const team = teamRow(saveWorld, id);
  const state = saveWorld.world?.teamState?.[id] ?? {};
  const raw = numeric(state.reputation ?? team.reputation ?? team.prestige ?? team.team_reputation ?? team.constructor_reputation, 50);
  return clamp(raw <= 10 ? raw * 10 : raw);
}

function standingsPosition(saveWorld, id) {
  const table = saveWorld.world?.championship?.constructors ?? {};
  const entries = Object.entries(table)
    .map(([teamIdValue, row]) => ({ teamId: teamIdValue, points: numeric(row.countedPoints ?? row.points, 0) }))
    .sort((a, b) => b.points - a.points || a.teamId.localeCompare(b.teamId));
  const index = entries.findIndex((row) => String(row.teamId) === String(id));
  return index >= 0 ? index + 1 : null;
}

function driverReputation(saveWorld, id) {
  const state = saveWorld.world?.careerState?.drivers?.[id] ?? {};
  const rating = (saveWorld.world?.driverRatings ?? []).find((row) => String(row.driver_id) === String(id)) ?? {};
  const profile = (saveWorld.world?.drivers ?? []).find((row) => String(row.driver_id ?? row.id) === String(id)) ?? {};
  const raw = numeric(state.reputation ?? rating.reputation ?? profile.reputation ?? state.currentAbility ?? rating.current_ability ?? profile.current_ability, 50);
  return clamp(raw <= 10 ? raw * 10 : raw);
}

function recentDriverResults(saveWorld, driverId) {
  const races = [...(saveWorld.history?.races ?? [])].slice(-5);
  const positions = [];
  for (const race of races) {
    const result = (race.classification ?? []).find((row) => String(row.driverId ?? row.driver_id) === String(driverId));
    if (result) positions.push(Number(result.position));
  }
  return positions.filter(Number.isFinite);
}

export function driverMarketability(saveWorld, driverId) {
  const reputation = driverReputation(saveWorld, driverId);
  const positions = recentDriverResults(saveWorld, driverId);
  const wins = positions.filter((position) => position === 1).length;
  const podiums = positions.filter((position) => position <= 3).length;
  const person = saveWorld.world?.management?.people?.drivers?.[driverId]?.mentality ?? {};
  const confidence = numeric(person.confidence, 50);
  return round(clamp(reputation * 0.7 + wins * 7 + podiums * 2.5 + (confidence - 50) * 0.08, 5, 100));
}

function teamDriverMarketability(saveWorld, id) {
  const drivers = Object.entries(saveWorld.world?.employment?.drivers ?? {})
    .filter(([, row]) => String(row?.teamId ?? "") === String(id) && row?.status === "employed")
    .map(([driverId]) => driverMarketability(saveWorld, driverId));
  if (!drivers.length) return 40;
  return drivers.reduce((sum, value) => sum + value, 0) / drivers.length;
}

function recentTeamPerformance(saveWorld, id) {
  const races = [...(saveWorld.history?.races ?? [])].slice(-5);
  if (!races.length) return 50;
  const scores = races.map((race) => {
    const positions = (race.classification ?? [])
      .filter((row) => String(row.teamId ?? row.team_id) === String(id))
      .map((row) => Number(row.position))
      .filter(Number.isFinite);
    if (!positions.length) return 30;
    const best = Math.min(...positions);
    return clamp(100 - (best - 1) * 5, 20, 100);
  });
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

function commercialFacilityScore(saveWorld, id) {
  const row = (saveWorld.world?.facilities ?? []).find((item) => String(item.team_id ?? "") === String(id)) ?? {};
  for (const field of ["hospitality", "commercial", "commercial_facility", "brand_facility", "marketing"]) {
    const value = numeric(row[field], null);
    if (value !== null) return clamp(value <= 10 ? value * 10 : value);
  }
  return 50;
}

export function calculateTeamMarketability(saveWorld, id) {
  const reputation = teamReputation(saveWorld, id);
  const drivers = teamDriverMarketability(saveWorld, id);
  const recent = recentTeamPerformance(saveWorld, id);
  const position = standingsPosition(saveWorld, id);
  const championship = position === null ? 50 : clamp(95 - (position - 1) * 6, 20, 95);
  const facilities = commercialFacilityScore(saveWorld, id);
  const portfolio = teamPortfolioEstimate(saveWorld, id);
  const modelBoost = portfolio.value === null ? 0 : clamp(Math.log10(Math.max(1, portfolio.value)) * 2 - 10, -5, 10);
  return round(clamp(reputation * 0.36 + drivers * 0.24 + recent * 0.16 + championship * 0.14 + facilities * 0.1 + modelBoost, 5, 100));
}

function historicalSponsorRows(saveWorld, id) {
  const season = normalizedSeason(saveWorld);
  return (saveWorld.world?.sponsorContracts ?? []).filter((row) => String(row.team_id ?? "") === String(id) && isActiveInSeason(row, season));
}

function visibleSponsorRows(saveWorld) {
  const visible = listVisibleSponsors(saveWorld, { requireF1Eligible: true });
  const historical = saveWorld.world?.sponsorCatalog ?? saveWorld.world?.sponsors ?? [];
  const byId = new Map();
  for (const row of [...historical, ...visible]) {
    const id = sponsorId(row);
    if (id) byId.set(String(id), { ...(byId.get(String(id)) ?? {}), ...row });
  }
  for (const contract of saveWorld.world?.sponsorContracts ?? []) {
    const id = sponsorId(contract);
    if (!id) continue;
    byId.set(String(id), { sponsor_id: id, sponsor_name: sponsorName(contract), ...(byId.get(String(id)) ?? {}), ...contract });
  }
  return [...byId.values()];
}

function sponsorProfile(saveWorld, id) {
  const source = visibleSponsorRows(saveWorld).find((row) => String(sponsorId(row)) === String(id)) ?? { sponsor_id: id, sponsor_name: id };
  const prestigeRaw = numeric(source.reputation ?? source.prestige ?? source.brand_strength ?? source.marketability, null);
  let prestige = prestigeRaw === null ? null : clamp(prestigeRaw <= 10 ? prestigeRaw * 10 : prestigeRaw);
  let sourceKind = "historical_reference";
  if (prestige === null) {
    const rng = createRng(`${saveWorld.meta?.seed}|sponsor-profile|${id}`);
    prestige = round(38 + rng.next() * 45);
    sourceKind = "simulation_profile";
  }
  return {
    id: String(id),
    name: sponsorName(source),
    category: categoryForSponsor(source, id),
    categoryLabel: String(source.category ?? source.sponsor_category ?? source.industry ?? source.sector ?? "Unknown"),
    country: countryForSponsor(source),
    prestige,
    source: sourceKind,
  };
}

function teamCommercialState(saveWorld, id) {
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

function historicalDealFromRow(saveWorld, id, row, index, total, date) {
  const state = ensureCommercialState(saveWorld);
  const season = normalizedSeason(saveWorld);
  const sid = String(sponsorId(row) ?? `historical:${id}:${index + 1}`);
  const profile = sponsorProfile(saveWorld, sid);
  const exact = explicitAnnualValue(row);
  const portfolio = teamPortfolioEstimate(saveWorld, id);
  const annualValue = exact.value ?? (portfolio.value !== null && total > 0 ? portfolio.value / total : null);
  const source = exact.value !== null ? exact.source : annualValue !== null ? portfolio.source : "abstract_only";
  const startSeason = Number(row.contract_start ?? row.start_year ?? row.start_season ?? row.year ?? season);
  const endSeason = Number(row.contract_until ?? row.end_year ?? row.end_season ?? row.year ?? season);
  return {
    id: `sponsor-deal:${String(state.nextDealId++).padStart(5, "0")}`,
    sponsorId: sid,
    sponsorName: profile.name,
    teamId: id,
    tier: contractTier(row),
    category: profile.category,
    categoryLabel: profile.categoryLabel,
    annualValue: annualValue === null ? null : round(annualValue),
    valueSource: source,
    startSeason: Number.isFinite(startSeason) ? startSeason : season,
    endSeason: Number.isFinite(endSeason) ? endSeason : season,
    satisfaction: 65,
    status: "active",
    source: "historical_start_contract",
    activationCommitment: 0,
    activationsCompleted: 0,
    performanceBonusRate: 0,
    targetPosition: TIER[contractTier(row)]?.targetPosition ?? null,
    signedAt: date,
  };
}

export function initializeCommercialTeam(saveWorld, id, date = saveWorld.clock?.date) {
  const team = teamCommercialState(saveWorld, id);
  if (team.historicalStartLoaded) return team;
  const rows = historicalSponsorRows(saveWorld, id);
  for (const [index, row] of rows.entries()) team.activeDeals.push(historicalDealFromRow(saveWorld, id, row, index, rows.length, date));
  team.historicalStartLoaded = true;
  team.marketability = calculateTeamMarketability(saveWorld, id);
  team.lastMarketabilityUpdate = date;
  return team;
}

export function initializeCommercialWorld(saveWorld, date = saveWorld.clock?.date) {
  ensureCommercialState(saveWorld);
  let teams = 0;
  let deals = 0;
  for (const team of saveWorld.world?.teams ?? []) {
    const id = teamId(team);
    if (!id) continue;
    const state = initializeCommercialTeam(saveWorld, String(id), date);
    teams += 1;
    deals += state.activeDeals.length;
  }
  return { teams, deals };
}

function activeDeals(saveWorld, id, season = normalizedSeason(saveWorld)) {
  return (teamCommercialState(saveWorld, id).activeDeals ?? []).filter((deal) => deal.status === "active" && season >= deal.startSeason && season <= deal.endSeason);
}

export function commercialMonthlySponsorIncome(saveWorld, id, season = normalizedSeason(saveWorld)) {
  const team = ensureCommercialState(saveWorld).teams?.[id];
  if (!team?.historicalStartLoaded) return null;
  return round(activeDeals(saveWorld, id, season).reduce((sum, deal) => sum + (numeric(deal.annualValue, 0) / 12), 0));
}

function slotCapacity(season, tier) {
  const era = commercialEraProfile(season);
  if (tier === "title") return era.titleSlots;
  if (tier === "major") return era.majorSlots;
  return era.partnerSlots;
}

function tierCount(saveWorld, id, tier) {
  return activeDeals(saveWorld, id).filter((deal) => deal.tier === tier).length;
}

function categoryConflict(saveWorld, id, profile, ignoreDealId = null) {
  return activeDeals(saveWorld, id).some((deal) => deal.id !== ignoreDealId && deal.category === profile.category && !String(profile.category).startsWith("uncategorized:"));
}

function sponsorAlreadyActive(saveWorld, id, sid) {
  return activeDeals(saveWorld, id).some((deal) => String(deal.sponsorId) === String(sid));
}

function sponsorActiveTeams(saveWorld, sid) {
  let count = 0;
  for (const id of Object.keys(ensureCommercialState(saveWorld).teams)) {
    if (activeDeals(saveWorld, id).some((deal) => String(deal.sponsorId) === String(sid))) count += 1;
  }
  return count;
}

export function evaluateSponsorInterest(saveWorld, sid, id, options = {}) {
  const profile = sponsorProfile(saveWorld, sid);
  const marketability = calculateTeamMarketability(saveWorld, id);
  const tier = options.tier ?? "partner";
  const team = teamRow(saveWorld, id);
  const teamCountry = team.country ?? team.nationality ?? null;
  const countryFit = profile.country && teamCountry && String(profile.country).toLowerCase() === String(teamCountry).toLowerCase() ? 7 : 0;
  const exclusivity = categoryConflict(saveWorld, id, profile, options.ignoreDealId) ? -100 : 0;
  const saturation = sponsorActiveTeams(saveWorld, sid) * 4;
  const tierDemand = tier === "title" ? 10 : tier === "major" ? 4 : 0;
  const score = clamp(44 + (marketability - 50) * 0.72 + (profile.prestige - 50) * 0.08 + countryFit - tierDemand - saturation + exclusivity);
  return {
    score: round(score),
    level: score >= 78 ? "very_interested" : score >= 62 ? "interested" : score >= 46 ? "open" : score >= 30 ? "reluctant" : "not_interested",
    reasons: [
      ...(marketability >= 70 ? ["strong_team_marketability"] : []),
      ...(marketability < 40 ? ["weak_team_marketability"] : []),
      ...(countryFit ? ["national_market_fit"] : []),
      ...(exclusivity < 0 ? ["category_conflict"] : []),
      ...(saturation >= 8 ? ["sponsor_portfolio_saturated"] : []),
    ],
  };
}

function baseSponsorValue(saveWorld, sid, id, tier) {
  const profile = sponsorProfile(saveWorld, sid);
  const marketability = calculateTeamMarketability(saveWorld, id);
  const era = commercialEraProfile(normalizedSeason(saveWorld));
  const portfolio = teamPortfolioEstimate(saveWorld, id);
  const portfolioBase = portfolio.value ?? Math.max(120_000, (saveWorld.world?.teamState?.[id]?.openingCash ?? 1_000_000) * 0.3);
  const tierScale = TIER[tier]?.value ?? TIER.partner.value;
  const sponsorScale = 0.72 + profile.prestige / 180;
  const teamScale = 0.62 + marketability / 130;
  return round(Math.max(10_000, portfolioBase * tierScale * sponsorScale * teamScale * era.valueScale));
}

export function expectedSponsorTerms(saveWorld, sid, id, tier = "partner") {
  if (!TIER[tier]) throw new Error(`Unknown sponsor tier '${tier}'.`);
  const annualValue = baseSponsorValue(saveWorld, sid, id, tier);
  const era = commercialEraProfile(normalizedSeason(saveWorld));
  const activityCommitment = Math.round((TIER[tier].activityCommitment ?? 0) * era.activityIntensity);
  return {
    tier,
    annualValue,
    durationYears: tier === "title" ? 2 : 1,
    upfrontPercent: tier === "title" ? 12 : tier === "major" ? 8 : 0,
    performanceBonusPercent: tier === "title" ? 12 : tier === "major" ? 7 : 0,
    activationCommitment,
  };
}

export function listSponsorMarket(saveWorld, id, options = {}) {
  initializeCommercialTeam(saveWorld, id);
  const season = normalizedSeason(saveWorld);
  const query = String(options.query ?? "").trim().toLowerCase();
  return visibleSponsorRows(saveWorld)
    .map((row) => sponsorProfile(saveWorld, sponsorId(row)))
    .filter((profile) => profile.id)
    .filter((profile) => !query || `${profile.name} ${profile.categoryLabel} ${profile.country ?? ""}`.toLowerCase().includes(query))
    .filter((profile) => options.includeActive === true || !sponsorAlreadyActive(saveWorld, id, profile.id))
    .map((profile) => ({
      ...profile,
      interest: evaluateSponsorInterest(saveWorld, profile.id, id, { tier: options.tier ?? "partner" }),
      expectedTerms: expectedSponsorTerms(saveWorld, profile.id, id, options.tier ?? "partner"),
      categoryConflict: categoryConflict(saveWorld, id, profile),
      activeTeams: sponsorActiveTeams(saveWorld, profile.id),
      season,
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
  if (tierCount(saveWorld, id, tier) >= slotCapacity(normalizedSeason(saveWorld), tier)) throw new Error(`No ${tier} sponsorship slot is available.`);
  const profile = sponsorProfile(saveWorld, sid);
  if (categoryConflict(saveWorld, id, profile, input.renewDealId ?? null)) throw new Error(`Sponsor category '${profile.categoryLabel}' conflicts with an active partner.`);
  const duplicate = state.negotiations.find((row) => row.teamId === id && row.sponsorId === sid && ["open", "countered"].includes(row.status));
  if (duplicate) return structuredClone(duplicate);
  const interest = evaluateSponsorInterest(saveWorld, sid, id, { tier, ignoreDealId: input.renewDealId ?? null });
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
    interest,
    expectedTerms: expectedSponsorTerms(saveWorld, sid, id, tier),
    offers: [],
    renewDealId: input.renewDealId ?? null,
  };
  state.negotiations.push(negotiation);
  return structuredClone(negotiation);
}

function addDays(dateText, days) {
  const date = new Date(`${String(dateText ?? "").slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) return String(dateText ?? "").slice(0, 10);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizedTerms(negotiation, terms = {}) {
  const expected = negotiation.expectedTerms;
  return {
    tier: negotiation.tier,
    annualValue: Math.max(0, numeric(terms.annualValue, expected.annualValue)),
    durationYears: Math.max(1, Math.min(5, Math.round(numeric(terms.durationYears, expected.durationYears)))),
    upfrontPercent: clamp(numeric(terms.upfrontPercent, expected.upfrontPercent), 0, 40),
    performanceBonusPercent: clamp(numeric(terms.performanceBonusPercent, expected.performanceBonusPercent), 0, 40),
    activationCommitment: Math.max(0, Math.min(8, Math.round(numeric(terms.activationCommitment, expected.activationCommitment)))),
  };
}

function negotiationScore(saveWorld, negotiation, terms) {
  const expected = negotiation.expectedTerms;
  const askRatio = expected.annualValue > 0 ? terms.annualValue / expected.annualValue : 1;
  const valuePenalty = Math.max(0, askRatio - 1) * 48;
  const underAskBonus = Math.max(0, 1 - askRatio) * 14;
  const activationBonus = (terms.activationCommitment - expected.activationCommitment) * 3.5;
  const durationFit = terms.durationYears === expected.durationYears ? 4 : Math.abs(terms.durationYears - expected.durationYears) * -2;
  const rng = createRng(`${saveWorld.meta?.seed}|sponsor-offer|${negotiation.id}|${negotiation.offers.length}|${saveWorld.clock?.date}`);
  return negotiation.interest.score - valuePenalty + underAskBonus + activationBonus + durationFit + (rng.next() - 0.5) * 8;
}

export function submitSponsorOfferEvent(saveWorld, negotiationId, terms = {}) {
  const negotiation = ensureCommercialState(saveWorld).negotiations.find((row) => row.id === negotiationId);
  if (!negotiation) throw new Error(`Sponsor negotiation '${negotiationId}' does not exist.`);
  if (negotiation.status !== "open") throw new Error(`Sponsor negotiation '${negotiationId}' is not open.`);
  const offer = normalizedTerms(negotiation, terms);
  const score = negotiationScore(saveWorld, negotiation, offer);
  negotiation.offers.push({ ...offer, submittedAt: saveWorld.clock?.date ?? null, score: round(score) });
  if (score >= 64) {
    negotiation.status = "accepted";
    negotiation.agreedTerms = offer;
    negotiation.closedAt = saveWorld.clock?.date ?? null;
    return { type: COMMERCIAL_EVENT.NEGOTIATION_ACCEPTED, payload: { negotiation_id: negotiation.id, team_id: negotiation.teamId, sponsor_id: negotiation.sponsorId, sponsor_name: negotiation.sponsorName } };
  }
  if (score >= 46) {
    const expected = negotiation.expectedTerms;
    negotiation.status = "countered";
    negotiation.counterTerms = {
      ...offer,
      annualValue: round(Math.min(offer.annualValue, expected.annualValue * 0.98)),
      activationCommitment: Math.max(offer.activationCommitment, expected.activationCommitment),
      durationYears: expected.durationYears,
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
  if (!["open", "countered"].includes(negotiation.status)) return { type: COMMERCIAL_EVENT.NEGOTIATION_WITHDRAWN, payload: { negotiation_id: negotiation.id, team_id: negotiation.teamId } };
  negotiation.status = "withdrawn";
  negotiation.closedAt = saveWorld.clock?.date ?? null;
  return { type: COMMERCIAL_EVENT.NEGOTIATION_WITHDRAWN, payload: { negotiation_id: negotiation.id, team_id: negotiation.teamId, sponsor_id: negotiation.sponsorId, sponsor_name: negotiation.sponsorName } };
}

function objectivesForDeal(tier, terms) {
  return {
    raceTargetPosition: TIER[tier]?.targetPosition ?? null,
    activationCommitment: terms.activationCommitment ?? 0,
    performanceBonusPercent: terms.performanceBonusPercent ?? 0,
  };
}

export function activateSponsorDeal(saveWorld, negotiationId, options = {}) {
  const state = ensureCommercialState(saveWorld);
  const negotiation = state.negotiations.find((row) => row.id === negotiationId);
  if (!negotiation || negotiation.status !== "accepted" || !negotiation.agreedTerms) throw new Error(`Accepted sponsor negotiation '${negotiationId}' does not exist.`);
  if (negotiation.dealId) return structuredClone(teamCommercialState(saveWorld, negotiation.teamId).activeDeals.find((row) => row.id === negotiation.dealId));
  const terms = negotiation.agreedTerms;
  const season = normalizedSeason(saveWorld);
  const profile = sponsorProfile(saveWorld, negotiation.sponsorId);
  if (categoryConflict(saveWorld, negotiation.teamId, profile, negotiation.renewDealId)) throw new Error(`Sponsor category '${profile.categoryLabel}' conflicts with an active partner.`);
  if (negotiation.renewDealId) {
    const old = teamCommercialState(saveWorld, negotiation.teamId).activeDeals.find((row) => row.id === negotiation.renewDealId);
    if (old) {
      old.status = "superseded";
      old.closedAt = options.date ?? saveWorld.clock?.date ?? null;
    }
  }
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
    targetPosition: objectivesForDeal(negotiation.tier, terms).raceTargetPosition,
    signedAt: options.date ?? saveWorld.clock?.date ?? null,
  };
  teamCommercialState(saveWorld, negotiation.teamId).activeDeals.push(deal);
  negotiation.dealId = deal.id;
  const upfront = round(deal.annualValue * (terms.upfrontPercent / 100));
  const finances = saveWorld.world?.teamState?.[deal.teamId];
  if (finances && upfront > 0) finances.cash = round(numeric(finances.cash, 0) + upfront);
  saveWorld.history.commercial.push({ date: options.date ?? saveWorld.clock?.date ?? null, type: "deal_signed", dealId: deal.id, teamId: deal.teamId, sponsorId: deal.sponsorId, annualValue: deal.annualValue, upfront });
  if (upfront > 0) saveWorld.history.finances?.push?.({ date: options.date ?? saveWorld.clock?.date ?? null, season, type: "sponsor_upfront", teamId: deal.teamId, sponsorId: deal.sponsorId, income: upfront, closingCash: finances?.cash ?? null });
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
  const season = normalizedSeason(saveWorld);
  const expired = [];
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
  const season = normalizedSeason(saveWorld);
  const seasonActivities = state.activities.filter((row) => row.dealId === dealId && row.season === season && row.status !== "cancelled");
  if (seasonActivities.length >= deal.activationCommitment) return null;
  const pending = seasonActivities.find((row) => row.status === "pending");
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
  const team = state.teams?.[activity.teamId];
  const deal = team?.activeDeals?.find((row) => row.id === activity.dealId);
  if (!deal) throw new Error(`Sponsor deal '${activity.dealId}' does not exist.`);
  activity.status = fulfilled ? "fulfilled" : "skipped";
  activity.resolvedAt = date;
  if (fulfilled) {
    deal.activationsCompleted += 1;
    deal.satisfaction = round(clamp(deal.satisfaction + activity.satisfactionReward));
    team.marketability = round(clamp(team.marketability + activity.marketabilityReward));
  } else {
    deal.satisfaction = round(clamp(deal.satisfaction - activity.satisfactionPenalty));
  }
  saveWorld.history.commercial.push({ date, type: "sponsor_activity", activityId, dealId: deal.id, teamId: deal.teamId, sponsorId: deal.sponsorId, fulfilled: Boolean(fulfilled), satisfaction: deal.satisfaction });
  return { activity: structuredClone(activity), deal: structuredClone(deal) };
}

export function raceCommercialConsequences(saveWorld, classification = [], date = saveWorld.clock?.date) {
  const outputs = [];
  const calendarRaces = Math.max(1, (saveWorld.world?.calendar ?? []).length || 16);
  for (const [id, team] of Object.entries(ensureCommercialState(saveWorld).teams)) {
    const positions = classification.filter((row) => String(row.teamId ?? row.team_id) === String(id)).map((row) => Number(row.position)).filter(Number.isFinite);
    if (!positions.length) continue;
    const best = Math.min(...positions);
    for (const deal of activeDeals(saveWorld, id)) {
      const targetMet = deal.targetPosition !== null && best <= deal.targetPosition;
      const delta = targetMet ? 2.5 : best <= 10 ? 0.5 : -0.75;
      deal.satisfaction = round(clamp(deal.satisfaction + delta));
      let bonus = 0;
      if (targetMet && deal.performanceBonusRate > 0 && deal.annualValue) {
        bonus = round((deal.annualValue * deal.performanceBonusRate) / calendarRaces);
        const finances = saveWorld.world?.teamState?.[id];
        if (finances) finances.cash = round(numeric(finances.cash, 0) + bonus);
        saveWorld.history.finances?.push?.({ date, season: normalizedSeason(saveWorld), type: "sponsor_performance_bonus", teamId: id, sponsorId: deal.sponsorId, income: bonus, closingCash: finances?.cash ?? null });
      }
      saveWorld.history.commercial.push({ date, type: "race_sponsor_review", dealId: deal.id, teamId: id, sponsorId: deal.sponsorId, bestPosition: best, targetMet, satisfaction: deal.satisfaction, bonus });
      outputs.push({ dealId: deal.id, teamId: id, sponsorId: deal.sponsorId, targetMet, satisfaction: deal.satisfaction, bonus });
    }
    team.marketability = calculateTeamMarketability(saveWorld, id);
    team.lastMarketabilityUpdate = date;
  }
  return outputs;
}

export function commercialProjection(saveWorld, id) {
  const team = initializeCommercialTeam(saveWorld, id);
  const season = normalizedSeason(saveWorld);
  const era = commercialEraProfile(season);
  return {
    teamId: id,
    season,
    era,
    marketability: team.marketability,
    monthlySponsorIncome: commercialMonthlySponsorIncome(saveWorld, id, season) ?? 0,
    activeDeals: activeDeals(saveWorld, id, season).map((deal) => ({
      ...structuredClone(deal),
      renewalEligible: deal.endSeason <= season + 1,
    })),
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
