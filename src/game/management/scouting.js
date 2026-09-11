import { listVisibleDrivers } from "../../domain/entityVisibility.js";
import { ageOnDate } from "../../sim/systems/careerLifecycle.js";
import { createRng } from "../../sim/random.js";

export const SCOUTING_EVENT = Object.freeze({
  ASSIGNMENT_STARTED: "management.scouting.assignment_started",
  REPORT_COMPLETED: "management.scouting.report_completed",
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

function ensureManagement(saveWorld) {
  saveWorld.world.management ??= {};
  return saveWorld.world.management;
}

export function ensureScoutingState(saveWorld) {
  const management = ensureManagement(saveWorld);
  management.scouting ??= {
    nextAssignmentId: 1,
    shortlist: [],
    knowledge: { drivers: {} },
    assignments: [],
    reports: [],
  };
  management.scouting.nextAssignmentId = Math.max(1, Number(management.scouting.nextAssignmentId ?? 1));
  management.scouting.shortlist ??= [];
  management.scouting.knowledge ??= { drivers: {} };
  management.scouting.knowledge.drivers ??= {};
  management.scouting.assignments ??= [];
  management.scouting.reports ??= [];
  return management.scouting;
}

function profileId(row) {
  return row?.driver_id ?? row?.id ?? null;
}

function profileName(row) {
  return row?.display_name ?? row?.driver_name ?? row?.name ?? profileId(row) ?? "Unknown Driver";
}

function rawDriver(saveWorld, driverId) {
  return [...(saveWorld.world?.drivers ?? []), ...(saveWorld.world?.futureDrivers ?? [])]
    .find((row) => String(profileId(row)) === String(driverId)) ?? null;
}

function ratingRow(saveWorld, driverId) {
  return (saveWorld.world?.driverRatings ?? []).find((row) => String(row.driver_id) === String(driverId)) ?? {};
}

function assignment(saveWorld, driverId) {
  return saveWorld.world?.employment?.drivers?.[driverId] ?? null;
}

function controlledTeams(saveWorld) {
  return new Set(saveWorld.player?.controlledTeamIds ?? []);
}

function baseKnowledge(saveWorld, driverId) {
  const current = assignment(saveWorld, driverId);
  if (current?.teamId && controlledTeams(saveWorld).has(current.teamId)) return 100;
  if (current?.status === "employed") return 35;
  return 20;
}

export function driverScoutingKnowledge(saveWorld, driverId) {
  const scouting = ensureScoutingState(saveWorld);
  const stored = numeric(scouting.knowledge.drivers[driverId]);
  return clamp(stored ?? baseKnowledge(saveWorld, driverId), 0, 100);
}

function latestReport(saveWorld, driverId) {
  const reports = ensureScoutingState(saveWorld).reports.filter((row) => String(row.driverId) === String(driverId));
  return [...reports].sort((a, b) => b.completedAt.localeCompare(a.completedAt) || b.knowledge - a.knowledge)[0] ?? null;
}

function contractUntil(saveWorld, driverId) {
  return assignment(saveWorld, driverId)?.contractUntil ?? null;
}

function candidateProjection(saveWorld, row) {
  const id = profileId(row);
  const current = assignment(saveWorld, id);
  const knowledge = driverScoutingKnowledge(saveWorld, id);
  const report = latestReport(saveWorld, id);
  const raw = rawDriver(saveWorld, id) ?? row;
  const age = saveWorld.world?.careerState?.drivers?.[id]?.age ?? ageOnDate(raw, saveWorld.clock?.date);
  return {
    id,
    name: profileName(row),
    nationality: row.nationality ?? row.country ?? null,
    age,
    visibilityState: row.visibility_state ?? null,
    currentTeamId: current?.teamId ?? null,
    employmentStatus: current?.status ?? "available",
    contractUntil: contractUntil(saveWorld, id),
    shortlisted: ensureScoutingState(saveWorld).shortlist.includes(id),
    knowledge,
    report: report ? structuredClone(report) : null,
  };
}

export function listRecruitmentCandidates(saveWorld, options = {}) {
  let rows = listVisibleDrivers(saveWorld, { requireTalentVisible: true }).map((row) => candidateProjection(saveWorld, row));
  const nameQuery = text(options.query).trim().toLowerCase();
  if (nameQuery) rows = rows.filter((row) => row.name.toLowerCase().includes(nameQuery));
  if (options.nationality) rows = rows.filter((row) => text(row.nationality).toLowerCase() === text(options.nationality).toLowerCase());
  if (Number.isFinite(Number(options.maxAge))) rows = rows.filter((row) => row.age !== null && row.age <= Number(options.maxAge));
  if (Number.isFinite(Number(options.minAge))) rows = rows.filter((row) => row.age !== null && row.age >= Number(options.minAge));
  if (options.availability === "free_agent") rows = rows.filter((row) => !row.currentTeamId);
  if (options.shortlisted === true) rows = rows.filter((row) => row.shortlisted);
  return rows.sort((a, b) => Number(b.shortlisted) - Number(a.shortlisted) || b.knowledge - a.knowledge || a.name.localeCompare(b.name));
}

function requireVisibleCandidate(saveWorld, driverId) {
  const row = listVisibleDrivers(saveWorld, { requireTalentVisible: true })
    .find((candidate) => String(profileId(candidate)) === String(driverId));
  if (!row) throw new Error(`Driver '${driverId}' is not currently visible to recruitment.`);
  return row;
}

export function setDriverShortlist(saveWorld, driverId, shortlisted = true) {
  requireVisibleCandidate(saveWorld, driverId);
  const scouting = ensureScoutingState(saveWorld);
  const index = scouting.shortlist.indexOf(driverId);
  if (shortlisted && index < 0) scouting.shortlist.push(driverId);
  if (!shortlisted && index >= 0) scouting.shortlist.splice(index, 1);
  scouting.shortlist.sort();
  return candidateProjection(saveWorld, requireVisibleCandidate(saveWorld, driverId));
}

function defaultAssignmentDays(saveWorld) {
  const staffAssignments = saveWorld.world?.employment?.staff ?? {};
  const controlled = controlledTeams(saveWorld);
  const scoutIds = Object.entries(staffAssignments)
    .filter(([, row]) => row?.status === "employed" && controlled.has(row.teamId) && /scout|recruit/i.test(text(row.role)))
    .map(([id]) => id);
  if (!scoutIds.length) return 14;
  const ratings = scoutIds.map((id) => {
    const row = (saveWorld.world?.staffRatings ?? []).find((rating) => String(rating.staff_id) === String(id)) ?? {};
    return numeric(row.scouting ?? row.judging_ability ?? row.data_analysis ?? row.technical, 50);
  });
  const average = ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
  return Math.round(clamp(18 - average / 10, 7, 16));
}

export function startDriverScoutingAssignment(saveWorld, driverId, options = {}) {
  requireVisibleCandidate(saveWorld, driverId);
  const scouting = ensureScoutingState(saveWorld);
  const existing = scouting.assignments.find((row) => row.driverId === driverId && row.status === "active");
  if (existing) return structuredClone(existing);
  const serial = scouting.nextAssignmentId++;
  const durationDays = Math.max(1, Math.round(numeric(options.durationDays, defaultAssignmentDays(saveWorld))));
  const row = {
    id: `scout:${String(serial).padStart(6, "0")}`,
    driverId,
    status: "active",
    focus: text(options.focus, "full_report") || "full_report",
    startedAt: saveWorld.clock?.date ?? null,
    durationDays,
    progressDays: 0,
    completedAt: null,
  };
  scouting.assignments.push(row);
  return structuredClone(row);
}

function estimateRange(value, knowledge, rng, minimum = 0, maximum = 100) {
  if (value === null) return null;
  const uncertainty = Math.max(1, Math.round((100 - knowledge) / 7));
  const offset = (rng.next() - 0.5) * uncertainty;
  const centre = clamp(value + offset, minimum, maximum);
  return {
    low: Math.round(clamp(centre - uncertainty, minimum, maximum)),
    high: Math.round(clamp(centre + uncertainty, minimum, maximum)),
  };
}

function reportKnowledge(previous) {
  if (previous >= 95) return 100;
  if (previous >= 70) return Math.min(95, previous + 20);
  return Math.max(72, previous + 42);
}

export function buildDriverScoutingReport(saveWorld, assignmentRow) {
  const driverId = assignmentRow.driverId;
  requireVisibleCandidate(saveWorld, driverId);
  const profile = rawDriver(saveWorld, driverId) ?? {};
  const rating = ratingRow(saveWorld, driverId);
  const state = saveWorld.world?.careerState?.drivers?.[driverId] ?? {};
  const previousKnowledge = driverScoutingKnowledge(saveWorld, driverId);
  const knowledge = reportKnowledge(previousKnowledge);
  const rng = createRng(`${saveWorld.meta.seed}|${assignmentRow.id}|scouting-report|${driverId}`);
  const currentAbility = numeric(state.currentAbility ?? rating.current_ability ?? profile.current_ability);
  const potentialAbility = numeric(state.potentialAbility ?? rating.potential_ability ?? profile.potential_ability);
  const reputation = numeric(state.reputation ?? rating.reputation ?? profile.reputation);
  const attributes = {};
  if (knowledge >= 60) {
    const ignored = new Set(["driver_id", "year", "current_ability", "potential_ability", "reputation"]);
    for (const [key, raw] of Object.entries(rating)) {
      if (ignored.has(key)) continue;
      const value = numeric(raw);
      if (value === null) continue;
      attributes[key] = estimateRange(value, knowledge, rng);
    }
  }
  return {
    id: `report:${assignmentRow.id}`,
    assignmentId: assignmentRow.id,
    driverId,
    driverName: profileName(profile),
    completedAt: saveWorld.clock?.date ?? null,
    knowledge,
    currentAbility: estimateRange(currentAbility, knowledge, rng),
    potentialAbility: estimateRange(potentialAbility, Math.max(40, knowledge - 10), rng),
    reputation: estimateRange(reputation, knowledge, rng),
    attributes,
    availability: {
      teamId: assignment(saveWorld, driverId)?.teamId ?? null,
      contractUntil: contractUntil(saveWorld, driverId),
      f1Eligible: listVisibleDrivers(saveWorld, { requireF1Eligible: true }).some((row) => String(profileId(row)) === String(driverId)),
    },
  };
}

export function completeDriverScoutingAssignment(saveWorld, assignmentId) {
  const scouting = ensureScoutingState(saveWorld);
  const assignmentRow = scouting.assignments.find((row) => row.id === assignmentId);
  if (!assignmentRow) throw new Error(`Scouting assignment '${assignmentId}' does not exist.`);
  if (assignmentRow.status === "completed") return structuredClone(latestReport(saveWorld, assignmentRow.driverId));
  const report = buildDriverScoutingReport(saveWorld, assignmentRow);
  assignmentRow.status = "completed";
  assignmentRow.progressDays = assignmentRow.durationDays;
  assignmentRow.completedAt = saveWorld.clock?.date ?? null;
  scouting.knowledge.drivers[assignmentRow.driverId] = report.knowledge;
  scouting.reports.push(report);
  return structuredClone(report);
}

export function scoutingSummary(saveWorld) {
  const scouting = ensureScoutingState(saveWorld);
  return {
    shortlist: scouting.shortlist.length,
    activeAssignments: scouting.assignments.filter((row) => row.status === "active").length,
    completedReports: scouting.reports.length,
  };
}
