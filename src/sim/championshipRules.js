const NUMBER_WORDS = Object.freeze({
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
});

function asRuleObject(value, season) {
  if (!Array.isArray(value)) return value && typeof value === "object" ? value : {};
  return value.find((row) => Number(row?.year ?? row?.season) === Number(season)) ?? value[0] ?? {};
}

export function parsePointsSystem(value) {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  const text = String(value ?? "").trim();
  if (!text) return [];
  return text.split(/[-,;\s/]+/).map(Number).filter(Number.isFinite);
}

function parseCount(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (/^\d+$/.test(text)) return Number(text);
  return NUMBER_WORDS[text] ?? null;
}

function detailValue(row, season) {
  return row?.[`${season}_value`] ?? row?.value ?? null;
}

function findDetail(rows, pattern) {
  return rows.find((row) => pattern.test(String(row?.rule_area ?? row?.area ?? ""))) ?? null;
}

function parseDriverSegments(text) {
  const segments = [];
  const expression = /best\s+(\w+)\s+results?\s+from\s+rounds?\s+(\d+)\s*-\s*(\d+)/gi;
  for (const match of String(text ?? "").matchAll(expression)) {
    const bestResults = parseCount(match[1]);
    const roundStart = Number(match[2]);
    const roundEnd = Number(match[3]);
    if (!Number.isInteger(bestResults) || bestResults <= 0) continue;
    if (!Number.isInteger(roundStart) || !Number.isInteger(roundEnd) || roundStart > roundEnd) continue;
    segments.push({ roundStart, roundEnd, bestResults });
  }
  return segments;
}

function calendarRoundCount(world, season) {
  const rows = Array.isArray(world?.calendar) ? world.calendar : [];
  const seasonRows = rows.filter((row) => Number(row?.year ?? row?.season ?? season) === Number(season));
  return seasonRows.length || rows.length;
}

function normalizeExplicitRules(explicit, world, season) {
  if (!explicit || typeof explicit !== "object") return null;
  const pointsSystem = parsePointsSystem(explicit.pointsSystem ?? explicit.points_system ?? world?.rules?.points_system);
  const segments = (explicit.driver?.segments ?? explicit.driverSegments ?? []).map((segment) => ({
    roundStart: Number(segment.roundStart ?? segment.round_start),
    roundEnd: Number(segment.roundEnd ?? segment.round_end),
    bestResults: Number(segment.bestResults ?? segment.best_results),
  })).filter((segment) => Number.isInteger(segment.roundStart) && Number.isInteger(segment.roundEnd) && Number.isInteger(segment.bestResults) && segment.bestResults > 0);
  const constructorAllRounds = explicit.constructors?.allRoundsCount === true
    || explicit.constructors?.all_rounds_count === true
    || explicit.constructorAllRounds === true;
  const complete = Boolean(pointsSystem.length && segments.length && constructorAllRounds);
  return {
    season: Number(season),
    pointsSystem,
    expectedRounds: Number(explicit.expectedRounds ?? explicit.expected_rounds ?? calendarRoundCount(world, season)) || null,
    driver: {
      mode: segments.length ? "split_best_results" : "gross_points",
      segments,
    },
    constructors: {
      mode: constructorAllRounds ? "all_scoring_finishes" : "sum_driver_gross_points",
      allRoundsCount: constructorAllRounds,
    },
    complete,
    tieBreakComplete: explicit.tieBreakComplete === true || explicit.tie_break_complete === true,
    sourceStatus: explicit.sourceStatus ?? explicit.source_status ?? "explicit_world_rule",
    source: "world.championshipRules",
  };
}

export function resolveChampionshipRuleSet(saveWorld, season = saveWorld?.clock?.season) {
  const world = saveWorld?.world ?? {};
  const explicit = normalizeExplicitRules(world.championshipRules, world, season);
  if (explicit) return explicit;

  const rules = asRuleObject(world.rules, season);
  const pointsSystem = parsePointsSystem(rules.points_system ?? rules.pointsSystem ?? rules.race_points ?? world.raceModelParams?.points_system);
  const details = Array.isArray(world.seasonPack?.rulesDetail) ? world.seasonPack.rulesDetail : [];
  const driverDetail = findDetail(details, /driver\s+championship/i);
  const constructorDetail = findDetail(details, /constructor/i);
  const driverText = detailValue(driverDetail, season);
  const constructorText = detailValue(constructorDetail, season);
  const driverSegments = parseDriverSegments(driverText);
  const constructorAllRounds = /all\s+rounds\s+counted/i.test(String(constructorText ?? ""))
    || /count\s+all\s+scoring\s+finishes/i.test(String(constructorDetail?.gameplay_interpretation ?? ""));
  const complete = Boolean(pointsSystem.length && driverSegments.length && constructorAllRounds);

  return {
    season: Number(season),
    pointsSystem,
    expectedRounds: calendarRoundCount(world, season) || null,
    driver: {
      mode: driverSegments.length ? "split_best_results" : "gross_points",
      segments: driverSegments,
      sourceStatus: driverDetail?.source_status ?? null,
      sourceValue: driverText,
    },
    constructors: {
      mode: constructorAllRounds ? "all_scoring_finishes" : "sum_driver_gross_points",
      allRoundsCount: constructorAllRounds,
      sourceStatus: constructorDetail?.source_status ?? null,
      sourceValue: constructorText,
    },
    complete,
    tieBreakComplete: false,
    sourceStatus: complete ? "source_supported" : "partial_or_missing",
    source: details.length ? "seasonPack.rulesDetail" : "world.rules",
  };
}
