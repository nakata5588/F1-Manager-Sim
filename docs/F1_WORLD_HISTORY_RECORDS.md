# Phase 43 — F1 World, History & Records

Phase 43 turns the Phase 42 narrative/history foundation into a read-only world-browsing surface for the Developer Playtest.

The authority boundary remains:

`Save World authorities -> narrative/history projections -> F1 World application projection -> browser`

The browser never calculates results, transfers, championship records or career milestones.

## Application projection

`src/app/worldPlaytest.js` exposes `developerWorld()`.

It projects only currently active world identities plus simulation-owned career history:

- active drivers;
- active teams;
- current championship state;
- World News;
- World History timeline;
- driver career statistics;
- constructor career statistics;
- championship archive;
- persistent milestones;
- compact world summary counts.

Hidden `futureDrivers` and `futureTeams` are deliberately excluded from the active lists. A future identity may appear in a news/history row only after an existing simulation system legitimately emits an event that makes that entity visible/relevant.

## Records

Career leaderboards are derived from authoritative Save World history rather than duplicated counters in the UI.

Driver and team summaries currently expose:

- starts;
- wins;
- podiums;
- championships.

The championship archive lists the simulated champion identities and resolution status for each archived season.

Historical post-start champions are never preloaded into these tables.

## Developer Playtest

The playtest server exposes:

`GET /api/world`

Optional query filters:

- `category`
- `minImportance`
- `season`

The page is available at:

`/world.html`

It includes:

- current world KPIs;
- latest world news;
- driver record leaderboard;
- constructor record leaderboard;
- championship archive;
- world-history timeline.

This is still a developer validation surface, not the final product UI. Its purpose is to prove that a long alternative career is understandable and queryable before the Phase 49 product-navigation work.

## Safety / visibility

Regression coverage verifies that:

- hidden future driver/team names do not leak through the projection;
- returned projections are clones and browser mutation cannot change Save World state;
- record totals come from archived race/championship history;
- filters affect the projection only and never delete/alter underlying history.

## Future expansion

This projection is intentionally compatible with later additions such as:

- individual driver career pages;
- individual team histories;
- circuit/race histories;
- pole/fastest-lap/finish streak records;
- manager records;
- rivalries and relationship history;
- richer searchable world encyclopedia;
- final product History / Records / F1 World navigation.
