# Circuit Layout / Geometry Pipeline

## Goal

The historical world must select the correct circuit configuration for the selected season before the Live Race 2D layer resolves coordinates.

The canonical relationship is:

    Venue (track_id)
      -> Historical Layout (layout_id)
      -> Reviewed Geometry (layout_id)
      -> Season / Grand Prix Assignment

A modern line for the correct venue is still wrong if the historical configuration changed.

## Runtime contract

src/data/circuitLayoutCatalog.js validates layout IDs and season assignments. When the historical database exposes circuitLayouts, circuitLayoutGeometry and seasonCircuitAssignments, applyCircuitLayoutCatalog() can attach the selected layout_id to the season track/calendar rows.

It only attaches layout_geometry if the geometry has an explicitly reviewed status and the required provenance fields.

This is deliberately compatible with src/sim/circuitGeometry.js. Unreviewed/missing historical geometry remains absent, so resolveCircuitGeometry() continues to return geometry_unavailable instead of drawing a fabricated track.

## Research/import pipeline

    Global venue
      -> known historical layouts
      -> season usage
      -> geometry candidate libraries
      -> venue match
      -> lap-length comparison
      -> historical shape comparison
      -> direction / S/F / pit-lane verification
      -> coordinate conversion and simplification
      -> geometry hash + provenance
      -> MATCHED_REVIEWED
      -> runtime CircuitLayoutGeometry

### Candidate import

scripts/import-circuit-geojson.js imports any local GeoJSON Feature or FeatureCollection, calculates a geodesic line length, projects lon/lat to local metres, optionally simplifies the polyline, normalizes it to a unit box and creates a SHA-256 geometry hash.

Example for a local checkout of bacinger/f1-circuits:

    node scripts/import-circuit-geojson.js ../f1-circuits/f1-circuits.geojson \
      --library-id bacinger-f1-circuits \
      --repository bacinger/f1-circuits \
      --license MIT \
      --retrieved-at 2026-09-18 \
      --metadata-only \
      --out tmp/bacinger-candidates.json

The filename year in that repository is not treated as a layout-validity year. Upstream geometry is always candidate_only on import.

### Coverage audit

scripts/audit-circuit-layouts.js --season 1980 validates the stable layout registry and assignments, ranks same-venue candidates and reports length differences. Candidate ranking cannot promote a line to reviewed.

## 1980 findings

The required historical layout has been identified for all 14 rounds. The upstream bacinger/f1-circuits library is useful for candidate discovery, but its 1980 venue coverage is mostly modern geometry:

- clear length/layout mismatches: Buenos Aires, Interlagos, Kyalami, Hockenheim and Österreichring;
- no venue candidate: Long Beach, Zolder and Brands Hatch;
- modern/current-only despite superficially close length: Monaco, Zandvoort, Imola and Montréal;
- promising but still unreviewed: Paul Ricard and Watkins Glen.

No 1980 circuit is marked MATCHED_REVIEWED in this first pass. This is intentional.

## Historical verification notes

The first 1980 layout identity pass uses circuit-history references including RacingCircuits.info pages for Buenos Aires, Interlagos, Kyalami, Long Beach, Zolder, Monaco, Paul Ricard, Brands Hatch, Hockenheim, Österreichring, Zandvoort, Imola, Montréal and Watkins Glen. These pages are historical verification sources only; their maps are not silently copied into the game as geometry.

One database discrepancy is explicitly retained for follow-up: the current Imola 1980 baseline says 5.040 km, while period/race references commonly give about 5.000 km. The pipeline flags the conflict rather than silently rewriting the baseline.

## Expansion beyond 1980

The next season must use the same registry and assignment model. New seasons should add/reuse stable layout_id values rather than cloning layouts per year. A layout is reused across every season in which the same configuration was historically valid; a new layout_id is created only when the route/configuration materially changes.

The long-term target is therefore not one map per circuit, but a historical layout graph covering every F1 venue and every materially distinct configuration used by the championship.
