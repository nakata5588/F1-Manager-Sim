function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 4) {
  return Number(Number(value).toFixed(digits));
}

function normalize(value, fallback = null) {
  const parsed = numeric(value);
  if (parsed === null) return fallback;
  return clamp(parsed <= 1 ? parsed : parsed / 100, 0, 1);
}

export function resolveTrackEvolutionModel(track = {}) {
  const explicit = normalize(
    track.track_evolution_rate
      ?? track.grip_evolution
      ?? track.rubbering_rate,
    null,
  );
  return {
    rate: explicit ?? 0.5,
    source: explicit === null ? "simulation_default" : "track_data",
    dataStatus: explicit === null ? "simulation_tuning" : "explicit",
  };
}

function segmentStartLap(weatherChanges, lap, condition) {
  let start = 1;
  for (const change of weatherChanges ?? []) {
    if (Number(change.lap) > lap) break;
    if (String(change.condition) === String(condition)) start = Number(change.lap);
    else start = Number(change.lap);
  }
  return Math.max(1, start);
}

export function trackEvolutionAt(track, weatherChanges, lap, totalLaps, condition) {
  const model = resolveTrackEvolutionModel(track);
  const start = segmentStartLap(weatherChanges, lap, condition);
  const segmentLength = Math.max(1, totalLaps - start + 1);
  const progress = clamp((lap - start) / segmentLength, 0, 1);

  let paceModifier = 0;
  let gripIndex = 50;
  if (condition === "dry") {
    const gain = 0.18 + model.rate * 0.34;
    paceModifier = -gain * progress;
    gripIndex = 50 + progress * (4 + model.rate * 6);
  } else if (condition === "damp") {
    paceModifier = 0.16 - model.rate * 0.08 * progress;
    gripIndex = 45 + progress * model.rate * 3;
  } else {
    paceModifier = 0.32 - model.rate * 0.04 * progress;
    gripIndex = 38 + progress * model.rate * 2;
  }

  return {
    source: model.source,
    dataStatus: model.dataStatus,
    rate: model.rate,
    segmentStartLap: start,
    progress: round(progress, 4),
    gripIndex: round(gripIndex, 3),
    paceModifier: round(paceModifier, 4),
  };
}
