const RECRUITMENT_VISIBLE_STATES = new Set(["talent_visible", "f1_eligible"]);

export const DATABASE_REFERENCE_ONLY_FIELDS = Object.freeze([
  "eventFactTimeline",
  "managementMaterializerDeltaSpec",
  "managementDataPolicy",
  "managementCoreReadiness",
  "peopleDataPolicy",
  "peopleMaterializerDeltaSpec",
  "peopleReadiness",
  "sourceLockAudit",
  "sourceManifest",
  "activeStartSourceLockedFacts",
  "peopleSourceLockPolicy",
  "materializerSourceLockDeltaSpec",
  "phase33DatabaseReadinessMatrix",
  "baselineDiffV110ToV120",
  "baselineDiffV120ToV121",
  "summaryCards",
  "sourceManifestV122",
  "canonicalIdCorrectionsV122",
  "sponsorSpellingCorrectionsV122",
  "sponsorSourceLock1980",
  "staffSourceLock1980",
  "relationshipSourcePack1980",
  "suppressedOrReviewClaims1980",
  "historicalResearchBacklog1980",
  "historicalResearchBacklog1980V122",
  "relationshipsMaterializerDeltaSpecV122",
  "phase33DatabaseReadinessMatrixV122",
  "sourceManifestV123",
  "canonicalIdCorrectionsV123",
  "historicalResearchBacklog1980V123",
  "relationshipsMaterializerDeltaSpecV123",
  "phase33DatabaseReadinessMatrixV123",
  "databaseOnlyScope",
]);

export const DATABASE_OWNED_SEASON_FIELDS = Object.freeze([
  "seasonRecruitmentPool",
  "contractNegotiationBaseline",
  "scoutingBaselineRules",
  "driverMarketProfiles",
  "driverExperienceBaseline",
  "driverReputationBaseline",
  "initialInboxEvents",
  "decisionSupportTemplates",
  "managementMaterializerDeltaSpec",
  "managementDataPolicy",
  "managementCoreReadiness",
  "personalityTraitDefinitions",
  "relationshipTypeDefinitions",
  "driverPersonalityProfiles",
  "staffPersonalityProfiles",
  "entityRelationshipSeeds",
  "representationModelByEra",
  "agentArchetypes",
  "agentProfiles",
  "agentProfileFieldDefinitions",
  "driverRepresentationBaseline",
  "entityCareerPreferences",
  "teamPeopleCultureProfiles",
  "peopleDataPolicy",
  "peopleMaterializerDeltaSpec",
  "peopleReadiness",
  "eventFactTimeline",
  "sourceLockAudit",
  "sourceManifest",
  "activeStartSourceLockedFacts",
  "peopleSourceLockPolicy",
  "materializerSourceLockDeltaSpec",
  "phase33DatabaseReadinessMatrix",
  "baselineDiffV110ToV120",
  "baselineDiffV120ToV121",
  "summaryCards",
  "sourceManifestV122",
  "canonicalIdCorrectionsV122",
  "sponsorSpellingCorrectionsV122",
  "sponsorSourceLock1980",
  "staffSourceLock1980",
  "relationshipSourcePack1980",
  "suppressedOrReviewClaims1980",
  "historicalResearchBacklog1980",
  "historicalResearchBacklog1980V122",
  "relationshipsMaterializerDeltaSpecV122",
  "phase33DatabaseReadinessMatrixV122",
  "sourceManifestV123",
  "canonicalIdCorrectionsV123",
  "historicalResearchBacklog1980V123",
  "relationshipsMaterializerDeltaSpecV123",
  "phase33DatabaseReadinessMatrixV123",
  "databaseOnlyScope",
]);

function seasonValue(row) {
  const value = Number(row?.season ?? row?.year ?? row?.season_context);
  return Number.isInteger(value) ? value : null;
}

function rowsForSeason(rows, season, { allowUndated = false } = {}) {
  return (rows ?? []).filter((row) => {
    const value = seasonValue(row);
    return value === season || (allowUndated && value === null);
  }).map((row) => structuredClone(row));
}

