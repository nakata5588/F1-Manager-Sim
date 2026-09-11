# F1 Manager Sim

**Historical starting conditions. Dynamic alternative future.**

F1 Manager Sim is a long-form Formula One management and world simulation game. A new career begins from an authentic historical season where reliable data exists, then the simulation is free to diverge: drivers move teams, staff careers evolve, competitive order changes, regulations shift and new champions emerge.

## Current development phase

**Phase 35 — Sponsors, Marketability & Commercial**

The first fully supported target season remains **1980**. The simulation foundation now combines historical/save boundaries, autonomous career systems, interactive race weekends, people/market dynamics, manager careers, Board pressure and an evolving commercial market.

Current race path:

`New Career -> Choose Team -> Create Manager -> Career Home -> Continue -> Practice -> Setup -> Qualifying -> Pre-Race -> Live Race / Pit Wall -> Results -> Standings`

Current management loop:

`Continue -> Board / Inbox / People / Staff / Recruitment / Commercial -> Decision -> Save World consequence -> Continue`

Phase 35 turns sponsorship from passive historical income into dynamic Save World state. Historical sponsor contracts are materialized once as starting agreements, while renewals, new negotiations, activities, bonuses, satisfaction and commercial performance are free to diverge from real history.

Team marketability now reacts to reputation, drivers, recent performance, championship position and available commercial facilities. Driver marketability responds to reputation, recent results and confidence. Sponsor interest then reacts to that evolving world rather than a hardcoded historical outcome.

Sponsor negotiations support title, major and partner tiers, category exclusivity, duration, upfront payments, performance bonuses and commercial-activity commitments. AI teams and delegated commercial departments use the same negotiation pipeline as the player.

`Sponsor_Model` remains a gameplay calibration source and is never silently counted on top of historical sponsor contracts. Monetary provenance is explicit: historical contract values, gameplay estimates and in-career negotiated values remain distinguishable.

The local Developer Playtest Management Hub now exposes **Inbox, Board, Career, People, Staff, Drivers, Driver Contracts, Driver Market, Commercial and Responsibilities**.

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

`World Event -> Board / People / Market / Commercial / Career State -> Inbox / Advice -> Player Decision -> Simulation Event -> Updated Save World`

See `docs/ARCHITECTURE.md`, `docs/CAREER_BOOTSTRAP.md`, `docs/DEVELOPER_PLAYTEST.md`, `docs/MANAGEMENT_CORE.md`, `docs/PEOPLE_AND_MARKET_DYNAMICS.md`, `docs/BOARD_MANAGER_STAFF.md`, `docs/SPONSORS_AND_COMMERCIAL.md`, `docs/GLOBAL_SEASON_DATABASE_BOUNDARY.md`, `docs/ENTITY_VISIBILITY_BOUNDARY.md` and `docs/DATA_WORKFLOW.md`.

## Historical data policy

The current accepted source baseline is **v1.0 candidate (2026-09-11)** and the first career-ready season remains 1980.

Management systems are deliberately tolerant of missing historical fields. Salary, personality, agent, staff-rating, sponsor and contract data are used when the database supplies them. Missing values do not become fabricated historical truth:

- personality falls back to neutral gameplay values with explicit fallback provenance;
- representatives may receive deterministic behavioral profiles but no invented real-world name;
- driver and staff negotiation uses an abstract compensation index when real salary is unavailable;
- transfer compensation uses explicit historical clauses first, known-salary simulation estimates second, and an abstract index otherwise;
- sponsor monetary values retain explicit provenance between historical contracts, gameplay-model estimates and simulation negotiations;
- unknown sponsor industries remain uncategorized rather than receiving invented historical categories;
- board confidence, manager reputation, marketability and commercial outcomes are dynamic Save World state rather than claimed historical facts.

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
