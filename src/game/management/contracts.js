import { listVisibleDrivers } from "../../domain/entityVisibility.js";
import { createRng } from "../../sim/random.js";

export const CONTRACT_NEGOTIATION_EVENT = Object.freeze({
  OFFER_SUBMITTED: "management.contract.offer_submitted",
  COUNTERED: "management.contract.countered",
  ACCEPTED: "management.contract.accepted",
  REJECTED: "management.contract.rejected",
  COUNTER_ACCEPTED: "management.contract.counter_accepted",
  WITHDRAWN: "management.contract.withdrawn",
  EXPIRED: "management.contract.expired",
});

function text(value, fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function addDays(dateText, days) {
  const date = new Date(`${String(dateText).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) return String(dateText).slice(0, 10);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function ensureManagement(saveWorld) {
  saveWorld.world.management ??= {};
  return saveWorld.world.management;
}

export function ensureContractNegotiationState(saveWorld) {
  const management = ensureManagement(saveWorld);
  management.contracts ??= { nextNegotiationId: 1, negotiations: [] };
  management.contracts.nextNegotiationId = Math.max(1, Number(management.contracts.nextNegotiationId ?? 1));
  management.contracts.negotiations ??= [];
  return management.contracts;
}

function driverProfile(saveWorld, driverId) {
  return [...(saveWorld.world?.drivers ?? []), ...(saveWorld.world?.futureDrivers ?? [])]
    .find((row) => String(row.driver_id ?? row.id) === String(driverId)) ?? null;
}

function driverName(profile, driverId) {
  return profile?.display_name ?? profile?.driver_name ?? profile?.name ?? driverId;
}

function teamProfile(saveWorld, teamId) {
  return (saveWorld.world?.teams ?? []).find((row) => String(row.team_id ?? row.id) === String(teamId)) ?? {};
}

function currentAssignment(saveWorld, driverId) {
  return saveWorld.world?.employment?.drivers?.[driverId] ?? null;
}

function activeContract(saveWorld, driverId, teamId = null) {
  const rows = (saveWorld.world?.contracts ?? []).filter((row) => {
    if (String(row.driver_id ?? "") !== String(driverId)) return false;
    return teamId === null || String(row.team_id ?? "") === String(teamId);
  });
  return [...rows].sort((a, b) => Number(b.contract_start ?? b.year ?? 0) - Number(a.contract_start ?? a.year ?? 0))[0] ?? null;
}

function salaryFromContract(contract) {
  return numeric(contract?.annual_salary ?? contract?.salary ?? contract?.base_salary ?? contract?.wage);
}

function roleWeight(role) {
  const normalized = text(role, "driver").toLowerCase();
  if (/lead|first|number.?1|main/.test(normalized)) return 1;
  if (/second|number.?2/.test(normalized)) return 0.9;
  if (/reserve|test|third|development/.test(normalized)) return 0.68;
  return 0.86;
}

function abilityAndReputation(saveWorld, driverId) {
  const state = saveWorld.world?.careerState?.drivers?.[driverId] ?? {};
  const profile = driverProfile(saveWorld, driverId) ?? {};
  const rating = (saveWorld.world?.driverRatings ?? []).find((row) => String(row.driver_id) === String(driverId)) ?? {};
  return {
    ability: clamp(numeric(state.currentAbility ?? rating.current_ability ?? profile.current_ability, 50), 0, 100),
    potential: clamp(numeric(state.potentialAbility ?? rating.potential_ability ?? profile.potential_ability, 50), 0, 100),
    reputation: clamp(numeric(state.reputation ?? rating.reputation ?? profile.reputation, 50), 0, 100),
  };
}

function teamReputation(saveWorld, teamId) {
  const team = teamProfile(saveWorld, teamId);
  const value = numeric(team.reputation ?? team.prestige ?? team.team_reputation ?? team.constructor_reputation);
  if (value !== null) return clamp(value <= 10 ? value * 10 : value, 0, 100);
  const championship = saveWorld.world?.championship?.constructors?.[teamId];
  if (championship) return clamp(45 + numeric(championship.points ?? championship.countedPoints, 0) * 0.3, 35, 85);
  return 50;
}

function expectedTerms(saveWorld, driverId, teamId, requestedRole, startSeason) {
  const current = currentAssignment(saveWorld, driverId);
  const sourceContract = activeContract(saveWorld, driverId, current?.teamId ?? null);
  const knownSalary = salaryFromContract(sourceContract);
  const metrics = abilityAndReputation(saveWorld, driverId);
  const role = requestedRole ?? current?.role ?? "driver";
  const teamRep = teamReputation(saveWorld, teamId);
  const leverage = clamp((metrics.ability * 0.42 + metrics.potential * 0.18 + metrics.reputation * 0.4) / 100, 0.25, 1);
  const switchPremium = current?.teamId && current.teamId !== teamId ? 1.08 : 1.02;
  const attractiveness = clamp((teamRep - metrics.reputation) / 180, -0.18, 0.16);
  const requestedLength = metrics.potential > metrics.ability + 8 ? 3 : 2;

  if (knownSalary !== null && knownSalary > 0) {
    const annualSalary = Math.max(1, Math.round(knownSalary * switchPremium * (1.04 - attractiveness) * (0.9 + roleWeight(role) * 0.12)));
    return {
      compensationMode: "currency",
      annualSalary,
      salaryIndex: null,
      signingBonus: Math.round(annualSalary * (current?.teamId === teamId ? 0.05 : 0.1)),
      lengthYears: requestedLength,
      role,
      startSeason,
    };
  }

  const salaryIndex = Math.round(clamp(28 + leverage * 64 - attractiveness * 35 + roleWeight(role) * 6, 25, 100));
  return {
    compensationMode: "abstract_index",
    annualSalary: null,
    salaryIndex,
    signingBonus: null,
    lengthYears: requestedLength,
    role,
    startSeason,
  };
}

function normalizeOffer(negotiation, input = {}) {
  const expected = negotiation.expectedTerms;
  const lengthYears = Math.round(clamp(numeric(input.lengthYears ?? input.length_years, expected.lengthYears), 1, 5));
  const role = text(input.role, expected.role).trim() || expected.role;
  if (expected.compensationMode === "currency") {
    const annualSalary = numeric(input.annualSalary ?? input.annual_salary ?? input.salary);
    if (annualSalary === null || annualSalary <= 0) throw new Error("This negotiation requires a positive annualSalary.");
    return {
      compensationMode: "currency",
      annualSalary: Math.round(annualSalary),
      salaryIndex: null,
      signingBonus: Math.max(0, Math.round(numeric(input.signingBonus ?? input.signing_bonus, 0))),
      lengthYears,
      role,
      startSeason: negotiation.startSeason,
    };
  }
  const salaryIndex = numeric(input.salaryIndex ?? input.salary_index);
  if (salaryIndex === null) throw new Error("This negotiation uses abstract compensation and requires salaryIndex.");
  return {
    compensationMode: "abstract_index",
    annualSalary: null,
    salaryIndex: Math.round(clamp(salaryIndex, 1, 120)),
    signingBonus: null,
    lengthYears,
    role,
    startSeason: negotiation.startSeason,
  };
}

function negotiationScore(saveWorld, negotiation, offer, attempt) {
  const expected = negotiation.expectedTerms;
  let compensationRatio;
  if (expected.compensationMode === "currency") {
    const offeredValue = offer.annualSalary + offer.signingBonus / Math.max(1, offer.lengthYears);
    const expectedValue = expected.annualSalary + expected.signingBonus / Math.max(1, expected.lengthYears);
    compensationRatio = offeredValue / Math.max(1, expectedValue);
  } else {
    compensationRatio = offer.salaryIndex / Math.max(1, expected.salaryIndex);
  }
  const offeredRole = roleWeight(offer.role);
  const expectedRole = roleWeight(expected.role);
  const roleFit = clamp(1 - Math.max(0, expectedRole - offeredRole) * 1.7, 0.35, 1.08);
  const durationFit = clamp(1 - Math.abs(offer.lengthYears - expected.lengthYears) * 0.06, 0.76, 1.04);
  const metrics = abilityAndReputation(saveWorld, negotiation.driverId);
  const teamRep = teamReputation(saveWorld, negotiation.teamId);
  const teamFit = clamp((teamRep - metrics.reputation) / 250, -0.12, 0.12);
  const rng = createRng(`${saveWorld.meta.seed}|${negotiation.id}|offer|${attempt}`);
  const noise = (rng.next() - 0.5) * 0.035;
  return compensationRatio * 0.74 + roleFit * 0.14 + durationFit * 0.08 + 0.04 + teamFit + noise;
}

function counterTerms(negotiation, offer, score) {
  const expected = negotiation.expectedTerms;
  const pressure = clamp((0.99 - score) * 0.55, 0.02, 0.11);
  if (expected.compensationMode === "currency") {
    const floor = Math.round(expected.annualSalary * (1 - pressure));
    return {
      ...expected,
      annualSalary: Math.max(floor, Math.round(offer.annualSalary * 1.04)),
      signingBonus: Math.max(Math.round(expected.signingBonus * 0.8), offer.signingBonus),
      lengthYears: offer.lengthYears,
      role: roleWeight(offer.role) >= roleWeight(expected.role) ? offer.role : expected.role,
    };
  }
  return {
    ...expected,
    salaryIndex: Math.max(Math.round(expected.salaryIndex * (1 - pressure)), Math.round(offer.salaryIndex + 2)),
    lengthYears: offer.lengthYears,
    role: roleWeight(offer.role) >= roleWeight(expected.role) ? offer.role : expected.role,
  };
}

function visibleEligibleDriver(saveWorld, driverId) {
  return listVisibleDrivers(saveWorld, { requireF1Eligible: true })
    .find((row) => String(row.driver_id ?? row.id) === String(driverId)) ?? null;
}

export function openDriverContractNegotiation(saveWorld, input = {}) {
  const driverId = text(input.driverId ?? input.driver_id).trim();
  const teamId = text(input.teamId ?? input.team_id).trim();
  if (!driverId || !teamId) throw new Error("driverId and teamId are required to open a contract negotiation.");
  const profile = visibleEligibleDriver(saveWorld, driverId);
  if (!profile) throw new Error(`Driver '${driverId}' is not currently F1-eligible or visible.`);
  const state = ensureContractNegotiationState(saveWorld);
  const active = state.negotiations.find((row) => row.driverId === driverId && row.teamId === teamId && ["open", "countered"].includes(row.status));
  if (active) return structuredClone(active);

  const currentSeason = Number(saveWorld.clock?.season);
  const current = currentAssignment(saveWorld, driverId);
  let earliestStart = currentSeason;
  if (current?.teamId && current.teamId !== teamId) {
    if (!Number.isInteger(Number(current.contractUntil))) {
      throw new Error("Transfer compensation is not implemented yet and this driver's contract end is unknown.");
    }
    earliestStart = Number(current.contractUntil) + 1;
  }
  const requestedStart = Math.round(numeric(input.startSeason ?? input.start_season, earliestStart));
  if (requestedStart < earliestStart) {
    throw new Error(`This driver cannot join before season ${earliestStart} without a transfer/compensation agreement.`);
  }

  const serial = state.nextNegotiationId++;
  const id = `negotiation:${String(serial).padStart(6, "0")}`;
  const role = text(input.role, current?.role ?? "driver");
  const expected = expectedTerms(saveWorld, driverId, teamId, role, requestedStart);
  const row = {
    id,
    workerType: "driver",
    driverId,
    driverName: driverName(profile, driverId),
    teamId,
    status: "open",
    openedAt: saveWorld.clock?.date ?? null,
    expiresAt: addDays(saveWorld.clock?.date, Math.max(3, Math.round(numeric(input.windowDays, 14)))),
    startSeason: requestedStart,
    expectedTerms: expected,
    offers: [],
    counterTerms: null,
    acceptedTerms: null,
    closedAt: null,
  };
  state.negotiations.push(row);
  return structuredClone(row);
}

export function submitDriverContractOfferEvent(saveWorld, negotiationId, input = {}) {
  const negotiation = ensureContractNegotiationState(saveWorld).negotiations.find((row) => row.id === negotiationId);
  if (!negotiation) throw new Error(`Contract negotiation '${negotiationId}' does not exist.`);
  if (!["open", "countered"].includes(negotiation.status)) throw new Error(`Contract negotiation '${negotiationId}' is not open for offers.`);
  const terms = normalizeOffer(negotiation, input);
  return { type: CONTRACT_NEGOTIATION_EVENT.OFFER_SUBMITTED, payload: { negotiation_id: negotiationId, terms } };
}

export function acceptDriverContractCounterEvent(saveWorld, negotiationId) {
  const negotiation = ensureContractNegotiationState(saveWorld).negotiations.find((row) => row.id === negotiationId);
  if (!negotiation || negotiation.status !== "countered" || !negotiation.counterTerms) {
    throw new Error(`Contract negotiation '${negotiationId}' has no counter-offer to accept.`);
  }
  return { type: CONTRACT_NEGOTIATION_EVENT.COUNTER_ACCEPTED, payload: { negotiation_id: negotiationId } };
}

export function withdrawDriverContractNegotiationEvent(saveWorld, negotiationId) {
  const negotiation = ensureContractNegotiationState(saveWorld).negotiations.find((row) => row.id === negotiationId);
  if (!negotiation || !["open", "countered"].includes(negotiation.status)) {
    throw new Error(`Contract negotiation '${negotiationId}' cannot be withdrawn.`);
  }
  return { type: CONTRACT_NEGOTIATION_EVENT.WITHDRAWN, payload: { negotiation_id: negotiationId } };
}

export function evaluateDriverContractOffer(saveWorld, negotiation, terms) {
  const attempt = negotiation.offers.length + 1;
  const score = negotiationScore(saveWorld, negotiation, terms, attempt);
  if (score >= 0.985) return { outcome: "accepted", score, terms };
  if (score >= 0.79) return { outcome: "countered", score, terms, counterTerms: counterTerms(negotiation, terms, score) };
  return { outcome: "rejected", score, terms };
}

export function listContractNegotiations(saveWorld, options = {}) {
  let rows = ensureContractNegotiationState(saveWorld).negotiations;
  if (options.status) rows = rows.filter((row) => row.status === options.status);
  if (options.teamId) rows = rows.filter((row) => row.teamId === options.teamId);
  return structuredClone([...rows].sort((a, b) => b.openedAt.localeCompare(a.openedAt) || b.id.localeCompare(a.id)));
}

export function contractNegotiationSummary(saveWorld, teamId = null) {
  const rows = ensureContractNegotiationState(saveWorld).negotiations.filter((row) => teamId === null || row.teamId === teamId);
  return {
    active: rows.filter((row) => ["open", "countered"].includes(row.status)).length,
    countered: rows.filter((row) => row.status === "countered").length,
    accepted: rows.filter((row) => row.status === "accepted").length,
  };
}
