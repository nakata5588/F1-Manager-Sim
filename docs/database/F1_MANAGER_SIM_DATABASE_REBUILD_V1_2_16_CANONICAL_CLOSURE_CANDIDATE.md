# Database v1.2.16 — 1980 Canonical Closure & Audit Consistency Candidate

## Status

`v1.2.16-1980-canonical-closure-audit-consistency-candidate` is the latest cumulative 1980 database candidate.

It is **canonical-ready** but this integration does **not** promote it. The promoted canonical baseline remains `v1.2.5-1980-technical-source-lock-candidate` until a separate promotion gate is merged.

## Scope

Database-only closure work:

- publication/audit consistency;
- opening staff corrections and materialization cleanup;
- explicit safe-uncertainty closure for external drivers;
- regulation research-debt classification;
- canonical-readiness evidence.

No gameplay, Simulation, Save World dynamic authority or UI behavior is changed by this candidate integration.

## Independent bundle verification

Received ZIP SHA-256:

`81866f02b6aa26e89c99af8431061ef956d2fc602cd0d60c09db92d40c179f3b`

Validation before repository integration:

- 22/22 payload checksums PASS;
- 46/46 materialized validation checks PASS;
- Global SQLite integrity `ok`;
- Season SQLite integrity `ok`;
- FK violations 0 / 0;
- source lineage preserved.

## Opening-world closure

- active teams: 15;
- championship rounds: 14;
- opening employment audit: 66;
- opening staff contracts: 53;
- external opening availability unverified: 23;
- ordinary source-safe free drivers: 0.

### Staff

- Tony Southgate audit team corrected to Arrows.
- Alan Rees corrected to Arrows Team Manager; Jackie Oliver remains owner/team principal.
- Peter Warr materialized as opening Fittipaldi Team Manager.
- Steve Nichols is Project Four / late-1980 reference-only and is not opening McLaren employment.
- identity-role versus season-assignment vocabulary differences are classified as compatible taxonomy aliases where appropriate.

### External driver market

The 23 unresolved opening-availability rows are classified as `RESEARCH_EXHAUSTED_SAFE_UNCERTAINTY`.

They remain non-free and non-authoritative. Later 1980 participation, future F1 debut or later contracts do not retroactively establish 13-Jan-1980 availability.

### Regulations

There are no remaining canonical blockers. Two exact primary-text rule-wording items remain explicit research debt. Operational fallbacks must not masquerade as directly source-locked historical facts.

## Canonical policy

Canonical historical starting state may contain explicit unknowns. Unknown is preferable to fabricated certainty.

Unknown historical salary, sponsor money, exact contract dates and unrecovered source wording remain non-authoritative unless independently sourced later.

## Integration policy

The repository pins the compact baseline/source pack and external artifact hashes. Large Global/Season JSON, SQLite and EDITOR artifacts remain external.

Historical candidates remain pinned for reproducibility, but `LATEST_1980_CANDIDATE.json` now points to v1.2.16.

## Promotion decision

**Development candidate integration: READY**  
**Canonical promotion: READY FOR A SEPARATE GATE, NOT PERFORMED HERE**
