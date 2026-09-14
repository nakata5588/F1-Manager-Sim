import { listVisibleDrivers } from "../../domain/entityVisibility.js";
import { createRng } from "../../sim/random.js";
import { ageOnDate, registerCareerProfile } from "../../sim/systems/careerLifecycle.js";

const number = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, digits = 2) => Number(Number(value).toFixed(digits));
const driverId = (row) => row?.driver_id ?? row?.id ?? null;
const teamId = (row) => row?.team_id ?? row?.id ?? null;

export function talentProgramEraProfile(season) {
  const year = Number(season);
  if (!Number.isFinite(year) || year <= 1989) return { id: "informal_talent_network", label: "Talent Network", capacity: 2, minFactor: 1.03, maxFactor: 1.11 };
  if (year <= 1999) return { id: "junior_relationships", label: "Junior Relationships", capacity: 2, minFactor: 1.04, maxFactor: 1.13 };
  if (year <= 2008) return { id: "junior_program", label: "Junior Programme", capacity: 3, minFactor: 1.05, maxFactor: 1.15 };
  return { id: "driver_academy", label: "Driver Academy", capacity: 3, minFactor: 1.06, maxFactor: 1.18 };
}

export function ensureTalentProgramState(saveWorld) {
  saveWorld.world ??= {};
  saveWorld.world.management ??= {};
  saveWorld.world.management.talentPrograms ??= {
    version: 1,
    nextAgreementSerial: 1,
    programs: {},
    agreements: [],
    recruitmentHistory: [],
    feederSeriesHistory: [],
  };
  const state = saveWorld.world.management.talentPrograms;
  state.programs ??= {};
  state.agreements ??= [];
  state.recruitmentHistory ??= [];
  state.feederSeriesHistory ??= [];
  state.nextAgreementSerial = Math.max(1, Number(state.nextAgreementSerial ?? 1));
  return state;
}

function team(saveWorld, id) {
  return (saveWorld.world?.teams ?? []).find((row) => String(teamId(row)) === String(id)) ?? null;
}

function activeTeam(saveWorld, id) {
  const inactive = new Set((saveWorld.world?.teamEvolution?.inactiveTeamIds ?? []).map(String));
  return Boolean(team(saveWorld, id)) && !inactive.has(String(id));
}

function teamReputation(saveWorld, id) {
  const row = team(saveWorld, id) ?? {};
  return clamp(number(row.reputation ?? row.prestige ?? row.team_reputation ?? row.rating, 50), 1, 100);
}

