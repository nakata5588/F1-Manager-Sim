# F1 Manager Sim

**Historical starting conditions. Dynamic alternative future.**

F1 Manager Sim is a long-form Formula One management and world simulation game. A new career begins from an authentic historical season where reliable data exists, then the simulation is free to diverge: drivers move teams, staff careers evolve, competitive order changes, regulations shift and new champions emerge.

## Current development phase

**Phase 31 — Interactive Race Weekend & Pit Wall Foundation**

The first fully supported target season remains **1980**. The simulation foundation includes historical/save boundaries, autonomous career systems, race weekends, temporal/live race simulation, championship rules, database provenance and long-run validation. Phase 31 turns the Developer Playtest vertical slice into an interactive weekend and race-management loop without moving simulation authority into the browser.

Current playable path:

`New Career -> Choose Team -> Create Manager -> Career Home -> Continue -> Practice -> Setup -> Qualifying -> Pre-Race -> Live Race / Pit Wall -> Results -> Standings`

The current playtest exposes controlled-car setup changes, starting tyres, resumable live racing, tyre/fuel/damage telemetry where supported by data, Race Control/event feeds and simulation speed controls with auto-pause on notable events.

## Architecture rule

The project keeps five concerns separate:

- **Historical World Database** — immutable source data.
- **Save World** — evolving career state.
- **Simulation Engine** — systems that advance and change the world.
- **Game Systems** — contracts, development, finances, staff, sponsors and management mechanics.
- **UI** — presentation and player interaction; never the authoritative simulation state.

The database packaging boundary is:

`Global Database -> Season Database -> Save World -> Simulation Engine`

The race-weekend gameplay boundary is:

`Practice -> Qualifying -> Grid -> Strategy -> raceStartBaseline -> Live Race -> Classification -> Championship`

The live race no longer requires an aggregate placeholder race result before lights out. `raceStartBaseline` is starting state only; the first real classification is the completed live race.

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