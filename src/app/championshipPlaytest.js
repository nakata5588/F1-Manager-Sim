function text(value, fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

function dateOnly(value) {
  return text(value).slice(0, 10);
}

function number(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function raceId(row = {}) {
  return row.gp_id ?? row.gpId ?? row.race_id ?? row.raceId ?? `${row.year ?? row.season ?? ""}-${row.round ?? ""}`;
}

function raceName(row = {}) {
  return row.gp_name ?? row.gpName ?? row.race_name ?? row.raceName ?? row.name ?? raceId(row) ?? "Grand Prix";
}

function raceDate(row = {}) {
  return dateOnly(row.race_date ?? row.raceDate ?? row.date ?? "");
}

function teamId(row = {}) {
  return row.team_id ?? row.teamId ?? row.id ?? null;
}

function teamName(row = {}) {
  return row.team_name ?? row.display_name ?? row.name ?? teamId(row) ?? "Unknown Team";
}

function driverId(row = {}) {
  return row.driver_id ?? row.driverId ?? row.id ?? null;
}

function driverName(row = {}) {
  return row.display_name ?? row.driver_name ?? row.name ?? driverId(row) ?? "Unknown Driver";
}

function trackId(row = {}) {
  return row.track_id ?? row.trackId ?? row.circuit_id ?? row.circuitId ?? null;
}

function trackName(row = {}, tracks = new Map()) {
  const id = trackId(row);
  return row.track_name ?? row.trackName ?? row.circuit_name ?? row.circuitName ?? tracks.get(id)?.name ?? id ?? "Unknown Circuit";
}

function winnerFromRace(row = {}, drivers = new Map(), teams = new Map()) {
  const classification = row.classification ?? [];
  const winner = classification.find((entry) => Number(entry.position) === 1) ?? classification[0] ?? null;
  if (!winner) return null;
  const dId = winner.driverId ?? winner.driver_id ?? null;
  const tId = winner.teamId ?? winner.team_id ?? null;
  return {
    driverId: dId,
    driverName: driverName(drivers.get(dId) ?? { id: dId }),
    teamId: tId,
    teamName: teamName(teams.get(tId) ?? { id: tId }),
  };
}

function historyMatch(calendarRow, historyRows = []) {
  const id = raceId(calendarRow);
  const round = number(calendarRow.round);
  const date = raceDate(calendarRow);
  return historyRows.find((row) => raceId(row) === id)
    ?? historyRows.find((row) => round !== null && number(row.round) === round && (!date || !raceDate(row) || raceDate(row) === date))
    ?? null;
}

function championshipArchive(saveWorld, drivers, teams) {
  return (saveWorld.history?.championships ?? []).slice(-10).reverse().map((row) => {
    const driverChampionId = row.driverChampionId ?? row.driver_champion_id ?? row.driverChampion?.id ?? row.driverChampion ?? null;
    const constructorChampionId = row.constructorChampionId ?? row.constructor_champion_id ?? row.constructorChampion?.id ?? row.constructorChampion ?? null;
    return {
      season: number(row.season ?? row.year),
      driverChampionId,
      driverChampionName: driverChampionId ? driverName(drivers.get(driverChampionId) ?? { id: driverChampionId }) : null,
      constructorChampionId,
      constructorChampionName: constructorChampionId ? teamName(teams.get(constructorChampionId) ?? { id: constructorChampionId }) : null,
      racesCompleted: number(row.racesCompleted ?? row.races_completed),
    };
  });
}

export function developerChampionship(session) {
  const saveWorld = session.requireCareer();
  const state = session.state();
  const drivers = new Map((saveWorld.world?.drivers ?? []).map((row) => [driverId(row), row]));
  const teams = new Map((saveWorld.world?.teams ?? []).map((row) => [teamId(row), row]));
  const tracks = new Map((saveWorld.world?.tracks ?? []).map((row) => [trackId(row), {
    ...row,
    name: row.track_name ?? row.display_name ?? row.name ?? trackId(row),
  }]));
  const historyRows = saveWorld.history?.races ?? [];
  const currentGpId = state.raceWeekend?.gpId ?? null;
  const today = dateOnly(saveWorld.clock?.date);

  const calendar = [...(saveWorld.world?.calendar ?? [])]
    .sort((a, b) => number(a.round, 999) - number(b.round, 999) || raceDate(a).localeCompare(raceDate(b)))
    .map((row, index) => {
      const completed = historyMatch(row, historyRows);
      const id = raceId(row);
      const date = raceDate(row);
      let status = "upcoming";
      if (completed) status = "completed";
      else if (id === currentGpId) status = "current";
      else if (date && date < today) status = "unresolved";
      return {
        id,
        season: number(row.year ?? row.season ?? saveWorld.clock?.season),
        round: number(row.round, index + 1),
        name: raceName(row),
        date,
        trackId: trackId(row),
        trackName: trackName(row, tracks),
        country: row.country ?? row.track_country ?? tracks.get(trackId(row))?.country ?? null,
        laps: number(row.laps ?? row.race_laps),
        championshipStatus: row.championship_status ?? row.championshipStatus ?? "championship",
        generationSource: row.generation_source ?? row.generationSource ?? null,
        status,
        winner: completed ? winnerFromRace(completed, drivers, teams) : null,
      };
    });

  const completedCount = calendar.filter((row) => row.status === "completed").length;
  const currentIndex = calendar.findIndex((row) => row.status === "current");
  const nextIndex = calendar.findIndex((row) => row.status === "upcoming");
  const focusIndex = currentIndex >= 0 ? currentIndex : nextIndex;

  return {
    season: number(saveWorld.clock?.season),
    date: saveWorld.clock?.date ?? null,
    controlledTeamId: state.career?.controlledTeamId ?? null,
    summary: {
      totalRounds: calendar.length,
      completedRounds: completedCount,
      remainingRounds: Math.max(0, calendar.length - completedCount),
      currentRound: focusIndex >= 0 ? calendar[focusIndex].round : null,
      championshipComplete: calendar.length > 0 && completedCount === calendar.length,
    },
    calendar,
    standings: {
      drivers: (state.standings?.drivers ?? []).map((row) => ({ ...row })),
      constructors: (state.standings?.constructors ?? []).map((row) => ({ ...row })),
    },
    archive: championshipArchive(saveWorld, drivers, teams),
  };
}
