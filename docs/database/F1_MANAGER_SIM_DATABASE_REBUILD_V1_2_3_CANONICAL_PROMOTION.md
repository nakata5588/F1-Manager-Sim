# F1 Manager Sim Database Rebuild v1.2.3 — Canonical Promotion

## Status

`v1.2.3-canonical-candidate` is the promoted canonical historical database baseline for current development.

The release is cumulative and supersedes the v1.2.2 relationship/source-pack candidate. The v1.2.2 folder remains in git as an audit record of the rejected publication state and its three P0 blockers; it is not applied before v1.2.3.

Large generated/editorial artifacts remain external. Git pins their hashes plus the small source/audit files required to reproduce and explain the release.

## Why v1.2.2 was not promoted

The previous candidate had three P0 publication blockers:

1. `V122-IDENTITY-001` — top-level Global identity and embedded manifest identity disagreed.
2. `V122-IDENTITY-002` — Season Definition 1980 used a `sourceChecksum` that did not match the declared Global source identity.
3. `V122-ID-003` — eight canonical fact-ID repairs were declared but some pre-materialized fact surfaces still contained pre-repair IDs.

## v1.2.3 resolution

All three blockers are fixed in the supplied bundle:

- top-level Global `databaseVersion` and embedded `manifest.databaseVersion` are both `v1.2.3-canonical-candidate`;
- Season 1980 `sourceChecksum` equals Global `manifest.sourceSha256`;
- all eight canonical fact corrections are applied before active Season/source-lock/audit surfaces are emitted.

The canonical source SHA-256 is:

`9d29b8d004dbbc371b935e155a396bd6f33410f635de9ebdae4e808f8e2cc097`

Generated artifact hashes pinned by the baseline are:

- Global JSON: `e247978c04d3ed88d1ade9e354892666e1f24bbfcc3e39e34fc4444e91c3d95f`
- Season Definition 1980 JSON: `136d662040427f9ce1e12597c6b52fd11985c2c34e0e40a4ce2d088103ce75d5`

## Independent development audit

Development independently inspected the supplied ZIP before promotion rather than trusting the bundle report alone.

Confirmed:

- all 22 published checksum entries match the actual files byte-for-byte;
- Global SQLite `PRAGMA integrity_check` returns `ok`;
- Season SQLite `PRAGMA integrity_check` returns `ok`;
- duplicate `driver_id`: 0;
- duplicate `team_id`: 0;
- duplicate `staff_id`: 0;
- duplicate `alias_id`: 0;
- Season Definition 1980 uses the same source identity as the Global manifest;
- recursive inspection of `snapshot.futureStructure` found no outcome-authority keys;
- all corrected facts in `snapshot.activeStartSourceLockedFacts` use corrected IDs;
- all corrected facts in `auditOnly.sourceLockedFactRegisterAll` use corrected IDs;
- old ID strings remain only where audit/correction history legitimately records the previous values;
- no named historical agent profiles are introduced.

## 1980 invariants

Promotion preserves the expected 1980 materialization:

- active teams: 15;
- active drivers: 50;
- active staff: 55;
- calendar races: 14;
- recruitment pool: 66;
- contract negotiation baseline: 79;
- initial Inbox seeds: 90;
- driver personality profiles: 66;
- staff personality profiles: 55;
- entity relationship seeds: 159;
- relationship source-pack claims: 8;
- sponsor source-lock rows: 24;
- staff source-lock rows: 53.

## Runtime integration hardening

The v1.2.3 bundle publishes versioned audit fields such as:

- `sourceManifestV123`;
- `canonicalIdCorrectionsV123`;
- `phase33DatabaseReadinessMatrixV123`;
- `relationshipsMaterializerDeltaSpecV123`;
- `historicalResearchBacklog1980V123`.

The runtime now recognizes these as database-owned reference/audit fields. They are kept under `Save World.reference.databaseContext` and are removed from the mutable `Save World.world`.

Canonical fact repair now prefers `canonicalIdCorrectionsV123` and falls back to `canonicalIdCorrectionsV122` for backwards compatibility. This avoids making the canonical runtime dependent on legacy v1.2.2 field names even though the supplied v1.2.3 bundle retains those copies for compatibility.

## Historical boundary

The canonical rule is unchanged:

`Global Database -> Season Database -> Save World -> Simulation Engine / Game Systems -> UI`

Historical source data is immutable starting context. Post-career-start outcomes belong to the Save World.

`futureStructure` may contain hidden non-outcome structure such as future calendars/rules/safety references. It must not carry authoritative future winners, results, standings, champions, transfers or retirements.

Historical late-1980 references such as the Project Four/McLaren transition or Scheckter retirement context remain reference-only and must never force the alternative-history career to reproduce real history.

## Season interchange

The Global Database remains the long-lived historical universe. A Season Database is a selected temporal materialization.

A future 1998 Season Database may therefore replace the 1980 Season Database at New Career time without replacing gameplay systems, the simulation engine or UI, provided it emits the same Season Database contract and validates against the appropriate Global source identity.

## Repository policy

Canonical baseline metadata:

`data/database-baselines/v1.2.3-canonical-candidate/baseline.json`

The repository stores:

- baseline identity and counts;
- published external artifact checksums;
- small source/audit packs;
- automated compatibility tests;
- promotion documentation.

The repository does not commit the 22 MB Global JSON, 9 MB Season JSON, SQLite mirrors or editor workbook.
