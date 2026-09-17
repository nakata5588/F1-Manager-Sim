from pathlib import Path


def read(path):
    return Path(path).read_text(encoding="utf-8")


def write(path, content):
    Path(path).write_text(content, encoding="utf-8")


def replace(path, before, after):
    source = read(path)
    if before not in source:
        raise RuntimeError(f"Expected patch anchor not found in {path}: {before[:120]!r}")
    write(path, source.replace(before, after, 1))


# ---------------------------------------------------------------------------
# 1) Ownership / governance identities stay visible but cannot be recruited.
# ---------------------------------------------------------------------------
path = "src/game/management/staffRecruitment.js"
replace(path, '''function roleLabel(profile, assignmentRow) {
  return assignmentRow?.role ?? profile?.role ?? profile?.staff_role ?? profile?.job ?? "staff";
}
''', '''function roleLabel(profile, assignmentRow) {
  return assignmentRow?.role ?? profile?.role ?? profile?.staff_role ?? profile?.job ?? "staff";
}

const OWNERSHIP_GOVERNANCE_ROLE = /\\b(?:owner|co[-\\s]?owner|chairman|chairwoman|chairperson|president|proprietor|founder|co[-\\s]?founder)\\b/i;

function governanceIdentityText(profile, current) {
  return [
    current?.role,
    profile?.role,
    profile?.staff_role,
    profile?.job,
    profile?.position,
    profile?.title,
    profile?.occupation,
    profile?.role_name,
  ].filter(Boolean).join(" ");
}

export function staffRecruitmentEligibility(saveWorld, staffId) {
  const profile = personProfile(saveWorld, "staff", staffId);
  if (!profile) return { eligible: false, reason: "unknown_staff", role: null };
  const current = assignment(saveWorld, staffId);
  const role = roleLabel(profile, current);
  const ownershipLocked = OWNERSHIP_GOVERNANCE_ROLE.test(governanceIdentityText(profile, current));
  return {
    eligible: !ownershipLocked,
    reason: ownershipLocked ? "governance_ownership_locked" : null,
    role,
  };
}

function assertStaffRecruitable(saveWorld, staffId) {
  const eligibility = staffRecruitmentEligibility(saveWorld, staffId);
  if (!eligibility.eligible) {
    const name = staffName(saveWorld, staffId);
    if (eligibility.reason === "governance_ownership_locked") {
      throw new Error(`${name} is part of the team's ownership/governance structure and cannot be recruited through an ordinary staff contract.`);
    }
    throw new Error(`Staff '${staffId}' is not recruitable.`);
  }
  return eligibility;
}
''')

replace(path, '''  return listVisibleStaff(saveWorld, { requireF1Eligible: true })
    .map((profile) => {''', '''  return listVisibleStaff(saveWorld, { requireF1Eligible: true })
    .filter((profile) => staffRecruitmentEligibility(saveWorld, profile.staff_id ?? profile.id).eligible)
    .map((profile) => {''')

replace(path, '''  if (!staffId || !teamId) throw new Error("staffId and teamId are required.");
  if (!listVisibleStaff(saveWorld, { requireF1Eligible: true }).some((row) => String(row.staff_id ?? row.id) === staffId)) throw new Error(`Staff '${staffId}' is not available in the visible market.`);
  const current = assignment(saveWorld, staffId);''', '''  if (!staffId || !teamId) throw new Error("staffId and teamId are required.");
  if (!listVisibleStaff(saveWorld, { requireF1Eligible: true }).some((row) => String(row.staff_id ?? row.id) === staffId)) throw new Error(`Staff '${staffId}' is not available in the visible market.`);
  assertStaffRecruitable(saveWorld, staffId);
  const current = assignment(saveWorld, staffId);''')

replace(path, '''export function submitStaffContractOfferEvent(saveWorld, negotiationId, input = {}) {
  const negotiation = ensureState(saveWorld).negotiations.find((row) => row.id === negotiationId);
  if (!negotiation || negotiation.status !== "open") throw new Error(`Open staff negotiation '${negotiationId}' does not exist.`);
  const offer = normalizeOffer(negotiation, input);''', '''export function submitStaffContractOfferEvent(saveWorld, negotiationId, input = {}) {
  const negotiation = ensureState(saveWorld).negotiations.find((row) => row.id === negotiationId);
  if (!negotiation || negotiation.status !== "open") throw new Error(`Open staff negotiation '${negotiationId}' does not exist.`);
  assertStaffRecruitable(saveWorld, negotiation.staffId);
  const offer = normalizeOffer(negotiation, input);''')

