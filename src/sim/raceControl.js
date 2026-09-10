import { createRng } from "./random.js";

function numeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function flag(value, fallback = false) {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  if (["true", "yes", "enabled", "1"].includes(text)) return true;
  if (["false", "no", "disabled", "0"].includes(text)) return false;
  return fallback;
}

function positiveInteger(sources, names, fallback) {
  for (const source of sources) {
    for (const name of names) {
      const parsed = Number(source?.[name]);
      if (Number.isFinite(parsed) && parsed > 0) return Math.max(1, Math.round(parsed));
    }
  }
  return fallback;
}

export function resolveRaceControlPolicy(saveWorld) {
  const era = saveWorld.world?.eraSafety ?? {};
  const params = saveWorld.world?.raceModelParams ?? {};
  const rules = saveWorld.world?.rules ?? {};
  const modernSafetyCar = flag(
    era.modern_safety_car
      ?? params.modern_safety_car
      ?? rules.modern_safety_car,
    false,
  );
  const virtualSafetyCar = flag(
    era.virtual_safety_car
      ?? era.vsc
      ?? params.virtual_safety_car
      ?? rules.virtual_safety_car,
    false,
  );
  const yellowFlags = flag(era.yellow_flags ?? params.yellow_flags, false);
  const redFlags = flag(era.red_flags ?? params.red_flags, false);
  const sources = [era, params, rules];

  return {
    yellowFlags,
    redFlags,
    modernSafetyCar,
    virtualSafetyCar,
    safetyCarMode: modernSafetyCar ? "available" : "unavailable_in_era",
    vscMode: virtualSafetyCar ? "available" : "unavailable_in_era",
    safetyCarDurationLaps: positiveInteger(sources, ["safety_car_duration_laps", "safety_car_min_laps"], 3),
    virtualSafetyCarDurationLaps: positiveInteger(sources, ["virtual_safety_car_duration_laps", "vsc_duration_laps"], 2),
    redFlagRestartLaps: positiveInteger(sources, ["red_flag_restart_delay_laps", "red_flag_neutral_laps"], 1),
    source: era.source ?? (Object.keys(era).length ? "era_safety" : "rules_unspecified"),
  };
}

function trackForRace(saveWorld, race) {
  const id = race.trackId ?? race.track_id ?? race.circuitId ?? race.circuit_id;
  return (saveWorld.world?.tracks ?? []).find((row) => row.track_id === id || row.circuit_id === id) ?? {};
}

function driverCrashRating(saveWorld, driverId) {
  const state = saveWorld.world?.careerState?.drivers?.[driverId] ?? {};
  const dynamic = state.attributes ?? {};
  const rating = (saveWorld.world?.driverRatings ?? []).find((row) => row.driver_id === driverId) ?? {};
  return clamp(numeric(dynamic.crash_likelihood ?? rating.crash_likelihood, 20), 0, 100);
}

export function incidentSeverity(saveWorld, race, event) {
  const explicit = numeric(event.severity ?? event.severityScore ?? event.severity_score);
  if (explicit !== null) return clamp(explicit, 0, 100);
  const track = trackForRace(saveWorld, race);
  const incidentRiskRaw = numeric(track.incident_risk ?? track.crash_risk, 50);
  const incidentRisk = clamp(incidentRiskRaw <= 1 ? incidentRiskRaw * 100 : incidentRiskRaw, 0, 100);
  const crash = driverCrashRating(saveWorld, event.driverId);
  const rng = createRng(`${saveWorld.meta.seed}|${race.key ?? race.gpId ?? "race"}|race-control|${event.lap}|${event.driverId}`);
  return clamp(25 + incidentRisk * 0.28 + crash * 0.18 + rng.next() * 38, 0, 100);
}

function localYellow(event, severity) {
  const duration = severity >= 70 ? 2 : 1;
  return {
    type: "local_yellow",
    lap: event.lap,
    startLap: event.lap,
    endLap: Number(event.lap ?? 0) + duration - 1,
    durationLaps: duration,
    driverId: event.driverId ?? null,
    severity: Number(severity.toFixed(2)),
    clearsAfterLap: Number(event.lap ?? 0) + duration,
    effectStatus: "live_global_approximation_pending_sector_model",
    source: "severity_policy",
  };
}

