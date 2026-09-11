import { createRng } from "./random.js";
import { incidentSeverity } from "./raceControl.js";

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

function round(value, digits = 4) {
  return Number(Number(value).toFixed(digits));
}

export function resolveDamagePolicy(saveWorld) {
  const rules = saveWorld.world?.rules ?? {};
  const params = saveWorld.world?.raceModelParams ?? {};
  const explicitRepair = rules.pit_repairs_allowed
    ?? rules.race_repairs_allowed
    ?? params.pit_repairs_allowed
    ?? params.race_repairs_allowed;
  const explicit = explicitRepair !== undefined && explicitRepair !== null && String(explicitRepair).trim() !== "";
  return {
    pitRepairsAllowed: flag(explicitRepair, true),
    source: explicit ? "season_rules" : "simulation_default_limited_repairs",
  };
}

function chooseDamageType(saveWorld, weekend, event, sector = {}) {
  const weights = [
    ["aero", 0.22 + clamp(numeric(sector.aeroSensitivity, 0.5), 0, 1) * 0.22],
    ["suspension", 0.2 + clamp(numeric(sector.technicality, 0.5), 0, 1) * 0.2],
    ["brakes", 0.13 + clamp(numeric(sector.brakeStress, 0.5), 0, 1) * 0.22],
    ["bodywork", 0.28],
  ];
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  const rng = createRng(`${saveWorld.meta.seed}|${weekend.key}|damage-type|${event.lap}|${event.sectorId ?? "unknown"}|${event.driverId}`);
  let cursor = rng.next() * total;
  for (const [type, weight] of weights) {
    cursor -= weight;
    if (cursor <= 0) return type;
  }
  return "bodywork";
}

function repairLimit(type) {
  if (type === "bodywork") return 78;
  if (type === "aero") return 72;
  if (type === "brakes") return 48;
  if (type === "suspension") return 42;
  return 55;
}

function paceLoss(type, severity) {
  const multiplier = type === "aero" ? 1.15
    : type === "suspension" ? 1.25
      : type === "brakes" ? 1.2
        : 0.9;
  return clamp((severity / 100) ** 1.35 * 5.2 * multiplier, 0.05, 8);
}

export function resolveIncidentDamage(saveWorld, weekend, event, sector = {}) {
  const severity = incidentSeverity(saveWorld, weekend, event);
  const type = chooseDamageType(saveWorld, weekend, { ...event, severity }, sector);
  const rng = createRng(`${saveWorld.meta.seed}|${weekend.key}|damage-outcome|${event.lap}|${event.sectorId ?? "unknown"}|${event.driverId}`);
  const terminalProbability = severity >= 92 ? 1 : clamp((severity - 58) / 55, 0, 0.72);
  const terminal = rng.next() < terminalProbability;
  const policy = resolveDamagePolicy(saveWorld);
  const repairable = !terminal && policy.pitRepairsAllowed && severity <= repairLimit(type);
  const loss = terminal ? 0 : paceLoss(type, severity);

  return {
    id: `${event.driverId}:${event.lap}:${event.sectorId ?? "unknown"}:${type}`,
    driverId: event.driverId,
    lap: Number(event.lap),
    sectorId: event.sectorId ?? null,
    type,
    severity: round(severity, 2),
    terminal,
    repairable,
    paceLossIndex: round(loss, 4),
    repairPolicySource: policy.source,
    status: terminal ? "terminal" : repairable ? "repairable" : "persistent",
  };
}

function staffRepairCapability(saveWorld, teamId) {
  const assignments = saveWorld.world?.employment?.staff ?? {};
  const staffIds = Object.entries(assignments)
    .filter(([, row]) => row?.teamId === teamId && row?.status === "employed")
    .map(([staffId]) => staffId);
  if (!staffIds.length) return 50;
  const values = staffIds.map((staffId) => {
    const dynamic = saveWorld.world?.careerState?.staff?.[staffId]?.attributes ?? {};
    const source = (saveWorld.world?.staffRatings ?? []).find((row) => row.staff_id === staffId) ?? {};
    const technical = clamp(numeric(dynamic.technical ?? source.technical, 50), 0, 100);
    const pit = clamp(numeric(dynamic.pitstop_management ?? source.pitstop_management, 50), 0, 100);
    return technical * 0.62 + pit * 0.38;
  });
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function repairDamageAtPit(saveWorld, teamId, damageItems = [], entropyKey = "repair") {
  const capability = staffRepairCapability(saveWorld, teamId);
  const repaired = [];
  const remaining = [];
  let lossIndex = 0;

  for (const item of damageItems ?? []) {
    if (!item?.repairable || item?.status === "repaired") {
      remaining.push(item);
      continue;
    }
    const rng = createRng(`${saveWorld.meta.seed}|${entropyKey}|${item.id}`);
    const execution = clamp(capability + (rng.next() - 0.5) * 12, 0, 100);
    const repairLoss = 0.55 + item.severity * 0.035 * (1.28 - execution / 180);
    lossIndex += repairLoss;
    repaired.push({
      ...item,
      status: "repaired",
      repaired: true,
      repairExecution: round(execution, 2),
      repairLossIndex: round(repairLoss, 4),
    });
  }

  return {
    capability: round(capability, 2),
    repaired,
    remaining,
    lossIndex: round(lossIndex, 4),
    paceLossRecovered: round(repaired.reduce((sum, item) => sum + numeric(item.paceLossIndex, 0), 0), 4),
  };
}

export function activeDamagePaceLoss(damageItems = []) {
  return round((damageItems ?? [])
    .filter((item) => item?.status !== "repaired" && !item?.terminal)
    .reduce((sum, item) => sum + numeric(item.paceLossIndex, 0), 0), 4);
}
