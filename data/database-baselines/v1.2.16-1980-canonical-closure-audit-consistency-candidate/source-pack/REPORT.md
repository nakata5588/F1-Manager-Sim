# F1 Manager Sim — Database v1.2.16 Canonical Closure & Audit Consistency

## Status

**CANONICAL-READY CANDIDATE — NOT YET PROMOTED**

This release is a cumulative, database-only successor to `v1.2.15-1980-historical-source-enrichment-candidate`.

It does **not** alter gameplay/UI or make post-career historical outcomes authoritative.

## Closure result

- Global/Season source lineage preserved.
- 15 active 1980 teams.
- 14 championship rounds.
- 66 opening employment audit rows.
- 53 opening staff contracts.
- 23 external opening availability cases retained as explicit safe uncertainty.
- 0 ordinary source-safe free drivers.
- 0 staff canonical blockers.
- 0 sponsor review blockers.
- 0 regulation canonical blockers.
- 2 regulation primary-text research-debt items retained explicitly.
- Validation: **46/46 PASS**.
- SQLite integrity: **ok / ok**.
- FK violations: **0 / 0**.

## Staff corrections

1. **Tony Southgate** — stale review team corrected from Renault `t_0004` to **Arrows `t_0007`**; opening contract already had the correct Arrows assignment.
2. **Alan Rees** — corrected from `team_principal` to **Arrows Team Manager**. Jackie Oliver remains `owner_team_principal`.
3. **Peter Warr** — source-locked Fittipaldi Team Manager is now materialized at Career Start; opening staff contracts increase **52 → 53**.
4. **Steve Nichols** — made explicit as **Project Four / late-1980 reference-only**, not opening McLaren employment.
5. Harmless identity-role vs season-assignment vocabulary differences are classified as taxonomy aliases rather than false REVIEW failures.

## Driver-market closure

The authoritative current surface remains:

- 23 `external_candidate_availability_unverified`;
- 0 ordinary `free_driver`.

The 23 cases are now classified as `RESEARCH_EXHAUSTED_SAFE_UNCERTAINTY`.

This is intentional: absence of recoverable 13-Jan-1980 evidence does not justify inventing free agency, a contract, or F1-seeking status.

## Regulations closure

- Shortened-race half-points rule is source-enriched from a secondary source reporting a direct check of the 1980 FIA Yellow Book.
- Championship countback remains a high-confidence operational fallback with primary wording still research debt.
- Exact race-classification threshold wording remains operational research debt rather than a fabricated source lock.
- Exact session clock times are **event-specific**, not a universal 1980 rule, and therefore do not block canonical season readiness.

## Publication cleanup

v1.2.16 explicitly supersedes stale v1.2.15 current-state audit summaries, including the obsolete `16 unverified / 1 free driver` text.

Embedded manifest identity, previous release, candidate status and readiness semantics are synchronized.

`READY` now means structural/runtime database readiness; canonical readiness is tracked separately.

## Canonical policy

Canonical does not mean every historical value is known.

Unknown exact salaries, sponsor money, contract dates, external-driver availability and unrecovered primary rule wording remain explicit, non-authoritative data gaps.

They do not block canonical readiness unless they are required to instantiate the 1980 opening world or create a contradiction.

## Promotion

This bundle is ready for **separate canonical-promotion integration**.

It deliberately keeps `canonical = false` until the promotion step is performed and validated in the official repository.
