# Database v1.2.15 corrective r3 — 1980 Historical Source Enrichment Candidate

## Status

`v1.2.15-1980-historical-source-enrichment-candidate` corrective r3 is integrated as the **latest cumulative 1980 database candidate**.

It is database-only and is **not promoted to canonical**. The promoted canonical baseline remains `v1.2.5-1980-technical-source-lock-candidate`.

Candidate revision:

`historical_source_enrichment_corrective_r3_temporal_opening_audit`

## What changed after v1.2.14 r3

The release deepens row-level historical evidence for staff, sponsors and external-driver opening state while preserving the historical-start / alternative-future boundary.

The corrective r3 also fixes four issues found during independent audit of the original v1.2.15 bundle:

1. Season 1980 active-team count is correctly pinned at **15**.
2. `openingEmploymentAudit1980V1215` is regenerated from current v1.2.15 surfaces and supersedes the v1.2.14 audit for readiness purposes.
3. Beppe Gabbiani remains `external_candidate_availability_unverified`; general drive-seeking/F2 evidence is not treated as proof of F1-specific availability at Career Start.
4. 1980 programme evidence is subject to a uniform temporal gate. A later-documented 1980 programme does not retroactively create a 13 January 1980 employment commitment.

## Opening-state outcome

- current F1 drivers: 28
- external opening availability unverified: 23
- active non-F1 contracted: 6
- scoutable talent, not free driver: 5
- reserve/test/development: 2
- inactive returnable/not seeking: 1
- available non-F1 with F1 eligibility unverified: 1
- ordinary source-safe free drivers: **0**

The database does not target a desired free-driver count. `free_driver` requires selected-season evidence of realistic F1-specific availability/seeking, not simply absence of an F1 contract.

## Historical-source coverage

The v1.2.15 versioned reviews close the current staff role/team and sponsor review queues, while four regulation areas remain open/partial pending stronger period/primary rule-page evidence. Exact historical salaries, sponsor money and contract dates remain unknown unless row-level sourced.

### Legacy provenance surfaces

The legacy non-versioned `staffSourceLock1980` and `sponsorSourceLock1980` collections still retain older classifications for some rows. They are **reference-only historical audit surfaces**, not current opening-state authority.

Development already places both fields in `DATABASE_REFERENCE_ONLY_FIELDS`, and `extractDatabaseReferenceContext()` removes them from the active snapshot before Save World authority is established. Current v1.2.15 readiness uses the versioned v1.2.15 reviews and materialized relationships/contracts.

This residue should be cleaned before a future canonical-promotion decision, but it does not block candidate integration.

## Independent integration gates

The received corrective-r3 ZIP has external SHA-256:

`ecf96e7d253dd759b6995cdf144202d596a8fd4e87a3b05a7ea2d8895d4b1aa5`

Verified before integration:

- payload checksums: **33/33**
- supplied materialized validator: **137/137 PASS**
- Global SQLite integrity: `ok`
- Season SQLite integrity: `ok`
- foreign-key violations: **0 / 0**
- manifest row-count mismatches: **0**
- opening cross-surface: **66/66**
- Round 1 reconciliation: **28/28**
- future-outcome authority: **0**
- dynamic Save World authority: **0**

## Authority boundary

`Historical Global DB → Season DB 1980 → Save World → Simulation`

Future debuts, later contracts, later moves, later retirements/returns and historical results after Career Start are not allowed to become Save World starting authority.

## Promotion decision

**Development integration: READY**  
**Canonical promotion: NOT PERFORMED**

Promoted canonical remains `v1.2.5-1980-technical-source-lock-candidate` until a separate promotion audit and decision.
