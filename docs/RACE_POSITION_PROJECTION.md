# Race Position Projection

## Purpose

Stage 12 creates the read-only bridge between the temporal race engine and the Circuit Geometry Model.

The projection answers:

```text
Where can the UI place each car on the circuit right now?
```

without making the renderer or presentation layer authoritative for race state.

The flow is:

```text
Live Race state / telemetry
        ->
Race Position Projection
        ->
lapFraction / route / precision
        ->
Circuit Geometry
        ->
normalized x / y
```

## Authority boundary

The race engine remains authoritative for:

- classification order;
- completed laps;
- sector events;
- pit stops;
- retirements;
- race control;
- strategy;
- tyre/fuel/damage state.

Race Position Projection does not alter any of these values.

It never converts the abstract race-performance indexes into physical distance.

In particular:

- `elapsedIndex` is not metres;
- `raceIndex` is not metres;
- `gapIndex` is not seconds or track distance.

Those values are deliberately excluded from `racePositionProjection.js`.

## Projection schema

`projectRacePositions()` returns `schemaVersion: 1`.

The projection includes:

```text
geometryAvailable
geometryDataStatus
telemetryMode
currentLap
totalLaps
cars[]
summary
```

Each car may expose:

```text
position
driverId
teamId
status
completedLaps

source
precision
approximate
route

lapFraction
sectorId
sectorProgress
pitLaneProgress

x
y
mapPositionAvailable
```

`x` / `y` exist only when the Circuit Geometry Model can map the resolved race position to explicit circuit geometry.

## Precision hierarchy

The projection deliberately distinguishes levels of knowledge.

### 1. Explicit lap fraction

If live telemetry supplies:

```text
lapFraction
lapProgress
trackProgress
```

the value is treated as explicit race-relative progress.

Result:

```text
source: explicit_lap_fraction
precision: explicit
approximate: false
```

When geometry exists, `pointAtLapFraction()` converts it to x/y.

### 2. Explicit sector progress

If the runtime supplies:

```text
sectorId
sectorProgress
```

the projection maps that progress inside the geometry sector boundary.

Result:

```text
source: explicit_sector_progress
precision: sector_progress
approximate: false
```

This requires sector boundaries in the Circuit Geometry projection.

### 3. Explicit pit-lane progress

If telemetry identifies the car as being in the pit lane and supplies:

```text
pitLaneProgress
```

the marker follows the explicit pit-lane polyline.

When pit entry and exit race fractions are known, the projection also derives the corresponding `lapFraction`, including wraparound across start/finish.

Result:

```text
route: pit_lane
source: explicit_pit_lane_progress
precision: explicit
```

The model does not infer pit-lane progress from pit-stop time loss.

### 4. Retirement sector only

The current race engine persists `retirementSectorId`.

When explicit intra-sector telemetry is absent but geometry exists, a retired car can be placed at the midpoint of that known sector.

This is intentionally labelled:

```text
source: retirement_sector_midpoint
precision: sector_only
approximate: true
```

If geometry is unavailable, the projection preserves the known sector identity but returns no fake x/y.

### 5. Lap-boundary-only state

The current Live Race Controller pauses and serializes at whole-lap boundaries.

At these boundaries the engine knows:

- order;
- completed laps;
- abstract performance/gap indexes;

but it does **not** persist physical intra-lap progress.

Therefore running cars are projected to the race origin only as a representation of the discrete simulation boundary:

```text
source: lap_boundary
precision: lap_boundary_only
approximate: true
lapFraction: 0
```

At lap 0 the equivalent state is:

```text
source: start_grid_anchor
precision: start_grid_anchor
```

This does not claim the cars occupy the exact same physical point. It means the current simulation snapshot has no grid-box or intra-lap coordinate authority yet.

## Telemetry mode

The whole projection reports a coarse mode:

- `explicit` — every projected car has explicit lap/sector/pit progress;
- `mixed` — explicit telemetry exists for only part of the field;
- `lap_boundary_only` — current runtime boundary state is the best available;
- `unavailable` — no usable progress information exists.

This allows the future renderer to decide whether to animate precise positions, show a low-precision state, or suppress the map.

## Geometry-independent progress

Explicit `lapFraction` remains useful even if geometry is unavailable.

Example:

```text
lapFraction: 0.42
x: null
y: null
mapPositionAvailable: false
```

This keeps race-position semantics separate from the availability of a historical map.

When a reviewed geometry pack is later added, the same race telemetry can immediately become drawable without changing the race engine contract.

## Developer Playtest integration

`DeveloperPlaytestSession.state()` now exposes:

```text
liveRace.trackPositions
```

The existing:

```text
liveRace.order
```

remains unchanged.

The position projection is enriched with presentation context already available from the live order:

- driver name;
- team name;
- controlled-team flag.

The authoritative live session is not mutated.

## 1980 boundary

The current 1980 database does not include reviewed circuit centerline coordinates.

Therefore the Argentine GP currently exposes:

```text
raceWeekend.geometry.available: false
liveRace.trackPositions.geometryAvailable: false
liveRace.trackPositions.summary.mapPositionsAvailable: 0
```

This is now protected by the Playable Validation Gate.

The game must not produce x/y coordinates for 1980 merely to make the map look complete.

## Next stage

Stage 13 — Live Race 2D v0 now consumes:

```text
raceWeekend.geometry
liveRace.trackPositions
liveRace.order
```

without reading or mutating simulation internals. The v0 renderer deliberately withholds individual markers for `lap_boundary_only` / `start_grid_anchor` precision rather than visually overstating spatial knowledge.

For explicit geometry + explicit telemetry:

```text
lapFraction -> x/y -> car marker
```

For the current whole-lap runtime:

```text
lap-boundary-only -> clearly low-precision presentation
```

A later telemetry refinement can add persistent intra-sector progress to the race engine without changing the renderer-facing position schema.
