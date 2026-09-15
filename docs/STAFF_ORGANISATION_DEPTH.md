# Phase 44 — Staff & Organisation Depth

## Goal

Phase 44 turns staff from a flat collection of contracts into a persistent team organisation model without creating a second authority for employment, technical development, scouting, commercial management or race operations.

The organisation layer is **Save World derived state**. It reads the current career world and exposes consequences of staffing structure, vacancies, capability and workload.

## Authority boundary

Authoritative inputs remain in their existing systems:

- staff employment and contracts: Employment / Staff Recruitment;
- staff attributes and career state: historical starting data + Save World career evolution;
- board capacity decisions: Board Management;
- team entry and exit: Governance / Team Evolution;
- technical projects: Technical Management;
- scouting reports and visibility: Scouting / Entity Visibility;
- commercial deals: Commercial Management;
- race results: Race Weekend / Simulation.

Phase 44 does **not** create staff contracts, alter historical staff ratings, invent future appointments, start projects automatically, expose hidden people or script results.

## Organisation model

Staff are grouped into era-neutral functional departments according to their current employment role:

- `technical`
- `race_operations`
- `scouting`
- `commercial`
- `leadership`
- `general`

These are gameplay functions, not claims that every historical team used modern department names or formal organisational charts.

Only departments supported by current staff assignments or open vacancies are materialised. A missing formal department therefore does not automatically penalise an early-era team.

## Department state

Each active department derives:

- members and current roles;
- open vacancies;
- member count;
- vacancy count;
- demand units;
- capacity units;
- workload index;
- workload factor;
- quality index;
- effectiveness;
- status: `stable`, `weak`, `strained` or `critical`.

The quality index is calculated from specialist staff attributes relevant to that function. The workload factor is independent of quality and represents whether the current headcount/capacity can absorb the organisation's demand.

This distinction is important: specialist systems may already use staff quality directly. Phase 44 should not multiply the same attribute twice.

## Workload and capacity

An open role increases demand. A department with insufficient staff therefore becomes strained or critical even when its remaining employee is highly rated.

Board-approved staff capacity can increase organisational capacity without inventing extra named historical employees.

Workload factor is bounded so organisational pressure matters without making a department unusable from a single vacancy.

## Current gameplay consequences

### Staff advice

Monthly staff advice can now identify the most important organisational pressure:

- an empty/open critical function;
- an overloaded department;
- a fully staffed but weak department.

Advice is informational. It never edits staff attributes or signs staff on the player's behalf.

### Scouting throughput

The existing scouting model already uses scout quality when it calculates base assignment duration.

Phase 44 therefore applies **only organisation workload** to daily scouting progress. An overloaded scouting function takes more calendar time to complete an otherwise identical assignment.

This does not change:

- driver visibility;
- talent visibility;
- F1 eligibility;
- driver ability or potential;
- employment status;
- contract authority.

A talent-visible but not F1-eligible driver remains scoutable but cannot become an F1 signing merely because a scouting report completes.

## Team lifecycle

Organisation state is refreshed when relevant authoritative events occur, including:

- Career Start;
- Month Start;
- staff contract signing / activation;
- vacancy opening;
- retirement;
- accepted team entry;
- team exit.

Current projections remove exited teams, while historical monthly organisation snapshots remain in Save World history.

## Persistence

`world.management.organization` is mutable Save World state and is serialized with the career.

It contains:

- current per-team organisation projections;
- monthly snapshots;
- last snapshot month.

Monthly snapshots are idempotent: repeated processing of the same month does not create duplicate history snapshots.

## Provenance

Organisation values use explicit derived provenance:

- department state: `derived_gameplay_organisation_state`
- team organisation projection: `save_world_derived_organisation`

They are gameplay consequences, not reconstructed historical facts.

## Long-career principle

The same model applies to AI and player teams. As careers diverge, hires, departures, vacancies, board decisions and team entries/exits naturally change organisation quality and workload.

Historical starting staff remains a starting condition only. The organisation is free to evolve into an alternative future after Career Start.
