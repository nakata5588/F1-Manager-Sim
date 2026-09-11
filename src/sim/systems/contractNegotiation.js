import { SIM_EVENT } from "../timeEngine.js";
import {
  CONTRACT_NEGOTIATION_EVENT,
  ensureContractNegotiationState,
  evaluateDriverContractOffer,
} from "../../game/management/contracts.js";
import { EMPLOYMENT_EVENT } from "./employmentMarket.js";

function contractSigningEvent(negotiation, terms) {
  const start = Number(negotiation.startSeason);
  const until = start + Math.max(1, Number(terms.lengthYears ?? 1)) - 1;
  const transfer = terms.transferCompensation ?? null;
  return {
    type: EMPLOYMENT_EVENT.CONTRACT_SIGNED,
    payload: {
      worker_type: "driver",
      worker_id: negotiation.driverId,
      team_id: negotiation.teamId,
      from_team_id: negotiation.currentTeamId ?? negotiation.transferCompensation?.fromTeamId ?? null,
      role: terms.role,
      contract_start: start,
      contract_until: until,
      annual_salary: terms.annualSalary ?? null,
      salary_index: terms.salaryIndex ?? null,
      signing_bonus: terms.signingBonus ?? null,
      transfer_compensation_mode: transfer?.mode ?? null,
      transfer_compensation_value: transfer?.value ?? null,
      transfer_compensation_source: negotiation.transferCompensation?.source ?? null,
      negotiation_id: negotiation.id,
      decision: "player_negotiation",
    },
  };
}

function outcomeEvent(type, negotiation, terms = null, extra = {}) {
  return {
    type,
    payload: {
      negotiation_id: negotiation.id,
      driver_id: negotiation.driverId,
      driver_name: negotiation.driverName,
      team_id: negotiation.teamId,
      start_season: negotiation.startSeason,
      terms: terms ? structuredClone(terms) : null,
      transfer_compensation: negotiation.transferCompensation ? structuredClone(negotiation.transferCompensation) : null,
      ...extra,
    },
  };
}

export function createContractNegotiationSystem() {
  return {
    id: "management.contract-negotiation",
    eventTypes: [
      SIM_EVENT.DAY_ADVANCED,
      CONTRACT_NEGOTIATION_EVENT.OFFER_SUBMITTED,
      CONTRACT_NEGOTIATION_EVENT.COUNTER_ACCEPTED,
      CONTRACT_NEGOTIATION_EVENT.WITHDRAWN,
    ],
    handle({ saveWorld, event }) {
      const state = ensureContractNegotiationState(saveWorld);

      if (event.type === SIM_EVENT.DAY_ADVANCED) {
        const output = [];
        for (const negotiation of state.negotiations) {
          if (!["open", "countered"].includes(negotiation.status)) continue;
          if (!negotiation.expiresAt || event.date < negotiation.expiresAt) continue;
          negotiation.status = "expired";
          negotiation.closedAt = event.date;
          output.push(outcomeEvent(CONTRACT_NEGOTIATION_EVENT.EXPIRED, negotiation));
        }
        return output;
      }

      const id = event.payload?.negotiation_id ?? null;
      const negotiation = state.negotiations.find((row) => row.id === id);
      if (!negotiation) return null;

      if (event.type === CONTRACT_NEGOTIATION_EVENT.WITHDRAWN) {
        if (!["open", "countered"].includes(negotiation.status)) return null;
        negotiation.status = "withdrawn";
        negotiation.closedAt = event.date;
        return outcomeEvent(CONTRACT_NEGOTIATION_EVENT.WITHDRAWN, negotiation);
      }

      if (event.type === CONTRACT_NEGOTIATION_EVENT.COUNTER_ACCEPTED) {
        if (negotiation.status !== "countered" || !negotiation.counterTerms) return null;
        negotiation.status = "accepted";
        negotiation.acceptedTerms = structuredClone(negotiation.counterTerms);
        negotiation.closedAt = event.date;
        return [
          outcomeEvent(CONTRACT_NEGOTIATION_EVENT.ACCEPTED, negotiation, negotiation.acceptedTerms, { accepted_counter: true }),
          contractSigningEvent(negotiation, negotiation.acceptedTerms),
        ];
      }

      if (!["open", "countered"].includes(negotiation.status)) return null;
      const terms = structuredClone(event.payload?.terms ?? {});
      const evaluated = evaluateDriverContractOffer(saveWorld, negotiation, terms);
      negotiation.marketPressure = negotiation.marketPressure ?? {};
      negotiation.offers.push({
        attempt: negotiation.offers.length + 1,
        date: event.date,
        terms: structuredClone(terms),
        score: Number(evaluated.score.toFixed(4)),
        outcome: evaluated.outcome,
        reason: evaluated.reason ?? null,
      });

      if (evaluated.outcome === "accepted") {
        negotiation.status = "accepted";
        negotiation.acceptedTerms = structuredClone(terms);
        negotiation.counterTerms = null;
        negotiation.closedAt = event.date;
        return [
          outcomeEvent(CONTRACT_NEGOTIATION_EVENT.ACCEPTED, negotiation, terms),
          contractSigningEvent(negotiation, terms),
        ];
      }

      if (evaluated.outcome === "countered") {
        negotiation.status = "countered";
        negotiation.counterTerms = structuredClone(evaluated.counterTerms);
        return outcomeEvent(CONTRACT_NEGOTIATION_EVENT.COUNTERED, negotiation, evaluated.counterTerms, {
          submitted_terms: terms,
        });
      }

      negotiation.status = "rejected";
      negotiation.counterTerms = null;
      negotiation.closedAt = event.date;
      return outcomeEvent(CONTRACT_NEGOTIATION_EVENT.REJECTED, negotiation, terms, { reason: evaluated.reason ?? null });
    },
  };
}
