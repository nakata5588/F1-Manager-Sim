# Database Rebuild v1.2.2 Relationships Source Pack Candidate — Integration Audit

Date: 2026-09-12

## Status

`v1.2.2-relationships-source-pack-candidate` is integrated as a **non-canonical candidate**.

This bundle is cumulative. It supersedes the previous v1.0.1, v1.1.0, v1.2.0 and v1.2.1 rebuild candidates for audit/integration purposes. Those versions must not be applied sequentially.

The large editorial/runtime artifacts remain external to the source repository. Git pins their hashes and the compact source/audit pack. This preserves the existing repository policy established for the database baseline: JSON/SQLite/XLSX mirrors are release artifacts, not duplicated source files.

## External artifacts

- Global JSON SHA-256: `79d85678db968243c6b34fd9e1d0109ab7fee4b25b0d8f03f5802692e0ea5895`
- Global SQLite SHA-256: `e56fd6b0da1393356cd4b6c985ca37f19ed94e08cab827f06df68137bb168488`
- Season Definition 1980 JSON SHA-256: `3a0147451b6f31ee45af72b1e4413a397ee9ae0541fac7b8bbbd09a0691e989f`
- Season Definition 1980 SQLite SHA-256: `1edba292762aa42915bccb254377617405d6ab4e639080e2cc2e0522f2702dcf`

All hashes in the supplied CHECKSUMS file matched the uploaded bundle. Both supplied SQLite integrity checks report `ok`.

## Materializer integration

The Global Database can now materialize the new management/people/source context into a Season Snapshot without requiring gameplay code to understand the rebuild's editorial schema directly.

Database-owned Season fields include:

- `seasonRecruitmentPool`
- `contractNegotiationBaseline`
- `scoutingBaselineRules`
- `driverMarketProfiles`
- `driverExperienceBaseline`
- `driverReputationBaseline`
- `initialInboxEvents`
- decision-support definitions
- personality/relationship definitions and baselines
- representation/agent baselines
- team people-culture baselines
- source-lock/source-manifest audit blocks
- v1.2.2 relationship/source-lock packs.

When an active SeasonPack snapshot already contains these fields, Global materialization replaces the database-owned copies instead of appending them. This makes the merge idempotent and prevents duplicated recruitment, contract, Inbox or people rows.

For 1980 the supplied candidate contains:

- 66 recruitment-pool rows
- 79 contract-negotiation baseline rows
- 90 initial Inbox events
- 66 driver personality baseline rows
- 55 staff personality baseline rows
- 159 relationship seeds
- 8 relationship source-pack facts
- 24 sponsor source-lock rows
- 53 staff source-lock rows.

## Historical / simulation boundary

`derived_gameplay_baseline` and equivalent `derived_not_source_locked` rows remain simulation baselines. The materializer preserves their provenance and does not promote them to historical source-locked facts.

Audit/reference-only blocks are removed from mutable `Save World.world` and retained under `Save World.reference.databaseContext`. This includes the relationship source pack and source-lock audit surfaces.

Therefore rows such as the late-1980 Project Four/McLaren transition with `historical_reference_hidden_for_1980_start` remain available as historical context, but cannot force a McLaren ownership/staff transition in an alternative 1980 career.

Future or late-1980 source facts marked as suppressed/reference-only are not materialized into `activeStartSourceLockedFacts`.

## Canonical ID audit

Core canonical IDs and alias crosswalks were audited from the supplied Global JSON:

- no duplicate core IDs found in drivers, staff, teams, engines, tracks or sponsor catalog;
- no duplicate management/people primary IDs found in the new tables;
- 205 entity-alias rows contain no duplicate `(alias_namespace, entity_type, alias_id)` mappings and no ambiguous alias-to-multiple-canonical-ID collisions.

The Global `sourceLockedFactRegister` contains the v1.2.2 canonical-ID repairs. Runtime normalization also applies the supplied correction map when loading a pre-materialized Season Definition so stale fact metadata cannot become active Save World context.

## Promotion blockers found in the supplied v1.2.2 artifacts

### V122-IDENTITY-001 — embedded Global manifest release identity

The Global top level declares:

`v1.2.2-relationships-source-pack-candidate`

but the embedded manifest still declares older identities:

- `f1db-v1.2.0-people-market-candidate`
- `F1_Manager_Sim_Global_Database_v1.2.1_source_lock_candidate`
- `1.2.0-management-people-market-candidate`.

The immutable source-workbook lineage (`f1_db(2).xlsx`, SHA-256 `9d29b8d004dbbc371b935e155a396bd6f33410f635de9ebdae4e808f8e2cc097`) is valid and should remain separate from the rebuild release identity.

### V122-IDENTITY-002 — Season Definition source checksum

The supplied Season Definition declares source checksum:

`82627e7de1aa007ea7592ab30b8271b3f4f00536733ea5434c25812d0b3032bc`

This value does not match the declared Global source-workbook identity and is not a declared hash of any bundle artifact. The compatibility validator intentionally continues to reject this pair rather than weakening source validation.

A regenerated Season Definition must publish a traceable source identity that matches the corrected Global candidate.

### V122-ID-003 — stale IDs in the pre-materialized Season fact surface

`canonicalIdCorrectionsV122` contains eight repairs, but the supplied Season Definition's pre-materialized `activeStartSourceLockedFacts` still contains several pre-repair IDs. Top-level audit-only fact copies also retain old IDs.

The runtime loader repairs active fact metadata defensively, but the published data artifact itself remains internally inconsistent and must be regenerated.

## Promotion decision

**Do not promote the supplied v1.2.2 bundle to the canonical data baseline. A v1.2.3 rebuild is required.**

The v1.2.3 rebuild does not need a new gameplay design. It should preserve the v1.2.2 management/people/relationship data and make these data-artifact repairs:

1. synchronize top-level and embedded manifest release identities;
2. regenerate Season Definition 1980 with a declared, traceable source checksum compatible with the Global candidate;
3. apply the eight v1.2.2 canonical-ID corrections to every emitted Season/source-lock/audit fact surface before hashing;
4. regenerate JSON/SQLite/editor/checksum artifacts and rerun the same duplicate, future-boundary and materializer regressions.

Until then v1.0 remains the promoted repository baseline while v1.2.2 is recorded as `VALIDATED_WITH_PROMOTION_BLOCKERS`.
