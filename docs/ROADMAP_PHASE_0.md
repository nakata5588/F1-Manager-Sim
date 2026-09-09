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

## Current 1980 state

`READY_WITH_WARNINGS`

All 18 initialization-readiness checks pass on the current uploaded workbook after canonical normalization. Remaining 1980 warnings are source identity-link inconsistencies that the importer can resolve unambiguously and that are queued for correction in the master database.

## Next implementation block

### Historical World loader

Create a runtime loading boundary for generated canonical Historical World data. It must reject unsupported/blocked seasons and expose only validated canonical collections to the simulation.

### Time engine

Extend the current day clock into a deterministic event scheduler. Advancing time should be able to trigger:

- calendar milestones;
- contract milestones;
- ageing/development ticks;
- finance periods;
- R&D progress;
- race-weekend activation;
- season rollover hooks.

The time engine should not contain the business logic for those systems; it dispatches simulation events to dedicated systems.

### Save schema

Formalize save metadata and serialization versioning so future schema migrations are possible. The first persisted save format must include historical database provenance and simulation seed.

### Long-run harness

Create a headless simulation harness before substantial UI work. Initially it can run calendar/time progression with placeholder systems, then grow into the 10–20 season coherence test required by the project vision.

## Exit criteria for Phase 0

Phase 0 is complete when:

1. the evolving Excel master can be imported reproducibly;
2. 1980 can initialize from validated canonical data;
3. a Save World is fully independent of source data;
4. time can advance through an event-driven simulation boundary;
5. deterministic tests cover core state transitions;
6. CI validates both simulation and data tooling;
7. a headless harness can load 1980 and advance without UI involvement.
