# Live Race 2D v0

## Purpose

Stage 13 introduces the first circuit-map presentation for the live race.

The renderer is deliberately thin:

```text
Race Weekend Geometry
        +
Race Position Projection
        +
Live Race Order
        ->
SVG presentation
```

The browser does not calculate race outcomes, distance, overtakes, gaps or physical car progress.

## Inputs

The renderer consumes only player-facing projections already exposed by the application:

```text
raceWeekend.geometry
liveRace.trackPositions
liveRace.order
```

`liveRace.order` remains the authoritative timing/classification presentation.

`liveRace.trackPositions` remains the authoritative presentation bridge between race telemetry and geometry.

The SVG renderer never reads Save World or temporal-race internals directly.

## Circuit drawing

When explicit reviewed geometry is available, v0 can draw:

- closed circuit centerline;
- pit-lane polyline when available;
- sector boundary markers;
- start/finish marker;
- drawable car markers.

Coordinates are consumed from the normalized Circuit Geometry contract.

The browser does not reshape or infer a circuit from performance traits.

## No-geometry fallback

If:

```text
raceWeekend.geometry.available === false
```

the UI deliberately shows:

```text
No circuit drawing shown
```

with an explanation that reviewed coordinate geometry is unavailable.

It does **not** draw:

- a generic oval;
- a random spline;
- an approximation derived from lap length;
- a shape inferred from corner count;
- any historical-looking fallback.

Live Timing, Race Control and strategy remain available normally.

This is the current expected 1980 behaviour until reviewed historical coordinates are added.

## Position precision

The renderer respects the precision metadata created by Race Position Projection.

### Explicit / sector progress

Markers are drawn when the position row has usable x/y and precision such as:

- `explicit`;
- `sector_progress`.

### Sector-only approximation

A retired car with only a known retirement sector may be rendered from its explicit `sector_only` approximation.

The marker receives an `approximate` visual treatment so it cannot be mistaken for exact telemetry.

### Lap-boundary-only

The current temporal engine serializes the field only at whole-lap boundaries.

Although the projection can map the boundary to start/finish when geometry exists, v0 **withholds individual car markers** for:

```text
lap_boundary_only
start_grid_anchor
```

because placing the entire field at one physical point would imply a level of spatial knowledge the simulation does not currently have.

The circuit may still be displayed, accompanied by:

```text
Track positions withheld
```

and an explanation that Live Timing remains authoritative.

## Marker presentation

Drawable markers show current classification position (`P1`, `P2`, etc.).

Controlled-team markers use the player accent treatment.

Other cars use the neutral field treatment.

Approximate markers are visually differentiated with a dashed/hollow treatment.

Marker title/tooltip context can include:

- driver name;
- team name;
- projection precision.

The renderer does not generate team performance information.

## Pit lane

The pit lane is drawn only when:

```text
geometry.pitLane.available === true
```

Cars can be placed on it only when Race Position Projection provides explicit pit-lane x/y.

The renderer never converts a pit-stop event or pit-loss index into an inferred physical pit-lane coordinate.

## Race controls

Stage 13 does not replace the existing live-race controls.

The race screen still uses server-authoritative actions for:

- Pause;
- 1x / 2x / 4x / 8x request cadence;
- Step +1 Lap;
- Simulate to Finish;
- pit-wall calls.

Browser speed continues to control request cadence only. It does not animate or simulate additional race progress client-side.

## 1980 behaviour

The current supported 1980 runtime intentionally has no reviewed circuit coordinate geometry.

Therefore the Argentine GP currently shows the no-geometry fallback rather than a circuit.

This remains protected by the Playable Validation Gate and Circuit Geometry tests.

Adding a future reviewed 1980 geometry pack will automatically allow the same Race View to draw the track without changing the race engine.

Car movement will still require sufficiently precise Race Position telemetry.

## Authority guards

Automated tests ensure that the renderer does not use:

- `elapsedIndex`;
- `raceIndex`;
- `gapIndex`;

as physical coordinates.

Tests also prohibit a synthetic fallback track.

This keeps presentation uncertainty explicit.

## Race Weekend UX v2 integration

Stage 14 now embeds Live Race 2D v0 inside the unified Race Desk alongside:

- Timing Tower;
- weather / track-status strip;
- Race Control banner;
- Pit Wall strategy timelines;
- event feed;
- engineering field detail.

The map contract remains unchanged. It still consumes Circuit Geometry + Race Position Projection and keeps the no-fabrication fallback for circuits without reviewed coordinates.

A later telemetry refinement can upgrade markers from lap-boundary-only/withheld positions to continuous intra-sector movement without changing the Race Desk ownership model.
