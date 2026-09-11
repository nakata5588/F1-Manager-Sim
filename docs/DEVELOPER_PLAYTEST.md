# Developer Playtest UI

## Purpose

Phase 31 turns the first vertical slice into an interactive race-weekend gameplay loop while keeping the simulation architecture intact.

The UI is not a second simulation implementation. It is a thin application/client layer over the canonical career bootstrap and Save World:

`Season Database -> Save World -> Simulation Systems -> Player-facing projection -> Browser`

The browser never receives hidden future entity pools, future structural reference tables or raw mutable simulation internals.

## Run locally

```bash
npm run playtest -- /path/to/season-1980.json \
  --global-world /path/to/global-database.json
```

Open:

`http://127.0.0.1:3000`

Options:

- `--global-world <path>` validates Season Database provenance against the Global Database;
- `--port <number>` changes the local port (default `3000`);
- `--host <address>` changes the bind address (default `127.0.0.1`).

Inputs may be JSON or gzip-compressed JSON.

## Current playable path

1. New Career
2. Choose Team
3. Create Manager
4. Career Home
5. Continue to the next Grand Prix weekend
6. Practice
7. Review setup knowledge and adjust each controlled car
8. Qualifying
9. Review classification / DNQ state
10. Grid and strategy lock
11. Pre-Race starting tyre selection
12. Live resumable race
13. Pit-wall strategy calls
14. Results
15. Drivers' / Constructors' standings
16. Continue to the next event

The UI deliberately remains a developer playtest rather than final visual polish. Its purpose is to make real simulation systems observable and controllable as early as possible.

## Application boundary

`DeveloperPlaytestSession` lives under `src/app/` rather than `playtest/`.

It owns orchestration only:

- validates the selected team against the active Season Database;
- creates a career through `createCareerFromSeasonDatabase()`;
- initializes the normal core simulation systems;
- advances time through `advanceDays()`;
- stages Practice, Qualifying and Grid through the existing race-weekend system;
- applies setup changes through the simulation-side setup contract;
- locks strategies/calibration through existing systems;
- creates a semantic race-start baseline;
- hands Race execution to `LiveRaceController`;
- commits only the final live result into Save World history and championship systems;
- exposes a reduced player-facing projection.

The browser contains no race logic, standings logic, calendar logic, setup scoring logic or hidden database state.

## Race-start baseline

Phase 31 removes the Phase 30 workaround that generated an aggregate race result before the live race could begin.

The new pipeline is:

`Practice -> Qualifying -> Grid -> Strategy -> raceStartBaseline -> Live Race -> Classification -> Championship`

`createRaceStartBaseline()` derives the initial performance/reliability state from the grid, driver, calibrated car, engine and setup. It deliberately contains no finishing position, DNF outcome, retirement reason or simulated race result.

`LiveRaceController` accepts that baseline and adapts it inside its private cloned runtime weekend for the existing temporal engine contract. The authoritative active weekend remains classification-free until the live race actually finishes.

This means there is no fake classification to remove from history and no possibility of an aggregate placeholder result reaching championship scoring.

## Interactive setup

Practice still uses the canonical race-weekend simulation to build setup knowledge and an internally calculated ideal setup.

After Practice, the player may adjust:

- aero balance;
- mechanical grip;
- gearing;
- cooling.

`adjustWeekendSetup()` runs server-side. The ideal setup remains hidden; only the chosen values, setup knowledge and recalculated quality are projected to the browser.

Setup can be changed only after Practice and before Qualifying.

## Pre-Race strategy

The normal strategy system still creates and locks plans on `GRID_SET` for player and AI teams.

For the controlled team, Phase 31 adds a pre-race starting-tyre revision. It re-evaluates the existing strategy plan rather than replacing the strategy system in the UI.

Live pit calls continue to use `applyLiveStrategyInstruction()` at paused lap boundaries.

## Pit Wall / live race

The current Race View exposes:

- position/order;
- simulation-relative gap index;
- tyre compound;
- tyre wear where the tyre model supplies it;
- tyre thermal status;
- fuel mass when explicit era/race fuel data exists;
- damage pace loss;
- pit-stop count;
- current weather;
- active Race Control state;
- recent incidents, retirements, damage, weather changes and Race Control events;
- pit-wall tyre calls for the controlled team.

The current gap value is explicitly a **Gap Index**, not seconds. The temporal race engine does not yet operate on calibrated absolute lap-time seconds, so the UI does not pretend otherwise.

## Simulation speeds and auto-pause

The browser offers:

- Pause
- 1x
- 2x
- 4x
- 8x
- Step +1 lap
- Simulate to Finish

Speed only controls how frequently the browser requests the next authoritative lap. It does not simulate anything client-side.

The loop automatically pauses when a new notable event is returned, including incidents, damage, retirements, weather changes and Race Control changes. The server still resolves those events; the browser merely stops asking for further laps.

## API surface

The local server exposes:

- `GET /api/setup`
- `GET /api/state`
- `POST /api/career`
- `POST /api/continue`
- `POST /api/weekend/advance`
- `POST /api/weekend/setup`
- `POST /api/weekend/starting-tyre`
- `POST /api/weekend/start-race`
- `POST /api/race/advance`
- `POST /api/race/finish`
- `POST /api/race/strategy`

## Safety / visibility rule

Player-facing responses must continue to respect:

`exists internally != visible != scoutable != F1 eligible`

The Developer Playtest team chooser reads only active `snapshot.teams`. State projections read active Save World drivers/teams and never serialize `reference.futureStructure`, `futureDrivers`, `futureTeams`, `futureStaff`, `futureSponsors` or other hidden pools.

## Next iterations

Likely follow-up work:

- calibrated absolute timing/gaps rather than abstract race-index gaps;
- finer-grained telemetry (`lapProgress` / sector progress) and circuit geometry for a moving track map;
- richer Practice programmes and Qualifying session management;
- full pre-race stint editor rather than starting-compound-only control;
- save/load/autosave from the UI, including paused live races;
- proper Calendar navigation;
- Inbox and world-news surfaces;
- Team / Drivers / Car / Development / Finances pages using player-facing application queries.