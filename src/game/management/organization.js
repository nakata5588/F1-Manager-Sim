const DEPARTMENT_ORDER = ["technical", "race_operations", "scouting", "commercial", "leadership", "general"];

const DEPARTMENT_DEFINITIONS = Object.freeze({
  technical: {
    label: "Technical",
    rolePatterns: [/technical/i, /design/i, /engineer/i, /aero/i, /chassis/i, /research/i, /development/i, /reliab/i],
    qualityFields: ["technical", "engineering", "design", "aero", "innovation", "reliability", "reliability_focus", "data_analysis"],
  },
  race_operations: {
    label: "Race Operations",
    rolePatterns: [/race_engineer/i, /race engineer/i, /mechanic/i, /pit/i, /strategy/i, /sporting/i],
    qualityFields: ["strategy", "pitstop_management", "mechanics", "reliability", "reliability_focus", "communication", "leadership"],
  },
  scouting: {
    label: "Scouting & Recruitment",
    rolePatterns: [/scout/i, /recruit/i, /talent/i],
    qualityFields: ["scouting", "judging_ability", "data_analysis", "driver_development", "negotiation", "communication"],
  },
  commercial: {
    label: "Commercial",
    rolePatterns: [/commercial/i, /sponsor/i, /marketing/i, /business/i, /finance/i],
    qualityFields: ["negotiation", "budget_management", "communication", "leadership", "motivation"],
  },
  leadership: {
    label: "Team Leadership",
    rolePatterns: [/team_manager/i, /team manager/i, /team_principal/i, /team principal/i, /managing_director/i, /managing director/i, /owner/i, /director/i],
    qualityFields: ["leadership", "communication", "motivation", "conflict_management", "negotiation", "budget_management"],
  },
  general: {
    label: "General Staff",
    rolePatterns: [],
    qualityFields: ["leadership", "technical", "strategy", "communication", "motivation", "data_analysis"],
  },
});

function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizedRating(value) {
  const parsed = numeric(value);
  if (parsed === null) return null;
  return parsed <= 10 ? parsed * 10 : parsed;
}

