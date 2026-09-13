# F1 Manager Sim

**Historical starting conditions. Dynamic alternative future.**

F1 Manager Sim is a long-form Formula One management and world simulation game. A new career begins from an authentic historical season where reliable data exists, then the simulation is free to diverge: drivers move teams, staff careers evolve, competitive order changes, regulations shift and new champions emerge.

## Current development phase

**Phase 39 — Offseason & New Season Preparation**

The first fully supported target season remains **1980**. The simulation foundation now combines historical/save boundaries, autonomous career systems, interactive race weekends, people/market dynamics, manager careers, Board pressure, an evolving commercial market, a persistent physical technical lifecycle, dynamic governance/grid evolution and a playable season-to-season transition.

Current career path:

`New Career -> Choose Team -> Create Manager -> Career Home -> Continue -> Race Weekends -> Championship Finale -> Season Review -> Offseason Planning -> New Season -> Preseason -> Race Weekend`

Current management/world loop:

`Continue -> Board / Inbox / People / Staff / Recruitment / Commercial / Technical / Governance / Offseason -> Decision -> Save World consequence -> Continue`

The technical lifecycle extends through:

`Supplier -> Preseason Test -> Design / Research -> Specification -> Manufacture -> Inventory -> Fit -> Wear / Failure -> Replace / Rebuild -> Race`

Phase 39 closes the gap that previously left the interactive Developer Playtest parked after the final race. A completed championship now opens a persistent offseason cycle with a final season review, Board review, contracts/supplier/sponsor/governance/next-car readiness, a strategic season plan, January season preparation and a handoff into preseason testing.

The offseason is a coordinator rather than a duplicate management system. Contracts remain authoritative in Employment/Contracts, engine agreements in Suppliers, sponsors in Commercial, regulations/grid changes in Governance, and the next car in Technical. The offseason only projects readiness, records the team's plan and advances the world through the transition.

Central `Continue` is now season-aware. During the racing season it still moves to the next Grand Prix. After the final race it advances through monthly offseason boundaries so normal systems continue to run; January creates the next season/calendar, and the normal race path resumes afterwards.

At season start, actual team cash remains authoritative. Phase 39 records the current cash as the new season-opening finance baseline, archives the previous baseline, renews Board objectives and applies the confirmed season strategy to existing delegated/AI technical planning. It never creates a second budget currency or free offseason money.

Phase 38 remains responsible for regulation votes and team entry/exit/rebrand evolution. Phase 37 remains responsible for suppliers, component wear and preseason testing. Phase 36 remains responsible for physical specifications, manufacturing, inventory and fitment.

The local Developer Playtest exposes:

- Career / Race Weekend
- Management Hub
- Technical Operations, including suppliers, preseason, reliability, R&D, manufacturing and facilities
- Governance & F1 World, including regulation votes, grid evolution and team identity changes
- Offseason & New Season, including season review, readiness, planning and calendar transition

## Architecture rule

The project keeps five concerns separate:

- **Historical World Database** — immutable source data.
- **Save World** — evolving career state.
- **Simulation Engine** — systems that advance and change the world.
- **Game Systems** — contracts, development, finances, staff, sponsors, technical operations, governance and season preparation mechanics.
- **UI** — presentation and player interaction; never the authoritative simulation state.

The database packaging boundary is:

`Global Database -> Season Database -> Save World -> Simulation Engine / Game Systems -> UI projection`

The race-weekend gameplay boundary is:

`Practice -> Qualifying -> Grid -> Strategy -> raceStartBaseline -> Live Race -> Classification -> Championship`

The management gameplay boundary is:

`World Event -> Board / People / Market / Commercial / Technical / Governance / Offseason / Career State -> Inbox / Advice -> Player Decision -> Simulation Event -> Updated Save World`

The technical gameplay boundary is:

`Historical starting car/supplier -> Preseason -> Design / Research -> Specification -> Manufacture -> Inventory -> Fit -> Wear / Failure -> Maintain -> Race`

The governance boundary is:

`Historical future reference / Dynamic pressure -> Proposal / Application -> Vote / Review -> Enacted decision -> Save World consequence -> News / History`

The season-transition boundary is:

`Championship Complete -> Season Review -> Planning / Existing Management Systems -> Season Rollover -> Board & Finance Renewal -> Preseason -> First Race`

See `docs/ARCHITECTURE.md`, `docs/CAREER_BOOTSTRAP.md`, `docs/DEVELOPER_PLAYTEST.md`, `docs/MANAGEMENT_CORE.md`, `docs/PEOPLE_AND_MARKET_DYNAMICS.md`, `docs/BOARD_MANAGER_STAFF.md`, `docs/SPONSORS_AND_COMMERCIAL.md`, `docs/TECHNICAL_DEVELOPMENT_OPERATIONS.md`, `docs/SUPPLIERS_RELIABILITY_PRESEASON.md`, `docs/REGULATIONS_GOVERNANCE_TEAM_EVOLUTION.md`, `docs/OFFSEASON_NEW_SEASON_PREPARATION.md`, `docs/GLOBAL_SEASON_DATABASE_BOUNDARY.md`, `docs/ENTITY_VISIBILITY_BOUNDARY.md`, `docs/DATA_WORKFLOW.md`, `docs/database/F1_MANAGER_SIM_DATABASE_REBUILD_V1_2_3_CANONICAL_PROMOTION.md` and `docs/database/F1_MANAGER_SIM_DATABASE_REBUILD_V1_2_5_TECHNICAL_SOURCE_LOCK_PROMOTION.md`.

## Historical data policy

The current promoted canonical source baseline is **v1.2.5-1980-technical-source-lock-candidate (2026-09-12)**. Its reproducibility contract is pinned in `data/database-baselines/v1.2.5-1980-technical-source-lock-candidate/baseline.json`; earlier baseline folders remain audit history only. The v1.2.5 bundle is cumulative and supersedes v1.2.4, so those releases must not be applied sequentially. The first career-ready season remains 1980.

The canonical source identity remains `9d29b8d004dbbc371b935e155a396bd6f33410f635de9ebdae4e808f8e2cc097`. The promoted Global JSON hash is `315fdd58ef24b02bc6aeb073876d8fa1966839c134751979d8800393b83a36cd` and the promoted Season Definition 1980 JSON hash is `e22b89da311991fad300d873973513cba438ebac38b450e8bf5248f61dfc9303`.

Management, technical and governance systems are deliberately tolerant of missing historical fields. Missing values do not become fabricated historical truth:

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
- future historical regulations are reference inputs only and require career governance before becoming active;
- future team identities are eligibility candidates, not scripted future grid members;
- generated resources for newly admitted teams are explicit simulation baselines, not historical facts;
- rebrands preserve stable team IDs;
- offseason strategy, future Board objectives and season-opening financial baselines are Save World state, not historical source data;
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
- Governance & F1 World: `http://127.0.0.1:3000/governance.html`
- Offseason & New Season: `http://127.0.0.1:3000/offseason.html`

Both database inputs may be plain `.json` or `.json.gz`. The browser receives only player-facing projections; hidden future identity pools and reference data remain server-side in the Save World.

Generated build files are intentionally not committed. Editor workbooks, SQLite mirrors and large JSON exports remain database-authoring/audit artifacts rather than authoritative runtime state; the repository pins their identities and checksums instead.

## Legacy project

`nakata5588/F1-Manager-Light` is reference-only. Useful concepts and data may be adapted, but new development happens exclusively in this repository.
