# Phase 45 — Career Persistence / Save & Load

## Purpose

Phase 45 makes the Developer Playtest career persist across application restarts without changing the simulation authority model.

The boundary is:

`Historical / Season Database -> Save World -> serialize -> save slot -> deserialize -> validated Save World -> resumed simulation`

A save slot is storage only. It is never a second gameplay authority.

## Save format

The existing Save World envelope remains authoritative:

- `format = f1-manager-sim-save`
- `schemaVersion = 1`
- `savedAt`
- `save` — the complete mutable Save World

Phase 45 does not invent a parallel playtest save schema.

## Slot storage

The local Developer Playtest uses `FileSaveSlotStore`.

Default directory:

`build/playtest-saves`

The directory can be changed with:

```bash
npm run playtest -- season.json --save-dir /path/to/saves
```

Slot names are normalized and restricted to letters, numbers, hyphens and underscores. Writes use a temporary file followed by an atomic rename so an interrupted write does not leave a partially replaced slot.

The reserved gameplay convention `autosave` is used by the local server for milestone autosaves. Manual slots use the same format and the same validation path.

## Load validation

A Save World can only be restored into a Developer Playtest session when its starting Season Database provenance matches the currently loaded Season Database:

- source season;
- `databaseVersion`;
- `sourceChecksum`.

When a Global Database is supplied to the playtest, the normal Global / Season compatibility gate is also rerun.

A mismatched save is rejected. Phase 45 never silently remaps a career onto a different historical database release.

## Runtime reconstruction

Loading does **not** call the New Career bootstrap.

Instead it:

1. deserializes the existing Save World;
2. validates database provenance;
3. restores current player control from `player.controlledTeamIds`;
4. rebuilds the current core system list;
5. restores the active race-weekend key;
6. passes through the canonical idempotent simulation initializer;
7. returns the normal player-facing state projection.

This is important for manager careers: if the player has changed teams or is unemployed, the loaded session follows the current Save World rather than the team originally selected at career creation.

## Career Start and event safety

`initializeSimulation()` already records `simulation.systemState.__simulationInitialized`.

Current saves therefore do not replay `CAREER_STARTED` on load. Narrative stories, Inbox state, contracts, history and event sequence numbers remain exactly where they were when saved.

Regression tests assert that loading does not duplicate Career Start news/history or advance the global simulation event sequence.

## Paused live races

The live race runtime already lives inside Save World under `world.liveRaceState` and includes its deterministic resume state.

Phase 45 persists that state without converting it into a second race representation.

Regression gate:

`run 3 laps -> save -> load into a fresh application session -> finish race`

must produce the same:

- final classification;
- race timeline;
- championship state

as finishing the same race without save/load.

## Developer Playtest API

New endpoints:

- `GET /api/saves` — list slots and compact metadata;
- `POST /api/saves` — write a manual slot;
- `POST /api/saves/load` — validate and restore a chosen slot;
- `POST /api/saves/continue` — restore the newest compatible valid slot;
- `POST /api/saves/delete` — delete a slot.

The Main Menu now exposes the normal player-facing Continue Game and Load Game flows. Save discovery marks corrupt or Season Database-incompatible slots as unavailable. The small SAVE / LOAD developer control remains available only inside an active career. Loading refreshes the page after the server session has been restored, so existing player-facing application projections remain authoritative.

## Autosave milestones

The local server writes the `autosave` slot after core race/career milestones, including:

- career creation;
- Continue into the next race weekend;
- race-weekend session progression;
- setup and starting-tyre changes;
- lights out;
- live race progression;
- live strategy instructions;
- race completion.

This intentionally focuses Phase 45 on the vertical slice first. Manual saves can persist any management state at any time.

## Non-goals

Phase 45 does not add:

- cloud saves;
- account synchronization;
- save compression;
- arbitrary migration between incompatible database releases;
- branching/checkpoint timelines;
- final-product save UI polish.

Those can be added later without changing the Save World authority boundary.