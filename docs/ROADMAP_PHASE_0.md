# Phase 0 Roadmap — Audit & Foundations

## Completed

- Define project architecture boundaries.
- Create immutable Historical Season Snapshot.
- Create independent mutable Save World.
- Add deterministic seeded RNG.
- Add basic world clock.
- Audit the recovered master workbook.
- Define parallel database-development workflow.
- Build dependency-free XLSX reader/importer.
- Normalize legacy headers and preserve provenance.
- Detect and safely repair unambiguous identity-link mismatches.
- Add primary/foreign-key validation.
- Add 1980 season-readiness gate.
- Pin saves to historical database version/checksum.
- Add automated Node and Python tests.
- Add GitHub Actions CI.
- Add validated Historical World runtime loader.
- Add event-driven time engine with calendar/month/season hooks.
- Add versioned Save World serialization/deserialization.
- Add headless simulation harness and CLI.
- Validate a full 366-day 1980 run against the current canonical workbook data.

## Current 1980 state

`READY_WITH_WARNINGS`

All 18 initialization-readiness checks pass on the current uploaded workbook after canonical normalization. Remaining 1980 warnings are source identity-link inconsistencies that the importer can resolve unambiguously and that are queued for correction in the master database.

The Phase 0 headless harness can now load that validated 1980 world, advance from 1980-01-01 to 1981-01-01, and encounter all 14 scheduled race dates without UI involvement.

## Next implementation block

### Simulation system contracts

Promote the event-dispatch interface into dedicated world systems. The first systems should cover ageing/development, contract milestones, finance periods and R&D progress. They must react to time events rather than live inside the clock.

### Season rollover

The current time engine emits a season-start event, but a future-world transition still needs to construct the next season from the evolving Save World rather than simply loading historical outcomes. Historical future data may inform eligibility and context but must never overwrite the alternate-history save.

### Race weekend skeleton

Create a deterministic Practice / Qualifying / Race state machine with no hardcoded historical results. Early race calculations can remain deliberately simple while the interfaces for driver, car, circuit, conditions, reliability and strategy are established.

### Long-run harness expansion

Grow the headless harness from calendar progression into the 10–20 season coherence test required by the project vision. It should eventually validate championships, careers, transfers, finances, development, retirements, records and regulations.

## Phase 0 exit criteria

The original Phase 0 foundation criteria are now implemented in code:

1. the evolving Excel master can be imported reproducibly;
2. 1980 can initialize from validated canonical data;
3. a Save World is fully independent of source data;
4. time advances through an event-driven simulation boundary;
5. deterministic tests cover core state transitions;
6. CI validates both simulation and data tooling;
7. a headless harness can load 1980 and advance without UI involvement.

The remaining work above begins the transition from foundations into Phase 1/2 world modelling and time simulation.
