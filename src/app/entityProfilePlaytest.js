import {
  listVisibleDrivers,
  listVisibleStaff,
  listVisibleTeams,
} from "../domain/entityVisibility.js";
import { ageOnDate } from "../sim/systems/careerLifecycle.js";
import { driverScoutingKnowledge } from "../game/management/scouting.js";
import { personProfile, personProjection } from "../game/management/people.js";
import { staffRecruitmentEligibility } from "../game/management/staffRecruitment.js";
import { teamVisualIdentity } from "../presentation/teamVisualIdentity.js";
import { financialPlanningProjection } from "../game/management/finances.js";
import { financialCrisisProjection } from "../game/management/financialCrisis.js";
import { driverAvailabilityProjection } from "../game/management/driverAvailability.js";
import { driverMarketProjection } from "../game/management/driverMarket.js";
import { developmentProjection } from "../game/management/development.js";

function requireSession(session) {
  if (!session || typeof session.requireCareer !== "function") throw new TypeError("A DeveloperPlaytestSession is required.");
  return session.requireCareer();
}

function idOf(type, row = {}) {
  if (type === "driver") return row.driver_id ?? row.id ?? null;
  if (type === "staff") return row.staff_id ?? row.id ?? null;
  if (type === "team") return row.team_id ?? row.id ?? null;
  return null;
}

function displayName(type, row = {}, fallback = "Unknown") {
  if (type === "driver") return row.display_name ?? row.driver_name ?? row.name ?? fallback;
  if (type === "staff") return row.display_name ?? row.staff_name ?? row.name ?? fallback;
  return row.team_name ?? row.display_name ?? row.name ?? fallback;
}

function teamRow(saveWorld, teamId) {
  return [...(saveWorld.world?.teams ?? []), ...(saveWorld.world?.futureTeams ?? [])]
    .find((row) => String(row.team_id ?? row.id ?? "") === String(teamId)) ?? null;
}

function currentTeamName(saveWorld, teamId) {
  if (!teamId) return null;
  const activeBrand = saveWorld.world?.governance?.teamEvolution?.active?.[teamId]?.currentBrand;
  if (activeBrand) return String(activeBrand);
  const season = Number(saveWorld.clock?.season);
  const brand = [...(saveWorld.world?.teamBrands ?? [])]
    .filter((row) => String(row.team_id ?? row.id ?? "") === String(teamId))
    .filter((row) => !Number.isFinite(Number(row.year)) || Number(row.year) <= season)
    .sort((a, b) => Number(b.year ?? 0) - Number(a.year ?? 0))[0];
  if (brand) return String(brand.brand_name ?? brand.team_name ?? brand.name ?? teamId);
  return displayName("team", teamRow(saveWorld, teamId) ?? {}, String(teamId));
}

function visibleCollection(saveWorld, type) {
  if (type === "driver") return listVisibleDrivers(saveWorld);
  if (type === "staff") return listVisibleStaff(saveWorld);
  if (type === "team") return listVisibleTeams(saveWorld);
  throw new Error(`Unsupported profile type '${type}'.`);
}

function requireVisibleProfile(saveWorld, type, id) {
  const row = visibleCollection(saveWorld, type)
    .find((candidate) => String(idOf(type, candidate) ?? "") === String(id));
  if (!row) throw new Error(`${type[0].toUpperCase()}${type.slice(1)} '${id}' is not visible in the current Save World.`);
  return row;
}

function currentAssignment(saveWorld, type, id) {
  if (type === "driver") return saveWorld.world?.employment?.drivers?.[id] ?? null;
  if (type === "staff") return saveWorld.world?.employment?.staff?.[id] ?? null;
  return null;
}

function isControlledTeam(saveWorld, teamId) {
  return Boolean(teamId && (saveWorld.player?.controlledTeamIds ?? []).some((id) => String(id) === String(teamId)));
}

function numericEntries(row = {}, ignored = new Set()) {
  return Object.fromEntries(Object.entries(row)
    .filter(([key, value]) => !ignored.has(key) && Number.isFinite(Number(value)))
    .map(([key, value]) => [key, Number(value)]));
}