function mapBy(rows, key) {
  return new Map((rows ?? []).filter((row) => row?.[key]).map((row) => [row[key], row]));
}

function copy(value, fallback = []) {
  if (value === undefined) return structuredClone(fallback);
  return structuredClone(value);
}

function recruitmentPool(database, season) {
  return rowsForSeason(database.driverMarketProfileByYear, season)
    .filter((row) => RECRUITMENT_VISIBLE_STATES.has(String(row.visibility_state ?? "")))
    .map((row) => ({
      season,
      entity_type: "driver",
      entity_id: row.driver_id,
      driver_name: row.driver_name ?? null,
      pool_type: row.market_category === "current_f1_grid" ? "current_f1_grid" : "external_talent_watch",
      visibility_state: row.visibility_state,
      market_status: row.visibility_state === "f1_eligible"
        ? (row.contract_status === "under_contract_current_f1" ? "under_contract_current_f1" : "f1_market_available")
        : "scout_only_not_f1_eligible",
      f1_eligible: row.visibility_state === "f1_eligible",
      talent_visible: ["talent_visible", "f1_eligible"].includes(row.visibility_state),
      current_team_id: row.current_team_id ?? null,
      contract_until: row.contract_until ?? null,
      region: row.region ?? null,
      nationality: row.country_code ?? row.nationality ?? null,
      reputation_reference: row.reputation_reference ?? null,
      reputation_estimate: row.reputation_estimate ?? null,
      potential_reference: row.potential_ability_reference ?? row.potential_reference ?? null,
      potential_estimate: row.potential_estimate ?? null,
      scoutability_band: row.scoutability_band ?? null,
      pay_driver_flag: row.pay_driver_flag ?? null,
      contract_likelihood_reference: row.contract_likelihood_reference ?? null,
      source_table: row.source_tables ?? row.source_table ?? null,
      source_confidence: row.source_confidence ?? null,
      data_status: "season_initial_recruitment_context_not_save_scout_report",
      notes: row.notes ?? null,
    }));
}

function contractBaselines(database, season) {
  const drivers = mapBy(database.drivers, "driver_id");
  const staff = mapBy(database.staff, "staff_id");
  const teams = mapBy(database.teams, "team_id");
  return rowsForSeason(database.contractTerms, season).map((row) => ({
    season,
    baseline_id: row.contract_term_id ?? `${row.worker_type ?? "worker"}:${row.driver_id ?? row.staff_id ?? "unknown"}:${row.team_id ?? "none"}:${season}`,
    worker_type: row.worker_type ?? (row.driver_id ? "driver" : "staff"),
    driver_id: row.driver_id ?? null,
    staff_id: row.staff_id ?? null,
    name: row.driver_id
      ? drivers.get(row.driver_id)?.driver_name ?? null
      : staff.get(row.staff_id)?.staff_name ?? null,
    team_id: row.team_id ?? null,
    team_name: teams.get(row.team_id)?.team_name ?? null,
    role: row.role ?? null,
    contract_start: row.contract_start ?? null,
    contract_until: row.contract_until ?? null,
    compensation_mode: row.compensation_mode ?? null,
    annual_salary: row.annual_salary ?? null,
    salary_currency: row.salary_currency ?? null,
    salary_index: row.salary_index ?? null,
    salary_source_status: row.salary_source_status ?? null,
    signing_bonus: row.signing_bonus ?? null,
    bonus_win: row.bonus_win ?? null,
    bonus_podium: row.bonus_podium ?? null,
    bonus_championship: row.bonus_championship ?? null,
    transfer_boundary: row.transfer_boundary ?? (
      row.worker_type === "driver" ? "future_start_after_contract_end_if_other_team" : "role_and_contract_dates_start_context_only"
    ),
    buyout_compensation: row.buyout_compensation ?? null,
    release_clause: row.release_clause ?? null,
    renewal_option: row.renewal_option ?? null,
    agent_id: row.agent_id ?? null,
    source_confidence: row.source_confidence ?? null,
    data_status: "materialized_starting_contract_baseline",
    notes: row.notes ?? null,
  }));
}

