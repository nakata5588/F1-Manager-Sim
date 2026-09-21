import {
  archiveDevelopmentSeason,
  ensureDevelopmentState,
  ensureDriverDevelopmentSeason,
  ensureStaffDevelopmentSeason,
  resetDevelopmentSeason,
} from "../../game/management/development.js";
import { DRIVER_AVAILABILITY_EVENT } from "../../game/management/driverAvailability.js";
import { PRESEASON_EVENT } from "../../game/management/preseason.js";
import {
  organizationDepartmentForRole,
  organizationProjection,
} from "../../game/management/organization.js";
import { SIM_EVENT } from "../timeEngine.js";
import { CAREER_EVENT } from "./careerLifecycle.js";
import { RACE_EVENT } from "./raceWeekend.js";

export const DEVELOPMENT_SIGNAL_EVENT = Object.freeze({
  INITIALIZED: "development.signals_initialized",
  RACE_RECORDED: "development.race_recorded",
  TEST_RECORDED: "development.test_recorded",
  MONTH_RECORDED: "development.month_recorded",
  INJURY_RECORDED: "development.injury_recorded",
  SEASON_ARCHIVED: "development.season_archived",
});

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalize(value, fallback = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed >= 0 && parsed <= 1) return parsed * 100;
  if (parsed >= 1 && parsed <= 10) return parsed * 10;
  return clamp(parsed, 0, 100);
}

function assignmentMap(saveWorld, type) {
  return type === "driver"
    ? saveWorld.world?.employment?.drivers ?? {}
    : saveWorld.world?.employment?.staff ?? {};
}

function employedOnTeam(saveWorld, type, teamId) {
  return Object.entries(assignmentMap(saveWorld, type))
    .filter(([, row]) => row?.status === "employed" && String(row?.teamId ?? row?.team_id ?? "") === String(teamId))
    .map(([id, assignment]) => ({ id, assignment }));
}

function driverState(saveWorld, driverId) {
  return saveWorld.world?.careerState?.drivers?.[driverId] ?? null;
}

function staffState(saveWorld, staffId) {
  return saveWorld.world?.careerState?.staff?.[staffId] ?? null;
}

function driverRating(saveWorld, driverId) {
  return (saveWorld.world?.driverRatings ?? []).find((row) => String(row.driver_id) === String(driverId)) ?? {};
}

function staffRating(saveWorld, staffId) {
  return (saveWorld.world?.staffRatings ?? []).find((row) => String(row.staff_id) === String(staffId)) ?? {};
}

function dynamicDriverValue(saveWorld, driverId, fields, fallback = 50) {
  const state = driverState(saveWorld, driverId) ?? {};
  const rating = driverRating(saveWorld, driverId);
  for (const field of fields) {
    const value = state.attributes?.[field] ?? rating?.[field];
    if (value !== null && value !== undefined && value !== "") return normalize(value, fallback);
  }
  return fallback;
}

