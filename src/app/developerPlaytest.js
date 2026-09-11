import { createCareerFromSeasonDatabase } from "../data/careerBootstrap.js";
import { validateSeasonDatabasePayload } from "../data/seasonDatabase.js";
import {
  advanceLiveRaceSession,
  applyLiveStrategyInstruction,
  getLiveRaceSession,
  startLiveRaceSession,
} from "../sim/liveRaceController.js";
import { advanceDays, dispatchSimulationEvents, initializeSimulation, SIM_EVENT } from "../sim/timeEngine.js";
import { createCoreWorldSystems } from "../sim/systems/coreWorldSystems.js";
import { createRaceWeekendSystem, RACE_EVENT } from "../sim/systems/raceWeekend.js";

function text(value, fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

function dateOnly(value) {
  return text(value).slice(0, 10);
}

function daysBetween(from, to) {
  const start = Date.parse(`${dateOnly(from)}T00:00:00Z`);
  const end = Date.parse(`${dateOnly(to)}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

function teamId(row) {
  return row?.team_id ?? row?.id ?? null;
}

function teamName(row) {
  return row?.team_name ?? row?.display_name ?? row?.name ?? teamId(row) ?? "Unknown Team";
}

function driverId(row) {
  return row?.driver_id ?? row?.id ?? null;
}

function driverName(row) {
  return row?.display_name ?? row?.driver_name ?? row?.name ?? driverId(row) ?? "Unknown Driver";
}

function raceDate(row) {
  return dateOnly(row?.race_date ?? row?.date ?? "");
}

function raceId(row) {
  return row?.gp_id ?? row?.race_id ?? `${row?.year ?? ""}-${row?.round ?? ""}`;
}

function raceName(row) {
  return row?.gp_name ?? row?.race_name ?? row?.name ?? raceId(row) ?? "Grand Prix";
}

function nextRace(saveWorld, includeToday = false) {
  const today = dateOnly(saveWorld.clock?.date);
  return [...(saveWorld.world?.calendar ?? [])]
    .filter((row) => {
      const date = raceDate(row);
      return date && (includeToday ? date >= today : date > today);
    })
    .sort((a, b) => raceDate(a).localeCompare(raceDate(b)) || Number(a.round ?? 0) - Number(b.round ?? 0))[0] ?? null;
}

function driverLookup(saveWorld) {
  return new Map((saveWorld.world?.drivers ?? []).map((row) => [driverId(row), row]));
}

function teamLookup(saveWorld) {
  return new Map((saveWorld.world?.teams ?? []).map((row) => [teamId(row), row]));
}

function activeTeamDrivers(saveWorld, controlledTeamId) {
  const drivers = driverLookup(saveWorld);
  const assignments = saveWorld.world?.employment?.drivers ?? {};
  return Object.entries(assignments)
    .filter(([, row]) => row?.status === "employed" && row?.teamId === controlledTeamId)
    .map(([id, assignment]) => ({
      id,
      name: driverName(drivers.get(id)),
      role: assignment.role ?? "driver",
    }))
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
}

function standings(saveWorld, type) {
  const championship = saveWorld.world?.championship ?? {};
  const rows = Object.entries(type === "constructors" ? championship.constructors ?? {} : championship.drivers ?? {});
  return rows
    .map(([id, row]) => ({
      id,
      points: Number(row?.countedPoints ?? row?.points ?? 0),
      grossPoints: Number(row?.points ?? 0),
      wins: Number(row?.wins ?? 0),
    }))
    .sort((a, b) => b.points - a.points || b.wins - a.wins || a.id.localeCompare(b.id));
}

function labelledStandings(saveWorld, type) {
  const drivers = driverLookup(saveWorld);
  const teams = teamLookup(saveWorld);
  return standings(saveWorld, type).map((row, index) => ({
    position: index + 1,
    ...row,
    name: type === "constructors" ? teamName(teams.get(row.id)) : driverName(drivers.get(row.id)),
  }));
}

function liveOrder(saveWorld, session) {
  if (!session) return [];
  if (session.status === "completed") {
    return (session.result?.classification ?? []).map((row) => ({
      position: Number(row.position),
      driverId: row.driverId,
      status: row.status ?? "FINISHED",
      completedLaps: Number(row.completedLaps ?? session.totalLaps),
    }));
  }
  const snapshots = session.resumeState?.snapshots ?? [];
  const latest = snapshots.at?.(-1) ?? snapshots[snapshots.length - 1];
  if (latest?.order?.length) return latest.order;
  return (session.weekend?.grid ?? []).map((row, index) => ({
    position: Number(row.position ?? row.grid ?? index + 1),
    driverId: row.driverId,
    status: "RUNNING",
    completedLaps: Number(session.currentLap ?? 0),
  }));
}

function projectLiveRace(saveWorld, controlledTeamId) {
  const session = getLiveRaceSession(saveWorld);
  if (!session) return null;
  const drivers = driverLookup(saveWorld);
  const teams = teamLookup(saveWorld);
  const gridByDriver = new Map((session.weekend?.grid ?? []).map((row) => [row.driverId, row]));
  return {
    status: session.status,
    currentLap: session.currentLap,
    totalLaps: session.totalLaps,
    gpId: session.gpId,
    strategyRevisions: session.strategyRevisions ?? [],
    order: liveOrder(saveWorld, session).map((row) => {
      const grid = gridByDriver.get(row.driverId) ?? {};
      const team = teams.get(grid.teamId);
      return {
        ...row,
        driverName: driverName(drivers.get(row.driverId)),
        teamId: grid.teamId ?? null,
        teamName: teamName(team),
        controlled: grid.teamId === controlledTeamId,
      };
    }),
  };
}

function normaliseEvent(raw, date, sequence) {
  return {
    id: `playtest:${date}:${String(sequence).padStart(2, "0")}:${raw.type}`,
    sequence,
    type: raw.type,
    date,
    payload: raw.payload ?? {},
  };
}

function removeAggregateArchive(saveWorld, weekendKey) {
  saveWorld.history.races = (saveWorld.history?.races ?? []).filter((row) => row.key !== weekendKey);
  const state = saveWorld.simulation?.systemState?.["race.weekend"];
  if (state?.completed) state.completed = state.completed.filter((key) => key !== weekendKey);
}

function archiveLiveWeekend(saveWorld, weekend, liveSession) {
  weekend.classification = structuredClone(liveSession.result?.classification ?? []);
  weekend.timeline = structuredClone(liveSession.result?.timeline ?? null);
  weekend.strategies = structuredClone(liveSession.weekend?.strategies ?? weekend.strategies ?? {});
  weekend.strategyApplied = true;
  weekend.phase = "completed";
  weekend.liveRace = true;

  const state = saveWorld.simulation.systemState["race.weekend"] ??= { completed: [] };
  if (!state.completed.includes(weekend.key)) state.completed.push(weekend.key);
  state.completed.sort();

  const archived = structuredClone(weekend);
  delete archived.race;
  saveWorld.history.races ??= [];
  saveWorld.history.races.push(archived);
  return archived;
}

export function listDeveloperPlaytestTeams(seasonDatabasePayload) {
  validateSeasonDatabasePayload(seasonDatabasePayload);
  return (seasonDatabasePayload.snapshot?.teams ?? [])
    .map((row) => ({
      id: teamId(row),
      name: teamName(row),
      nationality: row.nationality ?? row.country ?? null,
      constructorName: row.constructor_name ?? null,
    }))
    .filter((row) => row.id)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export class DeveloperPlaytestSession {
  constructor(seasonDatabasePayload, options = {}) {
    validateSeasonDatabasePayload(seasonDatabasePayload);
    this.seasonDatabase = seasonDatabasePayload;
    this.globalDatabase = options.globalDatabase ?? null;
    this.saveWorld = null;
    this.systems = [];
    this.controlledTeamId = null;
    this.managerName = null;
    this.lastWeekendKey = null;
  }

  setup() {
    return {
      season: Number(this.seasonDatabase.season),
      databaseVersion: this.seasonDatabase.databaseVersion ?? null,
      releaseName: this.seasonDatabase.releaseName ?? null,
      teams: listDeveloperPlaytestTeams(this.seasonDatabase),
    };
  }

  startCareer(options = {}) {
    const managerName = text(options.managerName).trim();
    const controlledTeamId = text(options.teamId).trim();
    if (!managerName) throw new Error("Manager name is required.");
    if (!listDeveloperPlaytestTeams(this.seasonDatabase).some((row) => row.id === controlledTeamId)) {
      throw new Error(`Team '${controlledTeamId}' is not available in this Season Database.`);
    }

    const saveWorld = createCareerFromSeasonDatabase(this.seasonDatabase, {
      globalDatabase: this.globalDatabase,
      seed: options.seed ?? `${this.seasonDatabase.season}-${controlledTeamId}-${managerName}`,
      startDate: options.startDate ?? `${this.seasonDatabase.season}-01-01`,
    });
    saveWorld.player = {
      manager: { name: managerName },
      controlledTeamIds: [controlledTeamId],
    };

    this.controlledTeamId = controlledTeamId;
    this.managerName = managerName;
    this.saveWorld = saveWorld;
    this.systems = createCoreWorldSystems({ controlledTeamIds: [controlledTeamId] })
      .filter((system) => !["race.weekend", "race.timeline"].includes(system.id));
    initializeSimulation(this.saveWorld, this.systems);
    return this.state();
  }

  requireCareer() {
    if (!this.saveWorld) throw new Error("No developer playtest career has been started.");
    return this.saveWorld;
  }

  prepareRaceWeekend(race) {
    const saveWorld = this.requireCareer();
    const date = raceDate(race);
    const system = createRaceWeekendSystem();
    let current = normaliseEvent({
      type: SIM_EVENT.RACE_DAY,
      payload: {
        gp_id: race.gp_id ?? null,
        gp_name: raceName(race),
        track_id: race.track_id ?? race.circuit_id ?? null,
        round: race.round ?? null,
      },
    }, date, 0);

    let emitted = system.handle({ saveWorld, event: current });
    for (let step = 1; step <= 3; step += 1) {
      if (!emitted?.type) throw new Error("Race weekend failed to advance to the grid.");
      current = normaliseEvent(emitted, date, step);
      dispatchSimulationEvents(saveWorld, [current], this.systems);
      emitted = system.handle({ saveWorld, event: current });
    }

    if (emitted?.type !== RACE_EVENT.GRID_SET) {
      throw new Error(`Race weekend expected GRID_SET, received '${emitted?.type ?? "nothing"}'.`);
    }
    const gridEvent = normaliseEvent(emitted, date, 4);
    dispatchSimulationEvents(saveWorld, [gridEvent], this.systems);

    const aggregateCompleted = system.handle({ saveWorld, event: gridEvent });
    const weekendKey = gridEvent.payload?.weekend_key;
    const weekend = saveWorld.world?.raceWeekendState?.active?.[weekendKey];
    if (!weekend || aggregateCompleted?.type !== RACE_EVENT.COMPLETED) {
      throw new Error("Race weekend failed to build a live-race baseline.");
    }

    removeAggregateArchive(saveWorld, weekendKey);
    weekend.phase = "race_ready";
    this.lastWeekendKey = weekendKey;
    startLiveRaceSession(saveWorld, weekend);
    return this.state();
  }

  continue() {
    const saveWorld = this.requireCareer();
    const race = nextRace(saveWorld, false);
    if (!race) return this.state();
    const days = daysBetween(saveWorld.clock.date, raceDate(race));
    if (days === null || days < 0) throw new Error("Next race has an invalid calendar date.");
    advanceDays(saveWorld, days, this.systems);
    return this.prepareRaceWeekend(race);
  }

  advanceRace(laps = 1) {
    const saveWorld = this.requireCareer();
    const outcome = advanceLiveRaceSession(saveWorld, { laps: Number(laps) });
    if (outcome.completed) this.finalizeLiveRace();
    return this.state();
  }

  finishRace() {
    const saveWorld = this.requireCareer();
    const session = getLiveRaceSession(saveWorld);
    if (!session) throw new Error("No live race is active.");
    const outcome = advanceLiveRaceSession(saveWorld, { toLap: session.totalLaps });
    if (outcome.completed) this.finalizeLiveRace();
    return this.state();
  }

  changeStrategy(driverIdValue, instruction) {
    const saveWorld = this.requireCareer();
    const id = text(driverIdValue).trim();
    if (!id) throw new Error("driverId is required.");
    const controlledDrivers = new Set(activeTeamDrivers(saveWorld, this.controlledTeamId).map((row) => row.id));
    if (!controlledDrivers.has(id)) throw new Error("Live strategy can only be changed for the controlled team.");
    applyLiveStrategyInstruction(saveWorld, id, instruction ?? {}, { source: "developer_playtest_ui" });
    return this.state();
  }

  finalizeLiveRace() {
    const saveWorld = this.requireCareer();
    const session = getLiveRaceSession(saveWorld);
    if (!session || session.status !== "completed") return null;
    const key = session.weekendKey;
    if ((saveWorld.history?.races ?? []).some((row) => row.key === key && row.liveRace)) return null;
    const weekend = saveWorld.world?.raceWeekendState?.active?.[key];
    if (!weekend) throw new Error(`Active weekend '${key}' is missing during live-race finalization.`);
    const archived = archiveLiveWeekend(saveWorld, weekend, session);
    dispatchSimulationEvents(saveWorld, [{
      type: RACE_EVENT.COMPLETED,
      date: saveWorld.clock.date,
      payload: archived,
    }], this.systems);
    return archived;
  }

  state() {
    if (!this.saveWorld) return { screen: "new_career", setup: this.setup() };
    const saveWorld = this.saveWorld;
    const teams = teamLookup(saveWorld);
    const team = teams.get(this.controlledTeamId);
    const live = projectLiveRace(saveWorld, this.controlledTeamId);
    const lastRace = (saveWorld.history?.races ?? []).at?.(-1) ?? null;
    const upcoming = nextRace(saveWorld, live ? false : true);
    const screen = live && live.status !== "completed"
      ? "race"
      : live?.status === "completed"
        ? "race_results"
        : "home";

    return {
      screen,
      career: {
        managerName: this.managerName,
        controlledTeamId: this.controlledTeamId,
        teamName: teamName(team),
        season: saveWorld.clock.season,
        date: saveWorld.clock.date,
      },
      teamDrivers: activeTeamDrivers(saveWorld, this.controlledTeamId),
      nextRace: upcoming ? {
        id: raceId(upcoming),
        name: raceName(upcoming),
        date: raceDate(upcoming),
        round: Number(upcoming.round ?? 0),
      } : null,
      liveRace: live,
      lastRace: lastRace ? {
        key: lastRace.key,
        gpId: lastRace.gpId,
        name: lastRace.gpName ?? lastRace.name ?? lastRace.gpId,
        classification: (lastRace.classification ?? []).slice(0, 10).map((row) => ({
          ...row,
          driverName: driverName(driverLookup(saveWorld).get(row.driverId)),
          teamName: teamName(teamLookup(saveWorld).get(row.teamId)),
        })),
      } : null,
      standings: {
        drivers: labelledStandings(saveWorld, "drivers").slice(0, 10),
        constructors: labelledStandings(saveWorld, "constructors").slice(0, 10),
      },
    };
  }
}
