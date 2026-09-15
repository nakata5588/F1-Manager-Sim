# v1.2.15 corrective r3 integration note

This repository pack pins the independently re-audited `v1.2.15-1980-historical-source-enrichment-candidate` corrective r3 bundle as a **database-only 1980 candidate**.

External received ZIP SHA-256:

`ecf96e7d253dd759b6995cdf144202d596a8fd4e87a3b05a7ea2d8895d4b1aa5`

Independent re-extraction checks confirmed 33/33 declared payload checksums, both SQLite integrity checks as `ok`, zero foreign-key violations, zero manifest row-count mismatches and the supplied 137/137 materialized validation gates.

The corrective resolves the four blockers found in the original v1.2.15 audit:

- active 1980 team count is 15;
- `openingEmploymentAudit1980V1215` is regenerated and authoritative for v1.2.15 readiness;
- Beppe Gabbiani is not promoted to `free_driver` without F1-specific seeking evidence;
- programme evidence without proof that a commitment already existed on 13 January 1980 is not retroactively used as opening employment authority.

## Legacy source-lock surfaces

The non-versioned `staffSourceLock1980` and `sponsorSourceLock1980` collections retain older audit classifications for some rows. They are preserved only as legacy/reference evidence. The current v1.2.15 readiness authority is the versioned review surface plus the materialized contract/relationship rows.

Development already classifies both legacy collections as `DATABASE_REFERENCE_ONLY_FIELDS`; they are extracted from the active Season snapshot before Save World simulation authority is created. They therefore do not override the v1.2.15 opening state.

This legacy audit residue is still relevant to a future canonical-promotion cleanup, but is not a Development integration blocker.

## Promotion state

- Latest cumulative candidate after integration: v1.2.15 corrective r3.
- Promoted canonical: **v1.2.5**, unchanged.
- Canonical promotion: **not performed**.
- Remaining safe uncertainty: 23 external-driver opening-availability rows and 4 regulation areas open/partial; exact historical contract dates/money remain non-authoritative unless row-level sourced.
