function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function seasonRows(rows, season) {
  return (rows ?? []).filter((row) => Number(row?.season ?? row?.year) === Number(season));
}

function byId(rows, key) {
  return new Map((rows ?? []).filter((row) => row?.[key]).map((row) => [row[key], row]));
}

function applyFinanceBaseline(snapshot) {
  const season = Number(snapshot?.season);
  const baseline = seasonRows(snapshot?.teamFinanceBaseline1980, season);
  if (!baseline.length) return 0;

  const current = new Map((snapshot.teamFinancials ?? []).filter((row) => row?.team_id).map((row) => [row.team_id, row]));
  let applied = 0;
  for (const row of baseline) {
    if (!row?.team_id) continue;
    const existing = current.get(row.team_id) ?? {};
    const opening = numeric(row.opening_budget_index);
    current.set(row.team_id, {
      ...structuredClone(row),
      ...structuredClone(existing),
      year: season,
      team_id: row.team_id,
      starting_budget: numeric(existing.starting_budget, opening),
      cash_balance: numeric(existing.cash_balance, opening),
      opening_income_index: numeric(existing.opening_income_index, numeric(row.opening_income_index)),
      opening_expense_index: numeric(existing.opening_expense_index, numeric(row.opening_expense_index)),
      currency_mode: existing.currency_mode ?? row.currency_mode ?? "abstract_index",
      source: existing.source ?? "database_opening_finance_baseline",
      source_lock_status: existing.source_lock_status ?? row.source_lock_status ?? null,
      data_status: existing.data_status ?? row.data_status ?? null,
    });
    applied += 1;
  }
  snapshot.teamFinancials = [...current.values()];
  return applied;
}

function applyCircuitBaselines(snapshot) {
  const season = Number(snapshot?.season);
  const layouts = seasonRows(snapshot?.circuitLayoutBaseline1980, season);
  const evolution = seasonRows(snapshot?.trackEvolutionBaseline1980, season);
  const weather = seasonRows(snapshot?.weatherProfileBaseline1980, season);
  if (!layouts.length && !evolution.length && !weather.length) return { layouts: 0, evolution: 0, weather: 0 };

  const layoutByTrack = byId(layouts, "track_id");
  const evolutionByTrack = byId(evolution, "track_id");
  const weatherByTrack = byId(weather, "track_id");

  snapshot.tracks = (snapshot.tracks ?? []).map((source) => {
    const track = structuredClone(source);
    const layout = layoutByTrack.get(track.track_id);
    const evo = evolutionByTrack.get(track.track_id);
    const climate = weatherByTrack.get(track.track_id);
    if (layout) {
      track.lap_length_km = numeric(layout.layout_lap_length_km, track.lap_length_km);
      track.laps_default = numeric(layout.scheduled_laps, track.laps_default);
      track.period_correct_track_name = layout.period_correct_track_name ?? track.period_correct_track_name ?? null;
      track.season_layout_year = numeric(layout.layout_year_reference, season);
      track.season_layout_source = layout.layout_data_status ?? "historical_season_geometry";
      track.power_sensitivity = numeric(layout.power_sensitivity_index, track.power_sensitivity);
      track.aero_sensitivity = numeric(layout.aero_sensitivity_index, track.aero_sensitivity);
      track.brake_stress = numeric(layout.brake_stress_index, track.brake_stress);
      track.tyre_wear = numeric(layout.tyre_wear_index, track.tyre_wear);
      track.overtaking_difficulty = numeric(layout.overtaking_difficulty_index, track.overtaking_difficulty);
      track.incident_risk = numeric(layout.incident_risk_index, track.incident_risk);
    }
    if (evo) {
      const rubbering = numeric(evo.rubbering_rate_index);
      if (rubbering !== null) {
        track.track_evolution_rate = rubbering;
        track.rubbering_rate = rubbering;
      }
      track.green_track_penalty_index = numeric(evo.green_track_penalty_index);
      track.qualifying_evolution_effect_index = numeric(evo.qualifying_evolution_effect_index);
      track.race_grip_stability_index = numeric(evo.race_grip_stability_index);
      track.offline_marble_risk_index = numeric(evo.offline_marble_risk_index);
      track.track_evolution_source = evo.source_lock_status ?? "derived_gameplay_baseline";
    }
    if (climate) {
      track.weather_probability_baseline = {
        weatherProfileId: climate.weather_profile_id ?? null,
        climateBand: climate.climate_band ?? null,
        averageAirTempC: numeric(climate.avg_air_temp_c_baseline),
        rainChancePercent: numeric(climate.rain_chance_percent_baseline),
        stormChancePercent: numeric(climate.storm_chance_percent_baseline),
        windProfile: climate.wind_profile_baseline ?? null,
        exactHistoricalWeekendKnown: Boolean(climate.exact_1980_weekend_weather_known),
        source: climate.source_lock_status ?? "derived_gameplay_baseline",
      };
    }
    return track;
  });

  const layoutByGp = byId(layouts, "gp_id");
  const evolutionByGp = byId(evolution, "gp_id");
  const weatherByGp = byId(weather, "gp_id");
  snapshot.calendar = (snapshot.calendar ?? []).map((source) => {
    const race = structuredClone(source);
    const layout = layoutByGp.get(race.gp_id) ?? layoutByTrack.get(race.track_id);
    const evo = evolutionByGp.get(race.gp_id) ?? evolutionByTrack.get(race.track_id);
    const climate = weatherByGp.get(race.gp_id) ?? weatherByTrack.get(race.track_id);
    if (layout) {
      race.season_layout_lap_length_km = numeric(layout.layout_lap_length_km, race.season_layout_lap_length_km);
      race.scheduled_laps = numeric(layout.scheduled_laps, race.scheduled_laps);
      race.scheduled_distance_km = numeric(layout.scheduled_distance_km, race.scheduled_distance_km);
      race.period_correct_track_name = layout.period_correct_track_name ?? race.period_correct_track_name ?? null;
      race.layout_source_status = layout.layout_data_status ?? null;
    }
    if (evo) {
      race.track_evolution_rate = numeric(evo.rubbering_rate_index, race.track_evolution_rate);
      race.track_evolution_source = evo.source_lock_status ?? "derived_gameplay_baseline";
    }
    if (climate) {
      race.weather_probability_baseline = {
        weatherProfileId: climate.weather_profile_id ?? null,
        climateBand: climate.climate_band ?? null,
        averageAirTempC: numeric(climate.avg_air_temp_c_baseline),
        rainChancePercent: numeric(climate.rain_chance_percent_baseline),
        stormChancePercent: numeric(climate.storm_chance_percent_baseline),
        windProfile: climate.wind_profile_baseline ?? null,
        exactHistoricalWeekendKnown: Boolean(climate.exact_1980_weekend_weather_known),
        source: climate.source_lock_status ?? "derived_gameplay_baseline",
      };
    }
    return race;
  });

  return { layouts: layouts.length, evolution: evolution.length, weather: weather.length };
}

