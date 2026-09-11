import {
  archiveManagementInboxItem,
  listManagementInbox,
  managementInboxSummary,
  markManagementInboxRead,
  resolveManagementInboxDecision,
} from "../game/management/inbox.js";
import {
  listRecruitmentCandidates,
  scoutingSummary,
  setDriverShortlist,
  startDriverScoutingAssignment,
} from "../game/management/scouting.js";
import {
  acceptDriverContractCounterEvent,
  contractNegotiationSummary,
  listContractNegotiations,
  openDriverContractNegotiation,
  submitDriverContractOfferEvent,
  withdrawDriverContractNegotiationEvent,
} from "../game/management/contracts.js";
import {
  evaluateDriverTransferInterest,
  peopleSummary,
  personProjection,
  personProfile,
} from "../game/management/people.js";
import {
  listOpenExternalOffers,
  marketSummary,
} from "../game/management/market.js";
import {
  boardProjection,
  submitBoardRequest,
} from "../game/management/board.js";
import {
  acceptManagerJobOfferEvent,
  ensureManagerCareer,
  listManagerJobVacancies,
  managerCareerProjection,
  submitManagerApplicationEvent,
} from "../game/management/managerCareer.js";
import {
  responsibilityProjection,
  setResponsibility,
} from "../game/management/responsibilities.js";
import {
  acceptStaffCounterEvent,
  listStaffContractNegotiations,
  listStaffRecruitmentCandidates,
  openStaffContractNegotiation,
  staffRecruitmentSummary,
  submitStaffContractOfferEvent,
  withdrawStaffNegotiationEvent,
} from "../game/management/staffRecruitment.js";
import { BOARD_EVENT } from "../sim/systems/boardManagement.js";
import { createCoreWorldSystems } from "../sim/systems/coreWorldSystems.js";
import { dispatchSimulationEvents } from "../sim/timeEngine.js";

function syncSessionControl(session) {
  if (!session || typeof session.requireCareer !== "function") throw new TypeError("A DeveloperPlaytestSession is required.");
  const saveWorld = session.requireCareer();
  const dynamicTeamId = saveWorld.player?.controlledTeamIds?.[0] ?? null;
  if (session.controlledTeamId !== dynamicTeamId) {
    session.controlledTeamId = dynamicTeamId;
    session.systems = createCoreWorldSystems({ controlledTeamIds: dynamicTeamId ? [dynamicTeamId] : [] })
      .filter((system) => !["race.weekend", "race.timeline"].includes(system.id));
  }
  return saveWorld;
}

function requireSession(session) {
  return syncSessionControl(session);
}

function requireControlledTeam(session) {
  const saveWorld = syncSessionControl(session);
  if (!session.controlledTeamId) throw new Error("The manager is currently unemployed and does not control a team.");
  return { saveWorld, teamId: session.controlledTeamId };
}

function dispatchManagementEvent(session, raw) {
  const saveWorld = requireSession(session);
  const processed = dispatchSimulationEvents(saveWorld, [{
    ...raw,
    date: raw.date ?? saveWorld.clock.date,
    payload: raw.payload ?? {},
  }], session.systems ?? []);
  syncSessionControl(session);
  return processed;
}

function personName(saveWorld, type, id) {
  const row = personProfile(saveWorld, type, id) ?? {};
  return row.display_name ?? row.driver_name ?? row.staff_name ?? row.name ?? id;
}

export function developerManagementOverview(session) {
  const saveWorld = requireSession(session);
  const teamId = session.controlledTeamId;
  return {
    inbox: managementInboxSummary(saveWorld),
    scouting: scoutingSummary(saveWorld),
    contracts: teamId ? contractNegotiationSummary(saveWorld, teamId) : { active: 0, agreed: 0, total: 0 },
    staffContracts: teamId ? staffRecruitmentSummary(saveWorld, teamId) : { active: 0, agreed: 0, total: 0 },
    people: peopleSummary(saveWorld),
    market: marketSummary(saveWorld),
    board: teamId ? boardProjection(saveWorld, teamId) : null,
    career: managerCareerProjection(saveWorld),
  };
}

