import { createRng } from "../random.js";
import { SIM_EVENT } from "../timeEngine.js";
import {
  activeTalentAgreement,
  applyTalentProgramSupport,
  ensureTalentProgramState,
  expireTalentProgramAgreements,
  initializeTalentPrograms,
  listTalentRecruitmentCandidates,
  signTalentProgramDriver,
} from "../../game/management/talentPrograms.js";

export const TALENT_PROGRAM_EVENT = Object.freeze({
  INITIALIZED: "talent.programs_initialized",
  DRIVER_SIGNED: "talent.program_driver_signed",
  AGREEMENT_EXPIRED: "talent.program_agreement_expired",
  FEEDER_SERIES_RECORDED: "talent.feeder_series_recorded",
});

const number = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value, digits = 2) => Number(Number(value).toFixed(digits));

function team(saveWorld, id) {
  return (saveWorld.world?.teams ?? []).find((row) => String(row?.team_id ?? row?.id) === String(id)) ?? {};
}

function teamReputation(saveWorld, id) {
  const row = team(saveWorld, id);
  return number(row.reputation ?? row.prestige ?? row.team_reputation ?? row.rating, 50);
}

function driverRating(saveWorld, id) {
  return (saveWorld.world?.driverRatings ?? []).find((row) => String(row?.driver_id) === String(id)) ?? {};
}

function latestFeeder(saveWorld, id) {
  return [...(saveWorld.world?.management?.talentPipeline?.feederHistory ?? [])]
    .filter((row) => String(row.driverId) === String(id))
    .sort((a, b) => Number(b.season) - Number(a.season))[0] ?? null;
}

function activeTeamAgreements(saveWorld, teamId, season) {
  return ensureTalentProgramState(saveWorld).agreements.filter((row) => (
    row.status === "active" && String(row.teamId) === String(teamId) && row.startSeason <= season && row.endSeason >= season
  ));
}

function aiEvaluation(saveWorld, program, candidate, season) {
  const career = saveWorld.world?.careerState?.drivers?.[candidate.id] ?? {};
  const rating = driverRating(saveWorld, candidate.id);
  const current = number(career.currentAbility ?? rating.current_ability, 45);
  const potential = number(career.potentialAbility ?? rating.potential_ability, 60);
  const feeder = latestFeeder(saveWorld, candidate.id);
  const rng = createRng(`${saveWorld.meta?.seed ?? "career"}|talent-eval|${season}|${program.teamId}|${candidate.id}`);
  const uncertainty = Math.max(2, (100 - program.quality) / 4);
  const estimatedPotential = potential + (rng.next() - 0.5) * uncertainty;
  const ageBonus = Math.max(0, 22 - number(candidate.age, 22));
  return round(estimatedPotential * 0.5 + current * 0.2 + number(feeder?.performanceIndex, 50) * 0.15 + ageBonus + (rng.next() - 0.5) * 5);
}

function driverPreference(saveWorld, program, driverId, season) {
  const rng = createRng(`${saveWorld.meta?.seed ?? "career"}|talent-choice|${season}|${driverId}|${program.teamId}`);
  return round(program.quality * 0.65 + teamReputation(saveWorld, program.teamId) * 0.25 + (rng.next() - 0.5) * 14);
}

