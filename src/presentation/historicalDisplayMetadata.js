const SEMVER_PREFIX = /(^|[^0-9])v?(\d+)\.(\d+)\.(\d+)(?=$|[^0-9])/i;

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

export function publicVersionLabel(value, fallback = "Current") {
  const raw = text(value);
  if (!raw) return fallback;
  const match = raw.match(SEMVER_PREFIX);
  if (!match) return fallback;
  return `v${match[2]}.${match[3]}.${match[4]}`;
}

export function publicSeasonName(seasonValue) {
  const season = Number(seasonValue);
  if (!Number.isInteger(season)) return "Formula One World Championship";
  return `${season} Formula One World Championship`;
}

export function historicalDatabasePresentation(input = {}) {
  const season = Number(input.season);
  const override = input.presentation && typeof input.presentation === "object"
    ? input.presentation
    : {};

  return Object.freeze({
    databaseName: text(override.databaseName) || "Official Historical Database",
    databaseDescription: text(override.databaseDescription)
      || "Authentic historical Formula One starting conditions with a dynamic alternative future.",
    seasonName: text(override.seasonName) || publicSeasonName(season),
    versionLabel: text(override.versionLabel) || publicVersionLabel(input.databaseVersion),
  });
}