function text(value, fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

export function organizationDepartmentForRole(role) {
  const normalized = text(role, "staff").trim();
  for (const key of DEPARTMENT_ORDER) {
    if (key === "general") continue;
    const definition = DEPARTMENT_DEFINITIONS[key];
    if (definition.rolePatterns.some((pattern) => pattern.test(normalized))) return key;
  }
  return "general";
}

function staffProfile(saveWorld, staffId) {
  return (saveWorld.world?.staff ?? []).find((row) => String(row.staff_id ?? row.id) === String(staffId)) ?? {};
}

function staffRating(saveWorld, staffId) {
  return (saveWorld.world?.staffRatings ?? []).find((row) => String(row.staff_id ?? row.id) === String(staffId)) ?? {};
}

function staffState(saveWorld, staffId) {
  return saveWorld.world?.careerState?.staff?.[staffId] ?? {};
}

function staffName(saveWorld, staffId) {
  const row = staffProfile(saveWorld, staffId);
  return row.display_name ?? row.staff_name ?? row.name ?? staffId;
}

function memberQuality(saveWorld, staffId, department) {
  const definition = DEPARTMENT_DEFINITIONS[department] ?? DEPARTMENT_DEFINITIONS.general;
  const rating = staffRating(saveWorld, staffId);
  const dynamic = staffState(saveWorld, staffId)?.attributes ?? {};
  const values = definition.qualityFields
    .map((field) => normalizedRating(dynamic[field] ?? rating[field]))
    .filter((value) => value !== null);
  if (!values.length) {
    const fallback = normalizedRating(
      staffState(saveWorld, staffId)?.currentAbility
      ?? rating.current_ability
      ?? staffProfile(saveWorld, staffId)?.current_ability,
    );
    return fallback ?? 50;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function boardCapacityBonus(saveWorld, teamId) {
  return Math.max(0, numeric(saveWorld.world?.management?.board?.teams?.[teamId]?.staffCapacityBonus, 0));
}

function activeTeamIds(saveWorld) {
  const evolution = saveWorld.world?.governance?.teamEvolution;
  if (evolution?.initializedAt && evolution.active && Object.keys(evolution.active).length) {
    return Object.keys(evolution.active).sort();
  }
  return (saveWorld.world?.teams ?? [])
    .map((row) => row.team_id ?? row.id)
    .filter(Boolean)
    .map(String)
    .sort();
}

function openStaffVacancies(saveWorld, teamId) {
  return (saveWorld.world?.employment?.vacancies ?? [])
    .filter((row) => String(row?.teamId ?? row?.team_id ?? "") === String(teamId))
    .filter((row) => (row?.type ?? row?.workerType ?? row?.worker_type ?? "staff") === "staff")
    .filter((row) => (row?.status ?? "open") === "open");
}

function employedStaff(saveWorld, teamId) {
  return Object.entries(saveWorld.world?.employment?.staff ?? {})
    .filter(([, assignment]) => assignment?.status === "employed" && String(assignment?.teamId ?? assignment?.team_id ?? "") === String(teamId))
    .map(([staffId, assignment]) => ({ staffId, assignment }));
}

function departmentStatus({ memberCount, vacancyCount, workloadIndex, qualityIndex }) {
  if (vacancyCount > 0 && memberCount === 0) return "critical";
  if (workloadIndex >= 1.6) return "critical";
  if (workloadIndex > 1.15) return "strained";
  if (qualityIndex < 45) return "weak";
  return "stable";
}

function statusRank(status) {
  return ({ stable: 0, weak: 1, strained: 2, critical: 3 })[status] ?? 0;
}

function buildTeamOrganization(saveWorld, teamId) {
  const buckets = new Map();
  const ensureBucket = (department) => {
    if (!buckets.has(department)) buckets.set(department, { members: [], vacancies: [] });
    return buckets.get(department);
  };

  for (const { staffId, assignment } of employedStaff(saveWorld, teamId)) {
    const role = assignment?.role ?? staffProfile(saveWorld, staffId)?.role ?? "staff";
    const department = organizationDepartmentForRole(role);
    ensureBucket(department).members.push({
      staffId,
      name: staffName(saveWorld, staffId),
      role,
      quality: Number(memberQuality(saveWorld, staffId, department).toFixed(2)),
    });
  }

  for (const vacancy of openStaffVacancies(saveWorld, teamId)) {
    const role = vacancy?.role ?? "staff";
    const department = organizationDepartmentForRole(role);
    ensureBucket(department).vacancies.push({
      id: vacancy.id ?? vacancy.vacancyId ?? null,
      role,
      openedAt: vacancy.openedAt ?? vacancy.createdAt ?? null,
    });
  }

  const activeDepartments = [...buckets.keys()];
  const capacityBonus = boardCapacityBonus(saveWorld, teamId);
  const bonusShare = activeDepartments.length ? capacityBonus / activeDepartments.length : 0;
  const departments = {};

  for (const department of DEPARTMENT_ORDER) {
    const bucket = buckets.get(department);
    if (!bucket) continue;
    const memberCount = bucket.members.length;
    const vacancyCount = bucket.vacancies.length;
    const demandUnits = memberCount + vacancyCount;
    const capacityUnits = Math.max(0.5, memberCount + bonusShare);
    const workloadIndex = demandUnits > 0 ? demandUnits / capacityUnits : 0;
    const qualityIndex = memberCount
      ? bucket.members.reduce((sum, row) => sum + row.quality, 0) / memberCount
      : 50;
    const workloadFactor = workloadIndex > 0 ? clamp(1 / workloadIndex, 0.55, 1.05) : 1;
    const effectiveness = clamp((qualityIndex / 70) * workloadFactor, 0.4, 1.15);
    const status = departmentStatus({ memberCount, vacancyCount, workloadIndex, qualityIndex });
    departments[department] = {
      id: department,
      label: DEPARTMENT_DEFINITIONS[department].label,
      members: bucket.members.sort((a, b) => b.quality - a.quality || String(a.staffId).localeCompare(String(b.staffId))),
      vacancies: bucket.vacancies,
      memberCount,
      vacancyCount,
      demandUnits: Number(demandUnits.toFixed(2)),
      capacityUnits: Number(capacityUnits.toFixed(2)),
      workloadIndex: Number(workloadIndex.toFixed(3)),
      qualityIndex: Number(qualityIndex.toFixed(2)),
      effectiveness: Number(effectiveness.toFixed(3)),
      status,
      provenance: "derived_gameplay_organisation_state",
    };
  }

  const rows = Object.values(departments);
  const overallEffectiveness = rows.length
    ? rows.reduce((sum, row) => sum + row.effectiveness, 0) / rows.length
    : 1;
  const overallStatus = rows.length
    ? [...rows].sort((a, b) => statusRank(b.status) - statusRank(a.status) || b.workloadIndex - a.workloadIndex)[0].status
    : "stable";

  return {
    teamId: String(teamId),
    updatedAt: saveWorld.clock?.date ?? null,
    season: Number(saveWorld.clock?.season),
    staffCapacityBonus: capacityBonus,
    employedStaffCount: employedStaff(saveWorld, teamId).length,
    openStaffVacancies: openStaffVacancies(saveWorld, teamId).length,
    overallEffectiveness: Number(overallEffectiveness.toFixed(3)),
    overallStatus,
    departments,
    provenance: "save_world_derived_organisation",
  };
}

export function ensureOrganizationState(saveWorld) {
  saveWorld.world ??= {};
  saveWorld.world.management ??= {};
  saveWorld.world.management.organization ??= {
    teams: {},
    history: [],
    lastSnapshotMonth: null,
  };
  const state = saveWorld.world.management.organization;
  state.teams ??= {};
  state.history ??= [];
  state.lastSnapshotMonth ??= null;
  return state;
}

export function refreshOrganization(saveWorld, options = {}) {
  const state = ensureOrganizationState(saveWorld);
  const ids = activeTeamIds(saveWorld);
  const active = new Set(ids);

  for (const teamId of Object.keys(state.teams)) {
    if (!active.has(teamId)) delete state.teams[teamId];
  }
  for (const teamId of ids) state.teams[teamId] = buildTeamOrganization(saveWorld, teamId);

  const monthKey = String(saveWorld.clock?.date ?? "").slice(0, 7);
  if (options.snapshot === true && monthKey && state.lastSnapshotMonth !== monthKey) {
    for (const team of Object.values(state.teams)) {
      state.history.push({
        date: saveWorld.clock?.date ?? null,
        season: Number(saveWorld.clock?.season),
        teamId: team.teamId,
        overallEffectiveness: team.overallEffectiveness,
        overallStatus: team.overallStatus,
        employedStaffCount: team.employedStaffCount,
        openStaffVacancies: team.openStaffVacancies,
        departments: Object.fromEntries(Object.entries(team.departments).map(([key, row]) => [key, {
          effectiveness: row.effectiveness,
          status: row.status,
          workloadIndex: row.workloadIndex,
          qualityIndex: row.qualityIndex,
          memberCount: row.memberCount,
          vacancyCount: row.vacancyCount,
        }])),
      });
    }
    state.lastSnapshotMonth = monthKey;
  }
  return state;
}

export function organizationProjection(saveWorld, teamId, options = {}) {
  const id = String(teamId);
  const state = ensureOrganizationState(saveWorld);
  if (options.refresh !== false || !state.teams?.[id]) refreshOrganization(saveWorld);
  const team = state.teams?.[id] ?? buildTeamOrganization(saveWorld, id);
  return structuredClone(team);
}

export function departmentEffectiveness(saveWorld, teamId, department, fallback = 1) {
  if (!teamId) return fallback;
  const team = organizationProjection(saveWorld, String(teamId));
  return numeric(team.departments?.[department]?.effectiveness, fallback);
}

export function organisationPressure(saveWorld, teamId) {
  const team = organizationProjection(saveWorld, String(teamId));
  const departments = Object.values(team.departments ?? {})
    .filter((row) => row.status !== "stable")
    .sort((a, b) => statusRank(b.status) - statusRank(a.status) || b.workloadIndex - a.workloadIndex || a.label.localeCompare(b.label));
  return departments.length ? structuredClone(departments[0]) : null;
}

export function organizationSummary(saveWorld, teamId = null) {
  const state = refreshOrganization(saveWorld);
  const rows = teamId ? [state.teams?.[String(teamId)]].filter(Boolean) : Object.values(state.teams);
  return {
    teams: rows.length,
    criticalDepartments: rows.reduce((sum, team) => sum + Object.values(team.departments ?? {}).filter((row) => row.status === "critical").length, 0),
    strainedDepartments: rows.reduce((sum, team) => sum + Object.values(team.departments ?? {}).filter((row) => row.status === "strained").length, 0),
    weakDepartments: rows.reduce((sum, team) => sum + Object.values(team.departments ?? {}).filter((row) => row.status === "weak").length, 0),
    averageEffectiveness: rows.length
      ? Number((rows.reduce((sum, team) => sum + team.overallEffectiveness, 0) / rows.length).toFixed(3))
      : 1,
  };
}

export { DEPARTMENT_DEFINITIONS };
