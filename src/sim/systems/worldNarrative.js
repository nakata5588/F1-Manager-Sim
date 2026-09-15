import {
  appendWorldHistoryEvent,
  appendWorldRecord,
  ensureWorldNarrative,
  publishWorldStory,
  worldRecordsSummary,
} from "../../game/worldNarrative.js";
import { MANAGER_EVENT } from "../../game/management/managerCareer.js";
import { REGULATION_EVENT } from "../../game/management/regulations.js";
import { TEAM_EVOLUTION_EVENT } from "../../game/management/teamEvolution.js";
import { SIM_EVENT } from "../timeEngine.js";
import { CAREER_EVENT } from "./careerLifecycle.js";
import { CHAMPIONSHIP_EVENT } from "./championship.js";
import { EMPLOYMENT_EVENT } from "./employmentMarket.js";
import { RACE_EVENT } from "./raceWeekend.js";

function driverProfile(saveWorld, id) {
  return [...(saveWorld.world?.drivers ?? []), ...(saveWorld.world?.futureDrivers ?? [])]
    .find((row) => String(row?.driver_id ?? row?.id) === String(id)) ?? null;
}

function staffProfile(saveWorld, id) {
  return [...(saveWorld.world?.staff ?? []), ...(saveWorld.world?.futureStaff ?? [])]
    .find((row) => String(row?.staff_id ?? row?.id) === String(id)) ?? null;
}

function teamProfile(saveWorld, id) {
  return [...(saveWorld.world?.teams ?? []), ...(saveWorld.world?.inactiveTeams ?? []), ...(saveWorld.world?.futureTeams ?? [])]
    .find((row) => String(row?.team_id ?? row?.id) === String(id)) ?? null;
}

function driverName(saveWorld, id) {
  const row = driverProfile(saveWorld, id) ?? {};
  return row.display_name ?? row.driver_name ?? row.name ?? id ?? "Driver";
}

function staffName(saveWorld, id) {
  const row = staffProfile(saveWorld, id) ?? {};
  return row.display_name ?? row.staff_name ?? row.name ?? id ?? "Staff member";
}

function teamName(saveWorld, id) {
  const row = teamProfile(saveWorld, id) ?? {};
  return row.team_name ?? row.display_name ?? row.name ?? id ?? "Team";
}

function managerName(saveWorld) {
  return saveWorld.player?.manager?.name ?? "The manager";
}

function entity(type, id, name) {
  return id ? { type, id: String(id), name: name ?? null } : null;
}

function emitStory(saveWorld, event, input) {
  const entities = (input.entities ?? []).filter(Boolean);
  publishWorldStory(saveWorld, {
    ...input,
    date: event.date,
    sourceEventId: event.id,
    sourceEventType: event.type,
    entities,
  });
  appendWorldHistoryEvent(saveWorld, {
    date: event.date,
    season: input.season ?? saveWorld.clock?.season,
    type: input.historyType ?? input.storyKey ?? event.type,
    category: input.category,
    importance: input.importance,
    title: input.headline,
    summary: input.summary,
    sourceEventId: event.id,
    sourceEventType: event.type,
    storyKey: input.storyKey,
    entities,
    data: input.data ?? event.payload ?? {},
  });
  return null;
}

