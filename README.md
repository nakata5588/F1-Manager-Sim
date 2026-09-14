# F1 Manager Sim

**Historical starting conditions. Dynamic alternative future.**

F1 Manager Sim is a long-form Formula One management and world simulation game. A new career begins from an authentic historical season where reliable data exists, then the simulation is free to diverge: drivers move teams, staff careers evolve, competitive order changes, regulations shift, new talent emerges and new champions are created by the simulation.

## Current development phase

**Phase 40 — Talent Pipeline & Generated Drivers**

The first fully supported target season remains **1980**. The simulation foundation now combines historical/save boundaries, autonomous career systems, interactive race weekends, people/market dynamics, manager careers, Board pressure, an evolving commercial market, a persistent physical technical lifecycle, dynamic governance/grid evolution, a playable season-to-season transition and a renewable driver population for long careers.

Current career path:

`New Career -> Choose Team -> Create Manager -> Career Home -> Continue -> Race Weekends -> Championship Finale -> Season Review -> Offseason Planning -> New Season -> Preseason -> Race Weekend`

Current management/world loop:

`Continue -> Board / Inbox / People / Staff / Recruitment / Commercial / Technical / Governance / Offseason -> Decision -> Save World consequence -> Continue`

The technical lifecycle extends through:

`Supplier -> Preseason Test -> Design / Research -> Specification -> Manufacture -> Inventory -> Fit -> Wear / Failure -> Replace / Rebuild -> Race`

The talent lifecycle now extends through:

`Generated Junior -> World Visible -> Talent Visible -> F1 Eligible -> Free Driver / Contract -> F1 Career`

Phase 40 closes the long-career population gap. Each career season can create a deterministic, save-specific cohort of generated junior drivers. Generated drivers are Save World entities only: they do not alter the historical database and they never receive historical debut, retirement or future-result authority. They use the same visibility boundary, career development, scouting, contract, employment and race systems as historical drivers once they reach the relevant stage.

Generated drivers have separate Current Ability and Potential Ability plus multidimensional attributes for pace, qualifying, starts, racecraft, wet ability, consistency, tyre management, race intelligence, technical feedback, adaptability, mentality, aggression, pressure handling, teamwork and car-development impact. Their pre-F1 progression is represented through explicitly simulated feeder tiers rather than invented historical lower-series facts.

Phase 39 remains responsible for the persistent offseason cycle, final season review, Board renewal, strategic planning and handoff into the next season. Phase 38 remains responsible for regulation votes and team entry/exit/rebrand evolution. Phase 37 remains responsible for suppliers, component wear and preseason testing. Phase 36 remains responsible for physical specifications, manufacturing, inventory and fitment.

The local Developer Playtest exposes:

- Career / Race Weekend
- Management Hub
- Technical Operations, including suppliers, preseason, reliability, R&D, manufacturing and facilities
- Governance & F1 World, including regulation votes, grid evolution and team identity changes
- Offseason & New Season, including season review, readiness, planning and calendar transition

## Architecture rule

The project keeps five concerns separate:

- **Historical World Database** — immutable source data.
- **Save World** — evolving career state, including generated talent.
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

The generated-talent boundary is:

`Save World Generation -> Visibility Progression -> Scouting -> F1 Eligibility -> Existing Employment Market -> Dynamic Career`

See `docs/ARCHITECTURE.md`, `docs/CAREER_BOOTSTRAP.md`, `docs/DEVELOPER_PLAYTEST.md`, `docs/MANAGEMENT_CORE.md`, `docs/PEOPLE_AND_MARKET_DYNAMICS.md`, `docs/BOARD_MANAGER_STAFF.md`, `docs/SPONSORS_AND_COMMERCIAL.md`, `docs/TECHNICAL_DEVELOPMENT_OPERATIONS.md`, `docs/SUPPLIERS_RELIABILITY_PRESEASON.md`, `docs/REGULATIONS_GOVERNANCE_TEAM_EVOLUTION.md`, `docs/OFFSEASON_NEW_SEASON_PREPARATION.md`, `docs/TALENT_PIPELINE_GENERATED_DRIVERS.md`, `docs/GLOBAL_SEASON_DATABASE_BOUNDARY.md`, `docs/ENTITY_VISIBILITY_BOUNDARY.md`, `docs/DATA_WORKFLOW.md`, `docs/database/F1_MANAGER_SIM_DATABASE_REBUILD_V1_2_3_CANONICAL_PROMOTION.md` and `docs/database/F1_MANAGER_SIM_DATABASE_REBUILD_V1_2_5_TECHNICAL_SOURCE_LOCK_PROMOTION.md`.

## Historical data policy

The current promoted canonical source baseline remains **v1.2.5-1980-technical-source-lock-candidate (2026-09-12)**. Its reproducibility contract is pinned in `data/database-baselines/v1.2.5-1980-technical-source-lock-candidate/baseline.json`; earlier baseline folders remain audit history only.

The latest cumulative 1980 database candidate is **v1.2.11-1980-calendar-circuits-weather-recovery-candidate**. It is pinned separately as the latest candidate and is **not** silently promoted over v1.2.5. Its recovered Calendar/Circuits/Weather scope keeps weather and track evolution as derived gameplay baselines; actual session weather, qualifying, live track state and race results remain simulation-owned.

The canonical source identity remains `9d29b8d004dbbc371b935e155a396bd6f33410f635de9ebdae4e808f8e2cc097`. The promoted Global JSON hash is `315fdd58ef24b02bc6aeb073876d8fa1966839c134751979d8800393b83a36cd` and the promoted Season Definition 1980 JSON hash is `e22b89da311991fad300d873973513cba438ebac38b450e8bf5248f61dfc9303`.

Management, technical, governance and career systems are deliberately tolerant of missing historical fields. Missing values do not become fabricated historical truth:

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
- generated drivers are Save World simulation entities with explicit provenance and visibility gates, never historical source rows;
- generated feeder performances are simulated career outcomes and never claims about real junior-series history;
- generated drivers can become free drivers through the normal F1 eligibility and employment-market pipeline, but are never assigned a scripted F1 debut or team;
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

Materialize a career from the currently promoted database baseline:

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