function knownAttributes(saveWorld, type, id, assignment) {
  if (!isControlledTeam(saveWorld, assignment?.teamId)) return null;
  const dynamic = type === "driver"
    ? saveWorld.world?.careerState?.drivers?.[id]?.attributes ?? {}
    : saveWorld.world?.careerState?.staff?.[id]?.attributes ?? {};
  const ratings = type === "driver"
    ? (saveWorld.world?.driverRatings ?? []).find((row) => String(row.driver_id) === String(id)) ?? {}
    : (saveWorld.world?.staffRatings ?? []).find((row) => String(row.staff_id) === String(id)) ?? {};
  const ignored = new Set(["driver_id", "staff_id", "year", "current_ability", "potential_ability", "reputation"]);
  return { ...numericEntries(ratings, ignored), ...numericEntries(dynamic, ignored) };
}

function recentDriverResults(saveWorld, driverId) {
  const rows = [];
  for (const race of [...(saveWorld.history?.races ?? [])].reverse()) {
    const result = (race.classification ?? []).find((row) => String(row.driverId ?? row.driver_id ?? "") === String(driverId));
    if (!result) continue;
    const teamId = result.teamId ?? result.team_id ?? null;
    rows.push({
      season: race.season ?? (String(race.date ?? "").slice(0, 4) || null),
      round: race.round ?? null,
      date: race.date ?? null,
      raceName: race.gpName ?? race.gp_name ?? race.name ?? race.gpId ?? race.gp_id ?? "Grand Prix",
      position: result.position ?? result.classifiedPosition ?? null,
      status: result.status ?? null,
      points: result.points ?? null,
      teamId,
      teamName: currentTeamName(saveWorld, teamId),
    });
    if (rows.length >= 10) break;
  }
  return rows;
}

function personProfileProjection(saveWorld, type, id) {
  const visible = requireVisibleProfile(saveWorld, type, id);
  const raw = personProfile(saveWorld, type, id) ?? visible;
  const assignment = currentAssignment(saveWorld, type, id);
  const teamId = assignment?.teamId ?? null;
  const controlled = isControlledTeam(saveWorld, teamId);
  const state = type === "driver" ? saveWorld.world?.careerState?.drivers?.[id] ?? {} : saveWorld.world?.careerState?.staff?.[id] ?? {};
  const management = controlled ? personProjection(saveWorld, type, id) : null;
  const profile = {
    type,
    id: String(id),
    name: displayName(type, visible, String(id)),
    nationality: visible.nationality ?? visible.country ?? raw.nationality ?? raw.country ?? null,
    birthDate: visible.birth_date ?? visible.date_of_birth ?? raw.birth_date ?? raw.date_of_birth ?? null,
    age: ageOnDate(raw, saveWorld.clock?.date),
    visibilityState: visible.visibility_state ?? null,
    employment: {
      status: assignment?.status ?? "available",
      teamId,
      teamName: currentTeamName(saveWorld, teamId),
      role: assignment?.role ?? raw.role ?? raw.staff_role ?? (type === "driver" ? "driver" : "staff"),
      contractUntil: assignment?.contractUntil ?? assignment?.contract_until ?? null,
    },
    controlled,
    media: { category: type, entityId: String(id), status: "media_pack_pending_resolver" },
    attributes: knownAttributes(saveWorld, type, id, assignment),
    careerState: controlled ? {
      currentAbility: state.currentAbility ?? null,
      potentialAbility: state.potentialAbility ?? null,
      reputation: state.reputation ?? null,
      morale: state.morale ?? management?.mentality?.morale ?? null,
    } : null,
    personality: management?.personality ?? null,
    mentality: management?.mentality ?? null,
    representative: management?.representative ?? null,
  };
  if (type === "driver") {
    profile.scoutingKnowledge = driverScoutingKnowledge(saveWorld, id);
    profile.availability = driverAvailabilityProjection(saveWorld, id);
    profile.marketPath = driverMarketProjection(saveWorld, id);
    profile.development = developmentProjection(saveWorld, "driver", id);
    profile.recentResults = recentDriverResults(saveWorld, id);
  } else {
    profile.recruitment = staffRecruitmentEligibility(saveWorld, id);
    profile.recentResults = [];
  }
  return profile;
}

