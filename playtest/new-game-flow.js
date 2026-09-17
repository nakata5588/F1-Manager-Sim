export const NEW_GAME_STEPS = Object.freeze([
  "database",
  "decade",
  "season",
  "team",
  "manager",
]);

function text(value, fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

function slug(value, fallback = "database") {
  const normalized = text(value, fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function normalizeTeams(rows = []) {
  return rows
    .map((row) => ({
      id: text(row?.id).trim(),
      name: text(row?.name, row?.id ?? "Unknown Team").trim(),
      nationality: row?.nationality ?? null,
      constructorName: row?.constructorName ?? null,
    }))
    .filter((row) => row.id)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeSeason(row, fallback = {}) {
  const season = Number(row?.season ?? fallback.season);
  if (!Number.isInteger(season)) throw new Error("New Game catalog season must be an integer.");
  return {
    season,
    decade: Math.floor(season / 10) * 10,
    releaseName: row?.releaseName ?? fallback.releaseName ?? null,
    databaseVersion: row?.databaseVersion ?? fallback.databaseVersion ?? null,
    teams: normalizeTeams(row?.teams ?? fallback.teams ?? []),
  };
}

function normalizeDatabase(row, index = 0) {
  const name = text(row?.name ?? row?.releaseName ?? row?.databaseVersion, `Database ${index + 1}`).trim();
  const databaseVersion = row?.databaseVersion ?? null;
  const releaseName = row?.releaseName ?? name;
  const id = text(row?.id).trim() || `db-${slug(databaseVersion ?? releaseName ?? name)}-${index + 1}`;
  const seasons = (row?.seasons ?? [])
    .map((season) => normalizeSeason(season, row))
    .sort((a, b) => a.season - b.season);
  if (!seasons.length) throw new Error(`New Game database '${name}' has no seasons.`);
  return { id, name, databaseVersion, releaseName, seasons };
}

export function buildNewGameCatalog(setup) {
  if (!setup || typeof setup !== "object") throw new TypeError("Developer setup is required.");

  const databases = Array.isArray(setup.databases) && setup.databases.length
    ? setup.databases.map(normalizeDatabase)
    : [normalizeDatabase({
      id: `db-${slug(setup.databaseVersion ?? setup.releaseName ?? "local")}`,
      name: setup.releaseName ?? "Local Season Database",
      releaseName: setup.releaseName ?? null,
      databaseVersion: setup.databaseVersion ?? null,
      seasons: [{
        season: setup.season,
        releaseName: setup.releaseName ?? null,
        databaseVersion: setup.databaseVersion ?? null,
        teams: setup.teams ?? [],
      }],
    })];

  const ids = new Set();
  for (const database of databases) {
    if (ids.has(database.id)) throw new Error(`Duplicate New Game database id '${database.id}'.`);
    ids.add(database.id);
  }

  return { databases };
}

export function databaseById(catalog, databaseId) {
  return catalog?.databases?.find((row) => row.id === databaseId) ?? null;
}

export function decadesForDatabase(catalog, databaseId) {
  const database = databaseById(catalog, databaseId);
  if (!database) return [];
  return [...new Set(database.seasons.map((row) => row.decade))]
    .sort((a, b) => a - b)
    .map((decade) => ({ id: String(decade), decade, label: `${decade}s` }));
}

export function seasonsForDecade(catalog, databaseId, decadeValue) {
  const database = databaseById(catalog, databaseId);
  const decade = Number(decadeValue);
  if (!database || !Number.isInteger(decade)) return [];
  return database.seasons.filter((row) => row.decade === decade);
}

export function seasonBySelection(catalog, databaseId, seasonValue) {
  const database = databaseById(catalog, databaseId);
  const season = Number(seasonValue);
  return database?.seasons?.find((row) => row.season === season) ?? null;
}

export function defaultNewGameSelection(catalog) {
  const database = catalog?.databases?.[0] ?? null;
  const season = database?.seasons?.[0] ?? null;
  return {
    databaseId: database?.id ?? null,
    decade: season?.decade ?? null,
    season: season?.season ?? null,
    teamId: season?.teams?.[0]?.id ?? null,
    managerName: "",
  };
}

export function validateNewGameSelection(catalog, selection = {}) {
  const database = databaseById(catalog, selection.databaseId);
  if (!database) throw new Error("Select a valid database.");

  const decade = Number(selection.decade);
  if (!decadesForDatabase(catalog, database.id).some((row) => row.decade === decade)) {
    throw new Error("Select a valid decade.");
  }

  const season = seasonBySelection(catalog, database.id, selection.season);
  if (!season || season.decade !== decade) throw new Error("Select a valid season.");

  const teamId = text(selection.teamId).trim();
  const team = season.teams.find((row) => row.id === teamId);
  if (!team) throw new Error("Select a valid team.");

  const managerName = text(selection.managerName).trim();
  if (!managerName) throw new Error("Manager name is required.");
  if (managerName.length > 64) throw new Error("Manager name must be 64 characters or fewer.");

  return {
    databaseId: database.id,
    databaseName: database.name,
    decade,
    season: season.season,
    teamId: team.id,
    teamName: team.name,
    managerName,
  };
}
