import { SIM_EVENT } from "../timeEngine.js";
import { EMPLOYMENT_EVENT } from "./employmentMarket.js";
import {
  STAFF_NEGOTIATION_EVENT,
  acceptStaffCounterEvent,
  buildStaffCounterTerms,
  evaluateStaffOffer,
  listStaffContractNegotiations,
} from "../../game/management/staffRecruitment.js";

function activeNegotiation(saveWorld, id) {
  return listStaffContractNegotiations(saveWorld).find((row) => row.id === id) ?? null;
}

function mutableNegotiation(saveWorld, id) {
  return saveWorld.world?.management?.staffRecruitment?.negotiations?.find((row) => row.id === id) ?? null;
}

function signingEvent(saveWorld, negotiation, terms) {
  const current = saveWorld.world?.employment?.staff?.[negotiation.staffId] ?? null;
  const start = Number(negotiation.startSeason);
  const until = start + Math.max(1, Number(terms.lengthYears ?? 1)) - 1;
  return {
    type: EMPLOYMENT_EVENT.CONTRACT_SIGNED,
    payload: {
      worker_type: "staff",
      worker_id: negotiation.staffId,
      team_id: negotiation.teamId,
      from_team_id: current?.teamId && String(current.teamId) !== String(negotiation.teamId) && start <= Number(saveWorld.clock?.season)
        ? current.teamId
        : null,
      role: terms.role ?? negotiation.role ?? "staff",
      contract_start: start,
      contract_until: until,
      annual_salary: terms.annualSalary ?? null,
      salary_index: terms.salaryIndex ?? null,
      signing_bonus: terms.signingBonus ?? null,
      negotiation_id: negotiation.id,
      decision: "staff_negotiation",
    },
  };
}

function acceptNegotiation(saveWorld, negotiation, terms, date, source) {
  const mutable = mutableNegotiation(saveWorld, negotiation.id);
  if (!mutable) return [];
  mutable.status = "accepted";
  mutable.agreedAt = date;
  mutable.agreedTerms = structuredClone(terms);
  mutable.source = source;
  return [
    {
      type: STAFF_NEGOTIATION_EVENT.ACCEPTED,
      payload: {
        negotiation_id: negotiation.id,
        staff_id: negotiation.staffId,
        staff_name: negotiation.staffName,
        team_id: negotiation.teamId,
        start_season: negotiation.startSeason,
      },
    },
    signingEvent(saveWorld, negotiation, terms),
  ];
}

function resolveOffer(saveWorld, event) {
  const negotiation = activeNegotiation(saveWorld, event.payload?.negotiation_id);
  const mutable = mutableNegotiation(saveWorld, event.payload?.negotiation_id);
  if (!negotiation || !mutable || mutable.status !== "open") return null;
  const offer = structuredClone(event.payload?.offer ?? {});
  const attempt = mutable.offers.length + 1;
  const score = evaluateStaffOffer(saveWorld, negotiation, offer, attempt);
  mutable.offers.push({ ...offer, submittedAt: event.date, score: Number(score.toFixed(4)) });
  if (score >= 1) return acceptNegotiation(saveWorld, negotiation, offer, event.date, "offer");
  if (score >= 0.86 && attempt < 3) {
    mutable.status = "countered";
    mutable.counterTerms = buildStaffCounterTerms(saveWorld, negotiation, offer, score);
    return {
      type: STAFF_NEGOTIATION_EVENT.COUNTERED,
      payload: {
        negotiation_id: negotiation.id,
        staff_id: negotiation.staffId,
        staff_name: negotiation.staffName,
        team_id: negotiation.teamId,
      },
    };
  }
  mutable.status = "rejected";
  mutable.closedAt = event.date;
  return {
    type: STAFF_NEGOTIATION_EVENT.REJECTED,
    payload: {
      negotiation_id: negotiation.id,
      staff_id: negotiation.staffId,
      staff_name: negotiation.staffName,
      team_id: negotiation.teamId,
    },
  };
}

function expireNegotiations(saveWorld, date) {
  const output = [];
  for (const negotiation of saveWorld.world?.management?.staffRecruitment?.negotiations ?? []) {
    if (!["open", "countered"].includes(negotiation.status) || !negotiation.expiresAt) continue;
    if (String(negotiation.expiresAt) > String(date)) continue;
    negotiation.status = "expired";
    negotiation.closedAt = date;
    output.push({
      type: STAFF_NEGOTIATION_EVENT.EXPIRED,
      payload: {
        negotiation_id: negotiation.id,
        staff_id: negotiation.staffId,
        staff_name: negotiation.staffName,
        team_id: negotiation.teamId,
      },
    });
  }
  return output;
}

export function createStaffNegotiationSystem() {
  return {
    id: "management.staff-negotiation",
    eventTypes: [
      SIM_EVENT.DAY_ADVANCED,
      STAFF_NEGOTIATION_EVENT.OFFER_SUBMITTED,
      STAFF_NEGOTIATION_EVENT.COUNTER_ACCEPTED,
      STAFF_NEGOTIATION_EVENT.WITHDRAWN,
    ],
    handle({ saveWorld, event }) {
      if (event.type === SIM_EVENT.DAY_ADVANCED) return expireNegotiations(saveWorld, event.date);
      if (event.type === STAFF_NEGOTIATION_EVENT.OFFER_SUBMITTED) return resolveOffer(saveWorld, event);
      const negotiation = activeNegotiation(saveWorld, event.payload?.negotiation_id);
      const mutable = mutableNegotiation(saveWorld, event.payload?.negotiation_id);
      if (!negotiation || !mutable) return null;
      if (event.type === STAFF_NEGOTIATION_EVENT.WITHDRAWN) {
        if (!["open", "countered"].includes(mutable.status)) return null;
        mutable.status = "withdrawn";
        mutable.closedAt = event.date;
        return null;
      }
      if (event.type === STAFF_NEGOTIATION_EVENT.COUNTER_ACCEPTED && mutable.status === "countered" && mutable.counterTerms) {
        return acceptNegotiation(saveWorld, negotiation, mutable.counterTerms, event.date, "counter");
      }
      return null;
    },
  };
}

export { acceptStaffCounterEvent };
