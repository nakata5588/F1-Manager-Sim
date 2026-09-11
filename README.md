# F1 Manager Sim

**Historical starting conditions. Dynamic alternative future.**

F1 Manager Sim is a long-form Formula One management and world simulation game. A new career begins from an authentic historical season where reliable data exists, then the simulation is free to diverge: drivers move teams, staff careers evolve, competitive order changes, regulations shift and new champions emerge.

## Current development phase

**Phase 30 — Developer Playtest UI**

The first fully supported target season remains **1980**. The simulation foundation includes historical/save boundaries, autonomous career systems, race weekends, temporal/live race simulation, championship rules, database provenance and long-run validation. Phase 30 exposes the first playable vertical slice without moving simulation authority into the browser.

Current playable path:

`New Career -> Choose Team -> Create Manager -> Career Home -> Continue -> Race Weekend -> Live Race -> Results -> Standings`

The UI is deliberately functional rather than polished. It consumes a real Season Database and advances the same Save World/simulation systems used by automated tests.

## Architecture rule

The project keeps five concerns separate:

- **Historical World Database** — immutable source data.
- **Save World** — evolving career state.
- **Simulation Engine** — systems that advance and change the world.
- **Game Systems** — contracts, development, finances, staff, sponsors and management mechanics.
- **UI** — presentation and player interaction; never the authoritative simulation state.

The database packaging boundary is:

`Global Database -> Season Database -> Save World -> Simulation Engine`

See `docs/ARCHITECTURE.md`, `docs/CAREER_BOOTSTRAP.md`, `docs/DEVELOPER_PLAYTEST.md`, `docs/GLOBAL_SEASON_DATABASE_BOUNDARY.md`, `docs/ENTITY_VISIBILITY_BOUNDARY.md` and `docs/DATA_WORKFLOW.md`.

## Database baseline

The current accepted source baseline is **v1.0 candidate (2026-09-11)**. Its source identity, checksums, readiness counts and historical calendar race-count reference are pinned in:

`data/database-baselines/v1.0-candidate/baseline.json`

1980 is `READY`; later seasons are enabled only when their active starting-state data passes readiness validation. A database update is audited against the current baseline before promotion rather than silently replacing it.

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

Materialize a career from an accepted Season Database:

```bash
npm run save:from-season-db -- /path/to/season-1980.json \
  --global-world /path/to/global-database.json \
  --out build/saves/1980.save.json \
  --seed 1980-playtest
```

Run the local Developer Playtest UI against a materialized Season Database:

```bash
npm run playtest -- /path/to/season-1980.json \
  --global-world /path/to/global-database.json
```

Then open `http://127.0.0.1:3000`.

Both database inputs may be plain `.json` or `.json.gz`. The browser receives only player-facing projections; hidden future identity pools and reference data remain server-side in the Save World.

Generated build files are intentionally not committed. Editor workbooks, SQLite mirrors and CSV exports remain database-authoring/audit artifacts rather than authoritative runtime state.

## Legacy project

`nakata5588/F1-Manager-Light` is reference-only. Useful concepts and data may be adapted, but new development happens exclusively in this repository.
