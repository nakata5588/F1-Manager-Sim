import {
  OFFSEASON_EVENT,
  completeOffseasonCycle,
  ensureOffseasonState,
  finalBoardReviews,
  openOffseasonCycle,
  prepareNewSeasonFromOffseason,
  refreshOffseasonCycle,
} from "../../game/management/offseason.js";
import { SIM_EVENT } from "../timeEngine.js";
import { CHAMPIONSHIP_EVENT } from "./championship.js";
import { controlledTeamSet } from "./controlState.js";

function championshipComplete(saveWorld, event) {
  const championship = saveWorld.world?.championship;
  if (!championship?.seasonComplete) return false;
  const eventSeason = Number(event.payload?.season ?? championship.season);
  return Number(championship.season) === eventSeason;
}

function teamName(row) {
  return row?.team_name ?? row?.display_name ?? row?.name ?? row?.team_id ?? "Team";
}

function addSeasonStartEntrantsToCycle(saveWorld, cycle, date) {
  if (!cycle || cycle.status === "completed") return 0;
  cycle.teams ??= {};
  let added = 0;
  for (const team of saveWorld.world?.teams ?? []) {
    const teamId = team?.team_id;
    if (!teamId || cycle.teams[teamId]) continue;
    const finance = saveWorld.world?.teamState?.[teamId] ?? {};
    const distressed = finance.financialStatus === "distressed" || finance.financialStatus === "tight";
    cycle.teams[teamId] = {
      teamId,
      teamName: teamName(team),
      controlled: false,
      plan: {
        technicalFocus: "balanced",
        staffingFocus: distressed ? "rebuild" : "retain",
        commercialFocus: distressed ? "expand" : "retain",
        financialRisk: distressed ? "conservative" : "balanced",
        source: "season_start_new_entrant_default",
        confirmed: true,
        confirmedAt: date ?? saveWorld.clock?.date ?? null,
        updatedAt: date ?? saveWorld.clock?.date ?? null,
      },
      preparation: {},
      joinedCycleAtSeasonStart: true,
    };
    added += 1;
  }
  return added;
}

export function createOffseasonManagementSystem(options = {}) {
  return {
    id: "management.offseason",
    eventTypes: [CHAMPIONSHIP_EVENT.UPDATED, SIM_EVENT.MONTH_STARTED, SIM_EVENT.SEASON_STARTED, SIM_EVENT.RACE_DAY],
    handle({ saveWorld, event }) {
      const state = ensureOffseasonState(saveWorld);
      const controlled = [...controlledTeamSet(saveWorld, options.controlledTeamIds ?? [])];

      if (event.type === CHAMPIONSHIP_EVENT.UPDATED) {
        if (!championshipComplete(saveWorld, event)) return null;
        const closingSeason = Number(saveWorld.world?.championship?.season ?? saveWorld.clock?.season);
        const alreadyOpen = state.current && Number(state.current.closingSeason) === closingSeason && state.current.status !== "completed";
        if (alreadyOpen) {
          refreshOffseasonCycle(saveWorld, event.date);
          return null;
        }
        const cycle = openOffseasonCycle(saveWorld, {
          closingSeason,
          date: event.date,
          controlledTeamIds: controlled,
        });
        const boardReviews = finalBoardReviews(saveWorld, controlled, event.date);
        return {
          type: OFFSEASON_EVENT.OPENED,
          payload: {
            cycle_id: cycle.cycleId,
            closing_season: cycle.closingSeason,
            target_season: cycle.targetSeason,
            controlled_team_ids: controlled,
            board_reviews: boardReviews,
          },
        };
      }

      if (event.type === SIM_EVENT.SEASON_STARTED) {
        const season = Number(event.payload?.season ?? saveWorld.clock?.season);
        const newEntrants = addSeasonStartEntrantsToCycle(saveWorld, state.current, event.date);
        const prepared = prepareNewSeasonFromOffseason(saveWorld, season, { date: event.date });
        return {
          type: OFFSEASON_EVENT.SEASON_PREPARED,
          payload: {
            season,
            previous_season: Number(event.payload?.previousSeason ?? season - 1),
            teams: prepared,
            new_entrant_teams_added_to_cycle: newEntrants,
          },
        };
      }

      if (event.type === SIM_EVENT.RACE_DAY) {
        const cycle = state.current;
        if (!cycle || cycle.status === "completed" || Number(cycle.targetSeason) !== Number(saveWorld.clock?.season)) return null;
        const completed = completeOffseasonCycle(saveWorld, event.date);
        return {
          type: OFFSEASON_EVENT.COMPLETED,
          payload: {
            cycle_id: completed.cycleId,
            closing_season: completed.closingSeason,
            target_season: completed.targetSeason,
            first_race_gp_id: event.payload?.gp_id ?? null,
          },
        };
      }

      const before = state.current?.stage ?? null;
      const result = refreshOffseasonCycle(saveWorld, event.date);
      if (!result.cycle || !result.stageChanged) return null;
      return {
        type: OFFSEASON_EVENT.STAGE_CHANGED,
        payload: {
          cycle_id: result.cycle.cycleId,
          closing_season: result.cycle.closingSeason,
          target_season: result.cycle.targetSeason,
          previous_stage: before,
          stage: result.cycle.stage,
        },
      };
    },
  };
}
