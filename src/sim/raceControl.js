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

  return {
    yellowFlags,
    redFlags,
    modernSafetyCar,
    virtualSafetyCar,
    safetyCarMode: modernSafetyCar ? "available" : "unavailable_in_era",
    vscMode: virtualSafetyCar ? "available" : "unavailable_in_era",
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

function incidentSeverity(saveWorld, race, event) {
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
    driverId: event.driverId ?? null,
    severity: Number(severity.toFixed(2)),
    clearsAfterLap: Number(event.lap ?? 0) + duration,
    effectStatus: "recorded_pending_sector_model",
  };
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
        effectStatus: "awaiting_resumable_race_control",
      });
    }

    if (policy.modernSafetyCar && severity >= 65) {
      reviews.push({
        type: "safety_car_review",
        lap: event.lap,
        driverId: event.driverId ?? null,
        severity: Number(severity.toFixed(2)),
        decision: "candidate",
        effectStatus: "awaiting_resumable_race_control",
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
        effectStatus: "awaiting_resumable_race_control",
      });
      continue;
    }

    if (policy.yellowFlags) interventions.push(localYellow(event, severity));
  }

  return {
    policy,
    interventions,
    reviews,
    status: reviews.length ? "control_review_pending_live_engine" : "reviewed",
    note: reviews.length
      ? "Safety Car/VSC/red-flag candidates are recorded but not allowed to rewrite an already-resolved race. They become active control decisions in the resumable race engine."
      : "Only era-available control mechanisms were considered.",
  };
}
