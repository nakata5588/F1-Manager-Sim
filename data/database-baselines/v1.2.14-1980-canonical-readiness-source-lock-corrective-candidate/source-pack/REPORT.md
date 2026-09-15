# F1 Manager Sim Database v1.2.14 r3 — Final Corrective Freeze

## Status

DATABASE-ONLY cumulative standalone candidate for **1980**. This r3 is a corrective freeze over the externally audited v1.2.14 r2; it does not add v1.2.15 historical enrichment and does not alter gameplay, Simulation, Save World runtime or UI.

- Database version: `v1.2.14-1980-canonical-readiness-source-lock-corrective-candidate`
- Candidate revision: `final_corrective_freeze_r3`
- Previous semantic database version: `v1.2.13-1980-driver-availability-consistency-manifest-corrective-candidate`
- Canonical promotion: **NO** — v1.2.5 remains the promoted canonical baseline.

## r2 → r3 corrections

1. `canonicalReadinessMatrix1980V1214.semantic_orphan_references` corrected from the stale r2 semantic-orphan readiness value to `PASS / 0`; the 17 legacy weather references remain archived and non-authoritative.
2. David Kennedy remains canonical `d_0225`, Shadow #18, opening current-F1, gameplay-derived role slot `second_driver`. `contractTerms` and Season `contractNegotiationBaseline` now match `contracts`.
3. Kennedy contract term ID is `ct_driver_1980_t_0015_d_0225_0023`; legacy `ct_driver_1980_t_0015_d_0862_0023` is retained only in explicit `legacy_contract_term_id` audit metadata.
4. Kennedy career interval IDs are `d_0225_career_interval_1980_context` in both V1212/V1213 surfaces; legacy `d_0862_career_interval_1980_context` is audit-only metadata.
5. Semantic reference validation now independently recalculates authoritative canonical references instead of trusting the audit summary.
6. Retired-ID validation scans substrings inside composite IDs and permits `d_0862` only in explicit alias/audit/reference contexts.
7. All 28 opening current-F1 drivers now have a dedicated contracts ↔ contractTerms ↔ Season contracts ↔ negotiation ↔ availability ↔ opening-state regression.
8. Historical gaps remain intentionally unchanged: staff 7, external availability 30, sponsors 5, regulations 5.

See `audit_csv/exact_diff_v1.2.14_r2_to_r3.csv` for the exact corrective diff.

## Preserved invariants

- Senna remains talent-visible / not F1-eligible / not free driver in 1980.
- Lauda remains returnable retired/inactive and not seeking.
- Patrick Tambay remains active non-F1 contracted.
- Vittorio Brambilla remains reserve/test/development.
- 30 external candidates remain availability-unverified; no artificial free-driver promotion.
- 28/28 Round 1 entry reconciliation is preserved.
- 17 legacy weather profiles remain archived non-authoritatively; 14/14 1980 weather baselines remain active.
- Contract dates and legacy monetary values remain non-authoritative without row-level sources.
- Circuit event geometry remains 14/14; Long Beach retains lap-based 260.080 km, official 261.705 km and 1.625 km offset semantics.
- Circuit performance traits remain `derived_gameplay_baseline`.
- Spanish GP remains reference-only/excluded from the championship calendar.
- Future outcomes remain non-authoritative and no dynamic Save World state is stored.

## Canonical blockers intentionally left open

- Staff: 7
- External-driver opening availability: 30
- Sponsors: 5
- Regulations open/partial: 5

These are future historical-source-enrichment work, not r3 corrective targets.