export function developerInbox(session, options = {}) {
  const saveWorld = requireSession(session);
  return {
    summary: managementInboxSummary(saveWorld),
    items: listManagementInbox(saveWorld, options),
  };
}

export function developerMarkInboxRead(session, itemId, read = true) {
  const saveWorld = requireSession(session);
  markManagementInboxRead(saveWorld, itemId, read);
  return developerInbox(session);
}

export function developerArchiveInboxItem(session, itemId) {
  const saveWorld = requireSession(session);
  archiveManagementInboxItem(saveWorld, itemId);
  return developerInbox(session);
}

export function developerResolveInboxDecision(session, itemId, optionId) {
  const saveWorld = requireSession(session);
  const item = listManagementInbox(saveWorld, { includeArchived: true, limit: 0 }).find((row) => row.id === itemId);
  if (!item) throw new Error(`Inbox item '${itemId}' does not exist.`);
  if (!item.decision || item.decision.status !== "pending") throw new Error(`Inbox item '${itemId}' has no pending decision.`);
  if (!item.decision.options.some((option) => option.id === optionId)) {
    throw new Error(`Decision option '${optionId}' is not available for '${itemId}'.`);
  }

  if (item.decision.kind === "contract_counter") {
    const raw = optionId === "accept_counter"
      ? acceptDriverContractCounterEvent(saveWorld, item.decision.refId)
      : withdrawDriverContractNegotiationEvent(saveWorld, item.decision.refId);
    dispatchManagementEvent(session, raw);
  } else if (item.decision.kind === "staff_contract_counter") {
    const raw = optionId === "accept_staff_counter"
      ? acceptStaffCounterEvent(saveWorld, item.decision.refId)
      : withdrawStaffNegotiationEvent(saveWorld, item.decision.refId);
    dispatchManagementEvent(session, raw);
  } else if (item.decision.kind === "manager_job_offer") {
    const career = ensureManagerCareer(saveWorld);
    const offer = career.jobOffers.find((row) => row.id === item.decision.refId && row.status === "open");
    if (!offer) throw new Error(`Manager job offer '${item.decision.refId}' is no longer open.`);
    if (optionId === "accept_job") {
      dispatchManagementEvent(session, acceptManagerJobOfferEvent(saveWorld, offer.id));
    } else {
      offer.status = "declined";
      offer.closedAt = saveWorld.clock.date;
    }
  }
  resolveManagementInboxDecision(saveWorld, itemId, optionId);
  syncSessionControl(session);
  return developerInbox(session);
}

export function developerRecruitment(session, options = {}) {
  const saveWorld = requireSession(session);
  if (!session.controlledTeamId) return { summary: scoutingSummary(saveWorld), candidates: [] };
  const candidates = listRecruitmentCandidates(saveWorld, options).map((row) => ({
    ...row,
    transferInterest: row.visibilityState === "f1_eligible" && row.knowledge >= 55
      ? evaluateDriverTransferInterest(saveWorld, row.id, session.controlledTeamId)
      : null,
  }));
  return {
    summary: scoutingSummary(saveWorld),
    candidates,
  };
}

export function developerSetShortlist(session, driverId, shortlisted = true) {
  const { saveWorld } = requireControlledTeam(session);
  setDriverShortlist(saveWorld, driverId, shortlisted);
  return developerRecruitment(session);
}

export function developerStartScouting(session, driverId, options = {}) {
  const { saveWorld } = requireControlledTeam(session);
  const assignment = startDriverScoutingAssignment(saveWorld, driverId, options);
  return {
    assignment,
    recruitment: developerRecruitment(session),
  };
}

