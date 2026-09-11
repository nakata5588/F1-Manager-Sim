import { SIM_EVENT } from "../timeEngine.js";
import { boardProjection, ensureBoardState, evaluateBoard, initializeBoardTeam, resolveBoardRequest } from "../../game/management/board.js";
import { controlledTeamSet } from "./controlState.js";

export const BOARD_EVENT = Object.freeze({
  INITIALIZED: "board.initialized",
  REVIEWED: "board.reviewed",
  WARNING: "board.warning",
  DISMISSED: "board.dismissed",
  REQUEST_SUBMITTED: "board.request_submitted",
  REQUEST_RESOLVED: "board.request_resolved",
});

export function createBoardManagementSystem(options = {}) {
  const configured = [...(options.controlledTeamIds ?? [])];
  return {
    id: "management.board",
    eventTypes: [SIM_EVENT.CAREER_STARTED, SIM_EVENT.MONTH_STARTED, BOARD_EVENT.REQUEST_SUBMITTED],
    handle({ saveWorld, event }) {
      ensureBoardState(saveWorld);
      if (event.type === SIM_EVENT.CAREER_STARTED) {
        const teams = [...controlledTeamSet(saveWorld, configured)];
        for (const teamId of teams) initializeBoardTeam(saveWorld, teamId, event.date);
        return { type: BOARD_EVENT.INITIALIZED, payload: { team_ids: teams } };
      }
      if (event.type === BOARD_EVENT.REQUEST_SUBMITTED) {
        const request = resolveBoardRequest(saveWorld, event.payload?.request_id);
        return { type: BOARD_EVENT.REQUEST_RESOLVED, payload: { request_id: request.id, team_id: request.teamId, kind: request.kind, status: request.status, value: request.value ?? null, reason: request.reason ?? null } };
      }
      const output = [];
      for (const teamId of controlledTeamSet(saveWorld, configured)) {
        const review = evaluateBoard(saveWorld, teamId, event.date);
        output.push({ type: BOARD_EVENT.REVIEWED, payload: review });
        const board = boardProjection(saveWorld, teamId);
        if (board.confidence < 30 && board.lastReviewAt === event.date) {
          const state = ensureBoardState(saveWorld).teams[teamId];
          if (state.lastWarningAt !== event.date) {
            state.lastWarningAt = event.date;
            output.push({ type: BOARD_EVENT.WARNING, payload: { team_id: teamId, confidence: board.confidence, status: board.status, reasons: review.reasons } });
          }
        }
        if (review.dismissalRecommended) {
          const state = ensureBoardState(saveWorld).teams[teamId];
          if (!state.dismissedAt) {
            state.dismissedAt = event.date;
            output.push({ type: BOARD_EVENT.DISMISSED, payload: { team_id: teamId, confidence: board.confidence, reasons: review.reasons } });
          }
        }
      }
      return output;
    },
  };
}
