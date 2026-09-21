import { runLongRunValidation } from "./longRun.js";

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
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
  const activeDriverStates = Object.values(saveWorld.world?.careerState?.drivers ?? {})
    .filter((row) => row?.status !== "retired");
  const activeStaffStates = Object.values(saveWorld.world?.careerState?.staff ?? {})
    .filter((row) => row?.status !== "retired");
  const activeDriverAges = activeDriverStates
    .map((row) => numeric(row?.age))
    .filter(Number.isFinite);
  const activeDriverAbilities = activeDriverStates
    .map((row) => numeric(row?.currentAbility))
    .filter(Number.isFinite);
  const activeStaffAbilities = activeStaffStates
    .map((row) => numeric(row?.currentAbility))
    .filter(Number.isFinite);
  const activeDriverForms = activeDriverStates
    .map((row) => numeric(row?.form))
    .filter(Number.isFinite);
  const driverChampions = championIds(saveWorld, "driverStandings");
  const constructorChampions = championIds(saveWorld, "constructorStandings");
  const classifications = classificationRows(saveWorld);
  const dnfs = classifications.filter((row) => String(row?.status ?? "").toUpperCase() === "DNF").length;
  const generatedDrivers = (saveWorld.world?.drivers ?? []).filter((row) => row?.generated === true || row?.source === "simulation").length;
  const teamStates = Object.values(saveWorld.world?.teamState ?? {});
  const marketRows = Object.values(saveWorld.world?.driverMarketState?.drivers ?? {});
  const availabilityRows = Object.values(saveWorld.world?.driverAvailability?.drivers ?? {});
  const crisisRows = Object.values(saveWorld.world?.financialCrisis?.teams ?? {});
  const crisisInterventions = saveWorld.world?.financialCrisis?.interventions ?? [];
  const ownershipChanges = saveWorld.world?.financialCrisis?.ownershipChanges ?? [];
  const crisisDebt = crisisRows.map((row) => numeric(row?.debtPrincipal)).filter(Number.isFinite);
  const crisisStages = crisisRows.reduce((acc, row) => {
    const stage = String(row?.stage ?? "stable");
    acc[stage] = Number(acc[stage] ?? 0) + 1;
    return acc;
  }, {});
  const crisisExits = (saveWorld.world?.inactiveTeams ?? []).filter((row) =>
    /financial|administration/i.test(String(row?.exit_reason ?? ""))).length;
  const developmentRows = (saveWorld.history?.development ?? []).filter((row) => row?.type === "worker_development");
  const driverDevelopmentDeltas = developmentRows
    .filter((row) => row?.workerType === "driver")
    .map((row) => numeric(row?.delta))
    .filter(Number.isFinite);
  const staffDevelopmentDeltas = developmentRows
    .filter((row) => row?.workerType === "staff")
    .map((row) => numeric(row?.delta))
    .filter(Number.isFinite);
  const calendarSeasons = Object.values(saveWorld.world?.calendarEvolution?.seasons ?? {});
  const activePromoterContracts = Object.values(saveWorld.world?.calendarEvolution?.contracts ?? {})
    .filter((row) => row?.status === "active");
  const calendarRaceCounts = calendarSeasons.map((row) => numeric(row?.raceCount)).filter(Number.isFinite);

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
    distressedTeamShare: teamStates.length
      ? round(teamStates.filter((row) => row?.financialStatus === "distressed").length / teamStates.length, 4)
      : 0,
    financialCrisisStages: crisisStages,
    teamsInAdministration: crisisRows.filter((row) => row?.stage === "administration").length,
    teamsUnderSpendingFreeze: crisisRows.filter((row) => row?.spendingFreeze === true).length,
    crisisDebt: distribution(crisisDebt),
    ownershipChanges: ownershipChanges.length,
    ownerFundingInterventions: crisisInterventions.filter((row) => row?.type === "owner_funding" && row?.approved !== false).length,
    bridgeFinanceInterventions: crisisInterventions.filter((row) => row?.type === "bridge_finance" && row?.approved !== false).length,
    financialCrisisTeamExits: crisisExits,
    activeDriverAges: distribution(activeDriverAges),
    activeDriverAbilities: distribution(activeDriverAbilities),
    activeStaffAbilities: distribution(activeStaffAbilities),
    activeDriverForm: distribution(activeDriverForms),
    driverDevelopmentDeltas: distribution(driverDevelopmentDeltas),
    staffDevelopmentDeltas: distribution(staffDevelopmentDeltas),
    developmentSeasonsArchived: saveWorld.world?.developmentState?.history?.length ?? 0,
    developmentRecords: developmentRows.length,
    generatedDrivers,
    freeDrivers: saveWorld.world?.employment?.freeAgents?.drivers?.length ?? 0,
    otherMotorsportDrivers: marketRows.filter((row) => row?.path === "other_motorsport").length,
    outsideF1Drivers: marketRows.filter((row) => row?.path === "outside_f1").length,
    temporaryReplacementDrivers: marketRows.filter((row) => row?.path === "temporary_replacement").length,
    injuredDrivers: availabilityRows.filter((row) => row?.status === "injured").length,
    injuriesRecorded: saveWorld.world?.driverAvailability?.injuries?.length ?? 0,
    replacementAgreements: saveWorld.world?.driverAvailability?.replacements?.length ?? 0,
    freeStaff: saveWorld.world?.employment?.freeAgents?.staff?.length ?? 0,
    openVacancies: (saveWorld.world?.employment?.vacancies ?? []).filter((row) => row?.status === "open").length,
    transfers: saveWorld.history?.transfers?.length ?? 0,
    retirements: saveWorld.history?.retirements?.length ?? 0,
    dnfRate: classifications.length ? round(dnfs / classifications.length, 4) : 0,
    calendarRaceCounts: distribution(calendarRaceCounts),
    calendarEventsAdded: calendarSeasons.reduce((sum, row) => sum + (row?.added?.length ?? 0), 0),
    calendarEventsDropped: calendarSeasons.reduce((sum, row) => sum + (row?.dropped?.length ?? 0), 0),
    calendarContractsRenewed: calendarSeasons.reduce((sum, row) => sum + (row?.renewed?.length ?? 0), 0),
    activePromoterContracts: activePromoterContracts.length,
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
  const administrations = runs.map((run) => run.ecosystem.teamsInAdministration);
  const ownershipChanges = runs.map((run) => run.ecosystem.ownershipChanges);
  const crisisExits = runs.map((run) => run.ecosystem.financialCrisisTeamExits);
  const driverAbilityMedians = runs.map((run) => run.ecosystem.activeDriverAbilities.median).filter(Number.isFinite);
  const staffAbilityMedians = runs.map((run) => run.ecosystem.activeStaffAbilities.median).filter(Number.isFinite);
  const dnfRates = runs.map((run) => run.ecosystem.dnfRate);
  const calendarChanges = runs.map((run) => run.ecosystem.calendarEventsAdded + run.ecosystem.calendarEventsDropped);
  const calendarRaceCountMedians = runs.map((run) => run.ecosystem.calendarRaceCounts.median).filter(Number.isFinite);
  const errors = runs.flatMap((run) => run.structural.errors.map((message) => `[${run.seed}] ${message}`));
  const warnings = runs.flatMap((run) => run.structural.warnings.map((message) => `[${run.seed}] ${message}`));

  if (driverChampions.size <= 1 && seasons >= 10) warnings.push("Ecosystem signal: all simulated seasons/seeds produced one driver champion identity.");
  if (constructorChampions.size <= 1 && seasons >= 10) warnings.push("Ecosystem signal: all simulated seasons/seeds produced one constructor champion identity.");
  if (runs.some((run) => run.ecosystem.freeDrivers === 0) && seasons >= 10) warnings.push("Ecosystem signal: at least one long run ended with no F1 free drivers.");
  if (runs.some((run) => run.ecosystem.freeDrivers > run.ecosystem.activeTeams * 8) && seasons >= 10) warnings.push("Ecosystem signal: the F1 free-driver pool remains unusually large relative to the active grid.");
  if (runs.some((run) => run.ecosystem.openVacancies > run.ecosystem.activeTeams * 8)) warnings.push("Ecosystem signal: at least one run ended with unusually high vacancy pressure.");
  if (runs.some((run) => run.ecosystem.distressedTeamShare >= 0.5)) warnings.push("Ecosystem signal: at least half of active teams are financially distressed in one or more long runs; economy/crisis calibration should be reviewed.");
  if (runs.some((run) => run.ecosystem.teamsInAdministration >= Math.max(3, Math.ceil(run.ecosystem.activeTeams * 0.25)))) warnings.push("Ecosystem signal: too many active teams remain in administration at the endpoint.");
  if (runs.some((run) => {
    const teamSeasons = Math.max(1, run.ecosystem.activeTeams * seasons);
    return run.ecosystem.ownershipChanges / teamSeasons > 0.12;
  })) warnings.push("Ecosystem signal: ownership turnover exceeds 0.12 changes per active-team season and should be calibrated.");
  if (runs.some((run) => run.ecosystem.activeDriverAges.count > 0 && run.ecosystem.activeDriverAges.median < 16)) warnings.push("Ecosystem signal: active-driver age distribution is implausibly young and should be audited.");
  if (runs.some((run) => run.ecosystem.activeDriverAbilities.count > 0 && run.ecosystem.activeDriverAbilities.median >= 95)) warnings.push("Ecosystem signal: driver development is saturating near the rating ceiling.");
  if (runs.some((run) => run.ecosystem.activeStaffAbilities.count > 0 && run.ecosystem.activeStaffAbilities.median >= 95)) warnings.push("Ecosystem signal: staff development is saturating near the rating ceiling.");
  if (seasons >= 10 && runs.every((run) => run.ecosystem.calendarEventsAdded + run.ecosystem.calendarEventsDropped === 0)) warnings.push("Ecosystem signal: the calendar remained completely static across all long runs.");

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
      finalAdministrations: distribution(administrations),
      ownershipChanges: distribution(ownershipChanges),
      financialCrisisTeamExits: distribution(crisisExits),
      finalDriverAbilityMedian: distribution(driverAbilityMedians),
      finalStaffAbilityMedian: distribution(staffAbilityMedians),
      dnfRate: distribution(dnfRates),
      calendarChanges: distribution(calendarChanges),
      calendarRaceCountMedian: distribution(calendarRaceCountMedians),
    },
    errors,
    warnings,
  };
}
