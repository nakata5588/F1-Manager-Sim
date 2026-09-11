function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalized(value, fallback = 0.5) {
  const parsed = numeric(value);
  if (parsed === null) return fallback;
  return clamp(parsed <= 1 ? parsed : parsed / 100, 0, 1);
}

function parseSectorRows(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeWeights(rows) {
  const total = rows.reduce((sum, row) => sum + Math.max(0.01, numeric(row.weight, 1)), 0);
  return rows.map((row) => ({ ...row, weight: Math.max(0.01, numeric(row.weight, 1)) / total }));
}

function explicitSectorModel(track) {
  const rows = parseSectorRows(
    track?.sector_model
      ?? track?.sector_profile
      ?? track?.sectors
      ?? track?.sector_traits,
  );
  if (!rows.length) return null;

  const normalizedRows = rows.map((row, index) => ({
    id: String(row?.id ?? row?.sector_id ?? row?.sector ?? `S${index + 1}`),
    name: String(row?.name ?? row?.sector_name ?? `Sector ${index + 1}`),
    weight: numeric(row?.weight ?? row?.length_share ?? row?.lap_share, 1),
    overtakingDifficulty: normalized(row?.overtaking_difficulty ?? row?.passing_difficulty, normalized(track?.overtaking_difficulty, 0.5)),
    incidentRisk: normalized(row?.incident_risk ?? row?.crash_risk, normalized(track?.incident_risk ?? track?.crash_risk, 0.5)),
    powerSensitivity: normalized(row?.power_sensitivity ?? row?.power_dependency, normalized(track?.power_sensitivity ?? track?.power_dependency, 0.5)),
    aeroSensitivity: normalized(row?.aero_sensitivity ?? row?.aero_dependency, normalized(track?.aero_sensitivity ?? track?.aero_dependency, 0.5)),
    brakeStress: normalized(row?.brake_stress, normalized(track?.brake_stress, 0.5)),
    technicality: normalized(row?.technicality ?? row?.handling_dependency, normalized(track?.technicality, 0.5)),
  }));

  return {
    source: "explicit_sector_data",
    dataStatus: "explicit",
    sectors: normalizeWeights(normalizedRows),
  };
}

function derivedSectorModel(track) {
  const overallPassing = normalized(track?.overtaking_difficulty ?? track?.passing_difficulty, 0.5);
  const incident = normalized(track?.incident_risk ?? track?.crash_risk, 0.5);
  const power = normalized(track?.power_sensitivity ?? track?.power_dependency, 0.5);
  const aero = normalized(track?.aero_sensitivity ?? track?.aero_dependency, 0.5);
  const brakes = normalized(track?.brake_stress, 0.5);
  const technical = normalized(track?.technicality ?? track?.handling_dependency, 0.5);

  return {
    source: "derived_track_traits",
    dataStatus: "simulation_approximation",
    sectors: normalizeWeights([
      {
        id: "S1",
        name: "Sector 1",
        weight: 0.33,
        overtakingDifficulty: clamp(overallPassing - power * 0.16 + brakes * 0.05, 0.05, 0.95),
        incidentRisk: clamp(incident * 0.9 + brakes * 0.08, 0.02, 1),
        powerSensitivity: clamp(power + 0.16, 0, 1),
        aeroSensitivity: clamp(aero - 0.08, 0, 1),
        brakeStress: clamp(brakes + 0.1, 0, 1),
        technicality: clamp(technical - 0.08, 0, 1),
      },
      {
        id: "S2",
        name: "Sector 2",
        weight: 0.34,
        overtakingDifficulty: clamp(overallPassing + technical * 0.12 + aero * 0.06, 0.05, 0.98),
        incidentRisk: clamp(incident + technical * 0.1, 0.02, 1),
        powerSensitivity: clamp(power - 0.12, 0, 1),
        aeroSensitivity: clamp(aero + 0.15, 0, 1),
        brakeStress: clamp(brakes - 0.04, 0, 1),
        technicality: clamp(technical + 0.16, 0, 1),
      },
      {
        id: "S3",
        name: "Sector 3",
        weight: 0.33,
        overtakingDifficulty: clamp(overallPassing - brakes * 0.12 + power * 0.04, 0.05, 0.95),
        incidentRisk: clamp(incident * 0.95 + brakes * 0.05, 0.02, 1),
        powerSensitivity: clamp(power + 0.05, 0, 1),
        aeroSensitivity: clamp(aero - 0.02, 0, 1),
        brakeStress: clamp(brakes + 0.15, 0, 1),
        technicality: clamp(technical, 0, 1),
      },
    ]),
  };
}

export function resolveSectorModel(track = {}) {
  return explicitSectorModel(track) ?? derivedSectorModel(track);
}

export function selectIncidentSector(seedRng, sectors) {
  const rows = Array.isArray(sectors) && sectors.length ? sectors : resolveSectorModel({}).sectors;
  const weights = rows.map((sector) => Math.max(0.001, sector.weight * (0.35 + sector.incidentRisk * 0.65)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = seedRng.next() * total;
  for (let index = 0; index < rows.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return rows[index];
  }
  return rows[rows.length - 1];
}

export function sectorPaceModifier(state, sector, condition = "dry") {
  const technique = clamp(Number(state?.racecraft ?? 50), 0, 100);
  const consistency = clamp(Number(state?.consistency ?? 50), 0, 100);
  const wetSkill = clamp(Number(state?.wetSkill ?? 50), 0, 100);
  const technicalPenalty = (50 - technique) * sector.technicality * 0.0025;
  const precisionPenalty = (50 - consistency) * sector.brakeStress * 0.0015;
  const wetPenalty = condition === "wet"
    ? (50 - wetSkill) * (0.35 + sector.technicality * 0.65) * 0.002
    : condition === "damp"
      ? (50 - wetSkill) * (0.25 + sector.technicality * 0.45) * 0.001
      : 0;
  return technicalPenalty + precisionPenalty + wetPenalty;
}
