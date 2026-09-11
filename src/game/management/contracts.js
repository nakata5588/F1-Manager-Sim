import { listVisibleDrivers } from "../../domain/entityVisibility.js";
import { createRng } from "../../sim/random.js";
import {
  ensureRepresentative,
  evaluateDriverTransferInterest,
  personProfile,
} from "./people.js";
import { marketPressureForDriver } from "./market.js";

export const CONTRACT_NEGOTIATION_EVENT = Object.freeze({
  OFFER_SUBMITTED: "management.contract.offer_submitted",
  COUNTERED: "management.contract.countered",
  ACCEPTED: "management.contract.accepted",
  REJECTED: "management.contract.rejected",
  COUNTER_ACCEPTED: "management.contract.counter_accepted",
  WITHDRAWN: "management.contract.withdrawn",
  EXPIRED: "management.contract.expired",
  LOST_TO_RIVAL: "management.contract.lost_to_rival",
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
  return personProfile(saveWorld, "driver", driverId);
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
  const currentSeason = Number(saveWorld.clock?.season);
  const rows = (saveWorld.world?.contracts ?? []).filter((row) => {
    if (String(row.driver_id ?? "") !== String(driverId)) return false;
    if (teamId !== null && String(row.team_id ?? "") !== String(teamId)) return false;
    const start = Number(row.contract_start ?? row.year ?? currentSeason);
    const until = Number(row.contract_until ?? row.contract_until_year ?? row.end_year ?? currentSeason);
    return start <= currentSeason && until >= currentSeason;
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

function explicitReleaseValue(contract) {
  for (const field of ["release_clause", "release_clause_value", "buyout", "buyout_value", "transfer_fee", "compensation_fee"]) {
    const value = numeric(contract?.[field]);
    if (value !== null && value >= 0) return { value, field };
  }
  return null;
}

export function transferCompensationRequirement(saveWorld, driverId, targetTeamId, startSeason = saveWorld.clock?.season) {
  const current = currentAssignment(saveWorld, driverId);
  if (!current?.teamId || String(current.teamId) === String(targetTeamId)) return null;
  const currentUntil = Number(current.contractUntil);
  const start = Number(startSeason);
  if (!Number.isInteger(currentUntil) || !Number.isInteger(start) || start > currentUntil) return null;
  const contract = activeContract(saveWorld, driverId, current.teamId) ?? {};
  const remainingSeasons = Math.max(1, currentUntil - start + 1);
  const explicit = explicitReleaseValue(contract);
  if (explicit) {
    return {
      required: true,
      fromTeamId: current.teamId,
      mode: "currency",
      value: Math.round(explicit.value),
      source: `historical_clause:${explicit.field}`,
      remainingSeasons,
    };
  }
  const salary = salaryFromContract(contract) ?? numeric(current.annualSalary);
  const metrics = abilityAndReputation(saveWorld, driverId);
  if (salary !== null && salary > 0) {
    const multiplier = 0.7 + metrics.reputation / 125 + metrics.potential / 300;
    return {
      required: true,
      fromTeamId: current.teamId,
      mode: "currency",
      value: Math.max(1, Math.round(salary * remainingSeasons * multiplier)),
      source: "simulation_estimate_from_known_salary",
      remainingSeasons,
    };
  }
  return {
    required: true,
    fromTeamId: current.teamId,
    mode: "abstract_index",
    value: Math.round(clamp(18 + metrics.ability * 0.34 + metrics.reputation * 0.28 + metrics.potential * 0.12 + remainingSeasons * 8, 20, 120)),
    source: "simulation_compensation_index",
    remainingSeasons,
  };
}

function expectedTerms(saveWorld, driverId, teamId, requestedRole, startSeason) {
  const current = currentAssignment(saveWorld, driverId);
  const sourceContract = activeContract(saveWorld, driverId, current?.teamId ?? null);
  const knownSalary = salaryFromContract(sourceContract) ?? numeric(current?.annualSalary);
  const metrics = abilityAndReputation(saveWorld, driverId);
  const role = requestedRole ?? current?.role ?? "driver";
  const teamRep = teamReputation(saveWorld, teamId);
  const interest = evaluateDriverTransferInterest(saveWorld, driverId, teamId, { role });
  const representative = ensureRepresentative(saveWorld, "driver", driverId);
  const leverage = clamp((metrics.ability * 0.42 + metrics.potential * 0.18 + metrics.reputation * 0.4) / 100, 0.25, 1);
  const switchPremium = current?.teamId && current.teamId !== teamId ? 1.08 : 1.02;
  const attractiveness = clamp((teamRep - metrics.reputation) / 180, -0.18, 0.16);
  const interestPremium = clamp((55 - interest.score) / 260, -0.08, 0.16);
  const agentPremium = clamp((representative.negotiationRigidity - 50) / 550, -0.04, 0.07);
  const requestedLength = metrics.potential > metrics.ability + 8 ? 3 : 2;

  if (knownSalary !== null && knownSalary > 0) {
    const annualSalary = Math.max(1, Math.round(knownSalary * switchPremium * (1.04 - attractiveness + interestPremium + agentPremium) * (0.9 + roleWeight(role) * 0.12)));
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

  const salaryIndex = Math.round(clamp(28 + leverage * 64 - attractiveness * 35 + interestPremium * 70 + agentPremium * 70 + roleWeight(role) * 6, 25, 110));
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

function normalizedTransferOffer(negotiation, input) {
  const requirement = negotiation.transferCompensation;
  if (!requirement?.required) return null;
  if (requirement.mode === "currency") {
    return { mode: "currency", value: Math.max(0, Math.round(numeric(input.transferFee ?? input.transfer_fee, 0))) };
  }
  return { mode: "abstract_index", value: Math.max(0, Math.round(numeric(input.transferCompensationIndex ?? input.transfer_compensation_index, 0))) };
}

function normalizeOffer(negotiation, input = {}) {
  const expected = negotiation.expectedTerms;
  const lengthYears = Math.round(clamp(numeric(input.lengthYears ?? input.length_years, expected.lengthYears), 1, 5));
  const role = text(input.role, expected.role).trim() || expected.role;
  const transferCompensation = normalizedTransferOffer(negotiation, input);
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
      transferCompensation,
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
    transferCompensation,
  };
}

function transferRatio(negotiation, offer) {
  const required = negotiation.transferCompensation;
  if (!required?.required) return 1;
  if (!offer.transferCompensation || offer.transferCompensation.mode !== required.mode) return 0;
  return offer.transferCompensation.value / Math.max(1, required.value);
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
  const interest = evaluateDriverTransferInterest(saveWorld, negotiation.driverId, negotiation.teamId, { role: offer.role });
  const interestFit = clamp(0.82 + interest.score / 280, 0.8, 1.16);
  const pressure = marketPressureForDriver(saveWorld, negotiation.driverId, negotiation.teamId);
  const representative = ensureRepresentative(saveWorld, "driver", negotiation.driverId);
  const agentResistance = Math.max(0, representative.negotiationRigidity - 50) / 850;
  const competitionPenalty = pressure.competingOffers * 0.025;
  const rng = createRng(`${saveWorld.meta.seed}|${negotiation.id}|offer|${attempt}`);
  const noise = (rng.next() - 0.5) * 0.03;
  return compensationRatio * 0.7 + roleFit * 0.12 + durationFit * 0.07 + interestFit * 0.11 - agentResistance - competitionPenalty + noise;
}

function counterTerms(saveWorld, negotiation, offer, score) {
  const expected = negotiation.expectedTerms;
  const pressure = marketPressureForDriver(saveWorld, negotiation.driverId, negotiation.teamId);
  const representative = ensureRepresentative(saveWorld, "driver", negotiation.driverId);
  const marketPremium = pressure.competingOffers * 0.025 + Math.max(0, representative.negotiationRigidity - 50) / 900;
  const concession = clamp((0.99 - score) * 0.5, 0.015, 0.1);
  const transferCompensation = negotiation.transferCompensation?.required
    ? { mode: negotiation.transferCompensation.mode, value: negotiation.transferCompensation.value }
    : null;
  if (expected.compensationMode === "currency") {
    const floor = Math.round(expected.annualSalary * (1 - concession + marketPremium));
    return {
      ...expected,
      annualSalary: Math.max(floor, Math.round(offer.annualSalary * 1.035)),
      signingBonus: Math.max(Math.round(expected.signingBonus * 0.8), offer.signingBonus),
      lengthYears: offer.lengthYears,
      role: roleWeight(offer.role) >= roleWeight(expected.role) ? offer.role : expected.role,
      transferCompensation,
    };
  }
  return {
    ...expected,
    salaryIndex: Math.max(Math.round(expected.salaryIndex * (1 - concession + marketPremium)), Math.round(offer.salaryIndex + 2)),
    lengthYears: offer.lengthYears,
    role: roleWeight(offer.role) >= roleWeight(expected.role) ? offer.role : expected.role,
    transferCompensation,
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
  const naturalStart = current?.teamId && current.teamId !== teamId && Number.isInteger(Number(current.contractUntil))
    ? Number(current.contractUntil) + 1
    : currentSeason;
  const requestedStart = Math.max(currentSeason, Math.round(numeric(input.startSeason ?? input.start_season, naturalStart)));
  const role = text(input.role, current?.role ?? "driver");
  const interest = evaluateDriverTransferInterest(saveWorld, driverId, teamId, { role });
  if (interest.score < 20) throw new Error(`${driverName(profile, driverId)} is not interested in discussing a move to this team.`);

  const serial = state.nextNegotiationId++;
  const id = `negotiation:${String(serial).padStart(6, "0")}`;
  const expected = expectedTerms(saveWorld, driverId, teamId, role, requestedStart);
  const transferCompensation = transferCompensationRequirement(saveWorld, driverId, teamId, requestedStart);
  const representative = ensureRepresentative(saveWorld, "driver", driverId);
  const row = {
    id,
    workerType: "driver",
    driverId,
    driverName: driverName(profile, driverId),
    teamId,
    currentTeamId: current?.teamId ?? null,
    status: "open",
    openedAt: saveWorld.clock?.date ?? null,
    expiresAt: addDays(saveWorld.clock?.date, Math.max(3, Math.round(numeric(input.windowDays, representative.patience >= 65 ? 18 : representative.patience <= 40 ? 8 : 14)))),
    startSeason: requestedStart,
    expectedTerms: expected,
    transferCompensation,
    interest,
    representative: {
      id: representative.id,
      name: representative.name,
      source: representative.source,
      style: representative.style,
    },
    marketPressure: marketPressureForDriver(saveWorld, driverId, teamId),
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
  const transfer = transferRatio(negotiation, terms);
  if (transfer < 0.95) {
    return { outcome: "rejected", score: transfer, terms, reason: "transfer_compensation_insufficient" };
  }
  const score = negotiationScore(saveWorld, negotiation, terms, attempt);
  const representative = ensureRepresentative(saveWorld, "driver", negotiation.driverId);
  const pressure = marketPressureForDriver(saveWorld, negotiation.driverId, negotiation.teamId);
  const acceptanceThreshold = clamp(0.965 + (representative.negotiationRigidity - 50) / 1250 + pressure.competingOffers * 0.012, 0.94, 1.08);
  const counterThreshold = acceptanceThreshold - 0.19;
  if (score >= acceptanceThreshold) return { outcome: "accepted", score, terms };
  if (score >= counterThreshold) return { outcome: "countered", score, terms, counterTerms: counterTerms(saveWorld, negotiation, terms, score) };
  return { outcome: "rejected", score, terms, reason: "terms_below_expectation" };
}

export function listContractNegotiations(saveWorld, options = {}) {
  let rows = ensureContractNegotiationState(saveWorld).negotiations;
  if (options.status) rows = rows.filter((row) => row.status === options.status);
  if (options.teamId) rows = rows.filter((row) => row.teamId === options.teamId);
  return structuredClone([...rows].sort((a, b) => String(b.openedAt ?? "").localeCompare(String(a.openedAt ?? "")) || b.id.localeCompare(a.id)));
}

export function contractNegotiationSummary(saveWorld, teamId = null) {
  const rows = ensureContractNegotiationState(saveWorld).negotiations.filter((row) => teamId === null || row.teamId === teamId);
  return {
    active: rows.filter((row) => ["open", "countered"].includes(row.status)).length,
    countered: rows.filter((row) => row.status === "countered").length,
    accepted: rows.filter((row) => row.status === "accepted").length,
    withTransferCompensation: rows.filter((row) => row.transferCompensation?.required).length,
  };
}
