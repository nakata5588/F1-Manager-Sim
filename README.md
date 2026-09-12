# F1 Manager Sim

**Historical starting conditions. Dynamic alternative future.**

F1 Manager Sim is a long-form Formula One management and world simulation game. A new career begins from an authentic historical season where reliable data exists, then the simulation is free to diverge: drivers move teams, staff careers evolve, competitive order changes, regulations shift and new champions emerge.

## Current development phase

**Phase 37 — Suppliers, Reliability & Preseason**

The first fully supported target season remains **1980**. The simulation foundation now combines historical/save boundaries, autonomous career systems, interactive race weekends, people/market dynamics, manager careers, Board pressure, an evolving commercial market and a persistent physical technical lifecycle.

Current race path:

`New Career -> Choose Team -> Create Manager -> Career Home -> Continue -> Practice -> Setup -> Qualifying -> Pre-Race -> Live Race / Pit Wall -> Results -> Standings`

Current management loop:

`Continue -> Board / Inbox / People / Staff / Recruitment / Commercial / Technical -> Decision -> Save World consequence -> Continue`

The technical lifecycle now extends through:

`Supplier -> Preseason Test -> Design / Research -> Specification -> Manufacture -> Inventory -> Fit -> Wear / Failure -> Replace / Rebuild -> Race`

Phase 36 established physical specifications, manufacturing, stock, per-car fitment and facility development. Phase 37 adds mutable engine-supplier contracts, per-car engine/component condition, deterministic race wear, persistent mechanical failures, spare consumption, component rebuilds, engine service and preseason testing.

Historical `teamEngines` seeds the opening supplier only. Future supplier negotiations belong to Save World and activate at the agreed future season rather than changing the current car early. Unknown historical engine-contract money remains unknown/abstract instead of receiving fabricated cash terms; negotiated future contracts become real Team Economy expenses after activation.

Physical condition now carries across races and affects both effective reliability and, when sufficiently poor, performance. A mechanical DNF can mark a persistent physical subsystem failed. Replacing a component consumes a matching manufactured spare, while a worn or failed removed component does not magically return to inventory as a fresh part.

Preseason testing creates persistent development knowledge, reliability preparation and setup knowledge. Testing costs real cash, closes at the first race date and uses technical staff, driver feedback, facilities and deterministic seeded uncertainty. AI teams and a player team with **Car Development = Delegated** use the same supplier, testing, wear and maintenance systems.

Facilities remain mutable Save World upgrade state. Upgrades cost real team cash, take time and add maintenance cost without rewriting historical database rows. The canonical v1.2.5 database provides explicit 1980 component/facility/manufacturing starting baselines with source-lock provenance; derived values remain explicitly non-source-locked.

The local Developer Playtest exposes:

- Career / Race Weekend
- Management Hub
- Technical Operations, including suppliers, preseason, reliability, R&D, manufacturing and facilities

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

`World Event -> Board / People / Market / Commercial / Technical / Career State -> Inbox / Advice -> Player Decision -> Simulation Event -> Updated Save World`

The technical gameplay boundary is:

`Historical starting car/supplier -> Preseason -> Design / Research -> Specification -> Manufacture -> Inventory -> Fit -> Wear / Failure -> Maintain -> Race`

See `docs/ARCHITECTURE.md`, `docs/CAREER_BOOTSTRAP.md`, `docs/DEVELOPER_PLAYTEST.md`, `docs/MANAGEMENT_CORE.md`, `docs/PEOPLE_AND_MARKET_DYNAMICS.md`, `docs/BOARD_MANAGER_STAFF.md`, `docs/SPONSORS_AND_COMMERCIAL.md`, `docs/TECHNICAL_DEVELOPMENT_OPERATIONS.md`, `docs/SUPPLIERS_RELIABILITY_PRESEASON.md`, `docs/GLOBAL_SEASON_DATABASE_BOUNDARY.md`, `docs/ENTITY_VISIBILITY_BOUNDARY.md`, `docs/DATA_WORKFLOW.md`, `docs/database/F1_MANAGER_SIM_DATABASE_REBUILD_V1_2_3_CANONICAL_PROMOTION.md` and `docs/database/F1_MANAGER_SIM_DATABASE_REBUILD_V1_2_5_TECHNICAL_SOURCE_LOCK_PROMOTION.md`.