function raceStory(saveWorld, event) {
  const race = event.payload ?? {};
  const classification = [...(race.classification ?? [])]
    .filter((row) => Number.isFinite(Number(row?.position)))
    .sort((a, b) => Number(a.position) - Number(b.position));
  const winner = classification.find((row) => Number(row.position) === 1) ?? classification[0];
  if (!winner) return null;
  const runnerUp = classification.find((row) => Number(row.position) === 2) ?? null;
  const third = classification.find((row) => Number(row.position) === 3) ?? null;
  const winnerId = winner.driverId ?? winner.driver_id;
  const winnerTeamId = winner.teamId ?? winner.team_id;
  const gpName = race.gpName ?? race.gp_name ?? race.name ?? race.gpId ?? race.gp_id ?? `Round ${race.round ?? ""}`.trim();
  const podium = [winner, runnerUp, third]
    .filter(Boolean)
    .map((row) => driverName(saveWorld, row.driverId ?? row.driver_id));

  emitStory(saveWorld, event, {
    storyKey: `race:${race.season ?? saveWorld.clock?.season}:${race.round ?? race.gpId ?? race.gp_id ?? event.date}`,
    historyType: "race_result",
    category: "race",
    importance: "high",
    headline: `${driverName(saveWorld, winnerId)} wins ${gpName}`,
    summary: `${teamName(saveWorld, winnerTeamId)} takes victory${podium.length > 1 ? ` ahead of ${podium.slice(1).join(" and ")}` : ""}.`,
    entities: [
      entity("driver", winnerId, driverName(saveWorld, winnerId)),
      entity("team", winnerTeamId, teamName(saveWorld, winnerTeamId)),
    ],
    tags: ["race", "winner"],
    data: {
      season: race.season ?? saveWorld.clock?.season,
      round: race.round ?? null,
      gpId: race.gpId ?? race.gp_id ?? null,
      winnerDriverId: winnerId ?? null,
      winnerTeamId: winnerTeamId ?? null,
      podiumDriverIds: [winner, runnerUp, third].filter(Boolean).map((row) => row.driverId ?? row.driver_id),
    },
  });

  const records = worldRecordsSummary(saveWorld);
  const driver = records.drivers.find((row) => String(row.id) === String(winnerId));
  const wins = Number(driver?.wins ?? 0);
  if (wins === 1) {
    appendWorldRecord(saveWorld, {
      recordKey: `driver:${winnerId}:first_win`,
      recordType: "first_race_win",
      entityType: "driver",
      entityId: winnerId,
      date: event.date,
      season: race.season ?? saveWorld.clock?.season,
      value: 1,
      title: `${driverName(saveWorld, winnerId)} records a first Formula One win`,
      context: { gpId: race.gpId ?? race.gp_id ?? null, gpName, teamId: winnerTeamId ?? null },
      sourceEventId: event.id,
    });
  } else if ([10, 25, 50, 75, 100].includes(wins)) {
    appendWorldRecord(saveWorld, {
      recordKey: `driver:${winnerId}:wins:${wins}`,
      recordType: "race_win_milestone",
      entityType: "driver",
      entityId: winnerId,
      date: event.date,
      season: race.season ?? saveWorld.clock?.season,
      value: wins,
      title: `${driverName(saveWorld, winnerId)} reaches ${wins} Formula One wins`,
      context: { gpId: race.gpId ?? race.gp_id ?? null, gpName, teamId: winnerTeamId ?? null },
      sourceEventId: event.id,
    });
  }
  return null;
}

function championshipStory(saveWorld, event) {
  const payload = event.payload ?? {};
  const season = Number(payload.season ?? saveWorld.clock?.season);
  const driverId = payload.driver_champion_id ?? payload.leader_driver_id ?? null;
  const teamId = payload.constructor_champion_id ?? payload.leader_constructor_id ?? null;
  const final = Boolean(payload.driver_champion_id || payload.constructor_champion_id);
  const driver = driverId ? driverName(saveWorld, driverId) : null;
  const team = teamId ? teamName(saveWorld, teamId) : null;
  const status = payload.standings_status ?? "archived";

  emitStory(saveWorld, event, {
    storyKey: `championship:${season}`,
    historyType: "championship_archived",
    category: "championship",
    importance: final ? "major" : "high",
    headline: final && driver && team
      ? `${driver} and ${team} crowned ${season} champions`
      : `${season} championship season archived`,
    summary: final
      ? `${driver ?? "The drivers' title"} and ${team ?? "the constructors' title"} close the season with status ${status}.`
      : `The ${season} standings were archived with status ${status}; unresolved title logic is preserved rather than invented.`,
    entities: [entity("driver", driverId, driver), entity("team", teamId, team)],
    tags: ["championship", "season"],
    season,
    data: payload,
  });

  if (payload.driver_champion_id) appendWorldRecord(saveWorld, {
    recordKey: `season:${season}:driver_champion`,
    recordType: "driver_championship",
    entityType: "driver",
    entityId: payload.driver_champion_id,
    date: event.date,
    season,
    value: 1,
    title: `${driverName(saveWorld, payload.driver_champion_id)} wins the ${season} Drivers' Championship`,
    context: { standingsStatus: status },
    sourceEventId: event.id,
  });
  if (payload.constructor_champion_id) appendWorldRecord(saveWorld, {
    recordKey: `season:${season}:constructor_champion`,
    recordType: "constructor_championship",
    entityType: "team",
    entityId: payload.constructor_champion_id,
    date: event.date,
    season,
    value: 1,
    title: `${teamName(saveWorld, payload.constructor_champion_id)} wins the ${season} Constructors' Championship`,
    context: { standingsStatus: status },
    sourceEventId: event.id,
  });
  return null;
}