function dynamicStaffValue(saveWorld, staffId, fields, fallback = 50) {
  const state = staffState(saveWorld, staffId) ?? {};
  const rating = staffRating(saveWorld, staffId);
  const values = fields
    .map((field) => state.attributes?.[field] ?? rating?.[field])
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map((value) => normalize(value, fallback));
  if (!values.length) return normalize(state.currentAbility, fallback);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function coachingScore(saveWorld, teamId) {
  const staff = employedOnTeam(saveWorld, "staff", teamId);
  if (!staff.length) return 45;
  const scores = staff.map(({ id }) => dynamicStaffValue(
    saveWorld,
    id,
    ["driver_development", "motivation", "communication", "leadership"],
    45,
  ));
  return clamp(scores.reduce((sum, value) => sum + value, 0) / scores.length, 20, 100);
}

function mentorScore(saveWorld, targetId, teamId) {
  const targetAge = numeric(driverState(saveWorld, targetId)?.age, null);
  if (targetAge === null || targetAge > 27) return 0;
  const candidates = employedOnTeam(saveWorld, "driver", teamId)
    .filter(({ id }) => id !== targetId)
    .map(({ id }) => {
      const age = numeric(driverState(saveWorld, id)?.age, null);
      if (age === null || age < 28 || age < targetAge + 5) return null;
      const knowledge = (
        dynamicDriverValue(saveWorld, id, ["leadership"], 45) * 0.34
        + dynamicDriverValue(saveWorld, id, ["team_player"], 50) * 0.28
        + dynamicDriverValue(saveWorld, id, ["technical_feedback"], 50) * 0.38
      );
      return { id, age, knowledge };
    })
    .filter(Boolean)
    .sort((a, b) => b.knowledge - a.knowledge || b.age - a.age || a.id.localeCompare(b.id));
  return candidates[0]?.knowledge ?? 0;
}

function updateRaceForm(saveWorld, row, teammatePerformance, qualifyingDelta) {
  const state = driverState(saveWorld, row.driverId);
  if (!state) return;
  const relative = clamp(numeric(row.performanceIndex, teammatePerformance) - teammatePerformance, -15, 15);
  let completion = 0;
  if (row.status === "DNF" && row.reason === "incident") completion = -1.5;
  else if (row.status === "FINISHED") completion = 0.6;
  const signal = clamp(relative * 1.35 + qualifyingDelta * 0.7 + completion, -12, 12);
  state.form = Number(clamp(numeric(state.form, 0) * 0.72 + signal * 2.4, -100, 100).toFixed(2));
  state.morale = Number(clamp(numeric(state.morale, 50) + signal * 0.18, 0, 100).toFixed(2));
}

function recordRace(saveWorld, event) {
  const race = event.payload ?? {};
  const season = Number(race.season ?? saveWorld.clock?.season);
  const classification = race.classification ?? [];
  const qualifying = new Map((race.qualifying?.classification ?? []).map((row) => [String(row.driverId), row]));
  const practice = new Map((race.practice?.results ?? []).map((row) => [String(row.driverId), row]));
  const teamRows = new Map();

  for (const row of classification) {
    const teamId = String(row.teamId ?? row.team_id ?? "");
    if (!teamRows.has(teamId)) teamRows.set(teamId, []);
    teamRows.get(teamId).push(row);
  }

  for (const row of classification) {
    const driverId = row.driverId ?? row.driver_id;
    const teamId = String(row.teamId ?? row.team_id ?? "");
    if (!driverId) continue;
    const evidence = ensureDriverDevelopmentSeason(saveWorld, driverId, season);
    evidence.raceStarts += 1;
    if (row.status === "FINISHED") evidence.raceFinishes += 1;
    evidence.performanceSamples += 1;
    const teammates = (teamRows.get(teamId) ?? []).filter((candidate) => candidate.driverId !== driverId);
    const teammatePerformance = teammates.length
      ? teammates.reduce((sum, candidate) => sum + numeric(candidate.performanceIndex, 0), 0) / teammates.length
      : numeric(row.performanceIndex, 0);
    evidence.teammatePerformanceDeltaTotal += numeric(row.performanceIndex, teammatePerformance) - teammatePerformance;

    const q = qualifying.get(String(driverId));
    if (q?.status === "QUALIFIED") evidence.qualifyingStarts += 1;
    const teammateQ = teammates
      .map((candidate) => qualifying.get(String(candidate.driverId)))
      .filter(Boolean);
    const teammateQPosition = teammateQ.length
      ? teammateQ.reduce((sum, candidate) => sum + numeric(candidate.position, q?.position ?? 0), 0) / teammateQ.length
      : numeric(q?.position, 0);
    const qDelta = q ? teammateQPosition - numeric(q.position, teammateQPosition) : 0;
    evidence.teammateQualifyingDeltaTotal += qDelta;

    const p = practice.get(String(driverId));
    evidence.practiceWindows += numeric(p?.practiceWindows, 0);
    updateRaceForm(saveWorld, row, teammatePerformance, qDelta);
  }

  for (const teamId of teamRows.keys()) {
    for (const { id } of employedOnTeam(saveWorld, "staff", teamId)) {
      ensureStaffDevelopmentSeason(saveWorld, id, season).raceWeekends += 1;
    }
  }

  return {
    type: DEVELOPMENT_SIGNAL_EVENT.RACE_RECORDED,
    payload: {
      season,
      race_key: race.key ?? null,
      drivers: classification.length,
      teams: teamRows.size,
    },
  };
}

function roleTestingWeight(role) {
  const text = String(role ?? "").toLowerCase();
  if (/test|development/.test(text)) return 1.15;
  if (/reserve|third/.test(text)) return 1;
  return 0.45;
}

function recordTest(saveWorld, event) {
  const teamId = event.payload?.team_id ?? event.payload?.teamId;
  if (!teamId) return null;
  const season = Number(saveWorld.clock?.season);
  const effectiveness = clamp(numeric(event.payload?.effectiveness, 50), 0, 100);
  for (const { id, assignment } of employedOnTeam(saveWorld, "driver", teamId)) {
    const row = ensureDriverDevelopmentSeason(saveWorld, id, season);
    const weight = roleTestingWeight(assignment?.role);
    row.testingSessions += 1;
    row.testingMileage += weight * (0.65 + effectiveness / 200);
  }
  for (const { id } of employedOnTeam(saveWorld, "staff", teamId)) {
    ensureStaffDevelopmentSeason(saveWorld, id, season).testSessions += 1;
  }
  return {
    type: DEVELOPMENT_SIGNAL_EVENT.TEST_RECORDED,
    payload: {
      team_id: teamId,
      test_id: event.payload?.test_id ?? null,
      effectiveness,
    },
  };
}

function recordMonth(saveWorld, event) {
  const season = Number(saveWorld.clock?.season);
  const teamIds = (saveWorld.world?.teams ?? [])
    .map((row) => row?.team_id ?? row?.id)
    .filter(Boolean)
    .map(String);

  for (const teamId of teamIds) {
    const organization = organizationProjection(saveWorld, teamId);
    const environment = clamp(numeric(organization?.overallEffectiveness, 1), 0.4, 1.2);
    const coaching = coachingScore(saveWorld, teamId);

    for (const { id } of employedOnTeam(saveWorld, "driver", teamId)) {
      const row = ensureDriverDevelopmentSeason(saveWorld, id, season);
      row.teamEnvironmentMonths += 1;
      row.teamEnvironmentTotal += environment;
      row.coachingMonths += 1;
      row.coachingTotal += coaching;
      const mentoring = mentorScore(saveWorld, id, teamId);
      if (mentoring > 0) {
        row.mentoringMonths += 1;
        row.mentoringTotal += mentoring;
      }
    }

    const teamStaff = employedOnTeam(saveWorld, "staff", teamId);
    for (const { id, assignment } of teamStaff) {
      const row = ensureStaffDevelopmentSeason(saveWorld, id, season);
      row.employedMonths += 1;
      const department = organizationDepartmentForRole(assignment?.role);
      const departmentRow = organization?.departments?.[department] ?? null;
      row.departmentMonths += 1;
      row.departmentEffectivenessTotal += numeric(departmentRow?.effectiveness, environment);
      row.workloadFactorTotal += numeric(departmentRow?.workloadFactor, 1);

      const targetAge = numeric(staffState(saveWorld, id)?.age, null);
      const peer = teamStaff
        .filter((candidate) => candidate.id !== id)
        .map((candidate) => ({
          id: candidate.id,
          age: numeric(staffState(saveWorld, candidate.id)?.age, null),
          department: organizationDepartmentForRole(candidate.assignment?.role),
          quality: dynamicStaffValue(saveWorld, candidate.id, ["leadership", "communication", "technical", "strategy"], 50),
        }))
        .filter((candidate) => candidate.department === department
          && targetAge !== null
          && candidate.age !== null
          && candidate.age >= targetAge + 6)
        .sort((a, b) => b.quality - a.quality || a.id.localeCompare(b.id))[0];
      if (peer) {
        row.peerLearningMonths += 1;
        row.peerLearningTotal += peer.quality;
      }
    }
  }

  return {
    type: DEVELOPMENT_SIGNAL_EVENT.MONTH_RECORDED,
    payload: { season, teams: teamIds.length },
  };
}

function injuryWeight(kind) {
  if (kind === "minor") return 0.15;
  if (kind === "moderate") return 0.4;
  if (kind === "serious") return 0.8;
  if (kind === "career_threatening") return 1.2;
  return 0.25;
}

function recordInjury(saveWorld, event) {
  const driverId = event.payload?.driver_id;
  if (!driverId) return null;
  const row = ensureDriverDevelopmentSeason(saveWorld, driverId);
  const kind = event.payload?.injury_class ?? "unknown";
  const days = Math.max(0, numeric(event.payload?.duration_days, 0));
  row.injuryDays += days;
  row.injuryBurden += injuryWeight(kind);
  if (kind === "serious") row.seriousInjuries += 1;
  if (kind === "career_threatening") row.careerThreateningInjuries += 1;
  const career = driverState(saveWorld, driverId);
  if (career) career.morale = Number(clamp(numeric(career.morale, 50) - Math.min(8, 1 + days / 30), 0, 100).toFixed(2));
  return {
    type: DEVELOPMENT_SIGNAL_EVENT.INJURY_RECORDED,
    payload: { driver_id: driverId, injury_class: kind, duration_days: days },
  };
}

function initialize(saveWorld, date) {
  const state = ensureDevelopmentState(saveWorld);
  state.initializedAt ??= date ?? null;
  resetDevelopmentSeason(saveWorld, saveWorld.clock?.season, date);
  return {
    type: DEVELOPMENT_SIGNAL_EVENT.INITIALIZED,
    payload: {
      season: Number(saveWorld.clock?.season),
      drivers: Object.keys(state.drivers).length,
      staff: Object.keys(state.staff).length,
    },
  };
}

function rollover(saveWorld, event) {
  const newSeason = Number(event.payload?.season ?? saveWorld.clock?.season);
  const previousSeason = Number(event.payload?.previousSeason ?? newSeason - 1);
  const archived = archiveDevelopmentSeason(saveWorld, previousSeason, event.date);
  resetDevelopmentSeason(saveWorld, newSeason, event.date);
  if (!archived) return null;
  return {
    type: DEVELOPMENT_SIGNAL_EVENT.SEASON_ARCHIVED,
    payload: {
      season: previousSeason,
      drivers: Object.keys(archived.drivers).length,
      staff: Object.keys(archived.staff).length,
    },
  };
}

export function createDevelopmentSignalsSystem() {
  return {
    id: "career.development-signals",
    eventTypes: [
      SIM_EVENT.CAREER_STARTED,
      SIM_EVENT.MONTH_STARTED,
      SIM_EVENT.SEASON_STARTED,
      CAREER_EVENT.PROFILE_ACTIVATED,
      RACE_EVENT.COMPLETED,
      PRESEASON_EVENT.TEST_COMPLETED,
      DRIVER_AVAILABILITY_EVENT.INJURED,
      DRIVER_AVAILABILITY_EVENT.RECOVERED,
    ],
    handle({ saveWorld, event }) {
      if (event.type === SIM_EVENT.CAREER_STARTED) return initialize(saveWorld, event.date);
      if (event.type === SIM_EVENT.SEASON_STARTED) return rollover(saveWorld, event);
      if (event.type === SIM_EVENT.MONTH_STARTED) return recordMonth(saveWorld, event);
      if (event.type === RACE_EVENT.COMPLETED) return recordRace(saveWorld, event);
      if (event.type === PRESEASON_EVENT.TEST_COMPLETED) return recordTest(saveWorld, event);
      if (event.type === DRIVER_AVAILABILITY_EVENT.INJURED) return recordInjury(saveWorld, event);
      if (event.type === DRIVER_AVAILABILITY_EVENT.RECOVERED) {
        const career = driverState(saveWorld, event.payload?.driver_id);
        if (career) career.morale = Number(clamp(numeric(career.morale, 50) + 1, 0, 100).toFixed(2));
        return null;
      }
      if (event.type === CAREER_EVENT.PROFILE_ACTIVATED) {
        if (event.payload?.entity_type === "driver") ensureDriverDevelopmentSeason(saveWorld, event.payload?.entity_id);
        if (event.payload?.entity_type === "staff") ensureStaffDevelopmentSeason(saveWorld, event.payload?.entity_id);
      }
      return null;
    },
  };
}
