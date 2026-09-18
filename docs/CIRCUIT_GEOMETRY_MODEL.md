# Circuit Geometry Model

## Purpose

Stage 11 introduces a reusable circuit-geometry contract for future race-position projection and Live Race 2D presentation.

The geometry layer is deliberately separate from circuit performance traits.

Performance data such as power sensitivity, aero sensitivity, brake stress, overtaking difficulty, tyre wear and incident risk continues to belong to the existing race/simulation models. Geometry describes where a car can be drawn around a circuit.

## Historical authority

Circuit geometry is historical starting data only when the selected Season Database supplies reviewed coordinates.

The current 1980 database audit explicitly marks exact 1980 geometry coordinates as `deferred_research`. Therefore the runtime must not fabricate a Buenos Aires, Interlagos, Monaco or other 1980 track shape and present it as historical.

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
- coordinate-based start/finish markers.

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
0.0 = start / finish
0.25 = quarter lap
0.5 = half lap
0.75 = three-quarter lap
```

The raw centerline may begin at any point. `pathOriginFraction` maps the canonical race origin to the explicit start/finish marker.

`pointAtLapFraction()` therefore always treats `lapFraction = 0` as start/finish rather than blindly using the first source point.

The function wraps fractions around the closed circuit, so `1.0`, `0.0` and `-1.0` resolve to the same race position.

### Start / finish

Start/finish can be supplied using:

- path/lap fraction;
- centerline point index;
- explicit coordinate.

A path fraction or centerline index anchors the canonical lap origin.

An isolated coordinate is preserved visually but is labelled `explicit_coordinate_unanchored`; the runtime does not guess which crossing/segment it belongs to.

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

Stage 12 can map live race state onto this contract:

```text
Race state
  -> completed laps
  -> sector / intra-sector progress
  -> canonical lapFraction
  -> pointAtLapFraction()
  -> x/y track position
```

Stage 13 can render those normalized positions in SVG/Canvas without changing the simulation model.

This separation means different resolutions, zoom levels or UI renderers can all consume the same geometry and race-position projection.
