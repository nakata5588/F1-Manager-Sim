import { runLongRunValidation } from "./longRun.js";

function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 4) {
  return Number(Number(value ?? 0).toFixed(digits));
}

function distribution(values = []) {
  const rows = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!rows.length) return { count: 0, minimum: null, median: null, maximum: null, average: null };
  const middle = Math.floor(rows.length / 2);
  const median = rows.length % 2 ? rows[middle] : (rows[middle - 1] + rows[middle]) / 2;
  return {
    count: rows.length,
    minimum: rows[0],
    median: round(median, 2),
    maximum: rows.at(-1),
    average: round(rows.reduce((sum, value) => sum + value, 0) / rows.length, 2),
  };
}

function championIds(saveWorld, field) {
  return (saveWorld.history?.championships ?? [])
    .map((row) => row?.[field]?.[0]?.id ?? null)
    .filter(Boolean);
}

function classificationRows(saveWorld) {
  return (saveWorld.history?.races ?? []).flatMap((race) => race.classification ?? []);
}

export function summarizeLongRunEcosystem(saveWorld, structuralReport = null) {
  const teamCash = Object.values(saveWorld.world?.teamState ?? {})
    .map((row) => numeric(row?.cash))
    .filter(Number.isFinite);
  const activeDriverAges = Object.values(saveWorld.world?.careerState?.drivers ?? {})
    .filter((row) => row?.status !== "retired")
    .map((row) => numeric(row?.age))
    .filter(Number.isFinite);
  const driverChampions = championIds(saveWorld, "driverStandings");
  const constructorChampions = championIds(saveWorld, "constructorStandings");
  const classifications = classificationRows(saveWorld);
  const dnfs = classifications.filter((row) => String(row?.status ?? "").toUpperCase() === "DNF").length;
  const generatedDrivers = (saveWorld.world?.drivers ?? []).filter((row) => row?.generated === true || row?.source === "simulation").length;
  const teamStates = Object.values(saveWorld.world?.teamState ?? {});

  return {
    structuralOk: structuralReport?.ok ?? null,
    seasonsArchived: saveWorld.history?.championships?.length ?? 0,
    racesArchived: saveWorld.history?.races?.length ?? 0,
    activeTeams: saveWorld.world?.teams?.length ?? 0,
    inactiveTeams: saveWorld.world?.inactiveTeams?.length ?? 0,
    uniqueDriverChampions: new Set(driverChampions).size,
    uniqueConstructorChampions: new Set(constructorChampions).size,
    driverChampionIds: [...new Set(driverChampions)].sort(),
    constructorChampionIds: [...new Set(constructorChampions)].sort(),
    teamCash: distribution(teamCash),
    financiallyDistressedTeams: teamStates.filter((row) => row?.financialStatus === "distressed").length,
    financiallyTightTeams: teamStates.filter((row) => row?.financialStatus === "tight").length,
    activeDriverAges: distribution(activeDriverAges),
    generatedDrivers,
    freeDrivers: saveWorld.world?.employment?.freeAgents?.drivers?.length ?? 0,
    freeStaff: saveWorld.world?.employment?.freeAgents?.staff?.length ?? 0,
    openVacancies: (saveWorld.world?.employment?.vacancies ?? []).filter((row) => row?.status === "open").length,
    transfers: saveWorld.history?.transfers?.length ?? 0,
    retirements: saveWorld.history?.retirements?.length ?? 0,
    dnfRate: classifications.length ? round(dnfs / classifications.length, 4) : 0,
  };
}

function normalizeSeeds(options = {}) {
  if (Array.isArray(options.seeds) && options.seeds.length) return options.seeds.map(String);
  const count = Math.max(1, Math.round(Number(options.seedCount ?? 10)));
  const prefix = String(options.seedPrefix ?? "ecosystem");
  return Array.from({ length: count }, (_, index) => `${prefix}-${String(index + 1).padStart(2, "0")}`);
}

export function runLongRunMatrix(historicalSnapshot, options = {}) {
  if (!historicalSnapshot?.season) throw new TypeError("A historical season snapshot is required.");
  const seasons = Math.max(1, Math.round(Number(options.seasons ?? 20)));
  const seeds = normalizeSeeds(options);
  const runs = seeds.map((seed) => {
    const result = runLongRunValidation(historicalSnapshot, {
      ...options,
      seasons,
      seed,
    });
    return {
      seed,
      ok: result.report.ok,
      structural: result.report,
      ecosystem: summarizeLongRunEcosystem(result.saveWorld, result.report),
    };
  });

  const driverChampions = new Set(runs.flatMap((run) => run.ecosystem.driverChampionIds));
  const constructorChampions = new Set(runs.flatMap((run) => run.ecosystem.constructorChampionIds));
  const activeTeams = runs.map((run) => run.ecosystem.activeTeams);
  const distressedTeams = runs.map((run) => run.ecosystem.financiallyDistressedTeams);
  const dnfRates = runs.map((run) => run.ecosystem.dnfRate);
  const errors = runs.flatMap((run) => run.structural.errors.map((message) => `[${run.seed}] ${message}`));
  const warnings = runs.flatMap((run) => run.structural.warnings.map((message) => `[${run.seed}] ${message}`));

  if (driverChampions.size <= 1 && seasons >= 10) warnings.push("Ecosystem signal: all simulated seasons/seeds produced one driver champion identity.");
  if (constructorChampions.size <= 1 && seasons >= 10) warnings.push("Ecosystem signal: all simulated seasons/seeds produced one constructor champion identity.");
  if (runs.some((run) => run.ecosystem.freeDrivers === 0) && seasons >= 10) warnings.push("Ecosystem signal: at least one long run ended with no free drivers.");
  if (runs.some((run) => run.ecosystem.openVacancies > run.ecosystem.activeTeams * 8)) warnings.push("Ecosystem signal: at least one run ended with unusually high vacancy pressure.");

  return {
    ok: runs.every((run) => run.ok),
    startSeason: Number(historicalSnapshot.season),
    seasons,
    seeds,
    runs,
    aggregate: {
      uniqueDriverChampions: driverChampions.size,
      uniqueConstructorChampions: constructorChampions.size,
      driverChampionIds: [...driverChampions].sort(),
      constructorChampionIds: [...constructorChampions].sort(),
      finalActiveTeams: distribution(activeTeams),
      finalDistressedTeams: distribution(distressedTeams),
      dnfRate: distribution(dnfRates),
    },
    errors,
    warnings,
  };
}
