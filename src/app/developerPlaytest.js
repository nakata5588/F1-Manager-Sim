import { createCareerFromSeasonDatabase } from "../data/careerBootstrap.js";
import { validateSeasonDatabasePayload } from "../data/seasonDatabase.js";
import {
  advanceLiveRaceSession,
  applyLiveStrategyInstruction,
  applyPreRaceStartingTyre,
  getLiveRaceSession,
  startLiveRaceSession,
} from "../sim/liveRaceController.js";
import { createRaceStartBaseline } from "../sim/raceStartBaseline.js";
import { availableTyreCompounds } from "../sim/raceStrategy.js";
import { currentStrategyStint } from "../sim/liveStrategy.js";
import { adjustWeekendSetup } from "../sim/weekendSetup.js";
import { advanceDays, dispatchSimulationEvents, initializeSimulation, SIM_EVENT } from "../sim/timeEngine.js";
import { createCoreWorldSystems } from "../sim/systems/coreWorldSystems.js";
import { createRaceWeekendSystem, RACE_EVENT } from "../sim/systems/raceWeekend.js";

function text(value, fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 3) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(digits)) : null;
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

function normaliseEvent(raw, date, sequence) {
  return {
    id: `playtest:${date}:${String(sequence).padStart(2, "0")}:${raw.type}`,
    sequence,
    type: raw.type,
    date,
    payload: raw.payload ?? {},
  };
}

function activeWeekend(saveWorld, weekendKey = null) {
  const active = saveWorld.world?.raceWeekendState?.active ?? {};
  if (weekendKey && active[weekendKey]) return active[weekendKey];
  const values = Object.values(active);
  return values.find((row) => row?.phase !== "completed") ?? values.at?.(-1) ?? values[values.length - 1] ?? null;
}

function controlledDriverSet(saveWorld, controlledTeamId) {
  return new Set(activeTeamDrivers(saveWorld, controlledTeamId).map((row) => row.id));
}

function compoundsForTeam(saveWorld, controlledTeamId) {
  const rows = [
    ...availableTyreCompounds(saveWorld, false, controlledTeamId),
    ...availableTyreCompounds(saveWorld, true, controlledTeamId),
  ];
  const unique = new Map();
  for (const row of rows) {
    if (!row?.compoundId) continue;
    unique.set(String(row.compoundId), {
      id: row.compoundId,
      name: row.name || String(row.compoundId),
      condition: row.condition ?? "dry",
      durabilityLaps: row.durabilityLaps ?? null,
    });
  }
  return [...unique.values()];
}

function projectPractice(saveWorld, weekend, controlledTeamId) {
  if (!weekend?.practice) return null;
  const drivers = driverLookup(saveWorld);
  const controlled = controlledDriverSet(saveWorld, controlledTeamId);
  return {
    windows: weekend.practice.windows,
    source: weekend.practice.source,
    team: (weekend.practice.results ?? [])
      .filter((row) => controlled.has(row.driverId))
      .map((row) => ({
        driverId: row.driverId,
        driverName: driverName(drivers.get(row.driverId)),
        setupKnowledge: round(row.setupKnowledge, 1),
        setupQuality: round(row.setupQuality, 1),
        setup: structuredClone(row.setup ?? {}),
        playerAdjusted: Boolean(row.playerAdjusted),
      })),
  };
}

function projectQualifying(saveWorld, weekend, controlledTeamId) {
  const rows = weekend?.qualifying?.classification ?? [];
  const drivers = driverLookup(saveWorld);
  const teams = teamLookup(saveWorld);
  return {
    sessions: weekend?.qualifying?.sessions ?? null,
    maxStarters: weekend?.qualifying?.maxStarters ?? null,
    classification: rows.map((row) => ({
      position: row.position,
      driverId: row.driverId,
      driverName: driverName(drivers.get(row.driverId)),
      teamId: row.teamId,
      teamName: teamName(teams.get(row.teamId)),
      status: row.status,
      score: round(row.score, 3),
      controlled: row.teamId === controlledTeamId,
    })),
  };
}

function projectGrid(saveWorld, weekend, controlledTeamId) {
  const drivers = driverLookup(saveWorld);
  const teams = teamLookup(saveWorld);
  return (weekend?.grid ?? []).map((row) => ({
    position: Number(row.grid),
    driverId: row.driverId,
    driverName: driverName(drivers.get(row.driverId)),
    teamId: row.teamId,
    teamName: teamName(teams.get(row.teamId)),
    controlled: row.teamId === controlledTeamId,
  }));
}