## Historical data policy

The current promoted canonical source baseline is **v1.2.5-1980-technical-source-lock-candidate (2026-09-12)**. Its reproducibility contract is pinned in `data/database-baselines/v1.2.5-1980-technical-source-lock-candidate/baseline.json`; earlier baseline folders remain audit history only. The v1.2.5 bundle is cumulative and supersedes v1.2.4, so those releases must not be applied sequentially. The first career-ready season remains 1980.

The canonical source identity remains `9d29b8d004dbbc371b935e155a396bd6f33410f635de9ebdae4e808f8e2cc097`. The promoted Global JSON hash is `315fdd58ef24b02bc6aeb073876d8fa1966839c134751979d8800393b83a36cd` and the promoted Season Definition 1980 JSON hash is `e22b89da311991fad300d873973513cba438ebac38b450e8bf5248f61dfc9303`.

Management and technical systems are deliberately tolerant of missing historical fields. Salary, personality, agent, staff-rating, sponsor, contract, facility and technical data are used when the database supplies them. Missing values do not become fabricated historical truth:

- personality falls back to neutral gameplay values with explicit fallback provenance;
- representatives may receive deterministic behavioral profiles but no invented real-world name;
- driver and staff negotiation uses an abstract compensation index when real salary is unavailable;
- transfer compensation uses explicit historical clauses first, known-salary simulation estimates second, and an abstract index otherwise;
- sponsor monetary values retain explicit provenance between historical contracts, gameplay-model estimates and simulation negotiations;
- unknown sponsor industries remain uncategorized rather than receiving invented historical categories;
- board confidence, manager reputation, marketability and commercial outcomes are dynamic Save World state rather than claimed historical facts;
- 1980 component values are relative source-locked database starting baselines, not claims about exact measured engineering values;
- starting technical specifications are fitted to both cars but create zero spare inventory unless a future sourced row explicitly provides stock;
- the absent 1980 simulator source field remains a `derived_gameplay_baseline` with `derived_not_source_locked` provenance;
- starting component/engine condition of `100` is a derived serviceable gameplay baseline, not a historical measurement of wear;
- historical `teamEngines` provides the opening supplier assignment only; future supplier contracts are Save World state;
- unknown historical supplier monetary values remain abstract rather than becoming invented costs;
- technical specifications, reliability ratings, wear, failures, maintenance, preseason preparation and supplier agreements created after career start are simulation state;
- facility upgrades never overwrite the historical starting facility rows or reference baselines;
- source-lock manifests, canonical ID correction maps, technical audits and research/readiness packs remain reference context rather than mutable Save World state.

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
npm run save:from-season-db -- /path/to/F1_Manager_Sim_SeasonDefinition_1980_v1.2.5_1980_technical_source_lock_candidate.json \
  --global-world /path/to/F1_Manager_Sim_Global_Database_v1.2.5_1980_technical_source_lock_candidate.json \
  --out build/saves/1980.save.json \
  --seed 1980-playtest
```

Run the local Developer Playtest UI:

```bash
npm run playtest -- /path/to/F1_Manager_Sim_SeasonDefinition_1980_v1.2.5_1980_technical_source_lock_candidate.json \
  --global-world /path/to/F1_Manager_Sim_Global_Database_v1.2.5_1980_technical_source_lock_candidate.json
```

Then open:

- Career / Race Weekend: `http://127.0.0.1:3000`
- Management Hub: `http://127.0.0.1:3000/management.html`
- Technical Operations: `http://127.0.0.1:3000/technical.html`

Both database inputs may be plain `.json` or `.json.gz`. The browser receives only player-facing projections; hidden future identity pools and reference data remain server-side in the Save World.

Generated build files are intentionally not committed. Editor workbooks, SQLite mirrors and large JSON exports remain database-authoring/audit artifacts rather than authoritative runtime state; the repository pins their identities and checksums instead.

## Legacy project

`nakata5588/F1-Manager-Light` is reference-only. Useful concepts and data may be adapted, but new development happens exclusively in this repository.
