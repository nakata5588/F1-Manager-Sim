import {
  OFFSEASON_EVENT,
  confirmOffseasonPlan,
  offseasonProjection,
  setOffseasonPlan,
} from "../game/management/offseason.js";
import { advanceDays, dispatchSimulationEvents } from "../sim/timeEngine.js";
import { developerManagementOverview } from "./managementPlaytest.js";

function dateOnly(value) {
  return String(value ?? "").slice(0, 10);
}

function daysBetween(from, to) {
  const start = Date.parse(`${dateOnly(from)}T00:00:00Z`);
  const end = Date.parse(`${dateOnly(to)}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

function nextMonthStart(date) {
  const parsed = new Date(`${dateOnly(date)}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) throw new Error("Career clock has an invalid date.");
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

function nextRaceDate(saveWorld) {
  const today = dateOnly(saveWorld.clock?.date);
  return (saveWorld.world?.calendar ?? [])
    .map((row) => dateOnly(row?.race_date ?? row?.date))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date > today)
    .sort()[0] ?? null;
}

function requireControlledTeam(session) {
  if (!session || typeof session.requireCareer !== "function") throw new TypeError("A DeveloperPlaytestSession is required.");
  developerManagementOverview(session);
  const saveWorld = session.requireCareer();
  const teamId = saveWorld.player?.controlledTeamIds?.[0] ?? null;
  if (!teamId) throw new Error("The manager is currently unemployed and does not control a team.");
  return { saveWorld, teamId };
}

function dispatchOffseasonEvent(session, type, payload) {
  const saveWorld = session.requireCareer();
  return dispatchSimulationEvents(saveWorld, [{ type, date: saveWorld.clock.date, payload }], session.systems ?? []);
}

export function developerOffseason(session) {
  const { saveWorld, teamId } = requireControlledTeam(session);
  return {
    season: Number(saveWorld.clock?.season),
    date: saveWorld.clock?.date ?? null,
    controlledTeamId: teamId,
    offseason: offseasonProjection(saveWorld, teamId),
  };
}

export function developerContinueCalendar(session) {
  const saveWorld = session.requireCareer();
  const offseason = saveWorld.world?.management?.offseason?.current;
  const futureRace = nextRaceDate(saveWorld);

  if (!offseason || offseason.status === "completed" || futureRace) return session.continue();

  const target = nextMonthStart(saveWorld.clock?.date);
  const days = daysBetween(saveWorld.clock?.date, target);
  if (!Number.isInteger(days) || days < 1) throw new Error("Unable to resolve the next offseason calendar boundary.");
  advanceDays(saveWorld, days, session.systems ?? []);
  const state = session.state();
  return {
    ...state,
    screen: "home",
    offseason: developerOffseason(session).offseason,
    continueMode: "offseason_month",
  };
}

export function developerUpdateOffseasonPlan(session, input = {}) {
  const { saveWorld, teamId } = requireControlledTeam(session);
  const plan = setOffseasonPlan(saveWorld, teamId, input);
  dispatchOffseasonEvent(session, OFFSEASON_EVENT.PLAN_UPDATED, {
    team_id: teamId,
    target_season: saveWorld.world?.management?.offseason?.current?.targetSeason ?? null,
    plan,
  });
  return developerOffseason(session);
}

export function developerConfirmOffseasonPlan(session) {
  const { saveWorld, teamId } = requireControlledTeam(session);
  const plan = confirmOffseasonPlan(saveWorld, teamId, { source: "player" });
  dispatchOffseasonEvent(session, OFFSEASON_EVENT.PLAN_CONFIRMED, {
    team_id: teamId,
    target_season: saveWorld.world?.management?.offseason?.current?.targetSeason ?? null,
    plan,
  });
  return developerOffseason(session);
}
