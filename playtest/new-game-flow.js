export const NEW_GAME_STEPS = Object.freeze([
  "database",
  "decade",
  "season",
  "team",
  "manager",
]);

function validIsoDate(value) {
  const raw = text(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== raw) return null;
  return raw;
}

function ageAtStart(dateOfBirth, season) {
  const birth = validIsoDate(dateOfBirth);
  if (!birth || !Number.isInteger(Number(season))) return null;
  const [year, month, day] = birth.split("-").map(Number);
  let age = Number(season) - year;
  if (month > 1 || (month === 1 && day > 1)) age -= 1;
  return age;
}

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

function publicVersionLabel(value, fallback = "Current") {
  const raw = text(value).trim();
  const match = raw.match(/(^|[^0-9])v?(\d+)\.(\d+)\.(\d+)(?=$|[^0-9])/i);
  return match ? `v${match[2]}.${match[3]}.${match[4]}` : fallback;
}

function seasonDisplayName(season) {
  return `${season} Formula One World Championship`;
}

function normalizeTeams(rows = []) {
  return rows
    .map((row) => ({
      id: text(row?.id).trim(),
      name: text(row?.name, row?.id ?? "Unknown Team").trim(),
      nationality: row?.nationality ?? null,
      constructorName: row?.constructorName ?? null,
      drivers: Array.isArray(row?.drivers)
        ? row.drivers.map((driver) => ({
          id: text(driver?.id).trim(),
          name: text(driver?.name, driver?.id ?? "Unknown Driver").trim(),
          role: driver?.role ?? null,
          carNumber: driver?.carNumber ?? null,
        })).filter((driver) => driver.id)
        : [],
      engine: row?.engine ? {
        id: row.engine.id ?? null,
        name: row.engine.name ?? null,
        manufacturer: row.engine.manufacturer ?? null,
      } : null,
      chassis: row?.chassis ?? null,
      visualIdentity: row?.visualIdentity ?? null,
      resolvedMedia: row?.resolvedMedia ?? null,
    }))
    .filter((row) => row.id)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeSeason(row, fallback = {}) {
  const season = Number(row?.season ?? fallback.season);
  if (!Number.isInteger(season)) throw new Error("New Game catalog season must be an integer.");
  const presentation = row?.presentation ?? fallback.presentation ?? {};
  const databaseVersion = row?.databaseVersion ?? fallback.databaseVersion ?? null;
  return {
    season,
    decade: Math.floor(season / 10) * 10,
    name: text(row?.displayName ?? presentation.seasonName, seasonDisplayName(season)).trim(),
    versionLabel: text(row?.versionLabel ?? presentation.versionLabel, publicVersionLabel(databaseVersion)).trim(),
    releaseName: row?.releaseName ?? fallback.releaseName ?? null,
    databaseVersion,
    teams: normalizeTeams(row?.teams ?? fallback.teams ?? []),
  };
}

function normalizeDatabase(row, index = 0) {
  const presentation = row?.presentation ?? {};
  const publicName = text(
    row?.displayName ?? presentation.databaseName ?? row?.name,
    `Historical Database ${index + 1}`,
  ).trim();
  const databaseVersion = row?.databaseVersion ?? null;
  const releaseName = row?.releaseName ?? null;
  const id = text(row?.id).trim() || `db-${slug(databaseVersion ?? releaseName ?? publicName)}-${index + 1}`;
  const seasons = (row?.seasons ?? [])
    .map((season) => normalizeSeason(season, row))
    .sort((a, b) => a.season - b.season);
  if (!seasons.length) throw new Error(`New Game database '${publicName}' has no seasons.`);
  return {
    id,
    name: publicName,
    description: text(
      row?.description ?? presentation.databaseDescription,
      "Historical Formula One starting conditions with a dynamic alternative future.",
    ).trim(),
    versionLabel: text(
      row?.versionLabel ?? presentation.versionLabel,
      publicVersionLabel(databaseVersion),
    ).trim(),
    databaseVersion,
    releaseName,
    seasons,
  };
}

export function buildNewGameCatalog(setup) {
  if (!setup || typeof setup !== "object") throw new TypeError("Developer setup is required.");

  const databases = Array.isArray(setup.databases) && setup.databases.length
    ? setup.databases.map(normalizeDatabase)
    : [normalizeDatabase({
      id: `db-${slug(setup.databaseVersion ?? setup.releaseName ?? "official")}`,
      displayName: setup.presentation?.databaseName ?? "Official Historical Database",
      description: setup.presentation?.databaseDescription,
      presentation: setup.presentation ?? null,
      releaseName: setup.releaseName ?? null,
      databaseVersion: setup.databaseVersion ?? null,
      seasons: [{
        season: setup.season,
        displayName: setup.presentation?.seasonName,
        versionLabel: setup.presentation?.versionLabel,
        releaseName: setup.releaseName ?? null,
        databaseVersion: setup.databaseVersion ?? null,
        presentation: setup.presentation ?? null,
        teams: setup.teams ?? [],
      }],
    })];

  const ids = new Set();
  for (const database of databases) {
    if (ids.has(database.id)) throw new Error(`Duplicate New Game database id '${database.id}'.`);
    ids.add(database.id);
  }

  const managerBackgrounds = Array.isArray(setup.managerBackgrounds)
    ? setup.managerBackgrounds
      .map((row) => ({
        id: text(row?.id).trim(),
        label: text(row?.label, row?.id ?? "Background").trim(),
        description: text(row?.description).trim(),
      }))
      .filter((row) => row.id)
    : [];

  return { databases, managerBackgrounds };
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
    managerNationality: "",
    managerDateOfBirth: "",
    managerBackground: catalog?.managerBackgrounds?.[0]?.id ?? "",
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
  const managerNationality = text(selection.managerNationality).trim();
  const managerDateOfBirth = validIsoDate(selection.managerDateOfBirth);
  const managerBackground = text(selection.managerBackground).trim();
  if (!managerName) throw new Error("Manager name is required.");
  if (managerName.length > 64) throw new Error("Manager name must be 64 characters or fewer.");
  if (!managerNationality) throw new Error("Manager nationality is required.");
  if (managerNationality.length > 64) throw new Error("Manager nationality must be 64 characters or fewer.");
  if (!managerDateOfBirth) throw new Error("Manager date of birth must be a valid date.");
  if (ageAtStart(managerDateOfBirth, season.season) < 18) throw new Error("Manager must be at least 18 years old at Career Start.");
  if (catalog?.managerBackgrounds?.length && !catalog.managerBackgrounds.some((row) => row.id === managerBackground)) {
    throw new Error("Select a valid manager background.");
  }
  if (!managerBackground) throw new Error("Manager background is required.");

  return {
    databaseId: database.id,
    databaseName: database.name,
    databaseVersionLabel: database.versionLabel,
    decade,
    season: season.season,
    seasonName: season.name,
    teamId: team.id,
    teamName: team.name,
    managerName,
    managerProfile: {
      name: managerName,
      nationality: managerNationality,
      dateOfBirth: managerDateOfBirth,
      background: managerBackground,
    },
  };
}
