import { SIM_EVENT } from "../timeEngine.js";
import { CAREER_EVENT } from "./careerLifecycle.js";
import { EMPLOYMENT_EVENT } from "./employmentMarket.js";
import { RACE_EVENT } from "./raceWeekend.js";
import {
  adjustRelationship,
  ensurePersonState,
  ensurePeopleState,
  ensureRelationship,
  personProfile,
} from "../../game/management/people.js";

export const PEOPLE_EVENT = Object.freeze({
  INITIALIZED: "people.initialized",
  MONTHLY_UPDATED: "people.monthly_updated",
  RACE_REACTION: "people.race_reaction",
  DISCONTENT: "people.discontent",
});

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function assignment(saveWorld, type, id) {
  return type === "staff"
    ? saveWorld.world?.employment?.staff?.[id] ?? null
    : saveWorld.world?.employment?.drivers?.[id] ?? null;
}

function careerState(saveWorld, type, id) {
  return type === "staff"
    ? saveWorld.world?.careerState?.staff?.[id] ?? null
    : saveWorld.world?.careerState?.drivers?.[id] ?? null;
}

function initializeLivePeople(saveWorld) {
  let drivers = 0;
  let staff = 0;
  for (const row of saveWorld.world?.drivers ?? []) {
    const id = row.driver_id ?? row.id;
    if (!id) continue;
    ensurePersonState(saveWorld, "driver", id);
    const current = assignment(saveWorld, "driver", id);
    if (current?.teamId) ensureRelationship(saveWorld, "driver", id, "team", current.teamId);
    drivers += 1;
  }
  for (const row of saveWorld.world?.staff ?? []) {
    const id = row.staff_id ?? row.id;
    if (!id) continue;
    ensurePersonState(saveWorld, "staff", id);
    const current = assignment(saveWorld, "staff", id);
    if (current?.teamId) ensureRelationship(saveWorld, "staff", id, "team", current.teamId);
    staff += 1;
  }
  return { drivers, staff };
}

function constructorRank(saveWorld, teamId) {
  const rows = Object.entries(saveWorld.world?.championship?.constructors ?? {})
    .map(([id, row]) => ({ id, points: numeric(row.countedPoints ?? row.points, 0), wins: numeric(row.wins, 0) }))
    .sort((a, b) => b.points - a.points || b.wins - a.wins || a.id.localeCompare(b.id));
  const index = rows.findIndex((row) => row.id === teamId);
  return index >= 0 ? index + 1 : null;
}

function teamCount(saveWorld) {
  return Math.max(1, (saveWorld.world?.teams ?? []).length);
}

