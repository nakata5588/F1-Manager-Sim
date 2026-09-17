# Phase 49 — Championship Hub

## Goal

Phase 49 promotes Calendar and Standings from Career Home anchors into a first-class Championship Hub.

The Hub remains a read-only projection over the current Save World. It does not own race scheduling, race results, championship points or historical future outcomes.

## Authoritative inputs

The Championship Hub uses only current mutable career state:

- `saveWorld.world.calendar` for the current season calendar;
- `saveWorld.world.championship` for current championship standings;
- `saveWorld.world.raceWeekendState` for an active/current round;
- `saveWorld.history.races` for completed race results;
- `saveWorld.history.championships` for simulation-owned completed championship history;
- active driver/team/track rows already present in Save World for display names.

`reference.futureStructure` is never consulted.

## Calendar states

Each current-season calendar row is projected as one of:

- `completed` — a matching race is already archived in Save World history;
- `current` — the active Race Weekend corresponds to the round;
- `upcoming` — the date is current/future and no result exists yet;
- `unresolved` — the calendar date has passed but no authoritative completed result is archived.

The projection never invents a winner. Winner/team are shown only for an archived completed race.

## Standings

Driver and Constructor standings are derived from the current championship state using counted points when the era rules provide them, while preserving gross points as metadata.

The browser does not recalculate championship scoring.

## Dynamic future seasons

The Hub reads the current `saveWorld.world.calendar`, not the original 1980 Season Database. After a season rollover it therefore follows the calendar already materialized by the simulation — whether sourced from safe structural historical reference or generated fallback continuity.

Historical real-world future results are never shown as career results.

## UI integration

`Calendar` and `Standings` in the Career Shell now deep-link to:

- `/championship.html#calendar`
- `/championship.html#standings`

Career Home links to the same Hub while retaining its compact dashboard summaries.

The F1 World projection exposes the Championship Hub payload as a nested read-only `championship` object, avoiding a new mutable API surface.