replace(path, '''export function acceptStaffCounterEvent(saveWorld, negotiationId) {
  const negotiation = ensureState(saveWorld).negotiations.find((row) => row.id === negotiationId);
  if (!negotiation || negotiation.status !== "countered" || !negotiation.counterTerms) throw new Error(`Staff negotiation '${negotiationId}' has no counter-offer.`);
  return { type: STAFF_NEGOTIATION_EVENT.COUNTER_ACCEPTED, payload: { negotiation_id: negotiation.id } };
}''', '''export function acceptStaffCounterEvent(saveWorld, negotiationId) {
  const negotiation = ensureState(saveWorld).negotiations.find((row) => row.id === negotiationId);
  if (!negotiation || negotiation.status !== "countered" || !negotiation.counterTerms) throw new Error(`Staff negotiation '${negotiationId}' has no counter-offer.`);
  assertStaffRecruitable(saveWorld, negotiation.staffId);
  return { type: STAFF_NEGOTIATION_EVENT.COUNTER_ACCEPTED, payload: { negotiation_id: negotiation.id } };
}''')


# ---------------------------------------------------------------------------
# 2) Era-aware facilities.
# ---------------------------------------------------------------------------
path = "src/game/management/technical.js"
replace(path, '''const FACILITIES = Object.freeze({
  windTunnel: { label: "Wind Tunnel", field: "wind_tunnel_level", discipline: "aero", baseCost: 180000 },
  simulator: { label: "Simulator", field: "simulator_level", discipline: "general", baseCost: 150000 },
  aeroDepartment: { label: "Aero Department", field: "aero_dept_level", discipline: "aero", baseCost: 165000 },
  chassisShop: { label: "Chassis Shop", field: "chassis_shop_level", discipline: "chassis", baseCost: 150000 },
  manufacturing: { label: "Manufacturing", field: "manufacturing_level", legacyField: "manufacturing_leve", discipline: "manufacturing", baseCost: 170000 },
});
''', '''const FACILITIES = Object.freeze({
  windTunnel: { label: "Wind Tunnel", field: "wind_tunnel_level", discipline: "aero", baseCost: 180000 },
  simulator: { label: "Simulator", field: "simulator_level", discipline: "general", baseCost: 150000 },
  aeroDepartment: { label: "Aero Department", field: "aero_dept_level", discipline: "aero", baseCost: 165000 },
  chassisShop: { label: "Chassis Shop", field: "chassis_shop_level", discipline: "chassis", baseCost: 150000 },
  manufacturing: { label: "Manufacturing", field: "manufacturing_level", legacyField: "manufacturing_leve", discipline: "manufacturing", baseCost: 170000 },
});

function explicitFacilityAvailability(saveWorld, facilityId) {
  const candidates = [
    saveWorld.world?.facilityAvailability?.[facilityId],
    saveWorld.world?.eraTechnology?.facilities?.[facilityId],
    saveWorld.world?.technicalEra?.facilities?.[facilityId],
  ];
  const raw = candidates.find((value) => value !== null && value !== undefined);
  if (raw === undefined) return null;
  const season = Number(saveWorld.clock?.season);
  if (typeof raw === "boolean") {
    return { available: raw, unlockSeason: null, source: "save_world_explicit_availability" };
  }
  if (Number.isFinite(Number(raw))) {
    const unlockSeason = Number(raw);
    return { available: season >= unlockSeason, unlockSeason, source: "save_world_explicit_unlock_season" };
  }
  if (typeof raw !== "object") return null;
  const unlockSeason = numeric(raw.availableFrom ?? raw.available_from ?? raw.unlockSeason ?? raw.unlock_season);
  const explicit = raw.available ?? raw.enabled;
  if (explicit === undefined && unlockSeason === null) return null;
  const available = explicit === false ? false : unlockSeason !== null ? season >= unlockSeason : explicit === true;
  return { available, unlockSeason, source: raw.source ?? "save_world_explicit_availability" };
}

export function facilityEraAvailability(saveWorld, facilityId) {
  const explicit = explicitFacilityAvailability(saveWorld, facilityId);
  if (explicit) {
    return {
      ...explicit,
      status: explicit.available ? "available" : "unavailable_future_technology",
    };
  }
  if (facilityId === "simulator") {
    return {
      available: false,
      status: "unavailable_future_technology",
      unlockSeason: null,
      source: "derived_gameplay_era_policy_pending_future_unlock",
    };
  }
  return {
    available: true,
    status: "available",
    unlockSeason: null,
    source: "era_default_available",
  };
}
''')