const OPERATIONAL_REFERENCE_EXCEPTIONS = new Set([
  "driverAvailabilitySnapshot1980",
  "driverCareerIntervalsV1213",
  "teamFinanceBaseline1980",
  "sponsorCommercialBaseline1980",
  "payrollCompensationBaseline1980",
  "circuitLayoutBaseline1980",
  "weatherProfileBaseline1980",
  "trackEvolutionBaseline1980",
  "operationalRegulationFallbacks1980V1216",
]);

function referenceOnlyField(name) {
  if (OPERATIONAL_REFERENCE_EXCEPTIONS.has(name)) return false;
  return /(?:audit|readiness|source.?manifest|source.?lock|data.?policy|materializer.*delta|unknown.*field|cumulative.*integrity|corrective.*diff|publication.*fix|supersession|canonical.*closure|canonical.*readiness|materializationAudit|databasePublicationStatus|baselineDiff|summaryCards)/i.test(name);
}

export function extractDatabaseAuditReferenceContext(snapshot) {
  const reference = {};
  for (const name of Object.keys(snapshot ?? {})) {
    if (!referenceOnlyField(name)) continue;
    reference[name] = structuredClone(snapshot[name]);
    delete snapshot[name];
  }
  return reference;
}

export function applyDatabaseOpeningState(snapshot) {
  if (!snapshot?.season) throw new TypeError("A season snapshot is required.");
  const financeTeams = applyFinanceBaseline(snapshot);
  const circuits = applyCircuitBaselines(snapshot);
  return {
    season: Number(snapshot.season),
    financeTeams,
    circuitLayouts: circuits.layouts,
    trackEvolutionProfiles: circuits.evolution,
    weatherProbabilityProfiles: circuits.weather,
  };
}