function contractStory(saveWorld, event, mode) {
  const payload = event.payload ?? {};
  const type = String(payload.worker_type ?? "driver").toLowerCase() === "staff" ? "staff" : "driver";
  const id = payload.worker_id ?? null;
  const teamId = payload.team_id ?? null;
  if (!id || !teamId) return null;
  const currentSeason = Number(saveWorld.clock?.season);
  const start = Number(payload.contract_start ?? currentSeason);
  if (mode === "signed" && start > currentSeason) return null;
  const name = type === "driver" ? driverName(saveWorld, id) : staffName(saveWorld, id);
  const target = teamName(saveWorld, teamId);
  const role = String(payload.role ?? type).replaceAll("_", " ");
  const future = mode === "future_signed";
  const activated = mode === "future_activated";
  const headline = future
    ? `${name} agrees future move to ${target}`
    : activated
      ? `${name} joins ${target}`
      : `${target} signs ${name}`;

  emitStory(saveWorld, event, {
    storyKey: `contract:${mode}:${type}:${id}:${teamId}:${start}`,
    historyType: activated ? "contract_activated" : "contract_signed",
    category: type === "driver" ? "transfers" : "staff",
    importance: type === "driver" ? "high" : "normal",
    headline,
    summary: future
      ? `The ${role} agreement begins in ${start} and does not alter current employment early.`
      : activated
        ? `The previously agreed ${role} contract is now effective.`
        : `${name} has signed as ${role}${payload.contract_until ? ` through ${payload.contract_until}` : ""}.`,
    entities: [entity(type, id, name), entity("team", teamId, target)],
    tags: [type, "contract"],
    data: payload,
  });
  return null;
}

function retirementStory(saveWorld, event) {
  const payload = event.payload ?? {};
  const type = payload.worker_type === "staff" ? "staff" : "driver";
  const id = payload.worker_id ?? null;
  if (!id) return null;
  const name = type === "driver" ? driverName(saveWorld, id) : staffName(saveWorld, id);
  emitStory(saveWorld, event, {
    storyKey: `retirement:${type}:${id}`,
    historyType: "retirement",
    category: type === "driver" ? "drivers" : "staff",
    importance: type === "driver" ? "high" : "normal",
    headline: `${name} retires from Formula One`,
    summary: payload.age ? `${name} ends an active career at age ${payload.age}.` : `${name} has retired from the active Formula One world.`,
    entities: [entity(type, id, name)],
    tags: [type, "retirement"],
    data: payload,
  });
  return null;
}

function regulationTitle(saveWorld, proposalId) {
  const proposals = saveWorld.world?.governance?.regulations?.proposals ?? [];
  return proposals.find((row) => row.proposalId === proposalId)?.title ?? proposalId ?? "Regulation proposal";
}