function updateMentalityForPerson(saveWorld, type, id, date) {
  const person = ensurePersonState(saveWorld, type, id);
  const mentality = person.mentality;
  const personality = person.personality.traits;
  const current = assignment(saveWorld, type, id);
  const career = careerState(saveWorld, type, id) ?? {};
  const currentSeason = Number(saveWorld.clock?.season);
  const remainingYears = current?.contractUntil === null || current?.contractUntil === undefined
    ? null
    : Number(current.contractUntil) - currentSeason;
  const teamRelation = current?.teamId
    ? ensureRelationship(saveWorld, type, id, "team", current.teamId)
    : { affinity: 42, trust: 42 };

  let teamTarget = 52 + (teamRelation.affinity - 50) * 0.35 + (teamRelation.trust - 50) * 0.2;
  if (type === "driver" && current?.teamId) {
    const rank = constructorRank(saveWorld, current.teamId);
    if (rank !== null) {
      const normalized = 1 - (rank - 1) / Math.max(1, teamCount(saveWorld) - 1);
      teamTarget += (normalized - 0.5) * (10 + personality.ambition * 0.12);
    }
  }
  if (!current?.teamId) teamTarget -= 12;

  let roleTarget = 55;
  const role = String(current?.role ?? "").toLowerCase();
  if (/reserve|test|third|development/.test(role)) roleTarget -= 12 + personality.ambition * 0.1;
  if (/lead|first|main|number.?1/.test(role)) roleTarget += 8;

  let contractTarget = 53;
  if (remainingYears !== null && remainingYears <= 0) contractTarget -= 14;
  else if (remainingYears === 1) contractTarget -= 6;
  else if (remainingYears !== null && remainingYears >= 3) contractTarget += 5;

  const future = type === "driver"
    ? saveWorld.world?.employment?.futureAssignments?.drivers?.[id] ?? []
    : saveWorld.world?.employment?.futureAssignments?.staff?.[id] ?? [];
  if (future.length) {
    contractTarget += 10;
    if (current?.teamId && future.some((row) => row.teamId !== current.teamId)) teamTarget -= 5;
  }

  mentality.teamSatisfaction = clamp(mentality.teamSatisfaction * 0.72 + teamTarget * 0.28);
  mentality.roleSatisfaction = clamp(mentality.roleSatisfaction * 0.72 + roleTarget * 0.28);
  mentality.contractSatisfaction = clamp(mentality.contractSatisfaction * 0.7 + contractTarget * 0.3);
  const averageSatisfaction = (mentality.teamSatisfaction + mentality.roleSatisfaction + mentality.contractSatisfaction) / 3;
  mentality.morale = clamp(mentality.morale * 0.68 + averageSatisfaction * 0.32);
  mentality.pressure = clamp(38 + (50 - mentality.confidence) * 0.45 + Math.max(0, 50 - mentality.morale) * 0.35 - personality.composure * 0.12);
  mentality.transferOpenness = clamp(
    42
      + personality.ambition * 0.18
      - personality.loyalty * 0.16
      + (50 - mentality.teamSatisfaction) * 0.42
      + (50 - mentality.contractSatisfaction) * 0.25,
  );
  mentality.lastUpdated = date;
  if (career) {
    career.morale = Number(mentality.morale.toFixed(2));
    career.lastUpdated = date;
  }
  return person;
}

function updateAllMentality(saveWorld, date) {
  const people = ensurePeopleState(saveWorld);
  let changed = 0;
  const discontent = [];
  for (const [type, bucket] of [["driver", people.drivers], ["staff", people.staff]]) {
    for (const id of Object.keys(bucket)) {
      const before = numeric(bucket[id]?.mentality?.morale, 50);
      const row = updateMentalityForPerson(saveWorld, type, id, date);
      if (Math.abs(row.mentality.morale - before) >= 0.1) changed += 1;
      if (row.mentality.morale < 32 || row.mentality.teamSatisfaction < 30 || row.mentality.contractSatisfaction < 28) {
        discontent.push({ type, id, mentality: structuredClone(row.mentality) });
      }
    }
  }
  return { changed, discontent };
}

function gridByDriver(weekend) {
  return new Map((weekend?.grid ?? []).map((row) => [row.driverId, Number(row.grid ?? row.position ?? 0)]));
}

function raceReaction(saveWorld, weekend, date) {
  const rows = weekend?.classification ?? [];
  const grid = gridByDriver(weekend);
  const byTeam = new Map();
  for (const row of rows) {
    const teamId = row.teamId ?? row.team_id ?? null;
    if (!teamId) continue;
    if (!byTeam.has(teamId)) byTeam.set(teamId, []);
    byTeam.get(teamId).push(row);
  }
  let updated = 0;
  for (const row of rows) {
    const id = row.driverId ?? row.driver_id;
    if (!id || !personProfile(saveWorld, "driver", id)) continue;
    const person = ensurePersonState(saveWorld, "driver", id);
    const mentality = person.mentality;
    const position = Number(row.position ?? 99);
    const start = grid.get(id) || position;
    const gain = start - position;
    const status = String(row.status ?? "").toUpperCase();
    const retired = /DNF|RET|DISQUAL|DNS/.test(status) || row.retired === true;
    const podiumBonus = position <= 3 ? 5 - position : 0;
    const confidenceDelta = clamp(gain * 1.15 + podiumBonus - (retired ? 8 : 0), -12, 10);
    mentality.confidence = clamp(mentality.confidence + confidenceDelta);
    mentality.morale = clamp(mentality.morale + confidenceDelta * 0.65);
    mentality.pressure = clamp(mentality.pressure - confidenceDelta * 0.35);
    mentality.lastUpdated = date;

    const teamId = row.teamId ?? row.team_id ?? assignment(saveWorld, "driver", id)?.teamId ?? null;
    if (teamId) adjustRelationship(saveWorld, "driver", id, "team", teamId, {
      affinity: retired ? -1 : position <= 6 ? 1 : 0,
      trust: retired ? -0.5 : 0.25,
    });

    const teammates = (byTeam.get(teamId) ?? []).filter((other) => (other.driverId ?? other.driver_id) !== id);
    for (const teammate of teammates) {
      const teammateId = teammate.driverId ?? teammate.driver_id;
      if (!teammateId) continue;
      const teammatePosition = Number(teammate.position ?? 99);
      const close = Math.abs(position - teammatePosition) <= 3;
      adjustRelationship(saveWorld, "driver", id, "driver", teammateId, {
        affinity: close ? 0.2 : 0,
        rivalry: close ? 0.8 : 0.2,
      });
    }

    const career = careerState(saveWorld, "driver", id);
    if (career) career.morale = Number(mentality.morale.toFixed(2));
    updated += 1;
  }
  return updated;
}

