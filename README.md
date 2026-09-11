# F1 Manager Sim

**Historical starting conditions. Dynamic alternative future.**

F1 Manager Sim is a long-form Formula One management and world simulation game. A new career begins from an authentic historical season where reliable data exists, then the simulation is free to diverge: drivers move teams, staff careers evolve, competitive order changes, regulations shift and new champions emerge.

## Current development phase

**Phase 34 — Board, Manager Career & Staff Management**

The first fully supported target season remains **1980**. The simulation foundation now combines historical/save boundaries, autonomous career systems, interactive race weekends, people/market dynamics and a manager career that can survive team changes or dismissal.

Current race path:

`New Career -> Choose Team -> Create Manager -> Career Home -> Continue -> Practice -> Setup -> Qualifying -> Pre-Race -> Live Race / Pit Wall -> Results -> Standings`

Current management loop:

`Continue -> Board / Inbox / People / Staff / Recruitment -> Decision -> Save World consequence -> Continue`

Phase 34 makes the **manager** a persistent career entity rather than a permanent label on one team. Board confidence and objectives evolve from current Save World performance; sustained severe underperformance can lead to dismissal. The manager keeps a separate paddock reputation, career history, applications and job offers, and can become genuinely unemployed or move to another team.

Staff recruitment now uses the same employment and contract world as drivers. Staff interest responds to team prestige, personality, satisfaction, relationships and representatives; future agreements remain future assignments until their effective season. Real salary data is used when available and explicit abstract compensation is used when it is not.

Responsibilities are persistent Save World policy. The first areas cover driver recruitment, staff recruitment, scouting, car development, race strategy, finances and commercial work. Delegated car development is already functional and uses the same development rules as AI teams rather than a separate player-only model.

The local Developer Playtest Management Hub now exposes **Inbox, Board, Career, People, Staff, Drivers, Driver Contracts, Market and Responsibilities**.

## Architecture rule

The project keeps five concerns separate:

- **Historical World Database** — immutable source data.
- **Save World** — evolving career state.
- **Simulation Engine** — systems that advance and change the world.
- **Game Systems** — contracts, development, finances, staff, sponsors and management mechanics.
- **UI** — presentation and player interaction; never the authoritative simulation state.

The database packaging boundary is:

`Global Database -> Season Database -> Save World -> Simulation Engine / Game Systems -> UI projection`

The race-weekend gameplay boundary is:

`Practice -> Qualifying -> Grid -> Strategy -> raceStartBaseline -> Live Race -> Classification -> Championship`

The management gameplay boundary is:

`World Event -> Board / People / Market / Career State -> Inbox / Advice -> Player Decision -> Simulation Event -> Updated Save World`

See `docs/ARCHITECTURE.md`, `docs/CAREER_BOOTSTRAP.md`, `docs/DEVELOPER_PLAYTEST.md`, `docs/MANAGEMENT_CORE.md`, `docs/PEOPLE_AND_MARKET_DYNAMICS.md`, `docs/BOARD_MANAGER_STAFF.md`, `docs/GLOBAL_SEASON_DATABASE_BOUNDARY.md`, `docs/ENTITY_VISIBILITY_BOUNDARY.md` and `docs/DATA_WORKFLOW.md`.

## Historical data policy

The current accepted source baseline is **v1.0 candidate (2026-09-11)** and the first career-ready season remains 1980.

Management systems are deliberately tolerant of missing historical fields. Salary, personality, agent, staff-rating and contract data are used when the database supplies them. Missing values do not become fabricated historical truth:

- personality falls back to neutral gameplay values with explicit fallback provenance;
- representatives may receive deterministic behavioral profiles but no invented real-world name;
- driver and staff negotiation uses an abstract compensation index when real salary is unavailable;
- transfer compensation uses explicit historical clauses first, known-salary simulation estimates second, and an abstract index otherwise;
- board confidence, manager reputation and job-market outcomes are dynamic Save World state rather than claimed historical facts.

The historical master database can therefore improve in parallel without requiring gameplay architecture rewrites or altering existing saves.

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

Run the local Developer Playtest UI:

```bash
npm run playtest -- /path/to/season-1980.json \
  --global-world /path/to/global-database.json
```

Then open:

- Career / Race Weekend: `http://127.0.0.1:3000`
- Management Hub: `http://127.0.0.1:3000/management.html`

Both database inputs may be plain `.json` or `.json.gz`. The browser receives only player-facing projections; hidden future identity pools and reference data remain server-side in the Save World.

Generated build files are intentionally not committed. Editor workbooks, SQLite mirrors and CSV exports remain database-authoring/audit artifacts rather than authoritative runtime state.

## Legacy project

`nakata5588/F1-Manager-Light` is reference-only. Useful concepts and data may be adapted, but new development happens exclusively in this repository.