function regulationStory(saveWorld, event) {
  const payload = event.payload ?? {};
  const proposalId = payload.proposal_id ?? null;
  const title = regulationTitle(saveWorld, proposalId);
  if (event.type === REGULATION_EVENT.PROPOSAL_RESOLVED) {
    emitStory(saveWorld, event, {
      storyKey: `regulation:resolved:${proposalId}`,
      historyType: "regulation_vote_resolved",
      category: "governance",
      importance: "high",
      headline: `${title} ${payload.accepted === true ? "approved" : "rejected"}`,
      summary: payload.accepted === true
        ? `The proposal has been accepted for season ${payload.target_season ?? "a future season"}.`
        : "The proposal did not secure approval and will not become an active rule package.",
      entities: [],
      tags: ["regulations", payload.accepted === true ? "approved" : "rejected"],
      data: payload,
    });
    return null;
  }
  emitStory(saveWorld, event, {
    storyKey: `regulation:enacted:${proposalId}:${payload.season ?? saveWorld.clock?.season}`,
    historyType: "regulation_enacted",
    category: "governance",
    importance: "major",
    headline: `${title} enters force`,
    summary: `The approved regulation package is now active for the ${payload.season ?? saveWorld.clock?.season} season.`,
    entities: [],
    tags: ["regulations", "enacted"],
    data: payload,
  });
  return null;
}

function teamEvolutionStory(saveWorld, event) {
  const payload = event.payload ?? {};
  const teamId = payload.team_id ?? null;
  const name = teamName(saveWorld, teamId);
  if (event.type === TEAM_EVOLUTION_EVENT.ENTRY_ACCEPTED) {
    const activated = payload.activated === true;
    emitStory(saveWorld, event, {
      storyKey: `team-entry:${activated ? "activated" : "accepted"}:${payload.application_id ?? teamId}:${payload.season ?? payload.target_season ?? ""}`,
      historyType: activated ? "team_entered_championship" : "team_entry_accepted",
      category: "teams",
      importance: "major",
      headline: activated ? `${name} joins the Formula One grid` : `${name} wins approval to enter Formula One`,
      summary: activated
        ? `${name} has become an active constructor for the ${payload.season ?? saveWorld.clock?.season} season.`
        : `${name} has been accepted for a proposed ${payload.target_season ?? "future"} entry, subject to the normal season transition.`,
      entities: [entity("team", teamId, name)],
      tags: ["team", "entry"],
      data: payload,
    });
    return null;
  }
  if (event.type === TEAM_EVOLUTION_EVENT.ENTRY_REJECTED) {
    emitStory(saveWorld, event, {
      storyKey: `team-entry:rejected:${payload.application_id ?? teamId}`,
      historyType: "team_entry_rejected",
      category: "teams",
      importance: "high",
      headline: `${name} entry application rejected`,
      summary: `${name} will not join the grid for ${payload.target_season ?? "the proposed season"}.`,
      entities: [entity("team", teamId, name)],
      tags: ["team", "entry"],
      data: payload,
    });
    return null;
  }
  if (event.type === TEAM_EVOLUTION_EVENT.TEAM_EXITED) {
    emitStory(saveWorld, event, {
      storyKey: `team-exit:${teamId}:${payload.season ?? saveWorld.clock?.season}`,
      historyType: "team_exited",
      category: "teams",
      importance: "major",
      headline: `${name} leaves Formula One`,
      summary: `${name} has exited the championship${payload.reason ? ` after ${String(payload.reason).replaceAll("_", " ")}` : ""}.`,
      entities: [entity("team", teamId, name)],
      tags: ["team", "exit"],
      data: payload,
    });
    return null;
  }
  const previous = payload.previous_name ?? payload.previousName ?? "its previous identity";
  const next = payload.new_name ?? payload.newName ?? name;
  emitStory(saveWorld, event, {
    storyKey: `team-rebrand:${payload.rebrand_id ?? payload.rebrandId ?? teamId}:${next}`,
    historyType: "team_rebranded",
    category: "teams",
    importance: "high",
    headline: `${previous} becomes ${next}`,
    summary: `The constructor retains its stable team identity while competing under the new ${next} brand.`,
    entities: [entity("team", teamId, next)],
    tags: ["team", "rebrand"],
    data: payload,
  });
  return null;
}

