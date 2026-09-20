# Season Pack Loader

The Season Pack loader is the boundary between immutable historical source data and an evolving career.

## Architecture

```text
Immutable Master Core
        |
        v
Immutable Season Pack
        |
        v
validateSeasonPackPayload()
        |
        v
loadSeasonPackPayload()
        |
        v
Immutable historical snapshot
        |
        v
createSaveWorld()
        |
        v
Mutable Save World
```

The loader never writes back into the Master Core or the Season Pack. A career receives a mutable structured clone through `createSaveWorld()`. Results, transfers, contracts, finances, development and other alternative-history state belong only to that Save World.

## Canonical implementation

There is one Season Pack loader:

- `src/data/seasonPackLoader.js`

and one materialization CLI:

- `scripts/materialize-season-pack.js`

Do not create parallel loader or save-state implementations under another directory.

## 1980 v0.7 source

The checked-in integration source is:

```text
data/season-packs/1980/season-pack-1980.v0.7.json
```

The loader validates required sheets and critical relationships before materialization. In particular it uses the explicit `1980_Staff_Loadout` assignment (`staff_id + team_id + role`) rather than loading every historical/context row sharing the same person ID, and it derives the round-one grid from entrant round ranges rather than forcing later historical substitutions into the start state.

For period-specific data precedence, engine/tyre handling and known source caveats, see `docs/SEASON_PACK_V07_INTEGRATION.md`.

## Materialize a test Save World

```bash
npm run seasonpack:materialize -- \
  --season-pack data/season-packs/1980/season-pack-1980.v0.7.json \
  --out tmp/1980-loader-test.save.json \
  --seed 1980-loader-test
```

`save:from-season-pack` is an alias for the same CLI for compatibility with the original PR #12 workflow.

The CLI calculates a SHA-256 checksum from the source bytes and passes it as provenance metadata without modifying the Season Pack object.

## 1980 integration gate

The real-payload integration test requires a new 1980 Save World to begin with:

- 15 teams;
- 28 initial drivers / round-one entries;
- 51 loader-safe staff assignments;
- 14 championship rounds;
- Season Pack context retained for reference/audit data;
- empty mutable career history.

The same test verifies that the historical snapshot is frozen while the Save World can change independently.

## Optional historical circuit catalog

A Season Pack may expose reviewed historical circuit data without making it part of the legacy required-sheet contract:

```text
<season>_Circuit_Layout_Registry
<season>_Circuit_Layout_Assignments
<season>_Circuit_Layout_Geometry
```

If any historical catalog sheets are present, the registry and assignments are validated relationally. Geometry remains optional and only explicitly reviewed geometry is materialized into the active track/calendar rows.

Global historical IDs remain stable. Overlay assignments may carry `runtime_gp_id` and `runtime_track_id` aliases to match older Season Pack identifiers such as `RACE198004` and `CIR0043`.

## Stacked overlays

The materializer accepts repeated `--overlay` arguments and applies them in order. This avoids rebuilding or duplicating a large Season Pack when one historical subsystem advances independently.

The 1980 chain after the circuit foundation is:

```bash
npm run seasonpack:materialize -- \
  --season-pack data/season-packs/1980/season-pack-1980.v0.7.json \
  --overlay data/season-packs/1980/season-pack-1980.v0.8.overlay.json.gz \
  --overlay data/season-packs/1980/season-pack-1980.v0.9.circuit-layout.overlay.json \
  --out tmp/1980-v09.save.json \
  --seed 1980-v09
```

The v0.9 circuit overlay contains 14 stable layout identities, 14 season assignments and 14 reviewed schematic geometries. All are safe presentation assets only; simulation performance remains owned by the race and circuit-trait systems.
