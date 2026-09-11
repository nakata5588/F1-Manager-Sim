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
import { dispatchSimulationEvents } from "../sim/timeEngine.js";

function requireSession(session) {
  if (!session || typeof session.requireCareer !== "function") throw new TypeError("A DeveloperPlaytestSession is required.");
  const saveWorld = session.requireCareer();
  if (!session.controlledTeamId) throw new Error("The playtest has no controlled team.");
  return saveWorld;
}

function dispatchManagementEvent(session, raw) {
  const saveWorld = requireSession(session);
  return dispatchSimulationEvents(saveWorld, [{
    ...raw,
    date: raw.date ?? saveWorld.clock.date,
    payload: raw.payload ?? {},
  }], session.systems ?? []);
}

function personName(saveWorld, type, id) {
  const row = personProfile(saveWorld, type, id) ?? {};
  return row.display_name ?? row.driver_name ?? row.staff_name ?? row.name ?? id;
}

export function developerManagementOverview(session) {
  const saveWorld = requireSession(session);
  return {
    inbox: managementInboxSummary(saveWorld),
    scouting: scoutingSummary(saveWorld),
    contracts: contractNegotiationSummary(saveWorld, session.controlledTeamId),
    people: peopleSummary(saveWorld),
    market: marketSummary(saveWorld),
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
  }
  resolveManagementInboxDecision(saveWorld, itemId, optionId);
  return developerInbox(session);
}

export function developerRecruitment(session, options = {}) {
  const saveWorld = requireSession(session);
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
  const saveWorld = requireSession(session);
  setDriverShortlist(saveWorld, driverId, shortlisted);
  return developerRecruitment(session);
}

export function developerStartScouting(session, driverId, options = {}) {
  const saveWorld = requireSession(session);
  const assignment = startDriverScoutingAssignment(saveWorld, driverId, options);
  return {
    assignment,
    recruitment: developerRecruitment(session),
  };
}

export function developerContractNegotiations(session, options = {}) {
  const saveWorld = requireSession(session);
  return {
    summary: contractNegotiationSummary(saveWorld, session.controlledTeamId),
    negotiations: listContractNegotiations(saveWorld, { ...options, teamId: session.controlledTeamId }),
  };
}

export function developerOpenDriverNegotiation(session, driverId, options = {}) {
  const saveWorld = requireSession(session);
  const negotiation = openDriverContractNegotiation(saveWorld, {
    ...options,
    driverId,
    teamId: session.controlledTeamId,
  });
  return {
    negotiation,
    contracts: developerContractNegotiations(session),
  };
}

export function developerSubmitDriverOffer(session, negotiationId, terms = {}) {
  const saveWorld = requireSession(session);
  const negotiation = listContractNegotiations(saveWorld).find((row) => row.id === negotiationId);
  if (!negotiation || negotiation.teamId !== session.controlledTeamId) throw new Error("This negotiation does not belong to the controlled team.");
  dispatchManagementEvent(session, submitDriverContractOfferEvent(saveWorld, negotiationId, terms));
  return {
    contracts: developerContractNegotiations(session),
    inbox: developerInbox(session),
  };
}

export function developerWithdrawDriverNegotiation(session, negotiationId) {
  const saveWorld = requireSession(session);
  const negotiation = listContractNegotiations(saveWorld).find((row) => row.id === negotiationId);
  if (!negotiation || negotiation.teamId !== session.controlledTeamId) throw new Error("This negotiation does not belong to the controlled team.");
  dispatchManagementEvent(session, withdrawDriverContractNegotiationEvent(saveWorld, negotiationId));
  return developerContractNegotiations(session);
}

export function developerPeople(session) {
  const saveWorld = requireSession(session);
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