function managerStory(saveWorld, event) {
  const payload = event.payload ?? {};
  const teamId = payload.team_id ?? null;
  const name = managerName(saveWorld);
  const team = teamName(saveWorld, teamId);
  if (event.type === MANAGER_EVENT.DISMISSED) {
    emitStory(saveWorld, event, {
      storyKey: `manager:dismissed:${teamId}:${event.date}`,
      historyType: "manager_dismissed",
      category: "manager",
      importance: "major",
      headline: `${name} dismissed by ${team}`,
      summary: `${name}'s career continues as an unemployed manager; the Save World retains the full appointment history.`,
      entities: [entity("team", teamId, team)],
      tags: ["manager", "dismissal"],
      data: payload,
    });
    return null;
  }
  emitStory(saveWorld, event, {
    storyKey: `manager:appointed:${teamId}:${event.date}`,
    historyType: "manager_appointed",
    category: "manager",
    importance: "major",
    headline: `${name} appointed by ${team}`,
    summary: `${name} takes control of ${team} in the evolving career world.`,
    entities: [entity("team", teamId, team)],
    tags: ["manager", "appointment"],
    data: payload,
  });
  return null;
}

export function createWorldNarrativeSystem() {
  return {
    id: "world.narrative",
    eventTypes: [
      SIM_EVENT.CAREER_STARTED,
      RACE_EVENT.COMPLETED,
      CHAMPIONSHIP_EVENT.ARCHIVED,
      EMPLOYMENT_EVENT.CONTRACT_SIGNED,
      EMPLOYMENT_EVENT.FUTURE_CONTRACT_SIGNED,
      EMPLOYMENT_EVENT.FUTURE_CONTRACT_ACTIVATED,
      CAREER_EVENT.RETIRED,
      REGULATION_EVENT.PROPOSAL_RESOLVED,
      REGULATION_EVENT.PACKAGE_ENACTED,
      TEAM_EVOLUTION_EVENT.ENTRY_ACCEPTED,
      TEAM_EVOLUTION_EVENT.ENTRY_REJECTED,
      TEAM_EVOLUTION_EVENT.TEAM_EXITED,
      TEAM_EVOLUTION_EVENT.TEAM_REBRANDED,
      MANAGER_EVENT.APPOINTED,
      MANAGER_EVENT.DISMISSED,
    ],
    handle({ saveWorld, event }) {
      ensureWorldNarrative(saveWorld);
      if (event.type === SIM_EVENT.CAREER_STARTED) {
        emitStory(saveWorld, event, {
          storyKey: `career-start:${saveWorld.clock?.season}`,
          historyType: "career_started",
          category: "world",
          importance: "major",
          headline: `${saveWorld.clock?.season} Formula One world begins`,
          summary: "Historical starting conditions are now frozen. Every subsequent result, transfer, retirement and championship is simulation-owned alternative history.",
          entities: [],
          tags: ["career", "world"],
          data: { sourceSeason: saveWorld.meta?.sourceSeason ?? saveWorld.clock?.season },
        });
        return null;
      }
      if (event.type === RACE_EVENT.COMPLETED) return raceStory(saveWorld, event);
      if (event.type === CHAMPIONSHIP_EVENT.ARCHIVED) return championshipStory(saveWorld, event);
      if (event.type === EMPLOYMENT_EVENT.CONTRACT_SIGNED) return contractStory(saveWorld, event, "signed");
      if (event.type === EMPLOYMENT_EVENT.FUTURE_CONTRACT_SIGNED) return contractStory(saveWorld, event, "future_signed");
      if (event.type === EMPLOYMENT_EVENT.FUTURE_CONTRACT_ACTIVATED) return contractStory(saveWorld, event, "future_activated");
      if (event.type === CAREER_EVENT.RETIRED) return retirementStory(saveWorld, event);
      if ([REGULATION_EVENT.PROPOSAL_RESOLVED, REGULATION_EVENT.PACKAGE_ENACTED].includes(event.type)) return regulationStory(saveWorld, event);
      if ([TEAM_EVOLUTION_EVENT.ENTRY_ACCEPTED, TEAM_EVOLUTION_EVENT.ENTRY_REJECTED, TEAM_EVOLUTION_EVENT.TEAM_EXITED, TEAM_EVOLUTION_EVENT.TEAM_REBRANDED].includes(event.type)) return teamEvolutionStory(saveWorld, event);
      if ([MANAGER_EVENT.APPOINTED, MANAGER_EVENT.DISMISSED].includes(event.type)) return managerStory(saveWorld, event);
      return null;
    },
  };
}