function scoutingStrength(saveWorld, id) {
  const employment = saveWorld.world?.employment?.staff ?? {};
  const values = Object.entries(employment)
    .filter(([, row]) => row?.status === "employed" && String(row.teamId) === String(id))
    .map(([staffId]) => (saveWorld.world?.staffRatings ?? []).find((row) => String(row.staff_id) === String(staffId)) ?? {})
    .map((row) => number(row.scouting ?? row.judging_ability ?? row.data_analysis))
    .filter((value) => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 50;
}

export function initializeTalentPrograms(saveWorld, season = saveWorld.clock?.season) {
  const state = ensureTalentProgramState(saveWorld);
  const era = talentProgramEraProfile(season);
  for (const row of saveWorld.world?.teams ?? []) {
    const id = teamId(row);
    if (!id || !activeTeam(saveWorld, id)) continue;
    const rng = createRng(`${saveWorld.meta?.seed ?? "career"}|talent-program|${season}|${id}`);
    const quality = round(clamp(30 + teamReputation(saveWorld, id) * 0.34 + scoutingStrength(saveWorld, id) * 0.24 + (rng.next() - 0.5) * 10, 35, 92));
    const normalized = clamp((quality - 35) / 57, 0, 1);
    state.programs[id] = {
      teamId: id,
      type: era.id,
      label: era.label,
      quality,
      capacity: clamp(era.capacity + (quality >= 68 ? 1 : 0) + (quality >= 84 ? 1 : 0), 1, 5),
      developmentFactor: round(era.minFactor + (era.maxFactor - era.minFactor) * normalized, 3),
      season: Number(season),
      status: "active",
      source: "simulation_baseline",
      provenance: "save_world_talent_program",
    };
  }
  for (const id of Object.keys(state.programs)) if (!activeTeam(saveWorld, id)) state.programs[id].status = "inactive";
  return state.programs;
}

export function activeTalentAgreement(saveWorld, id, season = saveWorld.clock?.season) {
  const year = Number(season);
  return ensureTalentProgramState(saveWorld).agreements.find((row) => (
    row.status === "active" && String(row.driverId) === String(id) && row.startSeason <= year && row.endSeason >= year
  )) ?? null;
}

function teamAgreements(saveWorld, id, season) {
  return ensureTalentProgramState(saveWorld).agreements.filter((row) => (
    row.status === "active" && String(row.teamId) === String(id) && row.startSeason <= season && row.endSeason >= season
  ));
}

function candidate(saveWorld, id) {
  const row = listVisibleDrivers(saveWorld, { requireTalentVisible: true }).find((entry) => String(driverId(entry)) === String(id));
  if (!row) return null;
  const age = saveWorld.world?.careerState?.drivers?.[id]?.age ?? ageOnDate(row, saveWorld.clock?.date);
  if (age !== null && (age < 14 || age > 23)) return null;
  if (saveWorld.world?.employment?.drivers?.[id]?.status === "employed") return null;
  const f1Eligible = listVisibleDrivers(saveWorld, { requireF1Eligible: true }).some((entry) => String(driverId(entry)) === String(id));
  if (f1Eligible) return null;
  return row;
}

export function listTalentRecruitmentCandidates(saveWorld, options = {}) {
  const season = Number(saveWorld.clock?.season ?? saveWorld.world?.season);
  let rows = listVisibleDrivers(saveWorld, { requireTalentVisible: true }).map((row) => {
    const id = driverId(row);
    if (!id || !candidate(saveWorld, id)) return null;
    const age = saveWorld.world?.careerState?.drivers?.[id]?.age ?? ageOnDate(row, saveWorld.clock?.date);
    return {
      id,
      name: row.display_name ?? row.driver_name ?? row.name ?? id,
      nationality: row.nationality ?? row.country ?? null,
      age,
      generated: row.generated === true,
      affiliatedTeamId: activeTalentAgreement(saveWorld, id, season)?.teamId ?? null,
    };
  }).filter(Boolean);
  if (options.unaffiliated === true) rows = rows.filter((row) => !row.affiliatedTeamId);
  return rows.sort((a, b) => Number(Boolean(a.affiliatedTeamId)) - Number(Boolean(b.affiliatedTeamId)) || a.name.localeCompare(b.name));
}

export function signTalentProgramDriver(saveWorld, teamIdValue, driverIdValue, options = {}) {
  const season = Number(options.season ?? saveWorld.clock?.season ?? saveWorld.world?.season);
  initializeTalentPrograms(saveWorld, season);
  const state = ensureTalentProgramState(saveWorld);
  if (!activeTeam(saveWorld, teamIdValue)) throw new Error(`Team '${teamIdValue}' cannot recruit junior talent.`);
  const profile = candidate(saveWorld, driverIdValue);
  if (!profile) throw new Error(`Driver '${driverIdValue}' is not available to talent recruitment.`);
  const current = activeTalentAgreement(saveWorld, driverIdValue, season);
  if (current) return structuredClone(current);
  const program = state.programs[teamIdValue];
  if (teamAgreements(saveWorld, teamIdValue, season).length >= program.capacity) throw new Error(`Team '${teamIdValue}' talent programme is at capacity.`);
  const duration = clamp(Math.round(number(options.durationSeasons, 2)), 1, 4);
  const agreement = {
    id: `talent:${String(state.nextAgreementSerial++).padStart(6, "0")}`,
    driverId: driverIdValue,
    teamId: teamIdValue,
    status: "active",
    startSeason: season,
    endSeason: season + duration - 1,
    programType: program.type,
    developmentFactor: program.developmentFactor,
    signedAt: saveWorld.clock?.date ?? `${season}-01-01`,
    source: "simulation",
    provenance: "save_world_talent_program_agreement",
  };
  state.agreements.push(agreement);
  state.recruitmentHistory.push({ season, action: "signed", agreementId: agreement.id, driverId: driverIdValue, teamId: teamIdValue, source: "simulation" });
  const career = registerCareerProfile(saveWorld, "driver", profile, { status: "junior", date: saveWorld.clock?.date ?? `${season}-01-01` });
  if (career.status !== "retired") career.status = "junior";
  career.talentProgramTeamId = teamIdValue;
  career.talentProgramAgreementId = agreement.id;
  return structuredClone(agreement);
}

export function expireTalentProgramAgreements(saveWorld, season = saveWorld.clock?.season) {
  const year = Number(season);
  const state = ensureTalentProgramState(saveWorld);
  const expired = [];
  for (const row of state.agreements) {
    if (row.status !== "active" || row.endSeason >= year) continue;
    row.status = "expired";
    row.endedAt = saveWorld.clock?.date ?? `${year}-01-01`;
    state.recruitmentHistory.push({ season: year, action: "expired", agreementId: row.id, driverId: row.driverId, teamId: row.teamId, source: "simulation" });
    expired.push(structuredClone(row));
  }
  return expired;
}

export function applyTalentProgramSupport(saveWorld, season = saveWorld.clock?.season) {
  const year = Number(season);
  initializeTalentPrograms(saveWorld, year);
  const drivers = saveWorld.world?.careerState?.drivers ?? {};
  const supported = [];
  for (const row of ensureTalentProgramState(saveWorld).agreements) {
    if (row.status !== "active" || row.startSeason > year || row.endSeason < year) continue;
    if (saveWorld.world?.employment?.drivers?.[row.driverId]?.status === "employed") continue;
    const career = drivers[row.driverId];
    if (!career || career.status === "retired" || Number(career.lastTalentProgramSupportSeason) === year) continue;
    const program = ensureTalentProgramState(saveWorld).programs[row.teamId];
    const factor = clamp(number(program?.developmentFactor ?? row.developmentFactor, 1), 1, 1.25);
    career.morale = round(clamp(number(career.morale, 50) + (factor - 1) * 18, 0, 100));
    career.form = round(clamp(number(career.form, 0) + (factor - 1) * 24, -25, 25));
    career.talentProgramTeamId = row.teamId;
    career.talentProgramAgreementId = row.id;
    career.lastTalentProgramSupportSeason = year;
    supported.push(row.driverId);
  }
  return supported;
}

export function talentProgramSummary(saveWorld, season = saveWorld.clock?.season) {
  const year = Number(season);
  initializeTalentPrograms(saveWorld, year);
  const state = ensureTalentProgramState(saveWorld);
  const agreements = state.agreements.filter((row) => row.status === "active" && row.startSeason <= year && row.endSeason >= year);
  return {
    season: year,
    era: talentProgramEraProfile(year).id,
    programs: Object.values(state.programs).filter((row) => row.status === "active").length,
    activeAgreements: agreements.length,
  };
}
