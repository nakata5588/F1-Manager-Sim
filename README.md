# F1 Manager Sim

**Historical starting conditions. Dynamic alternative future.**

F1 Manager Sim is a long-form Formula One management and world simulation game. A new career begins from an authentic historical season where reliable data exists, then the simulation is free to diverge: drivers move teams, staff careers evolve, competitive order changes, regulations shift and new champions emerge.

## Current development phase

**Phase 0 — Audit & Foundations**

The first fully supported target season is **1980**. The immediate goal is to build the simulation foundation before UI depth:

1. audit and normalize the recovered historical master database;
2. create an immutable Historical World snapshot;
3. create independent mutable Save Worlds;
4. implement deterministic simulation primitives and time progression;
5. validate the world through automated and long-run tests;
6. only then layer management systems and the Football Manager-style UI on top.

## Architecture rule

The project keeps five concerns separate:

- **Historical World Database** — immutable source data.
- **Save World** — evolving career state.
- **Simulation Engine** — systems that advance and change the world.
- **Game Systems** — contracts, development, finances, staff, sponsors and management mechanics.
- **UI** — presentation and player interaction; never the authoritative simulation state.

See `docs/ARCHITECTURE.md`, `docs/DATABASE_AUDIT_2026-09-10.md`, `docs/DATABASE_READINESS_1980.md` and `docs/DATA_WORKFLOW.md`.

## Parallel database development

The historical master database is expected to improve continuously while the simulation is developed. The importer/validator forms a stable boundary so a newer database version can be audited and adopted without rewriting simulation code or altering existing saves.

The importer preserves source provenance, normalizes known legacy column aliases, validates IDs and relationships, repairs only unambiguous name/ID mismatches, versions the database by SHA-256, and emits a season-readiness report.

## Development

Core simulation development requires Node.js 22+. Historical database tooling uses Python 3.11+ and only the standard library.

```bash
npm test
npm run test:data
```

Audit a master workbook without modifying it:

```bash
npm run db:audit -- /path/to/f1_db.xlsx --season 1980 --full-world
```

Generated files are written to `build/historical/` and are intentionally not committed. A newer workbook can be dropped through the same command to produce a new manifest, validation report and readiness result.

The repository is intentionally starting with a small simulation core. UI/framework dependencies will be added when the domain and save boundaries are stable.

## Legacy project

`nakata5588/F1-Manager-Light` is reference-only. Useful concepts and data may be adapted, but new development happens exclusively in this repository.
