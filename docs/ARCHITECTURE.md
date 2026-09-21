# Architecture

## Product principle

F1 Manager Sim uses historical data to define the starting world, not future outcomes. Once a career begins, every save owns an independent world state and may create a different Formula One history.

## Boundaries

### 1. Historical World Database

Immutable source data and normalized historical records. It contains entities and season-specific facts such as drivers, staff, teams, contracts, engines, cars, facilities, circuits, calendars and regulations.

Rules:

- source records are never mutated by a career;
- stable IDs are authoritative; names are display data;
- season-specific values are represented explicitly rather than overwritten;
- legacy source quirks are normalized at ingestion boundaries, not silently edited in the master file.

### 2. Historical Season Snapshot

A read-only projection of the Historical World Database for the selected starting season.

For example, a 1980 snapshot resolves the active team identities, drivers, contracts, staff, engines, car state, facilities, calendar and applicable rules for 1980.

The snapshot is deep-frozen at runtime so accidental writes fail early.

### 3. Save World

A mutable deep copy created from a Historical Season Snapshot.

A Save World owns:

- current date and season;
- current world entities and relationships;
- evolving contracts and employment;
- finances, facilities and car development;
- morale, form and reputation;
- event history, championships, transfers and records;
- deterministic seed metadata.

No save may modify the Historical World Database or another save.

### 4. Simulation Engine

Pure or near-pure systems that transform Save World state over time. The UI must not contain authoritative simulation logic.

Preferred flow:

`World State -> Simulation Event -> Consequence -> Updated World State -> News / Inbox / History`

Systems will include time progression, driver ageing/development, contracts, AI team decisions, R&D, finances, sponsors, regulations, race weekends, retirements, new talent and news generation.

### 5. Game Systems

Player-facing management rules built on the same world model used by AI teams. Examples include negotiations, hiring, development allocation, facilities, strategy, sponsors and board expectations.

### 6. UI

A Football Manager-style presentation and interaction layer. It reads state and dispatches commands; it is never the source of truth.

## Determinism and randomness

Simulation uncertainty is controlled through seeded pseudo-random generators. A seed allows debugging and reproducibility while different saves from the same season can still produce different alternative histories.

Randomness must modify plausible outcomes rather than replace performance modelling. Race performance will ultimately emerge from driver, car, team, circuit, setup, conditions, strategy, reliability, form/morale and controlled randomness.

## Driver model

Drivers are multi-dimensional entities. Current Ability and Potential Ability may summarize broad level internally, but race results must never be calculated as `Overall + Random`.

Core attribute families include pace, qualifying, start ability, racecraft, wet skill, consistency, tyre management, intelligence, technical feedback, adaptability, mentality, aggression, pressure handling, leadership, teamwork, development impact and reputation.

## Legacy classification

The old `F1-Manager-Light` repository is read-only reference material.

Initial classification:

- **KEEP as concepts/data reference:** stable IDs, season filtering, Excel-value sanitization ideas, normalized historical JSON approach, selected domain terminology.
- **ADAPT:** data ingestion/validation tooling, useful simulation formulas after independent review, UI concepts that fit the new world model.
- **REWRITE:** save architecture, world state ownership, simulation orchestration, race engine, contracts/AI progression and data normalization interfaces.
- **DISCARD:** monolithic state patterns that mix persistence, source database data, simulation logic and UI state in one store; hardcoded historical outcomes; UI-owned authoritative state.

## Initial module layout

- `src/domain` — immutable historical-domain projection and shared domain rules.
- `src/save` — Save World creation and persistence boundaries.
- `src/sim` — deterministic simulation primitives and engines.
- `src/game` — management mechanics (added in later phases).
- `src/ui` / application layer — added after core world flow is stable.
- `tests` — unit, integration and long-run simulation validation.
- `docs` — design decisions and database audits.

## First vertical simulation target

1980 is the first target season. Before substantial UI work, the core should be capable of:

1. loading a validated 1980 historical snapshot;
2. creating two independent saves from that same snapshot;
3. advancing dates safely;
4. producing deterministic events for a given seed;
5. evolving world state without mutating historical data;
6. running automated tests outside any UI.

This is the foundation for the longer milestone: New Game -> Database -> Decade -> Season -> Team -> Manager -> Career -> Continue -> Race Weekend -> Championship -> Offseason -> Next Season.


### 7. Race Entry authority

Employment owns contractual employment. `world.raceEntryState.current` owns participation in the current race-entry context.

Race Weekend consumes Race Entry directly. It must not mutate Employment to make a reserve/test/temporary driver appear as a race driver. This boundary is required for injuries, substitutions, one-race entries and era-specific entry rules.

### 8. Save schema evolution

Save envelopes use an ordered migration chain before restoration. Migrations may normalize persisted structure and metadata, but must not rerun simulation outcomes. Historical Database provenance compatibility is checked separately after save-schema migration.


### 9. Dynamic calendar authority

The selected starting season's historical calendar is authoritative only for career start.

After career start, `world.calendarEvolution` owns promoter contracts and future calendar planning. `world.calendar` remains the active race schedule consumed by the time engine and Race Weekend.

Future historical calendars under `reference.futureStructure.calendars` are candidate/reference data only. They may inform available venues, structural race-count context and scheduling context, but they never mandate exact future race counts, venue changes or round order.

The authority flow is:

`Historical opening calendar -> Calendar Evolution / Promoters -> Finalised Save World plan -> Active world.calendar -> Race Weekend -> World History`
