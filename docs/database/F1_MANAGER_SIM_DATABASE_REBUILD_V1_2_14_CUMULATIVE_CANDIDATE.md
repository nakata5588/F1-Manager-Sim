# Database v1.2.14 r3 — 1980 Canonical Readiness / Source-Lock Corrective Candidate

## Status

`v1.2.14-1980-canonical-readiness-source-lock-corrective-candidate` r3 is integrated as the **latest cumulative 1980 database candidate**.

It is database-only and is **not promoted to canonical**. The promoted canonical baseline remains `v1.2.5-1980-technical-source-lock-candidate`.

## Integration identity

External ZIP SHA-256:

`a7f21e6f5577257e062351dc7a03b215aeaf98f715bff24ec238467aa120f2c6`

The candidate is cumulative through the external v1.2.13 corrective lineage and supersedes the repository's previously integrated v1.2.12 candidate without replaying intermediate candidates sequentially.

Independent integration audit:

- 43/43 supplied payload checksums: PASS;
- materialized promotion evidence: 80/80 PASS;
- Global SQLite integrity: `ok`;
- Season SQLite integrity: `ok`;
- foreign-key violations: 0 / 0;
- manifest row-count mismatches: 0;
- semantic hard orphans: 0;
- Round 1 reconciliation: 28/28;
- opening cross-surface population: 66/66;
- current-F1 contract cross-surface: 28/28;
- future-outcome authority: 0;
- dynamic Save World state: 0.

## Corrective results

The candidate preserves the Senna and Lauda regressions and makes the opening driver market epistemically safer: 30 external candidates remain explicitly availability-unverified rather than being invented as free drivers. Patrick Tambay remains active non-F1 contracted and Vittorio Brambilla remains reserve/test/development.

David/Dave Kennedy is consolidated under canonical `d_0225` (David Kennedy). The duplicate `d_0862` survives only in explicit alias/legacy/audit contexts. Opening Shadow #18 employment, contract terms and career-interval composite IDs now use the canonical identity consistently.

The stale `FAIL / 879` semantic-orphan readiness artifact is removed. Independent semantic-reference recalculation reports zero hard canonical orphans; 17 legacy weather references remain archived non-authoritatively.

Circuit event geometry is source-reviewed for 14/14 championship rounds. Circuit performance traits remain `derived_gameplay_baseline`. Spanish GP 1980 remains reference-only and excluded from the championship calendar by default.

## Historical gaps deliberately left open

These are canonical-promotion blockers, not integration failures:

- staff source review: 7 open;
- external-driver opening availability: 30 unverified;
- sponsor source review: 5 open;
- regulation source review: 5 open/partial.

Unknown or unverified values remain unknown rather than being invented.

### Staff provenance caveat

The v1.2.14 `staffSourceLockReview1980V1214` surface is the current readiness review and reports 7 open rows. A legacy `staffSourceLock1980` audit surface still carries older pending-role classifications for some rows that were upgraded by the v1.2.14 review. This integration does not treat that legacy surface as authority for additional historical facts; canonical promotion remains blocked pending explicit source cleanup.

## Authority boundary

Historical database data defines the 1980 starting world only. Future contracts, transfers, returns, retirements, results, standings, weather and other post-start outcomes remain Save World / Simulation authority.

External ratings, weather profiles, track evolution and other explicitly derived values remain `derived_gameplay_baseline`, not objective historical measurements.

## Repository footprint

Only `data/`, `docs/database/` and `tests/` are changed. Large authoring/runtime artifacts remain external and are pinned by SHA-256.
