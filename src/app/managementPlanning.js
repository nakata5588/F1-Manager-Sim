import { organizationProjection } from "../game/management/organization.js";
import {
  activeCompetingOffers,
  personProfile,
  personProjection,
} from "../game/management/people.js";
import {
  listContractNegotiations,
} from "../game/management/contracts.js";
import {
  listStaffContractNegotiations,
  staffRecruitmentEligibility,
} from "../game/management/staffRecruitment.js";
import {
  listRecruitmentCandidates,
  scoutingSummary,
} from "../game/management/scouting.js";
import { boardProjection } from "../game/management/board.js";

function text(value, fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function personName(saveWorld, type, id) {
  const row = personProfile(saveWorld, type, id) ?? {};
  return row.display_name ?? row.driver_name ?? row.staff_name ?? row.name ?? id;
}

function contractHorizon(contractUntil, season) {
  const until = numeric(contractUntil);
  if (!Number.isInteger(until)) return {
    status: "unknown",
    seasonsRemaining: null,
    label: "Contract horizon unknown",
  };
  const remaining = until - Number(season);
  if (remaining <= 0) return {
    status: "expiring",
    seasonsRemaining: 0,
    label: "Contract expires this season",
  };
  if (remaining === 1) return {
    status: "next_season",
    seasonsRemaining: 1,
    label: "Contract expires next season",
  };
  return {
    status: "secure",
    seasonsRemaining: remaining,
    label: `${remaining} seasons remaining`,
  };
}

function retentionSignals(person, competingOffers, horizon) {
  const mentality = person?.mentality ?? {};
  const signals = [];

  if (horizon.status === "expiring") signals.push({ id: "contract_expiring", severity: 3, label: "Contract expires this season" });
  else if (horizon.status === "next_season") signals.push({ id: "contract_next_season", severity: 1, label: "Contract expires next season" });

  if (Number(mentality.contractSatisfaction ?? 50) < 35) {
    signals.push({ id: "low_contract_satisfaction", severity: 2, label: "Low contract satisfaction" });
  }
  if (Number(mentality.teamSatisfaction ?? 50) < 35) {
    signals.push({ id: "low_team_satisfaction", severity: 2, label: "Low team satisfaction" });
  }
  if (Number(mentality.morale ?? 50) < 35) {
    signals.push({ id: "low_morale", severity: 2, label: "Low morale" });
  }
  if (Number(mentality.transferOpenness ?? 45) >= 68) {
    signals.push({ id: "transfer_open", severity: 1, label: "Open to a move" });
  }
  if (competingOffers > 0) {
    signals.push({
      id: "rival_interest",
      severity: competingOffers > 1 ? 3 : 2,
      label: `${competingOffers} active rival approach${competingOffers === 1 ? "" : "es"}`,
    });
  }

  const score = signals.reduce((sum, row) => sum + row.severity, 0);
  return {
    level: score >= 5 ? "high" : score >= 2 ? "medium" : "low",
    signals,
  };
}

function currentPeople(saveWorld, teamId, type) {
  const assignments = type === "staff"
    ? saveWorld.world?.employment?.staff ?? {}
    : saveWorld.world?.employment?.drivers ?? {};
  const season = Number(saveWorld.clock?.season);
  return Object.entries(assignments)
    .filter(([, assignment]) => assignment?.status === "employed" && String(assignment?.teamId ?? assignment?.team_id ?? "") === String(teamId))
    .map(([id, assignment]) => {
      const person = personProjection(saveWorld, type, id);
      const competingOffers = activeCompetingOffers(saveWorld, type, id, { excludeTeamId: teamId }).length;
      const horizon = contractHorizon(assignment?.contractUntil ?? assignment?.contract_until, season);
      const retention = retentionSignals(person, competingOffers, horizon);
      const eligibility = type === "staff" ? staffRecruitmentEligibility(saveWorld, id) : { eligible: true, reason: null };
      return {
        id,
        type,
        name: personName(saveWorld, type, id),
        role: assignment?.role ?? type,
        contractUntil: assignment?.contractUntil ?? assignment?.contract_until ?? null,
        horizon,
        retention,
        mentality: {
          morale: Number(person?.mentality?.morale ?? 50),
          teamSatisfaction: Number(person?.mentality?.teamSatisfaction ?? 50),
          roleSatisfaction: Number(person?.mentality?.roleSatisfaction ?? 50),
          contractSatisfaction: Number(person?.mentality?.contractSatisfaction ?? 50),
          transferOpenness: Number(person?.mentality?.transferOpenness ?? 45),
        },
        competingOffers,
        renewalEligible: type === "driver" ? true : eligibility.eligible,
        renewalBlockedReason: eligibility.reason ?? null,
      };
    })
    .sort((a, b) => {
      const riskRank = { high: 0, medium: 1, low: 2 };
      return riskRank[a.retention.level] - riskRank[b.retention.level]
        || (a.horizon.seasonsRemaining ?? 99) - (b.horizon.seasonsRemaining ?? 99)
        || a.name.localeCompare(b.name);
    });
}

function departmentRows(organization) {
  return Object.values(organization?.departments ?? {})
    .map((row) => ({
      id: row.id,
      label: row.label,
      status: row.status,
      memberCount: Number(row.memberCount ?? 0),
      vacancyCount: Number(row.vacancyCount ?? 0),
      workloadIndex: Number(row.workloadIndex ?? 0),
      workloadLabel: Number(row.workloadIndex ?? 0) > 1.45
        ? "Overloaded"
        : Number(row.workloadIndex ?? 0) > 1.1
          ? "Busy"
          : "Balanced",
      memberRoles: (row.members ?? []).map((member) => ({
        staffId: member.staffId,
        name: member.name,
        role: member.role,
      })),
      vacancies: (row.vacancies ?? []).map((vacancy) => ({
        id: vacancy.id,
        role: vacancy.role,
        openedAt: vacancy.openedAt,
      })),
    }))
    .sort((a, b) => {
      const rank = { critical: 0, strained: 1, weak: 2, stable: 3 };
      return (rank[a.status] ?? 4) - (rank[b.status] ?? 4) || a.label.localeCompare(b.label);
    });
}

function priority(id, severity, category, title, detail, action) {
  return { id, severity, category, title, detail, action };
}

function priorityRows({ drivers, staff, departments, driverNegotiations, staffNegotiations, board }) {
  const rows = [];

  for (const row of departments) {
    if (row.status === "critical" || row.vacancyCount > 0) {
      rows.push(priority(
        `department:${row.id}`,
        row.status === "critical" ? "critical" : "high",
        "Organisation",
        `${row.label} needs attention`,
        row.vacancyCount
          ? `${row.vacancyCount} open role${row.vacancyCount === 1 ? "" : "s"} · ${row.workloadLabel}`
          : `${row.workloadLabel} workload`,
        { view: "staff-market", label: "Open staff recruitment" },
      ));
    } else if (row.status === "strained" || row.status === "weak") {
      rows.push(priority(
        `department:${row.id}`,
        "medium",
        "Organisation",
        `${row.label} is ${row.status}`,
        `${row.memberCount} staff · ${row.workloadLabel} workload`,
        { view: "staff", label: "Review staff" },
      ));
    }
  }

  for (const row of drivers) {
    if (row.retention.level === "high" || row.horizon.status === "expiring") {
      rows.push(priority(
        `driver:${row.id}`,
        row.retention.level === "high" ? "critical" : "high",
        "Driver retention",
        `${row.name} requires a contract decision`,
        row.retention.signals.map((signal) => signal.label).join(" · ") || row.horizon.label,
        { view: "drivers", label: "Review driver", personId: row.id },
      ));
    } else if (row.retention.level === "medium" || row.horizon.status === "next_season") {
      rows.push(priority(
        `driver:${row.id}`,
        "medium",
        "Driver planning",
        `Plan ahead for ${row.name}`,
        row.retention.signals.map((signal) => signal.label).join(" · ") || row.horizon.label,
        { view: "drivers", label: "Review driver", personId: row.id },
      ));
    }
  }

  for (const row of staff) {
    if (row.retention.level === "high" || row.horizon.status === "expiring") {
      rows.push(priority(
        `staff:${row.id}`,
        row.retention.level === "high" ? "high" : "medium",
        "Staff retention",
        `${row.name} requires a staffing decision`,
        row.retention.signals.map((signal) => signal.label).join(" · ") || row.horizon.label,
        { view: "staff", label: "Review staff", personId: row.id },
      ));
    }
  }

  for (const negotiation of driverNegotiations.filter((row) => row.status === "countered")) {
    rows.push(priority(
      `driver-negotiation:${negotiation.id}`,
      "critical",
      "Negotiation",
      `${negotiation.driverName} has made a counter-offer`,
      `Response required before ${text(negotiation.expiresAt, "expiry")}`,
      { view: "contracts", label: "Open negotiation", negotiationId: negotiation.id },
    ));
  }

  for (const negotiation of staffNegotiations.filter((row) => row.status === "countered")) {
    rows.push(priority(
      `staff-negotiation:${negotiation.id}`,
      "high",
      "Negotiation",
      `${negotiation.staffName} has made a counter-offer`,
      `Response required before ${text(negotiation.expiresAt, "expiry")}`,
      { view: "staff-market", label: "Open negotiation", negotiationId: negotiation.id },
    ));
  }

  if (board && Number(board.confidence ?? 100) < 35) {
    rows.push(priority(
      "board:confidence",
      "critical",
      "Board",
      "Board confidence is under pressure",
      `${Math.round(Number(board.confidence ?? 0))}/100 · ${text(board.status, "review required")}`,
      { view: "board", label: "Review board objectives" },
    ));
  }

  const rank = { critical: 0, high: 1, medium: 2, low: 3 };
  return rows
    .sort((a, b) => (rank[a.severity] ?? 4) - (rank[b.severity] ?? 4) || a.title.localeCompare(b.title))
    .slice(0, 12);
}

export function buildManagementPlanning(saveWorld, teamId) {
  if (!teamId) {
    return {
      teamId: null,
      season: Number(saveWorld.clock?.season),
      priorities: [],
      drivers: [],
      staff: [],
      organization: null,
      shortlist: [],
      scouting: scoutingSummary(saveWorld),
      negotiations: { drivers: [], staff: [] },
    };
  }

  const drivers = currentPeople(saveWorld, teamId, "driver");
  const staff = currentPeople(saveWorld, teamId, "staff");
  const organization = organizationProjection(saveWorld, teamId);
  const departments = departmentRows(organization);
  const driverNegotiations = listContractNegotiations(saveWorld, { teamId });
  const staffNegotiations = listStaffContractNegotiations(saveWorld, { teamId });
  const shortlist = listRecruitmentCandidates(saveWorld, { shortlisted: true }).map((row) => ({
    id: row.id,
    name: row.name,
    nationality: row.nationality ?? null,
    age: row.age ?? null,
    currentTeamId: row.currentTeamId ?? null,
    contractUntil: row.contractUntil ?? null,
    knowledge: Number(row.knowledge ?? 0),
    hasReport: Boolean(row.report),
    f1Eligible: row.report?.availability?.f1Eligible ?? row.visibilityState === "f1_eligible",
  }));
  const board = boardProjection(saveWorld, teamId);

  return {
    teamId: String(teamId),
    season: Number(saveWorld.clock?.season),
    date: saveWorld.clock?.date ?? null,
    priorities: priorityRows({
      drivers,
      staff,
      departments,
      driverNegotiations,
      staffNegotiations,
      board,
    }),
    drivers,
    staff,
    organization: {
      overallStatus: organization.overallStatus,
      employedStaffCount: organization.employedStaffCount,
      openStaffVacancies: organization.openStaffVacancies,
      staffCapacityBonus: organization.staffCapacityBonus,
      departments,
    },
    shortlist,
    scouting: scoutingSummary(saveWorld),
    negotiations: {
      drivers: driverNegotiations.map((row) => ({
        id: row.id,
        personId: row.driverId,
        personName: row.driverName,
        status: row.status,
        startSeason: row.startSeason,
        expiresAt: row.expiresAt,
      })),
      staff: staffNegotiations.map((row) => ({
        id: row.id,
        personId: row.staffId,
        personName: row.staffName,
        status: row.status,
        startSeason: row.startSeason,
        expiresAt: row.expiresAt,
      })),
    },
  };
}