replace(path, '''function normalizeLevel(value, fallback = null) {
  const parsed = numeric(value, fallback);
  if (parsed === null) return null;
  if (parsed > 0 && parsed <= 1) return clamp(parsed * 10, 1, 10);
  return clamp(parsed, 1, 10);
}
''', '''function normalizeLevel(value, fallback = null) {
  const parsed = numeric(value, fallback);
  if (parsed === null) return null;
  if (parsed === 0) return 0;
  if (parsed > 0 && parsed <= 1) return clamp(parsed * 10, 1, 10);
  return clamp(parsed, 1, 10);
}
''')

replace(path, '''function initializeFacilities(saveWorld, teamId) {
  const source = teamSourceFacility(saveWorld, teamId);
  const facilities = {};
  for (const [id, definition] of Object.entries(FACILITIES)) {
    const raw = source[definition.field] ?? (definition.legacyField ? source[definition.legacyField] : null);
    const level = normalizeLevel(raw);
    if (level === null) continue;
    facilities[id] = {
      id,
      label: definition.label,
      level: round(level, 1),
      source: "historical_start_input",
      sourceField: definition.field,
      maintenanceDeltaAnnual: 0,
    };
  }
  if (!facilities.manufacturing) {
    facilities.manufacturing = {
      id: "manufacturing",
      label: FACILITIES.manufacturing.label,
      level: 5,
      source: "derived_gameplay_baseline",
      sourceField: null,
      maintenanceDeltaAnnual: 0,
    };
  }
  return facilities;
}
''', '''function initializeFacilities(saveWorld, teamId) {
  const source = teamSourceFacility(saveWorld, teamId);
  const facilities = {};
  for (const [id, definition] of Object.entries(FACILITIES)) {
    const raw = source[definition.field] ?? (definition.legacyField ? source[definition.legacyField] : null);
    const level = normalizeLevel(raw);
    const availability = facilityEraAvailability(saveWorld, id);
    if (!availability.available) {
      facilities[id] = {
        id,
        label: definition.label,
        level: null,
        availabilityStatus: "unavailable_future_technology",
        unlockSeason: availability.unlockSeason,
        availabilitySource: availability.source,
        source: "era_locked",
        sourceField: raw === null || raw === undefined ? null : definition.field,
        ignoredOpeningLevel: level,
        maintenanceDeltaAnnual: 0,
      };
      continue;
    }
    if (level === null) {
      if (id === "manufacturing") {
        facilities[id] = {
          id,
          label: definition.label,
          level: 5,
          availabilityStatus: "operational",
          unlockSeason: availability.unlockSeason,
          availabilitySource: availability.source,
          source: "derived_gameplay_baseline",
          sourceField: null,
          maintenanceDeltaAnnual: 0,
        };
      } else {
        facilities[id] = {
          id,
          label: definition.label,
          level: 0,
          availabilityStatus: "available_unbuilt",
          unlockSeason: availability.unlockSeason,
          availabilitySource: availability.source,
          source: "derived_gameplay_availability_shell",
          sourceField: null,
          maintenanceDeltaAnnual: 0,
        };
      }
      continue;
    }
    facilities[id] = {
      id,
      label: definition.label,
      level: round(level, 1),
      availabilityStatus: level > 0 ? "operational" : "available_unbuilt",
      unlockSeason: availability.unlockSeason,
      availabilitySource: availability.source,
      source: "historical_start_input",
      sourceField: definition.field,
      maintenanceDeltaAnnual: 0,
    };
  }
  return facilities;
}

function refreshFacilityAvailability(saveWorld, team) {
  for (const [id, definition] of Object.entries(FACILITIES)) {
    const availability = facilityEraAvailability(saveWorld, id);
    const current = team.facilities?.[id] ?? null;
    if (!availability.available) {
      if (!current) {
        team.facilities[id] = {
          id,
          label: definition.label,
          level: null,
          availabilityStatus: "unavailable_future_technology",
          unlockSeason: availability.unlockSeason,
          availabilitySource: availability.source,
          source: "era_locked",
          sourceField: null,
          ignoredOpeningLevel: null,
          maintenanceDeltaAnnual: 0,
        };
      }
      continue;
    }
    if (!current || current.availabilityStatus === "unavailable_future_technology") {
      team.facilities[id] = {
        id,
        label: definition.label,
        level: id === "manufacturing" ? 5 : 0,
        availabilityStatus: id === "manufacturing" ? "operational" : "available_unbuilt",
        unlockSeason: availability.unlockSeason,
        availabilitySource: availability.source,
        source: "save_world_era_unlock",
        sourceField: null,
        maintenanceDeltaAnnual: 0,
      };
    }
  }
  return team.facilities;
}
''')

