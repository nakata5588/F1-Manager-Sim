# Developer Playtest UI

## Purpose

Phase 30 introduces the first playable vertical slice of F1 Manager Sim while keeping the simulation architecture intact.

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

## Current vertical slice

1. New Career
2. Choose Team
3. Create Manager
4. Career Home
5. Continue
6. Advance the real Save World to the next Grand Prix
7. Practice
8. Qualifying
9. Grid / strategy lock
10. Live resumable race
11. Results
12. Drivers' / Constructors' standings
13. Continue to the next event

The first UI deliberately focuses on making the engine observable and playable rather than delivering final visual polish.

## Application boundary

`DeveloperPlaytestSession` lives under `src/app/` rather than `playtest/`.

It owns orchestration only:

- validates the selected team against the active Season Database;
- creates a career through `createCareerFromSeasonDatabase()`;
- initializes the normal core simulation systems;
- advances time through `advanceDays()`;
- stages Practice and Qualifying through the existing race-weekend system;
- locks strategies/calibration through existing systems;
- hands Race execution to `LiveRaceController`;
- commits the final live result back into Save World history and championship systems;
- exposes a deliberately reduced player-facing projection.

The browser contains no race logic, standings logic, calendar logic or hidden database state.

## Interactive race handling

The normal headless simulation path completes a race weekend automatically. The Developer Playtest needs the race to pause at the grid so the player can watch/control it.

For playtest sessions the application removes `race.weekend` and `race.timeline` from the automatic daily system list. It still uses the canonical race-weekend system phase by phase for Practice/Qualifying/Grid, then uses the existing live resumable race engine.

A temporary aggregate race classification is generated only to provide the temporal engine with its existing baseline contract. That aggregate result is immediately removed from history and never reaches the championship. Only the completed live result is archived and scored.

This is an application orchestration boundary, not a second race simulator.

## API surface

The local server currently exposes:

- `GET /api/setup`
- `GET /api/state`
- `POST /api/career`
- `POST /api/continue`
- `POST /api/race/advance`
- `POST /api/race/finish`
- `POST /api/race/strategy`

The strategy endpoint is already wired to `applyLiveStrategyInstruction()`. A richer pit-wall UI is intentionally deferred to the next UI iteration.

## Safety / visibility rule

Player-facing responses must continue to respect:

`exists internally != visible != scoutable != F1 eligible`

The Developer Playtest team chooser reads only active `snapshot.teams`. State projections read active Save World drivers/teams and never serialize `reference.futureStructure`, `futureDrivers`, `futureTeams`, `futureStaff`, `futureSponsors` or other hidden pools.

## Next UI iterations

Likely follow-up work:

- proper Calendar screen and session navigation;
- Practice and Qualifying presentation rather than automatic staging;
- pit-wall controls and tyre/strategy selection;
- live timing gaps, tyre state, incidents and Race Control feed;
- track telemetry (`lapProgress`/sector progress) and circuit geometry for a moving track map;
- Inbox and world-news surfaces;
- save/load from the UI;
- Team / Drivers / Car / Development / Finances pages using player-facing application queries.
