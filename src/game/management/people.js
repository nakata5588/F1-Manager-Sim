import { createRng } from "../../sim/random.js";

function text(value, fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function ensureManagement(saveWorld) {
  saveWorld.world.management ??= {};
  return saveWorld.world.management;
}

export function ensurePeopleState(saveWorld) {
  const management = ensureManagement(saveWorld);
  management.people ??= {
    drivers: {},
    staff: {},
    relationships: {},
    representatives: {},
    market: { nextOfferId: 1, externalOffers: [] },
  };
  management.people.drivers ??= {};
  management.people.staff ??= {};
  management.people.relationships ??= {};
  management.people.representatives ??= {};
  management.people.market ??= { nextOfferId: 1, externalOffers: [] };
  management.people.market.nextOfferId = Math.max(1, Number(management.people.market.nextOfferId ?? 1));
  management.people.market.externalOffers ??= [];
  return management.people;
}

function collection(saveWorld, type) {
  return type === "staff"
    ? [...(saveWorld.world?.staff ?? []), ...(saveWorld.world?.futureStaff ?? [])]
    : [...(saveWorld.world?.drivers ?? []), ...(saveWorld.world?.futureDrivers ?? [])];
}

function idField(type) {
  return type === "staff" ? "staff_id" : "driver_id";
}

export function personProfile(saveWorld, type, id) {
  const field = idField(type);
  return collection(saveWorld, type).find((row) => String(row?.[field] ?? row?.id ?? "") === String(id)) ?? null;
}

function ratingProfile(saveWorld, type, id) {
  const rows = type === "staff" ? saveWorld.world?.staffRatings : saveWorld.world?.driverRatings;
  const field = idField(type);
  return (rows ?? []).find((row) => String(row?.[field] ?? "") === String(id)) ?? {};
}

function explicitTrait(profile, rating, names) {
  for (const name of names) {
    const value = numeric(rating?.[name] ?? profile?.[name]);
    if (value !== null) return { value: clamp(value <= 10 ? value * 10 : value), source: `historical:${name}` };
  }
  return { value: 50, source: "neutral_fallback" };
}

function personalityFromSource(saveWorld, type, id) {
  const profile = personProfile(saveWorld, type, id) ?? {};
  const rating = ratingProfile(saveWorld, type, id);
  const traits = {
    ambition: explicitTrait(profile, rating, ["ambition", "career_ambition"]),
    loyalty: explicitTrait(profile, rating, ["loyalty", "team_loyalty"]),
    professionalism: explicitTrait(profile, rating, ["professionalism", "professional"]),
    adaptability: explicitTrait(profile, rating, ["adaptability", "adaptation"]),
    composure: explicitTrait(profile, rating, ["composure", "pressure_handling", "pressure"]),
    teamwork: explicitTrait(profile, rating, ["teamwork", "team_player"]),
  };
  return {
    traits: Object.fromEntries(Object.entries(traits).map(([key, row]) => [key, row.value])),
    traitSources: Object.fromEntries(Object.entries(traits).map(([key, row]) => [key, row.source])),
    historicalTraitCount: Object.values(traits).filter((row) => row.source.startsWith("historical:")).length,
  };
}

function representativeStyle(rigidity, patience) {
  if (rigidity >= 68) return "hardline";
  if (patience >= 68) return "patient";
  if (rigidity <= 38) return "flexible";
  return "professional";
}

export function ensureRepresentative(saveWorld, type, id) {
  const people = ensurePeopleState(saveWorld);
  const key = `${type}:${id}`;
  if (people.representatives[key]) return people.representatives[key];
  const profile = personProfile(saveWorld, type, id) ?? {};
  const explicitId = profile.agent_id ?? profile.representative_id ?? null;
  const explicitName = profile.agent_name ?? profile.representative_name ?? null;
  const rng = createRng(`${saveWorld.meta?.seed}|representative|${type}|${id}`);
  const rigidity = clamp(Math.round(38 + rng.next() * 42));
  const patience = clamp(Math.round(38 + rng.next() * 42));
  const reputationWeight = clamp(Math.round(42 + rng.next() * 36));
  const row = {
    id: explicitId ? String(explicitId) : `representative:${type}:${id}`,
    name: explicitName ? String(explicitName) : null,
    source: explicitId || explicitName ? "historical_reference" : "simulation_fallback",
    style: representativeStyle(rigidity, patience),
    negotiationRigidity: rigidity,
    patience,
    reputationWeight,
  };
  people.representatives[key] = row;
  return row;
}

function initialMentality(saveWorld, type, id) {
  const career = type === "staff"
    ? saveWorld.world?.careerState?.staff?.[id] ?? {}
    : saveWorld.world?.careerState?.drivers?.[id] ?? {};
  const morale = clamp(numeric(career.morale, 50));
  return {
    morale,
    confidence: 50,
    teamSatisfaction: 55,
    roleSatisfaction: 55,
    contractSatisfaction: 50,
    pressure: 40,
    transferOpenness: 45,
    lastUpdated: saveWorld.clock?.date ?? null,
  };
}

export function ensurePersonState(saveWorld, type, id) {
  if (!["driver", "staff"].includes(type)) throw new Error(`Unsupported person type '${type}'.`);
  const people = ensurePeopleState(saveWorld);
  const target = type === "staff" ? people.staff : people.drivers;
  if (!target[id]) {
    target[id] = {
      type,
      id,
      personality: personalityFromSource(saveWorld, type, id),
      mentality: initialMentality(saveWorld, type, id),
      initializedAt: saveWorld.clock?.date ?? null,
    };
  }
  ensureRepresentative(saveWorld, type, id);
  return target[id];
}

function relationKey(subjectType, subjectId, targetType, targetId) {
  return `${subjectType}:${subjectId}->${targetType}:${targetId}`;
}

export function ensureRelationship(saveWorld, subjectType, subjectId, targetType, targetId) {
  const people = ensurePeopleState(saveWorld);
  const key = relationKey(subjectType, subjectId, targetType, targetId);
  people.relationships[key] ??= {
    subjectType,
    subjectId,
    targetType,
    targetId,
    affinity: 50,
    trust: 50,
    rivalry: 0,
    lastUpdated: saveWorld.clock?.date ?? null,
  };
  return people.relationships[key];
}

export function adjustRelationship(saveWorld, subjectType, subjectId, targetType, targetId, changes = {}) {
  const row = ensureRelationship(saveWorld, subjectType, subjectId, targetType, targetId);
  for (const key of ["affinity", "trust", "rivalry"]) {
    if (numeric(changes[key]) !== null) row[key] = clamp(row[key] + Number(changes[key]));
  }
  row.lastUpdated = saveWorld.clock?.date ?? row.lastUpdated;
  return row;
}

function teamReputation(saveWorld, teamId) {
  const team = (saveWorld.world?.teams ?? []).find((row) => String(row.team_id ?? row.id) === String(teamId)) ?? {};
  const explicit = numeric(team.reputation ?? team.prestige ?? team.team_reputation ?? team.constructor_reputation);
  if (explicit !== null) return clamp(explicit <= 10 ? explicit * 10 : explicit);
  const championship = saveWorld.world?.championship?.constructors?.[teamId];
  if (championship) return clamp(45 + numeric(championship.countedPoints ?? championship.points, 0) * 0.3, 30, 90);
  return 50;
}

function currentAssignment(saveWorld, type, id) {
  return type === "staff" ? saveWorld.world?.employment?.staff?.[id] ?? null : saveWorld.world?.employment?.drivers?.[id] ?? null;
}

function roleWeight(role) {
  const normalized = text(role, "driver").toLowerCase();
  if (/lead|first|number.?1|main/.test(normalized)) return 1;
  if (/second|number.?2/.test(normalized)) return 0.88;
  if (/reserve|test|third|development/.test(normalized)) return 0.62;
  return 0.8;
}

export function activeCompetingOffers(saveWorld, type, id, options = {}) {
  const today = String(saveWorld.clock?.date ?? "").slice(0, 10);
  return ensurePeopleState(saveWorld).market.externalOffers.filter((row) =>
    row.workerType === type
    && String(row.workerId) === String(id)
    && row.status === "open"
    && (!row.expiresAt || row.expiresAt >= today)
    && (!options.excludeTeamId || row.teamId !== options.excludeTeamId));
}

export function evaluateDriverTransferInterest(saveWorld, driverId, targetTeamId, options = {}) {
  const person = ensurePersonState(saveWorld, "driver", driverId);
  const personality = person.personality.traits;
  const mentality = person.mentality;
  const current = currentAssignment(saveWorld, "driver", driverId);
  const targetRep = teamReputation(saveWorld, targetTeamId);
  const currentRep = current?.teamId ? teamReputation(saveWorld, current.teamId) : 35;
  const teamRelation = current?.teamId
    ? ensureRelationship(saveWorld, "driver", driverId, "team", current.teamId)
    : { affinity: 45, trust: 45 };
  const targetRelation = ensureRelationship(saveWorld, "driver", driverId, "team", targetTeamId);
  const requestedRole = options.role ?? current?.role ?? "driver";
  const currentRole = current?.role ?? "reserve";
  const roleDelta = (roleWeight(requestedRole) - roleWeight(currentRole)) * 30;
  const prestigeDelta = (targetRep - currentRep) * (0.25 + personality.ambition / 250);
  const loyaltyResistance = current?.teamId && current.teamId !== targetTeamId
    ? (personality.loyalty / 100) * (teamRelation.affinity / 100) * 24
    : 0;
  const dissatisfaction = (50 - mentality.teamSatisfaction) * 0.32 + (50 - mentality.contractSatisfaction) * 0.24;
  const openness = (mentality.transferOpenness - 50) * 0.28;
  const relationshipPull = (targetRelation.affinity - 50) * 0.14;
  const competing = activeCompetingOffers(saveWorld, "driver", driverId, { excludeTeamId: targetTeamId }).length;
  const representative = ensureRepresentative(saveWorld, "driver", driverId);
  const agentSelectivity = (representative.reputationWeight - 50) * 0.06;
  const score = clamp(52 + prestigeDelta + roleDelta + dissatisfaction + openness + relationshipPull - loyaltyResistance - agentSelectivity - competing * 2.5);
  const reasons = [];
  if (prestigeDelta >= 5) reasons.push("higher_team_prestige");
  if (prestigeDelta <= -5) reasons.push("lower_team_prestige");
  if (roleDelta >= 4) reasons.push("improved_role");
  if (mentality.teamSatisfaction < 42) reasons.push("current_team_dissatisfaction");
  if (loyaltyResistance >= 8) reasons.push("loyal_to_current_team");
  if (competing > 0) reasons.push("other_interest_exists");
  return {
    score: Number(score.toFixed(2)),
    level: score >= 76 ? "very_interested" : score >= 60 ? "interested" : score >= 44 ? "open" : score >= 30 ? "reluctant" : "not_interested",
    reasons,
    representative: {
      style: representative.style,
      source: representative.source,
      name: representative.name,
    },
  };
}

export function personProjection(saveWorld, type, id) {
  const state = ensurePersonState(saveWorld, type, id);
  const representative = ensureRepresentative(saveWorld, type, id);
  return {
    type,
    id,
    personality: structuredClone(state.personality),
    mentality: structuredClone(state.mentality),
    representative: structuredClone(representative),
  };
}

export function peopleSummary(saveWorld) {
  const state = ensurePeopleState(saveWorld);
  const driverRows = Object.values(state.drivers);
  const staffRows = Object.values(state.staff);
  return {
    driversTracked: driverRows.length,
    staffTracked: staffRows.length,
    lowMoraleDrivers: driverRows.filter((row) => Number(row.mentality?.morale ?? 50) < 35).length,
    openExternalOffers: state.market.externalOffers.filter((row) => row.status === "open").length,
  };
}