function applyCorrectionString(value, correction) {
  if (typeof value !== "string") return value;
  const oldValue = String(correction?.old_related_entities ?? "");
  const newValue = String(correction?.corrected_related_entities ?? "");
  return oldValue && newValue && value === oldValue ? newValue : value;
}

function canonicalFactCorrections(container) {
  if (container?.canonicalIdCorrectionsV123?.length) return container.canonicalIdCorrectionsV123;
  return container?.canonicalIdCorrectionsV122 ?? [];
}

export function applyCanonicalFactCorrections(rows = [], corrections = []) {
  const byFact = new Map((corrections ?? []).filter((row) => row?.fact_id).map((row) => [row.fact_id, row]));
  return (rows ?? []).map((row) => {
    const correction = byFact.get(row?.fact_id);
    if (!correction) return structuredClone(row);
    return {
      ...structuredClone(row),
      related_entities: applyCorrectionString(row.related_entities, correction),
      source_lock_revision: row.source_lock_revision
        ?? correction.applied_in_database_version
        ?? "canonical_id_repair",
    };
  });
}

function sourceLockedFacts(database, season) {
  const corrected = applyCanonicalFactCorrections(
    rowsForSeason(database.sourceLockedFactRegister, season),
    canonicalFactCorrections(database),
  );
  return corrected.filter((row) => !String(row.start_1980_policy ?? "").includes("future_outcome_suppressed")
    && !String(row.start_1980_policy ?? "").includes("future_or_late_1980"));
}

function filteredByIds(rows, season, field, ids) {
  return rowsForSeason(rows, season).filter((row) => ids.has(row?.[field]));
}