export function developerContractNegotiations(session, options = {}) {
  const saveWorld = requireSession(session);
  if (!session.controlledTeamId) return { summary: { active: 0, agreed: 0, total: 0 }, negotiations: [] };
  return {
    summary: contractNegotiationSummary(saveWorld, session.controlledTeamId),
    negotiations: listContractNegotiations(saveWorld, { ...options, teamId: session.controlledTeamId }),
  };
}

export function developerOpenDriverNegotiation(session, driverId, options = {}) {
  const { saveWorld, teamId } = requireControlledTeam(session);
  const negotiation = openDriverContractNegotiation(saveWorld, {
    ...options,
    driverId,
    teamId,
  });
  return {
    negotiation,
    contracts: developerContractNegotiations(session),
  };
}

export function developerSubmitDriverOffer(session, negotiationId, terms = {}) {
  const { saveWorld, teamId } = requireControlledTeam(session);
  const negotiation = listContractNegotiations(saveWorld).find((row) => row.id === negotiationId);
  if (!negotiation || negotiation.teamId !== teamId) throw new Error("This negotiation does not belong to the controlled team.");
  dispatchManagementEvent(session, submitDriverContractOfferEvent(saveWorld, negotiationId, terms));
  return {
    contracts: developerContractNegotiations(session),
    inbox: developerInbox(session),
  };
}

export function developerWithdrawDriverNegotiation(session, negotiationId) {
  const { saveWorld, teamId } = requireControlledTeam(session);
  const negotiation = listContractNegotiations(saveWorld).find((row) => row.id === negotiationId);
  if (!negotiation || negotiation.teamId !== teamId) throw new Error("This negotiation does not belong to the controlled team.");
  dispatchManagementEvent(session, withdrawDriverContractNegotiationEvent(saveWorld, negotiationId));
  return developerContractNegotiations(session);
}