replace(path, '''export function ensureTechnicalTeam(saveWorld, teamId, date = saveWorld.clock?.date ?? null) {
  const world = ensureTechnicalWorld(saveWorld);
  if (world.teams[teamId]) return world.teams[teamId];''', '''export function ensureTechnicalTeam(saveWorld, teamId, date = saveWorld.clock?.date ?? null) {
  const world = ensureTechnicalWorld(saveWorld);
  if (world.teams[teamId]) {
    refreshFacilityAvailability(saveWorld, world.teams[teamId]);
    return world.teams[teamId];
  }''')

replace(path, '''function facilityLevel(team, id, fallback = 5) {
  return numeric(team.facilities?.[id]?.level, fallback);
}

function designFacilityEfficiency(team, component) {
  const levels = component === "aero_spec"
    ? [facilityLevel(team, "windTunnel"), facilityLevel(team, "aeroDepartment")]
    : [facilityLevel(team, "chassisShop"), facilityLevel(team, "simulator")];
  return clamp(levels.reduce((sum, level) => sum + level, 0) / levels.length / 10, 0.2, 1);
}
''', '''function facilityLevel(team, id, fallback = 5) {
  const facility = team.facilities?.[id];
  if (!facility || facility.availabilityStatus === "unavailable_future_technology") return fallback;
  return numeric(facility.level, fallback);
}

function operationalFacilityLevel(team, id) {
  const facility = team.facilities?.[id];
  if (!facility || facility.availabilityStatus === "unavailable_future_technology") return null;
  const level = numeric(facility.level);
  return level !== null && level > 0 ? level : null;
}

function designFacilityEfficiency(team, component) {
  const ids = component === "aero_spec"
    ? ["windTunnel", "aeroDepartment"]
    : ["chassisShop", "simulator"];
  const levels = ids.map((id) => operationalFacilityLevel(team, id)).filter((level) => level !== null);
  const effective = levels.length ? levels : [5];
  return clamp(effective.reduce((sum, level) => sum + level, 0) / effective.length / 10, 0.2, 1);
}
''')

