# Circuit Geometry Model

## Purpose

Stage 11 introduces a reusable circuit-geometry contract for future race-position projection and Live Race 2D presentation.

The geometry layer is deliberately separate from circuit performance traits.

Performance data such as power sensitivity, aero sensitivity, brake stress, overtaking difficulty, tyre wear and incident risk continues to belong to the existing race/simulation models. Geometry describes where a car can be drawn around a circuit.

## Historical authority

Circuit geometry is historical starting data only when the selected Season Database supplies reviewed coordinates.

The 1980 research pipeline now distinguishes three independent gates: historical layout identity, period-map source-lock, and reviewed runtime geometry. A source-locked map is not automatically drawable geometry.

All 14 1980 runtime geometries are now explicitly classified as `MATCHED_REVIEWED_SCHEMATIC`: suitable for historical Live Race 2D topology, but not authoritative for distance measurement, car performance, race timing or exact corner coordinates. Long Beach remains the special period case with separate start-grid and timing/finish locations.

For coordinate-free tracks:

```text
available: false
dataStatus: geometry_unavailable
reason: no_explicit_centerline
```

Lap length, circuit traits and the existing sector simulation remain available independently.

## Input contract

`resolveCircuitGeometry(track, options)` looks for explicit geometry in compatible track fields such as:

- `circuit_geometry`
- `circuitGeometry`
- `layout_geometry`
- `layoutGeometry`
- `map_geometry`
- `mapGeometry`
- `geometry`

A future Season Database can also expose a direct `centerline` / `center_line` field.

Geometry payloads may contain:

```text
centerline
startFinish / start_finish
finishLine / finish_line
timingLine / timing_line
startGrid / start_grid / startLine / start_line
sectors / sectorBoundaries
corners / turns
pitLane / pit_lane
source
dataStatus
lapLengthKm / lap_length_km
```

JSON strings and already-parsed objects are both supported.

## Canonical output

The runtime projection uses `schemaVersion: 1`.

### Coordinate system

All explicit coordinates are normalized into a unit box:

```text
x: 0.0 -> 1.0
y: 0.0 -> 1.0
```

Normalization preserves source aspect ratio.

The bounding box includes:

- centerline;
- pit lane;
- coordinate-based corner markers;
- coordinate-based timing/finish markers;
- coordinate-based starting-grid markers.

This prevents a pit lane outside the centerline bounds from being clipped simply because it sits beside the racing surface.

### Centerline

The canonical `centerline`:

- is a closed loop;
- stores the final closing segment implicitly;
- removes a duplicated final point when it repeats the first point;
- contains normalized points with stable indexes.

`segments` stores the closed-loop segment graph with:

- from/to indexes;
- normalized geometric length;
- path start/end fractions.

The normalized path length is presentation geometry only. It is not a replacement for source lap length in kilometres.

### Lap fraction

`lapFraction` is the stable position language for future race presentation.

```text
0.0 = lap timing / finish line
0.25 = quarter lap
0.5 = half lap
0.75 = three-quarter lap
```

The raw centerline may begin at any point. `pathOriginFraction` maps the canonical race origin to the explicit timing/finish marker.

`pointAtLapFraction()` therefore always treats `lapFraction = 0` as the lap timing/finish line rather than blindly using the first source point. The physical starting grid may be stored separately and does not redefine lap timing.

The function wraps fractions around the closed circuit, so `1.0`, `0.0` and `-1.0` resolve to the same race position.

### Timing / finish and starting grid

Historical circuits do not always use the same physical line for the race start and lap timing/finish. The geometry contract therefore preserves both concepts.

The lap anchor may be supplied through `timingLine`, `finishLine` or the backwards-compatible `startFinish`. Priority is timing line, then finish line, then start/finish. It can use:

- path/lap fraction;
- centerline point index;
- explicit coordinate.

A path fraction or centerline index anchors the canonical lap origin. `startGrid` / `startLine` is an independent presentation marker and never changes `lapFraction = 0`.

An isolated coordinate is preserved visually but is labelled `explicit_coordinate_unanchored`; the runtime does not guess which crossing/segment it belongs to.

Long Beach 1978-1981 is the first production case: the period map shows different START and FINISH locations, and Live Race 2D renders both.

### Sectors

Geometry sectors use canonical race-relative lap fractions:

```text
startFraction
endFraction
```

When explicit geometry-sector boundaries are absent but an explicit centerline exists, the geometry model reuses the existing `sectorModel` weights to create presentation boundaries.

Those rows are labelled:

```text
source: sector_model_weight
```

This does not turn derived simulation sectors into historical geometry.

If no explicit centerline exists, no geometry sectors are exposed because there is no map on which to place them.

### Corners

Corner markers are optional and explicit-only.

They may be placed through:

- race-relative lap fraction; or
- explicit coordinate.

The geometry model does not manufacture corner names, counts or locations from performance traits.

### Pit lane

Pit-lane geometry is a separate object:

```text
pitLane.available
pitLane.points
pitLane.entryFraction
pitLane.exitFraction
```

Entry/exit lap fractions are optional and must be explicit.

The runtime does not infer pit entry or exit from `pit_lane_loss`, because that field is a gameplay/time-loss calibration rather than physical geometry.

## Race Weekend projection

`DeveloperPlaytestSession` now projects:

```text
raceWeekend.geometry
```

This is derived read-only presentation data.

The authoritative Race Weekend, track row and live-race state are not mutated.

A coordinate-free current track therefore produces an unavailable geometry projection while Practice, Qualifying and Race continue normally.

## Relationship with the sector race engine

The existing temporal race engine remains authoritative for:

- pace;
- sector progression;
- overtaking;
- reliability/incidents;
- tyre/fuel state;
- Race Control;
- classification.

Circuit Geometry does not change any of those calculations.

The only connection in Stage 11 is that an explicit geometry can reuse the existing sector model's weights for non-historical presentation boundaries when explicit sector geometry is missing.

## Next stages

Stage 12 now maps live race state onto this contract through `Race Position Projection`:

```text
Race state
  -> completed laps
  -> sector / intra-sector progress
  -> canonical lapFraction
  -> pointAtLapFraction()
  -> x/y track position
```

Stage 13 now renders `raceWeekend.geometry` plus `liveRace.trackPositions` as Live Race 2D v0 without changing the simulation model. Coordinate-free circuits use an explicit no-map fallback.

This separation means different resolutions, zoom levels or UI renderers can all consume the same geometry and race-position projection.

## Reviewed schematic geometry

`MATCHED_REVIEWED_SCHEMATIC` is a deliberately narrow reviewed state. It means the historical topology and presentation trace have been checked sufficiently for Live Race 2D, while provenance explicitly lists what the geometry is and is not authoritative for.

Typical fields are:

```text
precision: schematic_historical_trace
reviewedFor:
  - historical_topology
  - 2d_track_presentation
notAuthoritativeFor:
  - distance_measurement
  - car_performance
  - race_timing
  - exact_corner_coordinates
```

Circuit geometry remains presentation data. It must never become an implicit source for pace, overtaking, tyre wear, reliability or other race-engine performance calculations.
