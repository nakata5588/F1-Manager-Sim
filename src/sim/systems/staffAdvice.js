import { SIM_EVENT } from "../timeEngine.js";
import { boardProjection } from "../../game/management/board.js";
import { controlledTeamSet } from "./controlState.js";

export const STAFF_ADVICE_EVENT = Object.freeze({
  CREATED: "staff.advice_created",
});

function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function staffName(saveWorld, id) {
  const row = (saveWorld.world?.staff ?? []).find((item) => String(item.staff_id) === String(id)) ?? {};
  return row.display_name ?? row.staff_name ?? row.name ?? id;
}

function staffExpertise(saveWorld, id) {
  const rating = (saveWorld.world?.staffRatings ?? []).find((row) => String(row.staff_id) === String(id)) ?? {};
  const dynamic = saveWorld.world?.careerState?.staff?.[id]?.attributes ?? {};
  const values = ["technical", "engineering", "design", "aero", "strategy", "leadership", "scouting", "mechanics", "reliability"]
    .map((field) => numeric(dynamic[field] ?? rating[field]))
    .filter((value) => value !== null)
    .map((value) => value <= 10 ? value * 10 : value);
  if (!values.length) return 50;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function leadAdvisor(saveWorld, teamId) {
  return Object.entries(saveWorld.world?.employment?.staff ?? {})
    .filter(([, assignment]) => assignment?.teamId === teamId && assignment?.status === "employed")
    .map(([id, assignment]) => ({ id, role: assignment.role ?? "staff", expertise: staffExpertise(saveWorld, id) }))
    .sort((a, b) => b.expertise - a.expertise || String(a.id).localeCompare(String(b.id)))[0] ?? null;
}

function weakestComponent(saveWorld, teamId) {
  return Object.entries(saveWorld.world?.carState?.[teamId]?.components ?? {})
    .filter(([, value]) => Number.isFinite(Number(value)))
    .sort((a, b) => Number(a[1]) - Number(b[1]) || a[0].localeCompare(b[0]))[0] ?? null;
}

function openVacancy(saveWorld, teamId) {
  return (saveWorld.world?.employment?.vacancies ?? []).find((row) => row.teamId === teamId && row.status === "open") ?? null;
}

function adviceForTeam(saveWorld, teamId) {
  const advisor = leadAdvisor(saveWorld, teamId);
  if (!advisor) return null;
  const vacancy = openVacancy(saveWorld, teamId);
  if (vacancy) return { team_id: teamId, advisor_id: advisor.id, advisor_name: staffName(saveWorld, advisor.id), advisor_role: advisor.role, category: "staff", priority: "high", title: "Staff recommendation: fill the open vacancy", body: `The team still has an open ${vacancy.type ?? "staff"} role (${vacancy.role ?? "unknown"}). Leaving it unresolved risks weakening the department.` };
  const board = boardProjection(saveWorld, teamId);
  if (board.confidence < 40) return { team_id: teamId, advisor_id: advisor.id, advisor_name: staffName(saveWorld, advisor.id), advisor_role: advisor.role, category: "board", priority: "high", title: "Staff recommendation: stabilise board confidence", body: "The board is under pressure. Prioritise the weakest board objective before the next monthly review." };
  const weakest = weakestComponent(saveWorld, teamId);
  if (weakest) return { team_id: teamId, advisor_id: advisor.id, advisor_name: staffName(saveWorld, advisor.id), advisor_role: advisor.role, category: "development", priority: "normal", title: `Technical recommendation: ${weakest[0]}`, body: `${staffName(saveWorld, advisor.id)} identifies ${weakest[0]} as the weakest measured car area (${Number(weakest[1]).toFixed(1)}). This is advice only; the simulation will not start a project unless development is delegated or you choose to act.` };
  return { team_id: teamId, advisor_id: advisor.id, advisor_name: staffName(saveWorld, advisor.id), advisor_role: advisor.role, category: "team", priority: "normal", title: "Staff review: no critical issue", body: "The senior staff review found no urgent vacancy, board or measured car-development issue this month." };
}

export function createStaffAdviceSystem(options = {}) {
  const configured = [...(options.controlledTeamIds ?? [])];
  return {
    id: "management.staff-advice",
    eventTypes: [SIM_EVENT.MONTH_STARTED],
    handle({ saveWorld }) {
      return [...controlledTeamSet(saveWorld, configured)]
        .map((teamId) => adviceForTeam(saveWorld, teamId))
        .filter(Boolean)
        .map((payload) => ({ type: STAFF_ADVICE_EVENT.CREATED, payload }));
    },
  };
}