replace(path, '''export function startFacilityUpgrade(saveWorld, teamId, facilityId) {
  const team = ensureTechnicalTeam(saveWorld, teamId);
  const facility = team.facilities?.[facilityId];
  const definition = FACILITIES[facilityId];
  if (!facility || !definition) throw new Error(`Facility '${facilityId}' is not available for this team/era.`);
  if (team.facilityUpgrades.some((row) => row.facilityId === facilityId && row.status === "active")) throw new Error("This facility already has an active upgrade.");
  if (facility.level >= 10) throw new Error("This facility is already at the maximum supported level.");
  const fromLevel = facility.level;
  const toLevel = Math.min(10, fromLevel + 1);''', '''export function startFacilityUpgrade(saveWorld, teamId, facilityId) {
  const team = ensureTechnicalTeam(saveWorld, teamId);
  const facility = team.facilities?.[facilityId];
  const definition = FACILITIES[facilityId];
  if (!definition) throw new Error(`Facility '${facilityId}' is not supported.`);
  const availability = facilityEraAvailability(saveWorld, facilityId);
  if (!availability.available || facility?.availabilityStatus === "unavailable_future_technology") {
    throw new Error(`${definition.label} is unavailable future technology in the current era.`);
  }
  if (!facility) throw new Error(`Facility '${facilityId}' is not available for this team/era.`);
  if (team.facilityUpgrades.some((row) => row.facilityId === facilityId && row.status === "active")) throw new Error("This facility already has an active upgrade.");
  if (numeric(facility.level, 0) >= 10) throw new Error("This facility is already at the maximum supported level.");
  const fromLevel = Math.max(0, numeric(facility.level, 0));
  const toLevel = Math.min(10, fromLevel + 1);''')

replace(path, '''  team.facilityUpgrades.push(upgrade);
  ensureHistory(saveWorld).push({ date: saveWorld.clock.date, type: "facility_upgrade_started", ...structuredClone(upgrade) });''', '''  team.facilityUpgrades.push(upgrade);
  facility.availabilityStatus = "upgrading";
  ensureHistory(saveWorld).push({ date: saveWorld.clock.date, type: "facility_upgrade_started", ...structuredClone(upgrade) });''')

replace(path, '''  facility.level = upgrade.toLevel;
  facility.source = "save_world_upgraded";
  facility.maintenanceDeltaAnnual = round(numeric(facility.maintenanceDeltaAnnual, 0) + upgrade.cost * 0.035);''', '''  facility.level = upgrade.toLevel;
  facility.availabilityStatus = "operational";
  facility.source = "save_world_upgraded";
  facility.maintenanceDeltaAnnual = round(numeric(facility.maintenanceDeltaAnnual, 0) + upgrade.cost * 0.035);''')

# AI/delegated technical departments obey the same era boundary.
path = "src/sim/systems/teamDevelopment.js"
replace(path, '''  const candidates = projection.facilities.filter((row) => Number(row.level) < 10).sort((a, b) => Number(a.level) - Number(b.level) || a.id.localeCompare(b.id));''', '''  const candidates = projection.facilities
    .filter((row) => row.availabilityStatus !== "unavailable_future_technology" && Number.isFinite(Number(row.level)) && Number(row.level) < 10)
    .sort((a, b) => Number(a.level) - Number(b.level) || a.id.localeCompare(b.id));''')

# Player-facing facility state.
path = "playtest/technical.js"
replace(path, '''function renderFacilities() {
  const rows = technical.team?.facilities ?? [];
  return `<section class="technical-card wide"><span class="management-category">Infrastructure</span><h2>Facilities</h2><div class="facility-grid">${rows.map((row) => `<article class="facility-card"><strong>${escapeHtml(row.label)}</strong><div>Level ${Number(row.level).toFixed(1)}</div><div class="technical-muted">${escapeHtml(row.source)}</div>${row.upgrade ? `<div class="technical-muted">Upgrade to ${row.upgrade.toLevel} · ${row.upgrade.monthsRemaining} month(s)</div>` : technical.responsibility === "manager" && Number(row.level) < 10 ? `<button data-facility="${escapeHtml(row.id)}" ${busy ? "disabled" : ""}>Upgrade</button>` : ""}</article>`).join("") || '<div class="technical-muted">No facilities recorded for this team.</div>'}</div></section>`;
}
''', '''function renderFacilities() {
  const rows = technical.team?.facilities ?? [];
  return `<section class="technical-card wide"><span class="management-category">Infrastructure</span><h2>Facilities</h2><div class="facility-grid">${rows.map((row) => {
    const status = row.availabilityStatus ?? (Number(row.level) > 0 ? "operational" : "available_unbuilt");
    const locked = status === "unavailable_future_technology";
    const levelText = locked ? "Future technology" : Number(row.level) > 0 ? `Level ${Number(row.level).toFixed(1)}` : "Not built";
    const availabilityText = locked
      ? row.unlockSeason ? `Available from ${row.unlockSeason}` : "Not available in this era"
      : status === "upgrading" ? "Upgrade in progress" : label(status);
    const action = row.upgrade
      ? `<div class="technical-muted">Upgrade to ${row.upgrade.toLevel} · ${row.upgrade.monthsRemaining} month(s)</div>`
      : technical.responsibility === "manager" && !locked && Number(row.level ?? 0) < 10
        ? `<button data-facility="${escapeHtml(row.id)}" ${busy ? "disabled" : ""}>${Number(row.level ?? 0) > 0 ? "Upgrade" : "Build"}</button>`
        : "";
    return `<article class="facility-card"><strong>${escapeHtml(row.label)}</strong><div>${escapeHtml(levelText)}</div><div class="technical-muted">${escapeHtml(availabilityText)}</div><div class="technical-muted">${escapeHtml(row.source)}</div>${action}</article>`;
  }).join("") || '<div class="technical-muted">No facilities recorded for this team.</div>'}</div></section>`;
}
''')


