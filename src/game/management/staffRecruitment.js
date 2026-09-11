import { listVisibleStaff } from "../../domain/entityVisibility.js";
import { createRng } from "../../sim/random.js";
import { ensurePersonState, ensureRepresentative, ensureRelationship, personProfile } from "./people.js";

export const STAFF_NEGOTIATION_EVENT = Object.freeze({
  OFFER_SUBMITTED: "management.staff.offer_submitted",
  COUNTERED: "management.staff.countered",
  ACCEPTED: "management.staff.accepted",
  REJECTED: "management.staff.rejected",
  COUNTER_ACCEPTED: "management.staff.counter_accepted",
  WITHDRAWN: "management.staff.withdrawn",
  EXPIRED: "management.staff.expired",
});

function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function text(value, fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

function addDays(dateText, days) {
  const date = new Date(`${String(dateText ?? "").slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) return String(dateText ?? "").slice(0, 10);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function assignment(saveWorld, staffId) {
  return saveWorld.world?.employment?.staff?.[staffId] ?? null;
}

function staffName(saveWorld, staffId) {
  const row = personProfile(saveWorld, "staff", staffId) ?? {};
  return row.display_name ?? row.staff_name ?? row.name ?? staffId;
}

function rating(saveWorld, staffId) {
  return (saveWorld.world?.staffRatings ?? []).find((row) => String(row.staff_id) === String(staffId)) ?? {};
}

function normalizeRating(value) {
  const parsed = numeric(value);
  if (parsed === null) return null;
  return clamp(parsed <= 10 ? parsed * 10 : parsed);
}

function staffAbility(saveWorld, staffId) {
  const dynamic = saveWorld.world?.careerState?.staff?.[staffId]?.attributes ?? {};
  const source = rating(saveWorld, staffId);
  const fields = ["technical", "engineering", "design", "aero", "strategy", "leadership", "scouting", "mechanics", "reliability"];
  const values = fields
    .map((field) => normalizeRating(dynamic[field] ?? source[field]))
    .filter((value) => value !== null);
  if (values.length) return values.reduce((sum, value) => sum + value, 0) / values.length;
  return numeric(saveWorld.world?.careerState?.staff?.[staffId]?.currentAbility, 50);
}

function currentStaffContract(saveWorld, staffId, teamId = null) {
  const season = Number(saveWorld.clock?.season);
  return [...(saveWorld.world?.staffContracts ?? [])]
    .filter((row) => String(row.staff_id ?? "") === String(staffId))
    .filter((row) => teamId === null || String(row.team_id ?? "") === String(teamId))
    .filter((row) => {
      const start = Number(row.contract_start ?? row.year ?? season);
      const until = Number(row.contract_until ?? row.contract_until_year ?? row.end_year ?? season);
      return start <= season && until >= season;
    })
    .sort((a, b) => Number(b.contract_start ?? b.year ?? 0) - Number(a.contract_start ?? a.year ?? 0))[0] ?? null;
}

function knownSalary(saveWorld, staffId) {
  const current = assignment(saveWorld, staffId);
  const contract = currentStaffContract(saveWorld, staffId, current?.teamId ?? null);
  return numeric(contract?.annual_salary ?? contract?.salary ?? contract?.wage ?? current?.annualSalary);
}

function teamReputation(saveWorld, teamId) {
  const team = (saveWorld.world?.teams ?? []).find((row) => String(row.team_id ?? row.id) === String(teamId)) ?? {};
  const state = saveWorld.world?.teamState?.[teamId] ?? {};
  const raw = numeric(state.reputation ?? team.reputation ?? team.prestige ?? team.team_reputation ?? team.constructor_reputation, 50);
  return clamp(raw <= 10 ? raw * 10 : raw);
}

function roleLabel(profile, assignmentRow) {
  return assignmentRow?.role ?? profile?.role ?? profile?.staff_role ?? profile?.job ?? "staff";
}

export function evaluateStaffInterest(saveWorld, staffId, targetTeamId, options = {}) {
  const person = ensurePersonState(saveWorld, "staff", staffId);
  const personality = person.personality.traits;
  const mentality = person.mentality;
  const current = assignment(saveWorld, staffId);
  const currentRep = current?.teamId ? teamReputation(saveWorld, current.teamId) : 35;
  const targetRep = teamReputation(saveWorld, targetTeamId);
  const currentRelation = current?.teamId ? ensureRelationship(saveWorld, "staff", staffId, "team", current.teamId) : { affinity: 45, trust: 45 };
  const targetRelation = ensureRelationship(saveWorld, "staff", staffId, "team", targetTeamId);
  const prestigePull = (targetRep - currentRep) * (0.22 + personality.ambition / 300);
  const loyaltyResistance = current?.teamId && String(current.teamId) !== String(targetTeamId)
    ? (personality.loyalty / 100) * (currentRelation.affinity / 100) * 20
    : 0;
  const dissatisfaction = (50 - mentality.teamSatisfaction) * 0.28 + (50 - mentality.contractSatisfaction) * 0.2;
  const openness = (mentality.transferOpenness - 50) * 0.25;
  const relationshipPull = (targetRelation.affinity - 50) * 0.12;
  const representative = ensureRepresentative(saveWorld, "staff", staffId);
  const agentResistance = (representative.reputationWeight - 50) * 0.05;
  const rolePremium = options.role && current?.role && String(options.role) !== String(current.role) ? 2 : 0;
  const score = clamp(54 + prestigePull + dissatisfaction + openness + relationshipPull + rolePremium - loyaltyResistance - agentResistance);
  const reasons = [];
  if (prestigePull >= 5) reasons.push("higher_team_prestige");
  if (prestigePull <= -5) reasons.push("lower_team_prestige");
  if (loyaltyResistance >= 7) reasons.push("loyal_to_current_team");
  if (mentality.teamSatisfaction < 42) reasons.push("current_team_dissatisfaction");
  return {
    score: Number(score.toFixed(2)),
    level: score >= 75 ? "very_interested" : score >= 60 ? "interested" : score >= 44 ? "open" : score >= 30 ? "reluctant" : "not_interested",
    reasons,
    representative: { name: representative.name, style: representative.style, source: representative.source },
  };
}

function ensureState(saveWorld) {
  saveWorld.world.management ??= {};
  saveWorld.world.management.staffRecruitment ??= { nextNegotiationId: 1, negotiations: [] };
  const state = saveWorld.world.management.staffRecruitment;
  state.nextNegotiationId = Math.max(1, Math.round(numeric(state.nextNegotiationId, 1)));
  state.negotiations ??= [];
  return state;
}

function expectedTerms(saveWorld, staffId, targetTeamId, role, startSeason) {
  const salary = knownSalary(saveWorld, staffId);
  const ability = staffAbility(saveWorld, staffId);
  const interest = evaluateStaffInterest(saveWorld, staffId, targetTeamId, { role });
  const representative = ensureRepresentative(saveWorld, "staff", staffId);
  if (salary !== null && salary > 0) {
    const switchPremium = assignment(saveWorld, staffId)?.teamId && assignment(saveWorld, staffId)?.teamId !== targetTeamId ? 1.08 : 1.02;
    const resistance = Math.max(0, 55 - interest.score) / 300 + Math.max(0, representative.negotiationRigidity - 50) / 650;
    const annualSalary = Math.max(1, Math.round(salary * switchPremium * (1 + resistance)));
    return {
      compensationMode: "currency",
      annualSalary,
      salaryIndex: null,
      signingBonus: Math.round(annualSalary * 0.06),
      lengthYears: ability >= 75 ? 3 : 2,
      role,
      startSeason,
    };
  }
  return {
    compensationMode: "abstract_index",
    annualSalary: null,
    salaryIndex: Math.round(clamp(30 + ability * 0.55 + (55 - interest.score) * 0.15, 25, 110)),
    signingBonus: null,
    lengthYears: ability >= 75 ? 3 : 2,
    role,
    startSeason,
  };
}

export function listStaffRecruitmentCandidates(saveWorld, options = {}) {
  const query = text(options.query).trim().toLowerCase();
  const targetTeamId = options.teamId ?? saveWorld.player?.controlledTeamIds?.[0] ?? null;
  return listVisibleStaff(saveWorld, { requireF1Eligible: true })
    .map((profile) => {
      const id = profile.staff_id ?? profile.id;
      const current = assignment(saveWorld, id);
      const person = ensurePersonState(saveWorld, "staff", id);
      const sourceRating = rating(saveWorld, id);
      return {
        id,
        name: staffName(saveWorld, id),
        nationality: profile.nationality ?? profile.country ?? null,
        role: roleLabel(profile, current),
        currentTeamId: current?.teamId ?? null,
        contractUntil: current?.contractUntil ?? null,
        ability: Number(staffAbility(saveWorld, id).toFixed(1)),
        technical: normalizeRating(sourceRating.technical ?? sourceRating.engineering ?? sourceRating.design),
        leadership: normalizeRating(sourceRating.leadership),
        strategy: normalizeRating(sourceRating.strategy),
        scouting: normalizeRating(sourceRating.scouting ?? sourceRating.judging_ability),
        morale: Number(person.mentality.morale.toFixed(1)),
        interest: targetTeamId ? evaluateStaffInterest(saveWorld, id, targetTeamId) : null,
      };
    })
    .filter((row) => !query || `${row.name} ${row.role} ${row.nationality ?? ""}`.toLowerCase().includes(query))
    .sort((a, b) => b.ability - a.ability || a.name.localeCompare(b.name));
}

export function openStaffContractNegotiation(saveWorld, input = {}) {
  const staffId = text(input.staffId ?? input.staff_id).trim();
  const teamId = text(input.teamId ?? input.team_id).trim();
  if (!staffId || !teamId) throw new Error("staffId and teamId are required.");
  if (!listVisibleStaff(saveWorld, { requireF1Eligible: true }).some((row) => String(row.staff_id ?? row.id) === staffId)) throw new Error(`Staff '${staffId}' is not available in the visible market.`);
  const current = assignment(saveWorld, staffId);
  const currentSeason = Number(saveWorld.clock?.season);
  const defaultStart = current?.teamId && String(current.teamId) !== teamId && Number.isInteger(Number(current.contractUntil))
    ? Math.max(currentSeason, Number(current.contractUntil) + 1)
    : currentSeason;
  const startSeason = Math.max(currentSeason, Math.round(numeric(input.startSeason ?? input.start_season, defaultStart)));
  const profile = personProfile(saveWorld, "staff", staffId) ?? {};
  const role = text(input.role, roleLabel(profile, current)).trim() || "staff";
  const interest = evaluateStaffInterest(saveWorld, staffId, teamId, { role });
  if (interest.score < 24) throw new Error(`${staffName(saveWorld, staffId)} is not interested in discussing this role.`);
  const state = ensureState(saveWorld);
  const duplicate = state.negotiations.find((row) => row.staffId === staffId && row.teamId === teamId && ["open", "countered"].includes(row.status));
  if (duplicate) return structuredClone(duplicate);
  const negotiation = {
    id: `staff-negotiation:${String(state.nextNegotiationId++).padStart(5, "0")}`,
    staffId,
    staffName: staffName(saveWorld, staffId),
    teamId,
    startSeason,
    status: "open",
    createdAt: saveWorld.clock?.date ?? null,
    expiresAt: addDays(saveWorld.clock?.date, Math.max(3, Math.round(numeric(input.windowDays, 10)))),
    role,
    interest,
    representative: ensureRepresentative(saveWorld, "staff", staffId),
    expectedTerms: expectedTerms(saveWorld, staffId, teamId, role, startSeason),
    offers: [],
    counterTerms: null,
  };
  state.negotiations.push(negotiation);
  return structuredClone(negotiation);
}

export function listStaffContractNegotiations(saveWorld, options = {}) {
  let rows = ensureState(saveWorld).negotiations;
  if (options.teamId) rows = rows.filter((row) => String(row.teamId) === String(options.teamId));
  if (options.status) rows = rows.filter((row) => row.status === options.status);
  return structuredClone(rows);
}

function normalizeOffer(negotiation, input = {}) {
  const expected = negotiation.expectedTerms;
  const lengthYears = Math.round(clamp(numeric(input.lengthYears ?? input.length_years, expected.lengthYears), 1, 5));
  const role = text(input.role, expected.role).trim() || expected.role;
  if (expected.compensationMode === "currency") {
    const annualSalary = numeric(input.annualSalary ?? input.annual_salary);
    if (annualSalary === null || annualSalary <= 0) throw new Error("A positive annualSalary is required.");
    return {
      compensationMode: "currency",
      annualSalary: Math.round(annualSalary),
      salaryIndex: null,
      signingBonus: Math.max(0, Math.round(numeric(input.signingBonus ?? input.signing_bonus, 0))),
      lengthYears,
      role,
    };
  }
  const salaryIndex = numeric(input.salaryIndex ?? input.salary_index);
  if (salaryIndex === null) throw new Error("salaryIndex is required for abstract staff compensation.");
  return {
    compensationMode: "abstract_index",
    annualSalary: null,
    salaryIndex: Math.round(clamp(salaryIndex, 1, 120)),
    signingBonus: null,
    lengthYears,
    role,
  };
}

export function submitStaffContractOfferEvent(saveWorld, negotiationId, input = {}) {
  const negotiation = ensureState(saveWorld).negotiations.find((row) => row.id === negotiationId);
  if (!negotiation || negotiation.status !== "open") throw new Error(`Open staff negotiation '${negotiationId}' does not exist.`);
  const offer = normalizeOffer(negotiation, input);
  return {
    type: STAFF_NEGOTIATION_EVENT.OFFER_SUBMITTED,
    payload: { negotiation_id: negotiation.id, offer },
  };
}

export function acceptStaffCounterEvent(saveWorld, negotiationId) {
  const negotiation = ensureState(saveWorld).negotiations.find((row) => row.id === negotiationId);
  if (!negotiation || negotiation.status !== "countered" || !negotiation.counterTerms) throw new Error(`Staff negotiation '${negotiationId}' has no counter-offer.`);
  return { type: STAFF_NEGOTIATION_EVENT.COUNTER_ACCEPTED, payload: { negotiation_id: negotiation.id } };
}

export function withdrawStaffNegotiationEvent(saveWorld, negotiationId) {
  const negotiation = ensureState(saveWorld).negotiations.find((row) => row.id === negotiationId);
  if (!negotiation || !["open", "countered"].includes(negotiation.status)) throw new Error(`Active staff negotiation '${negotiationId}' does not exist.`);
  return { type: STAFF_NEGOTIATION_EVENT.WITHDRAWN, payload: { negotiation_id: negotiation.id } };
}

export function evaluateStaffOffer(saveWorld, negotiation, offer, attempt = 1) {
  const expected = negotiation.expectedTerms;
  const compensationRatio = expected.compensationMode === "currency"
    ? (offer.annualSalary + offer.signingBonus / Math.max(1, offer.lengthYears)) / Math.max(1, expected.annualSalary + expected.signingBonus / Math.max(1, expected.lengthYears))
    : offer.salaryIndex / Math.max(1, expected.salaryIndex);
  const lengthFit = clamp(1 - Math.abs(offer.lengthYears - expected.lengthYears) * 0.08, 0.7, 1.05);
  const interest = evaluateStaffInterest(saveWorld, negotiation.staffId, negotiation.teamId, { role: offer.role });
  const representative = ensureRepresentative(saveWorld, "staff", negotiation.staffId);
  const rigidity = Math.max(0, representative.negotiationRigidity - 50) / 700;
  const rng = createRng(`${saveWorld.meta?.seed}|${negotiation.id}|staff-offer|${attempt}`);
  return compensationRatio * 0.78 + lengthFit * 0.08 + (0.82 + interest.score / 300) * 0.14 - rigidity + (rng.next() - 0.5) * 0.03;
}

export function buildStaffCounterTerms(saveWorld, negotiation, offer, score) {
  const expected = negotiation.expectedTerms;
  const concession = clamp((0.99 - score) * 0.45, 0.015, 0.09);
  if (expected.compensationMode === "currency") {
    return {
      ...expected,
      annualSalary: Math.max(Math.round(expected.annualSalary * (1 - concession)), Math.round(offer.annualSalary * 1.04)),
      signingBonus: Math.max(Math.round(expected.signingBonus * 0.75), offer.signingBonus),
      lengthYears: offer.lengthYears,
      role: offer.role,
    };
  }
  return {
    ...expected,
    salaryIndex: Math.max(Math.round(expected.salaryIndex * (1 - concession)), Math.round(offer.salaryIndex + 2)),
    lengthYears: offer.lengthYears,
    role: offer.role,
  };
}

export function staffRecruitmentSummary(saveWorld, teamId = null) {
  const rows = ensureState(saveWorld).negotiations.filter((row) => !teamId || String(row.teamId) === String(teamId));
  return {
    active: rows.filter((row) => ["open", "countered"].includes(row.status)).length,
    agreed: rows.filter((row) => row.status === "accepted").length,
    total: rows.length,
  };
}
