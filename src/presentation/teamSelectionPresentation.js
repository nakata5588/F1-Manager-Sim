import { teamVisualIdentity } from "./teamVisualIdentity.js";

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function teamId(row = {}) {
  return row.team_id ?? row.id ?? null;
}

function driverId(row = {}) {
  return row.driver_id ?? row.id ?? null;
}

function engineId(row = {}) {
  return row.engine_id ?? row.id ?? null;
}

function driverName(row = {}, fallback = "Unknown Driver") {
  return row.display_name ?? row.driver_name ?? row.name ?? fallback;
}

function engineName(row = {}) {
  return row.engine_name ?? row.display_name ?? row.name ?? row.power_unit ?? null;
}

function roleRank(role) {
  const value = text(role).toLowerCase();
  if (["main_driver", "first_driver", "lead_driver"].includes(value)) return 0;
  if (["second_driver", "race_driver", "driver"].includes(value)) return 1;
  if (["reserve_driver", "test_driver"].includes(value)) return 2;
  return 3;
}

function rowMatchesOpeningSeason(row, season) {
  const explicitSeason = Number(row?.year ?? row?.season);
  if (Number.isFinite(explicitSeason) && explicitSeason !== season) return false;

  const startYear = Number(
    row?.start_year
    ?? row?.startSeason
    ?? row?.contract_start_year
    ?? String(row?.start_date ?? row?.contract_start ?? "").slice(0, 4),
  );
  if (Number.isFinite(startYear) && startYear > season) return false;

  const status = text(row?.status).toLowerCase();
  if (["future", "inactive", "terminated", "expired"].includes(status)) return false;
  return true;
}

function activeTeamDrivers(snapshot, selectedTeamId, season) {
  const drivers = new Map((snapshot.drivers ?? []).map((row) => [String(driverId(row)), row]));

  const explicitEntries = (snapshot.startingRaceEntries ?? [])
    .filter((row) => String(row?.team_id ?? row?.teamId ?? "") === String(selectedTeamId))
    .filter((row) => rowMatchesOpeningSeason(row, season));

  const sourceRows = explicitEntries.length
    ? explicitEntries.map((row) => ({
      id: row.driver_id ?? row.driverId,
      role: row.source_role ?? row.role ?? "race_driver",
      carNumber: row.car_number ?? row.carNumber ?? null,
    }))
    : (snapshot.contracts ?? [])
      .filter((row) => String(row?.team_id ?? row?.teamId ?? "") === String(selectedTeamId))
      .filter((row) => rowMatchesOpeningSeason(row, season))
      .map((row) => ({
        id: row.driver_id ?? row.driverId,
        role: row.role ?? "driver",
        carNumber: row.car_number ?? row.carNumber ?? null,
      }));

  const seen = new Set();
  return sourceRows
    .filter((row) => {
      const id = text(row.id);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return drivers.has(id);
    })
    .map((row) => {
      const driver = drivers.get(text(row.id));
      return {
        id: text(row.id),
        name: driverName(driver, text(row.id)),
        role: row.role,
        carNumber: row.carNumber,
      };
    })
    .sort((a, b) => roleRank(a.role) - roleRank(b.role) || a.name.localeCompare(b.name));
}

function teamEngine(snapshot, selectedTeamId, season, teamRow) {
  const supply = (snapshot.teamEngines ?? [])
    .filter((row) => String(row?.team_id ?? row?.teamId ?? "") === String(selectedTeamId))
    .filter((row) => rowMatchesOpeningSeason(row, season))[0] ?? null;

  const id = supply?.engine_id ?? supply?.engineId ?? teamRow?.engine_id ?? teamRow?.engineId ?? null;
  const engine = id === null || id === undefined
    ? null
    : (snapshot.engines ?? []).find((row) => String(engineId(row) ?? "") === String(id)) ?? null;

  const name = engineName(engine ?? {})
    ?? supply?.engine_name
    ?? teamRow?.engine_name
    ?? teamRow?.power_unit
    ?? null;
  const manufacturer = engine?.manufacturer
    ?? supply?.manufacturer
    ?? teamRow?.engine_manufacturer
    ?? teamRow?.power_unit
    ?? null;

  if (!id && !name && !manufacturer) return null;
  return {
    id: id ? String(id) : null,
    name: name ? String(name) : null,
    manufacturer: manufacturer ? String(manufacturer) : null,
  };
}

function chassisName(snapshot, selectedTeamId, season, teamRow) {
  const car = (snapshot.carStats ?? [])
    .filter((row) => String(row?.team_id ?? row?.teamId ?? "") === String(selectedTeamId))
    .filter((row) => rowMatchesOpeningSeason(row, season))[0] ?? {};

  const value = car.chassis_name
    ?? car.chassisName
    ?? car.car_model
    ?? car.carModel
    ?? car.car_name
    ?? car.carName
    ?? car.model_name
    ?? teamRow?.chassis_name
    ?? teamRow?.chassisName
    ?? teamRow?.car_model
    ?? teamRow?.carModel
    ?? teamRow?.car_name
    ?? null;

  return value ? String(value) : null;
}

export function projectTeamSelectionCards(seasonDatabasePayload) {
  const snapshot = seasonDatabasePayload?.snapshot ?? {};
  const season = Number(seasonDatabasePayload?.season ?? snapshot.season);
  const pseudoSaveWorld = { world: { teams: snapshot.teams ?? [] } };

  return (snapshot.teams ?? [])
    .map((row) => {
      const id = teamId(row);
      if (!id) return null;
      const name = row.team_name ?? row.display_name ?? row.name ?? String(id);
      const visualIdentity = teamVisualIdentity(pseudoSaveWorld, id, { displayName: name });
      return {
        id: String(id),
        name: String(name),
        nationality: row.nationality ?? row.country ?? null,
        constructorName: row.constructor_name ?? null,
        drivers: activeTeamDrivers(snapshot, id, season),
        engine: teamEngine(snapshot, id, season, row),
        chassis: chassisName(snapshot, id, season, row),
        visualIdentity,
        media: {
          logo: visualIdentity.media.logo,
          car: visualIdentity.media.car,
        },
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}