# ---------------------------------------------------------------------------
# 3) 1980 supplier packages become usable derived compound families.
# ---------------------------------------------------------------------------
path = "src/sim/raceStrategy.js"
replace(path, '''function normalizeCompound(row) {
  const id = compoundId(row);
  if (!id) return null;
  const dryGrip = normalizedRating(row?.dry_grip ?? row?.grip ?? row?.performance, 50);
  const wetGrip = normalizedRating(row?.wet_grip ?? row?.rain_grip, compoundCondition(row) === "wet" ? dryGrip : 30);
  return {
    compoundId: id,
    supplierId: supplierId(row),
    name: compoundName(row),
    condition: compoundCondition(row),
    dryGrip,
    wetGrip,
    durabilityLaps: durabilityLaps(row),
    raw: row,
  };
}

export function availableTyreCompounds(saveWorld, wet = false, teamId = null) {
  const rows = saveWorld.world?.tyres ?? [];
  let normalized = rows.map(normalizeCompound).filter(Boolean);''', '''function normalizeCompound(row) {
  const id = compoundId(row);
  if (!id) return null;
  const dryGrip = normalizedRating(row?.dry_grip ?? row?.grip ?? row?.performance, 50);
  const wetGrip = normalizedRating(row?.wet_grip ?? row?.rain_grip, compoundCondition(row) === "wet" ? dryGrip : 30);
  return {
    compoundId: id,
    supplierId: supplierId(row),
    name: compoundName(row),
    condition: compoundCondition(row),
    dryGrip,
    wetGrip,
    durabilityLaps: durabilityLaps(row),
    dataStatus: row?.data_status ?? row?.dataStatus ?? "source_compound",
    raw: row,
  };
}

function packageLevelTyreRow(compound) {
  if (!compound?.supplierId || !compound?.raw) return false;
  const idMatchesSupplier = String(compound.compoundId).trim().toLowerCase() === String(compound.supplierId).trim().toLowerCase();
  const rawTyreId = compound.raw.tyre_id ?? compound.raw.tire_id ?? null;
  const rawName = compound.raw.tyre_name ?? compound.raw.tire_name ?? null;
  return idMatchesSupplier && rawTyreId !== null && rawName !== null;
}

function derivedPackageDurability(compound) {
  if (compound.durabilityLaps !== null) return compound.durabilityLaps;
  const rating = normalizedRating(compound.raw?.durability_rating ?? compound.raw?.durability, 70);
  return clamp(14 + rating * 0.34, 18, 48);
}

function derivedSupplierCompoundFamily(compound) {
  const baseDurability = derivedPackageDurability(compound);
  const brand = compound.name || compound.supplierId || "Tyre";
  const status = "derived_gameplay_compound_family_from_supplier_package";
  return [
    {
      ...compound,
      compoundId: `${compound.compoundId}:dry-grip`,
      name: `${brand} Dry — Grip`,
      condition: "dry",
      dryGrip: clamp(compound.dryGrip + 2.5, 0, 100),
      durabilityLaps: Math.max(8, baseDurability * 0.72),
      dataStatus: status,
      derivedFromCompoundId: compound.compoundId,
    },
    {
      ...compound,
      compoundId: `${compound.compoundId}:dry-endurance`,
      name: `${brand} Dry — Endurance`,
      condition: "dry",
      dryGrip: clamp(compound.dryGrip - 1.5, 0, 100),
      durabilityLaps: Math.max(12, baseDurability * 1.12),
      dataStatus: status,
      derivedFromCompoundId: compound.compoundId,
    },
    {
      ...compound,
      compoundId: `${compound.compoundId}:wet`,
      name: `${brand} Wet`,
      condition: "wet",
      dryGrip: clamp(compound.dryGrip - 22, 0, 100),
      wetGrip: compound.wetGrip,
      durabilityLaps: Math.max(10, baseDurability * 0.9),
      dataStatus: status,
      derivedFromCompoundId: compound.compoundId,
    },
  ];
}

export function materializedTyreCompounds(saveWorld) {
  const normalized = (saveWorld.world?.tyres ?? []).map(normalizeCompound).filter(Boolean);
  const grouped = new Map();
  for (const compound of normalized) {
    const key = compound.supplierId ?? `__compound__:${compound.compoundId}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(compound);
  }
  const output = [];
  for (const compounds of grouped.values()) {
    if (compounds.length === 1 && packageLevelTyreRow(compounds[0])) output.push(...derivedSupplierCompoundFamily(compounds[0]));
    else output.push(...compounds);
  }
  return output;
}

export function availableTyreCompounds(saveWorld, wet = false, teamId = null) {
  let normalized = materializedTyreCompounds(saveWorld);''')