export function developerPeople(session) {
  const saveWorld = requireSession(session);
  if (!session.controlledTeamId) return { summary: peopleSummary(saveWorld), drivers: [], staff: [] };
  const drivers = Object.entries(saveWorld.world?.employment?.drivers ?? {})
    .filter(([, row]) => row?.teamId === session.controlledTeamId && row?.status === "employed")
    .map(([id, assignment]) => ({
      id,
      name: personName(saveWorld, "driver", id),
      role: assignment.role ?? "driver",
      assignment: structuredClone(assignment),
      ...personProjection(saveWorld, "driver", id),
    }));
  const staff = Object.entries(saveWorld.world?.employment?.staff ?? {})
    .filter(([, row]) => row?.teamId === session.controlledTeamId && row?.status === "employed")
    .map(([id, assignment]) => ({
      id,
      name: personName(saveWorld, "staff", id),
      role: assignment.role ?? "staff",
      assignment: structuredClone(assignment),
      ...personProjection(saveWorld, "staff", id),
    }));
  return {
    summary: peopleSummary(saveWorld),
    drivers: drivers.sort((a, b) => a.name.localeCompare(b.name)),
    staff: staff.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export function developerMarket(session) {
  const saveWorld = requireSession(session);
  if (!session.controlledTeamId) return { summary: marketSummary(saveWorld), offers: [] };
  const negotiations = listContractNegotiations(saveWorld, { teamId: session.controlledTeamId });
  const relevantDriverIds = new Set([
    ...Object.entries(saveWorld.world?.employment?.drivers ?? {})
      .filter(([, row]) => row?.teamId === session.controlledTeamId)
      .map(([id]) => id),
    ...negotiations.map((row) => row.driverId),
  ]);
  const offers = listOpenExternalOffers(saveWorld)
    .filter((row) => relevantDriverIds.has(row.workerId) || (row.relatedNegotiationId && negotiations.some((negotiation) => negotiation.id === row.relatedNegotiationId)))
    .map((row) => ({ ...row, driverName: personName(saveWorld, "driver", row.workerId) }));
  return {
    summary: marketSummary(saveWorld),
    offers,
  };
}

export function developerBoard(session) {
  const saveWorld = requireSession(session);
  return {
    board: session.controlledTeamId ? boardProjection(saveWorld, session.controlledTeamId) : null,
    career: managerCareerProjection(saveWorld),
  };
}

export function developerSubmitBoardRequest(session, kind) {
  const { saveWorld, teamId } = requireControlledTeam(session);
  const request = submitBoardRequest(saveWorld, teamId, kind);
  dispatchManagementEvent(session, {
    type: BOARD_EVENT.REQUEST_SUBMITTED,
    payload: { request_id: request.id, team_id: teamId, kind },
  });
  return developerBoard(session);
}

export function developerManagerCareer(session) {
  const saveWorld = requireSession(session);
  return {
    career: managerCareerProjection(saveWorld),
    vacancies: listManagerJobVacancies(saveWorld),
  };
}

export function developerApplyManagerJob(session, teamId) {
  const saveWorld = requireSession(session);
  dispatchManagementEvent(session, submitManagerApplicationEvent(saveWorld, teamId));
  return {
    career: developerManagerCareer(session),
    inbox: developerInbox(session),
  };
}

export function developerResponsibilities(session) {
  const saveWorld = requireSession(session);
  return {
    teamId: session.controlledTeamId,
    areas: session.controlledTeamId ? responsibilityProjection(saveWorld, session.controlledTeamId) : [],
  };
}

export function developerSetResponsibility(session, area, owner) {
  const { saveWorld, teamId } = requireControlledTeam(session);
  setResponsibility(saveWorld, teamId, area, owner);
  return developerResponsibilities(session);
}

export function developerStaffRecruitment(session, options = {}) {
  const saveWorld = requireSession(session);
  if (!session.controlledTeamId) return { summary: { active: 0, agreed: 0, total: 0 }, candidates: [] };
  return {
    summary: staffRecruitmentSummary(saveWorld, session.controlledTeamId),
    candidates: listStaffRecruitmentCandidates(saveWorld, { ...options, teamId: session.controlledTeamId }),
  };
}

export function developerStaffContractNegotiations(session) {
  const saveWorld = requireSession(session);
  if (!session.controlledTeamId) return { summary: { active: 0, agreed: 0, total: 0 }, negotiations: [] };
  return {
    summary: staffRecruitmentSummary(saveWorld, session.controlledTeamId),
    negotiations: listStaffContractNegotiations(saveWorld, { teamId: session.controlledTeamId }),
  };
}

export function developerOpenStaffNegotiation(session, staffId, options = {}) {
  const { saveWorld, teamId } = requireControlledTeam(session);
  const negotiation = openStaffContractNegotiation(saveWorld, {
    staffId,
    teamId,
    role: options.role,
    startSeason: options.startSeason,
  });
  return { negotiation, contracts: developerStaffContractNegotiations(session) };
}

export function developerSubmitStaffOffer(session, negotiationId, terms = {}) {
  const { saveWorld, teamId } = requireControlledTeam(session);
  const negotiation = listStaffContractNegotiations(saveWorld).find((row) => row.id === negotiationId);
  if (!negotiation || negotiation.teamId !== teamId) throw new Error("This staff negotiation does not belong to the controlled team.");
  dispatchManagementEvent(session, submitStaffContractOfferEvent(saveWorld, negotiationId, terms));
  return {
    contracts: developerStaffContractNegotiations(session),
    inbox: developerInbox(session),
  };
}

export function developerWithdrawStaffNegotiation(session, negotiationId) {
  const { saveWorld, teamId } = requireControlledTeam(session);
  const negotiation = listStaffContractNegotiations(saveWorld).find((row) => row.id === negotiationId);
  if (!negotiation || negotiation.teamId !== teamId) throw new Error("This staff negotiation does not belong to the controlled team.");
  dispatchManagementEvent(session, withdrawStaffNegotiationEvent(saveWorld, negotiationId));
  return developerStaffContractNegotiations(session);
}