export function materializeDatabaseManagementBlocks(database, seasonInput, baseSnapshot = {}) {
  const season = Number(seasonInput);
  if (!Number.isInteger(season)) throw new TypeError("Season year must be an integer.");

  const recruitment = recruitmentPool(database, season);
  const recruitmentIds = new Set(recruitment.map((row) => row.entity_id).filter(Boolean));
  const activeStaffIds = new Set((baseSnapshot.staff ?? []).map((row) => row.staff_id).filter(Boolean));
  const activeTeamIds = new Set((baseSnapshot.teams ?? []).map((row) => row.team_id).filter(Boolean));

  return {
    seasonRecruitmentPool: recruitment,
    contractNegotiationBaseline: contractBaselines(database, season),
    scoutingBaselineRules: copy(database.scoutingBaselineRules),
    driverMarketProfiles: rowsForSeason(database.driverMarketProfileByYear, season),
    driverExperienceBaseline: filteredByIds(database.driverExperienceByYear, season, "driver_id", recruitmentIds),
    driverReputationBaseline: filteredByIds(database.driverReputationByYear, season, "driver_id", recruitmentIds),
    initialInboxEvents: rowsForSeason(database.initialInboxEventsBySeason, season),
    decisionSupportTemplates: copy(database.decisionSupportTemplates),
    managementMaterializerDeltaSpec: copy(database.managementMaterializerDeltaSpec),
    managementDataPolicy: copy(database.managementDataPolicy),
    managementCoreReadiness: copy(database.managementCoreReadiness1980, null),
    personalityTraitDefinitions: copy(database.personalityTraitDefinitions),
    relationshipTypeDefinitions: copy(database.relationshipTypeDefinitions),
    driverPersonalityProfiles: filteredByIds(database.driverPersonalityProfileByYear, season, "driver_id", recruitmentIds),
    staffPersonalityProfiles: filteredByIds(database.staffPersonalityProfileByYear, season, "staff_id", activeStaffIds),
    entityRelationshipSeeds: rowsForSeason(database.entityRelationshipSeeds, season, { allowUndated: true }),
    representationModelByEra: copy(database.representationModelByEra),
    agentArchetypes: copy(database.agentArchetypes),
    agentProfiles: copy(database.agentProfiles),
    agentProfileFieldDefinitions: copy(database.agentProfileFieldDefinitions),
    driverRepresentationBaseline: filteredByIds(database.driverRepresentationBaselineByYear, season, "driver_id", recruitmentIds),
    entityCareerPreferences: filteredByIds(database.entityCareerPreferencesByYear, season, "driver_id", recruitmentIds),
    teamPeopleCultureProfiles: filteredByIds(database.teamPeopleCultureProfileByYear, season, "team_id", activeTeamIds),
    peopleDataPolicy: copy(database.peopleDataPolicy),
    peopleMaterializerDeltaSpec: copy(database.peopleMaterializerDeltaSpec),
    peopleReadiness: copy(database.peopleReadiness1980, null),
    eventFactTimeline: rowsForSeason(database.eventFactTimeline, season),
    sourceLockAudit: copy(database.sourceLockAudit),
    sourceManifest: copy(database.sourceManifest),
    activeStartSourceLockedFacts: sourceLockedFacts(database, season),
    peopleSourceLockPolicy: copy(database.peopleSourceLockPolicy),
    materializerSourceLockDeltaSpec: copy(database.materializerSourceLockDeltaSpec),
    phase33DatabaseReadinessMatrix: copy(database.phase33DatabaseReadinessMatrix),
    baselineDiffV110ToV120: copy(database.baselineDiffV110ToV120),
    baselineDiffV120ToV121: copy(database.baselineDiffV120ToV121),
    summaryCards: copy(database.summaryCards),
    sourceManifestV122: copy(database.sourceManifestV122),
    canonicalIdCorrectionsV122: copy(database.canonicalIdCorrectionsV122),
    sponsorSpellingCorrectionsV122: copy(database.sponsorSpellingCorrectionsV122),
    sponsorSourceLock1980: rowsForSeason(database.sponsorSourceLock1980, season),
    staffSourceLock1980: rowsForSeason(database.staffSourceLock1980, season),
    relationshipSourcePack1980: rowsForSeason(database.relationshipSourcePack1980, season),
    suppressedOrReviewClaims1980: rowsForSeason(database.suppressedOrReviewClaims1980, season, { allowUndated: true }),
    historicalResearchBacklog1980: copy(database.historicalResearchBacklog1980),
    historicalResearchBacklog1980V122: copy(database.historicalResearchBacklog1980V122),
    relationshipsMaterializerDeltaSpecV122: copy(database.relationshipsMaterializerDeltaSpecV122),
    phase33DatabaseReadinessMatrixV122: copy(database.phase33DatabaseReadinessMatrixV122),
    sourceManifestV123: copy(database.sourceManifestV123),
    canonicalIdCorrectionsV123: copy(database.canonicalIdCorrectionsV123),
    historicalResearchBacklog1980V123: copy(database.historicalResearchBacklog1980V123),
    relationshipsMaterializerDeltaSpecV123: copy(database.relationshipsMaterializerDeltaSpecV123),
    phase33DatabaseReadinessMatrixV123: copy(database.phase33DatabaseReadinessMatrixV123),
    databaseOnlyScope: copy(database.databaseOnlyScope, null),
  };
}

export function mergeDatabaseOwnedSeasonFields(activeSnapshot, globalSnapshot) {
  const merged = { ...structuredClone(activeSnapshot) };
  for (const field of DATABASE_OWNED_SEASON_FIELDS) {
    if (globalSnapshot?.[field] !== undefined) merged[field] = structuredClone(globalSnapshot[field]);
  }
  return merged;
}

export function normalizeSeasonDatabaseSnapshot(snapshot) {
  const normalized = structuredClone(snapshot);
  const corrections = canonicalFactCorrections(normalized);
  if (normalized.activeStartSourceLockedFacts?.length && corrections.length) {
    normalized.activeStartSourceLockedFacts = applyCanonicalFactCorrections(
      normalized.activeStartSourceLockedFacts,
      corrections,
    );
  }
  return normalized;
}

export function extractDatabaseReferenceContext(snapshot) {
  const reference = {};
  for (const field of DATABASE_REFERENCE_ONLY_FIELDS) {
    if (!Object.hasOwn(snapshot, field)) continue;
    reference[field] = structuredClone(snapshot[field]);
    delete snapshot[field];
  }
  return reference;
}
