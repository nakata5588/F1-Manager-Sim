# Stage 16.5 — Core Integrity & Long-Term Simulation Gate

## Purpose

Stage 16.5 consolidates simulation authority before the next management-depth phase. It does not add a parallel gameplay system.

The gate focuses on five risks discovered during the project audit:

1. Race Entry must be the sole authority for race participation.
2. Save World schema evolution must preserve established careers through explicit migrations.
3. The real 1980 vertical slice must reflect the current database/circuit package rather than obsolete test expectations.
4. Long-run validation must measure ecosystem health, not only structural survival.
5. Repository release/database state must have one compact current manifest.

## Race Entry authority

Race Weekend now reads `world.raceEntryState.current` directly.

The former compatibility bridge temporarily projected race entries into `world.employment.drivers` and restored Employment after the weekend. That bridge is removed.

The authority flow is now:

`Employment -> Race Entry selection -> Race Entry State -> Race Weekend`

Employment remains contract/employment authority. Race Entry can therefore evolve independently for reserve drivers, temporary substitutes, injuries, one-race entries and DNQ scenarios.

A legacy fallback remains only for old/recovery Save Worlds that predate `raceEntryState`.

## Save migration boundary

The current save envelope is schema v2.

Loading accepts schema v1 and migrates it deterministically to v2 before restoration. The first migration is structural metadata only and never recalculates gameplay.

Future migrations must follow the same rule:

`stored envelope -> ordered migration chain -> current envelope -> provenance gate -> restored Save World`

A save created by a newer unsupported game version is rejected rather than silently downgraded.

## Ecosystem validation

The original long-run validator answers: **does the world remain structurally valid?**

Stage 16.5 adds an ecosystem matrix answering: **what kind of world did the simulation produce across multiple deterministic seeds?**

Tracked signals include:

- unique driver champions;
- unique constructor champions;
- active/inactive team counts;
- final team-cash distribution;
- financially distressed/tight teams;
- active-driver age distribution;
- generated-driver population;
- free drivers/staff;
- open vacancies;
- transfers and retirements;
- DNF rate.

These signals are diagnostic. Balance-sensitive observations are warnings unless they violate a structural invariant.

The default manual command is:

```bash
npm run sim:ecosystem -- --seasons 20 --seeds 10
```

CI runs a smaller but still long 20-season/two-seed gate on every simulation build.

## 1980 circuit/runtime baseline

The reviewed 1980 circuit project is now consolidated at 14/14 layouts. Geometry remains presentation-only and is never promoted to car-performance or race-timing authority.

The playable validation fixture should compose:

`SeasonPack v0.7 -> v0.8 systems -> v0.9 circuit layout overlay`

so the vertical-slice gate tests the actual current runtime package.

## Release-state authority

`data/release-manifest.json` is the compact current-state pointer for development tooling/documentation.

It records:

- application version;
- current development stage;
- save schema;
- promoted historical canonical baseline;
- latest 1980 cumulative candidate;
- current 1980 Season Pack/circuit coverage.

Historical baseline folders and implementation documents remain audit history, not competing declarations of current state.
