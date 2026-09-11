import { SIM_EVENT } from "../timeEngine.js";
import {
  completeDriverScoutingAssignment,
  ensureScoutingState,
  SCOUTING_EVENT,
} from "../../game/management/scouting.js";

function initializeControlledKnowledge(saveWorld) {
  const scouting = ensureScoutingState(saveWorld);
  const controlled = new Set(saveWorld.player?.controlledTeamIds ?? []);
  for (const [driverId, assignment] of Object.entries(saveWorld.world?.employment?.drivers ?? {})) {
    if (assignment?.status === "employed" && controlled.has(assignment.teamId)) {
      scouting.knowledge.drivers[driverId] = 100;
    }
  }
}

export function createScoutingManagementSystem() {
  return {
    id: "management.scouting",
    eventTypes: [SIM_EVENT.CAREER_STARTED, SIM_EVENT.DAY_ADVANCED],
    handle({ saveWorld, event }) {
      const scouting = ensureScoutingState(saveWorld);
      if (event.type === SIM_EVENT.CAREER_STARTED) {
        initializeControlledKnowledge(saveWorld);
        return null;
      }

      const completed = [];
      for (const assignment of scouting.assignments) {
        if (assignment.status !== "active") continue;
        assignment.progressDays = Math.min(assignment.durationDays, Number(assignment.progressDays ?? 0) + 1);
        if (assignment.progressDays < assignment.durationDays) continue;
        const report = completeDriverScoutingAssignment(saveWorld, assignment.id);
        completed.push({
          type: SCOUTING_EVENT.REPORT_COMPLETED,
          payload: {
            assignment_id: assignment.id,
            report_id: report.id,
            driver_id: report.driverId,
            driver_name: report.driverName,
            knowledge: report.knowledge,
          },
        });
      }
      return completed;
    },
  };
}