function standingsForTeam(saveWorld, teamId) {
  const championship = saveWorld.world?.championship ?? {};
  const row = championship.constructors?.[teamId] ?? championship.constructorStandings?.[teamId] ?? null;
  return row ? {
    points: Number(row.countedPoints ?? row.points ?? 0),
    grossPoints: Number(row.points ?? 0),
    wins: Number(row.wins ?? 0),
  } : { points: 0, grossPoints: 0, wins: 0 };
}

function visiblePersonMap(saveWorld, type) {
  return new Map(visibleCollection(saveWorld, type).map((row) => [String(idOf(type, row)), row]));
}

function teamProfileProjection(saveWorld, id) {
  const visible = requireVisibleProfile(saveWorld, "team", id);
  const driverMap = visiblePersonMap(saveWorld, "driver");
  const staffMap = visiblePersonMap(saveWorld, "staff");
  const drivers = Object.entries(saveWorld.world?.employment?.drivers ?? {})
    .filter(([, row]) => String(row?.teamId ?? "") === String(id) && row?.status === "employed")
    .filter(([personId]) => driverMap.has(String(personId)))
    .map(([personId, assignment]) => ({
      id: personId,
      name: displayName("driver", driverMap.get(String(personId)), personId),
      role: assignment.role ?? "driver",
    }));
  const staff = Object.entries(saveWorld.world?.employment?.staff ?? {})
    .filter(([, row]) => String(row?.teamId ?? "") === String(id) && row?.status === "employed")
    .filter(([personId]) => staffMap.has(String(personId)))
    .map(([personId, assignment]) => ({
      id: personId,
      name: displayName("staff", staffMap.get(String(personId)), personId),
      role: assignment.role ?? "staff",
    }));
  const controlled = isControlledTeam(saveWorld, id);
  const teamState = saveWorld.world?.teamState?.[id] ?? {};
  const evolution = saveWorld.world?.governance?.teamEvolution?.active?.[id] ?? null;
  return {
    type: "team",
    id: String(id),
    name: currentTeamName(saveWorld, id),
    nationality: visible.nationality ?? visible.country ?? null,
    visibilityState: visible.visibility_state ?? null,
    controlled,
    media: { category: "teamLogo", entityId: String(id), status: "media_pack_pending_resolver" },
    visualIdentity: teamVisualIdentity(saveWorld, id, { displayName: currentTeamName(saveWorld, id) }),
    championship: standingsForTeam(saveWorld, id),
    reputation: teamState.reputation ?? visible.reputation ?? visible.prestige ?? null,
    finances: controlled ? {
      cash: teamState.cash ?? null,
      monthlyIncome: teamState.monthlyIncome ?? null,
      monthlyExpenses: teamState.monthlyExpenses ?? null,
      monthlyNet: teamState.monthlyNet ?? null,
      financialStatus: teamState.financialStatus ?? null,
      planning: financialPlanningProjection(saveWorld, id),
      crisis: financialCrisisProjection(saveWorld, id),
    } : null,
    evolution: evolution ? {
      enteredSeason: evolution.enteredSeason ?? null,
      currentBrand: evolution.currentBrand ?? null,
      source: evolution.source ?? null,
    } : null,
    drivers: drivers.sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name)),
    staff: staff.sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name)),
  };
}

export function entityProfileProjection(saveWorld, type, id) {
  const normalizedType = String(type ?? "").trim().toLowerCase();
  const entityId = String(id ?? "").trim();
  if (!entityId) throw new Error("A profile id is required.");
  if (normalizedType === "team") return teamProfileProjection(saveWorld, entityId);
  if (["driver", "staff"].includes(normalizedType)) return personProfileProjection(saveWorld, normalizedType, entityId);
  throw new Error(`Unsupported profile type '${normalizedType}'.`);
}

export function developerEntityProfile(session, type, id) {
  return entityProfileProjection(requireSession(session), type, id);
}