function strategyRows(saveWorld, weekend, liveSession, controlledTeamId) {
  const drivers = driverLookup(saveWorld);
  const controlled = controlledDriverSet(saveWorld, controlledTeamId);
  const strategies = liveSession?.weekend?.strategies ?? weekend?.strategies ?? {};
  return Object.entries(strategies)
    .filter(([id]) => controlled.has(id))
    .map(([id, plan]) => ({
      driverId: id,
      driverName: driverName(drivers.get(id)),
      source: plan.source ?? null,
      plannedStops: Number(plan.plannedStops ?? Math.max(0, (plan.stints ?? []).length - 1)),
      startingCompoundId: plan.stints?.[0]?.compoundId ?? null,
      stints: (plan.stints ?? []).map((stint) => ({
        stint: stint.stint,
        compoundId: stint.compoundId,
        targetLaps: stint.targetLaps,
        condition: stint.condition ?? plan.condition ?? null,
      })),
    }));
}

function liveOrder(saveWorld, session, controlledTeamId) {
  if (!session) return [];
  const drivers = driverLookup(saveWorld);
  const teams = teamLookup(saveWorld);
  const gridByDriver = new Map((session.weekend?.grid ?? []).map((row) => [row.driverId, row]));
  const stateRows = session.status === "completed"
    ? Object.fromEntries((session.result?.classification ?? []).map((row) => [row.driverId, row]))
    : session.resumeState?.states ?? {};
  const orderIds = session.status === "completed"
    ? (session.result?.classification ?? []).map((row) => row.driverId)
    : session.resumeState?.order ?? (session.weekend?.grid ?? []).map((row) => row.driverId);
  const running = orderIds.map((id) => stateRows[id]).filter(Boolean);
  const leaderElapsed = running.find((row) => row.status === "RUNNING" || row.status === "FINISHED")?.elapsedIndex ?? running[0]?.raceIndex ?? 0;

  return orderIds.map((id, index) => {
    const state = stateRows[id] ?? {};
    const grid = gridByDriver.get(id) ?? {};
    const plan = session.weekend?.strategies?.[id];
    const active = currentStrategyStint(plan, Math.max(1, Number(session.currentLap ?? 0) + 1));
    const elapsed = numeric(state.elapsedIndex, numeric(state.raceIndex, leaderElapsed));
    const wear = numeric(state.tyreWear);
    return {
      position: index + 1,
      driverId: id,
      driverName: driverName(drivers.get(id)),
      teamId: grid.teamId ?? state.teamId ?? null,
      teamName: teamName(teams.get(grid.teamId ?? state.teamId)),
      controlled: (grid.teamId ?? state.teamId) === controlledTeamId,
      status: state.status ?? (session.currentLap === 0 ? "READY" : "RUNNING"),
      completedLaps: Number(state.completedLaps ?? session.currentLap ?? 0),
      gapIndex: index === 0 ? 0 : round(Math.max(0, elapsed - leaderElapsed), 3),
      compoundId: active?.stint?.compoundId ?? active?.compoundId ?? null,
      tyreWearPercent: wear === null ? null : round(wear * 100, 1),
      tyreTemperature: state.tyreThermal?.status ?? null,
      tyreTemperatureIndex: round(state.tyreThermal?.temperatureIndex, 1),
      fuelKg: round(state.fuelKg, 2),
      damagePaceLoss: round(state.damagePaceLoss, 3),
      pitStops: Number(state.pitStopsCompleted ?? 0),
    };
  });
}

function projectRaceEvents(saveWorld, session) {
  const drivers = driverLookup(saveWorld);
  return (session?.latestEvents ?? []).slice(-12).map((row, index) => ({
    id: `${row.lap ?? session.currentLap}:${row.sectorId ?? ""}:${row.type}:${row.driverId ?? ""}:${index}`,
    lap: row.lap ?? null,
    type: row.type ?? "event",
    driverId: row.driverId ?? null,
    driverName: row.driverId ? driverName(drivers.get(row.driverId)) : null,
    sectorName: row.sectorName ?? row.sectorId ?? null,
    reason: row.reason ?? null,
    control: row.control ?? null,
    from: row.from ?? null,
    to: row.to ?? null,
    compoundId: row.compoundId ?? null,
  }));
}

function projectLiveRace(saveWorld, controlledTeamId) {
  const session = getLiveRaceSession(saveWorld);
  if (!session) return null;
  const attention = session.latestAttentionEvents?.at?.(-1)
    ?? session.latestAttentionEvents?.[session.latestAttentionEvents.length - 1]
    ?? null;
  return {
    status: session.status,
    currentLap: session.currentLap,
    totalLaps: session.totalLaps,
    progress: session.totalLaps ? round(session.currentLap / session.totalLaps, 4) : 0,
    gpId: session.gpId,
    weather: session.resumeState?.lastCondition ?? null,
    activeControl: session.resumeState?.activeControl?.type ?? null,
    strategyRevisions: session.strategyRevisions ?? [],
    attentionRequired: Boolean(attention),
    attentionToken: attention ? `${attention.lap ?? session.currentLap}:${attention.type}:${attention.driverId ?? attention.control ?? ""}` : null,
    latestEvents: projectRaceEvents(saveWorld, session),
    order: liveOrder(saveWorld, session, controlledTeamId),
    strategies: strategyRows(saveWorld, null, session, controlledTeamId),
    tyreOptions: compoundsForTeam(saveWorld, controlledTeamId),
  };
}