export function runAiTalentRecruitment(saveWorld, season = saveWorld.clock?.season, options = {}) {
  const year = Number(season);
  initializeTalentPrograms(saveWorld, year);
  const state = ensureTalentProgramState(saveWorld);
  const controlled = new Set((saveWorld.player?.controlledTeamIds ?? []).map(String));
  const candidates = listTalentRecruitmentCandidates(saveWorld, { unaffiliated: true });
  const proposals = [];

  for (const program of Object.values(state.programs).sort((a, b) => String(a.teamId).localeCompare(String(b.teamId)))) {
    if (program.status !== "active" || controlled.has(String(program.teamId))) continue;
    const slots = Math.max(0, program.capacity - activeTeamAgreements(saveWorld, program.teamId, year).length);
    if (!slots) continue;
    const ranked = candidates.map((candidate) => ({
      candidate,
      score: aiEvaluation(saveWorld, program, candidate, year),
    })).sort((a, b) => b.score - a.score || String(a.candidate.id).localeCompare(String(b.candidate.id)));
    for (const row of ranked.slice(0, Math.min(slots, 2))) {
      if (row.score < number(options.minimumScore, 58)) continue;
      proposals.push({ teamId: program.teamId, driverId: row.candidate.id, score: row.score });
    }
  }

  const signed = [];
  for (const driverId of [...new Set(proposals.map((row) => row.driverId))].sort()) {
    if (activeTalentAgreement(saveWorld, driverId, year)) continue;
    const offers = proposals.filter((row) => row.driverId === driverId).map((row) => ({
      ...row,
      preference: driverPreference(saveWorld, state.programs[row.teamId], driverId, year),
    })).sort((a, b) => b.preference - a.preference || b.score - a.score || String(a.teamId).localeCompare(String(b.teamId)));
    for (const offer of offers) {
      try {
        const agreement = signTalentProgramDriver(saveWorld, offer.teamId, driverId, {
          season: year,
          durationSeasons: options.durationSeasons ?? 2,
        });
        signed.push({ ...offer, agreement });
        break;
      } catch {
        // Another simultaneous offer may have filled the programme's final slot.
      }
    }
  }
  return signed;
}

export function recordFeederSeries(saveWorld, season = saveWorld.clock?.season) {
  const year = Number(season);
  const state = ensureTalentProgramState(saveWorld);
  const records = (saveWorld.world?.management?.talentPipeline?.feederHistory ?? []).filter((row) => Number(row.season) === year);
  if (!records.length) return [];

  for (const row of records) {
    const agreement = activeTalentAgreement(saveWorld, row.driverId, year);
    if (!agreement) continue;
    row.talentProgramTeamId = agreement.teamId;
    row.talentProgramAgreementId = agreement.id;
    row.developmentSupport = state.programs[agreement.teamId]?.developmentFactor ?? agreement.developmentFactor ?? 1;
  }

  const created = [];
  for (const tier of [...new Set(records.map((row) => row.tier))].sort()) {
    if (state.feederSeriesHistory.some((row) => Number(row.season) === year && row.tier === tier)) continue;
    const field = records.filter((row) => row.tier === tier).sort((a, b) => Number(a.tierRank) - Number(b.tierRank) || b.performanceIndex - a.performanceIndex);
    const summary = {
      season: year,
      tier,
      fieldSize: field.length,
      championDriverId: field[0]?.driverId ?? null,
      topThreeDriverIds: field.slice(0, 3).map((row) => row.driverId),
      representedTalentPrograms: [...new Set(field.map((row) => row.talentProgramTeamId).filter(Boolean))].sort(),
      source: "simulation",
      provenance: "save_world_feeder_series",
    };
    state.feederSeriesHistory.push(summary);
    created.push(summary);
  }
  state.feederSeriesHistory.sort((a, b) => a.season - b.season || a.tier.localeCompare(b.tier));
  return created;
}

export function createTalentRecruitmentSystem(options = {}) {
  return {
    id: "career.talent-recruitment",
    eventTypes: [SIM_EVENT.CAREER_STARTED, SIM_EVENT.SEASON_STARTED],
    handle({ saveWorld, event }) {
      const season = Number(event.payload?.season ?? saveWorld.clock?.season);
      initializeTalentPrograms(saveWorld, season);
      const output = [];

      if (event.type === SIM_EVENT.CAREER_STARTED) {
        output.push({ type: TALENT_PROGRAM_EVENT.INITIALIZED, payload: { season } });
      } else {
        const expired = expireTalentProgramAgreements(saveWorld, season);
        for (const row of expired) output.push({ type: TALENT_PROGRAM_EVENT.AGREEMENT_EXPIRED, payload: { season, driver_id: row.driverId, team_id: row.teamId } });
        const feeder = recordFeederSeries(saveWorld, season);
        if (feeder.length) output.push({ type: TALENT_PROGRAM_EVENT.FEEDER_SERIES_RECORDED, payload: { season, series: feeder.length } });
      }

      const signed = runAiTalentRecruitment(saveWorld, season, options);
      applyTalentProgramSupport(saveWorld, season);
      for (const row of signed) output.push({ type: TALENT_PROGRAM_EVENT.DRIVER_SIGNED, payload: { season, driver_id: row.driverId, team_id: row.teamId } });
      return output;
    },
  };
}