replace(path, '''function compoundById(saveWorld, id) {
  if (id === null || id === undefined) return null;
  return (saveWorld.world?.tyres ?? []).map(normalizeCompound).find((row) => String(row?.compoundId) === String(id)) ?? null;
}''', '''function compoundById(saveWorld, id) {
  if (id === null || id === undefined) return null;
  return materializedTyreCompounds(saveWorld).find((row) => String(row?.compoundId) === String(id)) ?? null;
}''')


# ---------------------------------------------------------------------------
# Regression coverage.
# ---------------------------------------------------------------------------
write("tests/playtestCorrectionsPass02.test.js", '''import test from "node:test";
import assert from "node:assert/strict";
import {
  listStaffRecruitmentCandidates,
  openStaffContractNegotiation,
  staffRecruitmentEligibility,
} from "../src/game/management/staffRecruitment.js";
import {
  ensureTechnicalTeam,
  facilityEraAvailability,
  startFacilityUpgrade,
  startTechnicalDesignProject,
  technicalProjection,
} from "../src/game/management/technical.js";
import { availableTyreCompounds, materializedTyreCompounds } from "../src/sim/raceStrategy.js";

function baseSave() {
  return {
    meta: { seed: "pass02" },
    clock: { season: 1980, date: "1980-01-10" },
    player: { controlledTeamIds: ["T1"] },
    history: {},
    world: {
      teams: [
        { team_id: "T1", team_name: "Player Team", reputation: 70 },
        { team_id: "T2", team_name: "Rival Team", reputation: 60 },
      ],
      staff: [
        { staff_id: "OWNER", staff_name: "Owner Principal", role: "Owner / Team Principal" },
        { staff_id: "TP", staff_name: "Movable Principal", role: "Team Principal" },
      ],
      futureStaff: [],
      staffRatings: [
        { staff_id: "OWNER", leadership: 80 },
        { staff_id: "TP", leadership: 75 },
      ],
      staffContracts: [],
      driverRatings: [],
      careerState: { staff: {}, drivers: {} },
      employment: {
        staff: {
          OWNER: { teamId: "T2", role: "Owner / Team Principal", status: "employed", contractUntil: 1985 },
          TP: { teamId: "T2", role: "Team Principal", status: "employed", contractUntil: 1981 },
        },
        drivers: {},
      },
      facilities: [{
        team_id: "T1",
        wind_tunnel_level: 5,
        simulator_level: 6,
        aero_dept_level: 5,
        chassis_shop_level: 6,
        manufacturing_level: 5,
      }],
      carStats: [{ team_id: "T1", chassis_spec: 70, aero_spec: 70 }],
      carState: {},
      teamState: { T1: { cash: 10_000_000, openingCash: 5_000_000 } },
      tyres: [],
      teamTyreSuppliers: {},
      management: {},
    },
  };
}

test("ownership and governance identities stay visible but are excluded from ordinary staff recruitment", () => {
  const save = baseSave();
  assert.equal(staffRecruitmentEligibility(save, "OWNER").eligible, false);
  assert.equal(staffRecruitmentEligibility(save, "OWNER").reason, "governance_ownership_locked");
  assert.equal(staffRecruitmentEligibility(save, "TP").eligible, true, "ordinary team principals remain movable staff");

  const ids = listStaffRecruitmentCandidates(save, { teamId: "T1" }).map((row) => row.id);
  assert.deepEqual(ids, ["TP"]);
  assert.throws(
    () => openStaffContractNegotiation(save, { staffId: "OWNER", teamId: "T1" }),
    /ownership\\/governance structure/i,
  );
});

test("1980 simulator is future technology and cannot leak into design efficiency", () => {
  const save = baseSave();
  const availability = facilityEraAvailability(save, "simulator");
  assert.equal(availability.available, false);
  assert.equal(availability.status, "unavailable_future_technology");

  const team = ensureTechnicalTeam(save, "T1");
  assert.equal(team.facilities.simulator.availabilityStatus, "unavailable_future_technology");
  assert.equal(team.facilities.simulator.level, null);
  assert.equal(team.facilities.simulator.ignoredOpeningLevel, 6, "stale derived opening level is quarantined, not treated as a real 1980 facility");
  assert.throws(() => startFacilityUpgrade(save, "T1", "simulator"), /unavailable future technology/i);

  const project = startTechnicalDesignProject(save, "T1", { component: "chassis_spec", focus: "balanced" });
  assert.equal(project.facilityEfficiency, 0.6, "unavailable simulator must not be averaged into chassis design efficiency");
});

test("future-era facility metadata can explicitly unlock a previously unavailable simulator", () => {
  const save = baseSave();
  ensureTechnicalTeam(save, "T1");
  save.world.facilityAvailability = { simulator: { available: true, availableFrom: 1990, source: "test_future_era_rule" } };
  save.clock.season = 1990;
  save.clock.date = "1990-01-10";
  const projection = technicalProjection(save, "T1");
  const simulator = projection.facilities.find((row) => row.id === "simulator");
  assert.equal(simulator.availabilityStatus, "available_unbuilt");
  assert.equal(simulator.level, 0);
  const build = startFacilityUpgrade(save, "T1", "simulator");
  assert.equal(build.fromLevel, 0);
  assert.equal(build.toLevel, 1);
});

test("supplier-level 1980 tyre packages expose derived dry alternatives and a wet option without modern compound labels", () => {
  const save = baseSave();
  save.world.tyres = [{
    tyre_id: "goodyear",
    supplier_id: "goodyear",
    compound_id: "goodyear",
    tyre_name: "Goodyear",
    compound_name: "Goodyear",
    condition: "dry",
    dry_grip: 82,
    wet_grip: 81,
    durability_rating: 78,
  }];
  save.world.teamTyreSuppliers.T1 = "goodyear";

  const all = materializedTyreCompounds(save);
  const dry = availableTyreCompounds(save, false, "T1");
  const wet = availableTyreCompounds(save, true, "T1");
  assert.equal(all.length, 3);
  assert.equal(dry.length, 2);
  assert.equal(wet.length, 1);
  assert.ok(dry.every((row) => row.dataStatus === "derived_gameplay_compound_family_from_supplier_package"));
  assert.ok(dry.some((row) => /Grip/.test(row.name)));
  assert.ok(dry.some((row) => /Endurance/.test(row.name)));
  assert.match(wet[0].name, /Wet/);
  assert.ok(all.every((row) => !/soft|medium|hard/i.test(row.name)), "runtime fallback must not invent modern historical compound names");
  assert.ok(dry[0].durabilityLaps !== dry[1].durabilityLaps, "dry choices must create a meaningful strategy trade-off");
});
''')

print("Playtest pass 02 patches applied.")