function projectWeekend(saveWorld, weekend, controlledTeamId) {
  if (!weekend) return null;
  const live = getLiveRaceSession(saveWorld);
  return {
    key: weekend.key,
    stage: weekend.phase,
    gpId: weekend.gpId,
    name: weekend.gpName ?? weekend.gpId,
    round: weekend.round,
    date: weekend.date,
    trackId: weekend.trackId,
    trackName: weekend.trackName,
    weather: weekend.race?.weather_condition ?? weekend.race?.weather ?? null,
    practice: projectPractice(saveWorld, weekend, controlledTeamId),
    qualifying: projectQualifying(saveWorld, weekend, controlledTeamId),
    grid: projectGrid(saveWorld, weekend, controlledTeamId),
    strategies: strategyRows(saveWorld, weekend, live, controlledTeamId),
    tyreOptions: compoundsForTeam(saveWorld, controlledTeamId),
  };
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
  delete archived.raceStartBaseline;
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
    this.weekendSystem = createRaceWeekendSystem();
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

  requireControlledDriver(driverIdValue) {
    const saveWorld = this.requireCareer();
    const id = text(driverIdValue).trim();
    if (!id) throw new Error("driverId is required.");
    if (!controlledDriverSet(saveWorld, this.controlledTeamId).has(id)) {
      throw new Error("This action can only target a driver from the controlled team.");
    }
    return id;
  }

  beginRaceWeekend(race) {
    const saveWorld = this.requireCareer();
    const date = raceDate(race);
    const event = normaliseEvent({
      type: SIM_EVENT.RACE_DAY,
      payload: {
        gp_id: race.gp_id ?? null,
        gp_name: raceName(race),
        track_id: race.track_id ?? race.circuit_id ?? null,
        round: race.round ?? null,
      },
    }, date, 0);
    const emitted = this.weekendSystem.handle({ saveWorld, event });
    if (emitted?.type !== RACE_EVENT.WEEKEND_STARTED) {
      throw new Error(`Race weekend failed to start (${emitted?.type ?? "no event"}).`);
    }
    this.lastWeekendKey = emitted.payload?.weekend_key ?? null;
    dispatchSimulationEvents(saveWorld, [normaliseEvent(emitted, date, 1)], this.systems);
    return this.state();
  }

  continue() {
    const saveWorld = this.requireCareer();
    const weekend = activeWeekend(saveWorld, this.lastWeekendKey);
    if (weekend && weekend.phase !== "completed") {
      throw new Error("Complete the active race weekend before continuing the calendar.");
    }
    const race = nextRace(saveWorld, false);
    if (!race) return this.state();
    const days = daysBetween(saveWorld.clock.date, raceDate(race));
    if (days === null || days < 0) throw new Error("Next race has an invalid calendar date.");
    advanceDays(saveWorld, days, this.systems);
    return this.beginRaceWeekend(race);
  }

  advanceWeekend() {
    const saveWorld = this.requireCareer();
    const weekend = activeWeekend(saveWorld, this.lastWeekendKey);
    if (!weekend) throw new Error("No active race weekend.");
    const date = weekend.date ?? saveWorld.clock.date;

    if (weekend.phase === "started") {
      const event = normaliseEvent({
        type: RACE_EVENT.WEEKEND_STARTED,
        payload: { weekend_key: weekend.key, gp_id: weekend.gpId },
      }, date, 2);
      const emitted = this.weekendSystem.handle({ saveWorld, event });
      if (emitted?.type !== RACE_EVENT.PRACTICE_COMPLETED) throw new Error("Practice did not complete correctly.");
      dispatchSimulationEvents(saveWorld, [normaliseEvent(emitted, date, 3)], this.systems);
      return this.state();
    }

    if (weekend.phase === "practice_completed") {
      const event = normaliseEvent({
        type: RACE_EVENT.PRACTICE_COMPLETED,
        payload: { weekend_key: weekend.key, gp_id: weekend.gpId },
      }, date, 4);
      const emitted = this.weekendSystem.handle({ saveWorld, event });
      if (emitted?.type !== RACE_EVENT.QUALIFYING_COMPLETED) throw new Error("Qualifying did not complete correctly.");
      dispatchSimulationEvents(saveWorld, [normaliseEvent(emitted, date, 5)], this.systems);
      return this.state();
    }

    if (weekend.phase === "qualifying_completed") {
      const event = normaliseEvent({
        type: RACE_EVENT.QUALIFYING_COMPLETED,
        payload: { weekend_key: weekend.key, gp_id: weekend.gpId },
      }, date, 6);
      const emitted = this.weekendSystem.handle({ saveWorld, event });
      if (emitted?.type !== RACE_EVENT.GRID_SET) throw new Error("Grid could not be set.");
      const gridEvent = normaliseEvent(emitted, date, 7);
      dispatchSimulationEvents(saveWorld, [gridEvent], this.systems);

      weekend.raceStartBaseline = createRaceStartBaseline(saveWorld, weekend);
      weekend.phase = "pre_race";
      startLiveRaceSession(saveWorld, weekend, { raceStartBaseline: weekend.raceStartBaseline });
      return this.state();
    }

    throw new Error(`Race weekend cannot advance from phase '${weekend.phase}'.`);
  }

  changeSetup(driverIdValue, setup) {
    const saveWorld = this.requireCareer();
    const id = this.requireControlledDriver(driverIdValue);
    const weekend = activeWeekend(saveWorld, this.lastWeekendKey);
    if (!weekend) throw new Error("No active race weekend.");
    adjustWeekendSetup(saveWorld, weekend.key, id, setup ?? {});
    return this.state();
  }

  changeStartingTyre(driverIdValue, compoundId) {
    const saveWorld = this.requireCareer();
    const id = this.requireControlledDriver(driverIdValue);
    const weekend = activeWeekend(saveWorld, this.lastWeekendKey);
    if (!weekend || weekend.phase !== "pre_race") throw new Error("Starting tyres can only be changed in Pre-Race.");
    applyPreRaceStartingTyre(saveWorld, id, compoundId, { source: "developer_playtest_ui" });
    return this.state();
  }

  startRace() {
    const saveWorld = this.requireCareer();
    const weekend = activeWeekend(saveWorld, this.lastWeekendKey);
    const live = getLiveRaceSession(saveWorld);
    if (!weekend || weekend.phase !== "pre_race" || !live || live.currentLap !== 0) {
      throw new Error("The race is not ready to start.");
    }
    weekend.phase = "race_live";
    return this.state();
  }

  advanceRace(laps = 1) {
    const saveWorld = this.requireCareer();
    const weekend = activeWeekend(saveWorld, this.lastWeekendKey);
    if (!weekend || weekend.phase !== "race_live") throw new Error("The race has not started.");
    const outcome = advanceLiveRaceSession(saveWorld, { laps: Number(laps) });
    if (outcome.completed) this.finalizeLiveRace();
    return this.state();
  }

  finishRace() {
    const saveWorld = this.requireCareer();
    const weekend = activeWeekend(saveWorld, this.lastWeekendKey);
    if (!weekend || weekend.phase !== "race_live") throw new Error("The race has not started.");
    const session = getLiveRaceSession(saveWorld);
    if (!session) throw new Error("No live race is active.");
    const outcome = advanceLiveRaceSession(saveWorld, { toLap: session.totalLaps });
    if (outcome.completed) this.finalizeLiveRace();
    return this.state();
  }

  changeStrategy(driverIdValue, instruction) {
    const saveWorld = this.requireCareer();
    const id = this.requireControlledDriver(driverIdValue);
    const weekend = activeWeekend(saveWorld, this.lastWeekendKey);
    if (!weekend || weekend.phase !== "race_live") throw new Error("Live strategy changes require an active race.");
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
    const weekend = activeWeekend(saveWorld, this.lastWeekendKey);
    const lastRace = (saveWorld.history?.races ?? []).at?.(-1) ?? null;
    const upcoming = nextRace(saveWorld, false);

    let screen = "home";
    if (weekend?.phase === "started") screen = "practice";
    else if (weekend?.phase === "practice_completed") screen = "practice_results";
    else if (weekend?.phase === "qualifying_completed") screen = "qualifying_results";
    else if (weekend?.phase === "pre_race") screen = "pre_race";
    else if (weekend?.phase === "race_live") screen = "race";
    else if (weekend?.phase === "completed" && live?.status === "completed") screen = "race_results";

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
      raceWeekend: projectWeekend(saveWorld, weekend, this.controlledTeamId),
      liveRace: live,
      lastRace: lastRace ? {
        key: lastRace.key,
        gpId: lastRace.gpId,
        name: lastRace.gpName ?? lastRace.name ?? lastRace.gpId,
        classification: (lastRace.classification ?? []).slice(0, 20).map((row) => ({
          ...row,
          driverName: driverName(driverLookup(saveWorld).get(row.driverId)),
          teamName: teamName(teamLookup(saveWorld).get(row.teamId)),
        })),
      } : null,
      standings: {
        drivers: labelledStandings(saveWorld, "drivers").slice(0, 20),
        constructors: labelledStandings(saveWorld, "constructors").slice(0, 20),
      },
    };
  }
}
