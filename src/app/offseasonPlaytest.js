import {
  OFFSEASON_EVENT,
  confirmOffseasonPlan,
  offseasonProjection,
  setOffseasonPlan,
} from "../game/management/offseason.js";
import { dispatchSimulationEvents } from "../sim/timeEngine.js";
import { developerManagementOverview } from "./managementPlaytest.js";

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
