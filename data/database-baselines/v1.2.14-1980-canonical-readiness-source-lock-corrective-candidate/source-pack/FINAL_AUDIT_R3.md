# F1 Manager Sim — v1.2.14 r3 Final Independent Audit

## Verdict

**READY FOR DEVELOPMENT INTEGRATION as the latest cumulative 1980 database candidate.**

**NOT READY FOR CANONICAL PROMOTION.** The promoted canonical remains v1.2.5 pending a separate decision.

## Corrective freeze scope

This r3 changes only residual consistency/audit defects in v1.2.14 r2. It does not perform v1.2.15 historical enrichment and does not alter gameplay, Simulation, Save World runtime or UI.

## r3 gates

- final validator suite: **80/80 PASS**;

- semantic canonical references: independently calculated zero hard orphans;
- readiness semantic-orphan row: PASS and consistent with baseline/audit;
- David Kennedy canonical identity: d_0225; retired duplicate d_0862 only in explicit alias/audit/reference fields;
- opening assignment: Shadow, car 18, contracted current-F1, derived role slot second_driver;
- Kennedy contract term composite ID canonicalized to d_0225; legacy ID audit-only;
- Kennedy V1212/V1213 career interval composite IDs canonicalized to d_0225; legacy IDs audit-only;
- Round 1 reconciliation: 28/28;
- opening cross-surface population: 66/66;
- opening current-F1 contract cross-surface: 28/28;
- unverified external availability promoted to free driver: zero;
- Senna regression: PASS;
- Lauda regression: PASS;
- future-outcome authority: zero;
- dynamic Save World state: zero;
- manifest row-count mismatches: zero;
- unresolved duplicate persons: zero;
- Global/Season SQLite integrity: required to be `ok`; FK violations required to be zero;
- payload checksums: required to pass after final freeze.

## Historical gaps intentionally preserved

- staff open: 7;
- external-driver opening availability unverified: 30;
- sponsor relationships open: 5;
- regulations open/partial: 5.

These are explicit historical-source gaps for a future v1.2.15, not r3 consistency failures.

## Hash policy

Payload hashes are stored in CHECKSUMS.json. The final ZIP identity is external only; no authoritative self-referential ZIP hash is stored inside the ZIP.