export function decideLiveRaceControl(saveWorld, race, event, suppliedPolicy = null) {
  if (event?.type !== "retirement" || event?.reason !== "incident") return null;
  const policy = suppliedPolicy ?? resolveRaceControlPolicy(saveWorld);
  const severity = incidentSeverity(saveWorld, race, event);
  const lap = Math.max(1, Math.round(Number(event.lap ?? 1)));

  if (policy.redFlags && severity >= 90) {
    const duration = Math.max(1, Number(policy.redFlagRestartLaps ?? 1));
    return {
      type: "red_flag",
      lap,
      startLap: lap,
      endLap: lap + duration,
      durationLaps: duration,
      restartLap: lap + duration,
      driverId: event.driverId ?? null,
      severity: Number(severity.toFixed(2)),
      fieldCompression: 0.02,
      overtakingAllowed: false,
      effectStatus: "live",
      source: "era_race_control",
    };
  }

  if (policy.modernSafetyCar && severity >= 65) {
    const duration = Math.max(1, Number(policy.safetyCarDurationLaps ?? 3));
    return {
      type: "safety_car",
      lap,
      startLap: lap,
      endLap: lap + duration - 1,
      durationLaps: duration,
      driverId: event.driverId ?? null,
      severity: Number(severity.toFixed(2)),
      fieldCompression: 0.15,
      overtakingAllowed: false,
      effectStatus: "live",
      source: "era_race_control",
    };
  }

  if (policy.virtualSafetyCar && severity >= 55) {
    const duration = Math.max(1, Number(policy.virtualSafetyCarDurationLaps ?? 2));
    return {
      type: "virtual_safety_car",
      lap,
      startLap: lap,
      endLap: lap + duration - 1,
      durationLaps: duration,
      driverId: event.driverId ?? null,
      severity: Number(severity.toFixed(2)),
      fieldCompression: null,
      overtakingAllowed: false,
      effectStatus: "live",
      source: "era_race_control",
    };
  }

  return policy.yellowFlags ? localYellow(event, severity) : null;
}

export function reviewRaceTimeline(saveWorld, race) {
  const policy = resolveRaceControlPolicy(saveWorld);
  const timelineEvents = race.timeline?.events ?? [];
  const interventions = [];
  const reviews = [];

  for (const event of timelineEvents) {
    if (event.type !== "retirement" || event.reason !== "incident") continue;
    const severity = incidentSeverity(saveWorld, race, event);

    if (policy.redFlags && severity >= 90) {
      reviews.push({
        type: "red_flag_review",
        lap: event.lap,
        driverId: event.driverId ?? null,
        severity: Number(severity.toFixed(2)),
        decision: "candidate",
        effectStatus: race.timeline?.raceControlLive ? "already_applied_live" : "awaiting_resumable_race_control",
      });
    }

    if (policy.modernSafetyCar && severity >= 65) {
      reviews.push({
        type: "safety_car_review",
        lap: event.lap,
        driverId: event.driverId ?? null,
        severity: Number(severity.toFixed(2)),
        decision: "candidate",
        effectStatus: race.timeline?.raceControlLive ? "already_applied_live" : "awaiting_resumable_race_control",
      });
      continue;
    }

    if (policy.virtualSafetyCar && severity >= 55) {
      reviews.push({
        type: "virtual_safety_car_review",
        lap: event.lap,
        driverId: event.driverId ?? null,
        severity: Number(severity.toFixed(2)),
        decision: "candidate",
        effectStatus: race.timeline?.raceControlLive ? "already_applied_live" : "awaiting_resumable_race_control",
      });
      continue;
    }

    if (policy.yellowFlags) interventions.push(localYellow(event, severity));
  }

  return {
    policy,
    interventions,
    reviews,
    status: race.timeline?.raceControlLive ? "applied_live" : reviews.length ? "control_review_pending_live_engine" : "reviewed",
    note: race.timeline?.raceControlLive
      ? "Era-available Race Control interventions were applied during temporal simulation; this review is an audit summary only."
      : reviews.length
        ? "Safety Car/VSC/red-flag candidates are recorded but not allowed to rewrite an already-resolved race. They become active control decisions in the resumable race engine."
        : "Only era-available control mechanisms were considered.",
  };
}
