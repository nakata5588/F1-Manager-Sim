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

export function developerManagementOverview(session) {
  const saveWorld = requireSession(session);
  return {
    inbox: managementInboxSummary(saveWorld),
    scouting: scoutingSummary(saveWorld),
    contracts: contractNegotiationSummary(saveWorld, session.controlledTeamId),
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
  const { resolution } = resolveManagementInboxDecision(saveWorld, itemId, optionId);
  if (resolution.kind === "contract_counter") {
    const raw = optionId === "accept_counter"
      ? acceptDriverContractCounterEvent(saveWorld, resolution.refId)
      : withdrawDriverContractNegotiationEvent(saveWorld, resolution.refId);
    dispatchManagementEvent(session, raw);
  }
  return developerInbox(session);
}

export function developerRecruitment(session, options = {}) {
  const saveWorld = requireSession(session);
  return {
    summary: scoutingSummary(saveWorld),
    candidates: listRecruitmentCandidates(saveWorld, options),
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