function ensureActivatedPerson(saveWorld, event) {
  const type = String(event.payload?.entity_type ?? "").toLowerCase();
  if (!["driver", "staff"].includes(type)) return null;
  const id = event.payload?.entity_id ?? null;
  if (!id) return null;
  return ensurePersonState(saveWorld, type, id);
}

function contractReaction(saveWorld, event) {
  const type = String(event.payload?.worker_type ?? "driver").toLowerCase() === "staff" ? "staff" : "driver";
  const id = event.payload?.worker_id ?? null;
  const teamId = event.payload?.team_id ?? null;
  if (!id) return;
  const person = ensurePersonState(saveWorld, type, id);
  person.mentality.contractSatisfaction = clamp(person.mentality.contractSatisfaction + 12);
  person.mentality.morale = clamp(person.mentality.morale + 4);
  person.mentality.lastUpdated = event.date;
  if (teamId) adjustRelationship(saveWorld, type, id, "team", teamId, { affinity: 4, trust: 5 });
}

export function createPeopleDynamicsSystem() {
  return {
    id: "people.dynamics",
    eventTypes: [
      SIM_EVENT.CAREER_STARTED,
      SIM_EVENT.MONTH_STARTED,
      CAREER_EVENT.PROFILE_ACTIVATED,
      EMPLOYMENT_EVENT.CONTRACT_SIGNED,
      EMPLOYMENT_EVENT.FUTURE_CONTRACT_ACTIVATED,
      RACE_EVENT.COMPLETED,
    ],
    handle({ saveWorld, event }) {
      if (event.type === SIM_EVENT.CAREER_STARTED) {
        const initialized = initializeLivePeople(saveWorld);
        return { type: PEOPLE_EVENT.INITIALIZED, payload: initialized };
      }
      if (event.type === CAREER_EVENT.PROFILE_ACTIVATED) {
        ensureActivatedPerson(saveWorld, event);
        return null;
      }
      if ([EMPLOYMENT_EVENT.CONTRACT_SIGNED, EMPLOYMENT_EVENT.FUTURE_CONTRACT_ACTIVATED].includes(event.type)) {
        contractReaction(saveWorld, event);
        return null;
      }
      if (event.type === RACE_EVENT.COMPLETED) {
        const updated = raceReaction(saveWorld, event.payload, event.date);
        return { type: PEOPLE_EVENT.RACE_REACTION, payload: { updated } };
      }
      const result = updateAllMentality(saveWorld, event.date);
      const output = [{ type: PEOPLE_EVENT.MONTHLY_UPDATED, payload: { changed: result.changed } }];
      for (const row of result.discontent) {
        output.push({
          type: PEOPLE_EVENT.DISCONTENT,
          payload: {
            person_type: row.type,
            person_id: row.id,
            morale: Number(row.mentality.morale.toFixed(2)),
            team_satisfaction: Number(row.mentality.teamSatisfaction.toFixed(2)),
            contract_satisfaction: Number(row.mentality.contractSatisfaction.toFixed(2)),
          },
        });
      }
      return output;
    },
  };
}
