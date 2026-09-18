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
      -> licensed period-correct historical map
      -> historical topology lock
      -> vector / centerline extraction
      -> geometry candidate libraries as optional cross-checks
      -> direction + S/F + pit-lane verification
      -> coordinate normalization / simplification
      -> geometry hash + provenance + license lock
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

### Historical map source-lock

historical-map-sources/<year>.json records the period-correct map used to establish a layout's shape before any runtime geometry is created. Each source must carry a layout ID, URL, reuse license, source role and readiness status. Historical map readiness is not geometry readiness: a raster/SVG reference still needs extraction and review.

Public-domain sources are preferred when equivalent. CC BY / CC BY-SA sources remain usable but attribution and share-alike obligations must stay attached to derived geometry.

### Coverage audit

scripts/audit-circuit-layouts.js --season 1980 validates stable layout IDs, season assignments and historical map-source coverage, then ranks generic same-venue candidates as an independent cross-check. Candidate ranking cannot promote a line to reviewed.

## 1980 findings

The required historical layout and a licensed period-correct map source are now identified for all 14 rounds. Runtime geometry is still 0/14 reviewed; that is intentional.

The generic bacinger/f1-circuits library remains useful for candidate discovery, but its 1980 venue coverage is mostly modern geometry:

- clear length/layout mismatches: Buenos Aires, Interlagos, Kyalami, Hockenheim and Österreichring;
- no same-venue candidate: Long Beach, Zolder and Brands Hatch;
- modern/current-only despite superficially close length: Monaco, Zandvoort, Imola and Montréal;
- configuration mismatches despite close length: Paul Ricard and Watkins Glen.

Paul Ricard demonstrates why length matching is insufficient: the 1980 full course requires an uninterrupted roughly 1.8 km Mistral Straight, while the generic candidate has no comparable continuous straight. Watkins Glen likewise requires the temporary Formula One Esses chicane introduced in 1975.

The source pack also tightens two historical identities: Long Beach 1980 belongs to the 1978-1981 route, and Montréal 1980 belongs to the 1979-1981 configuration. Later configurations receive separate stable layout IDs when those seasons are added.

## Historical verification notes

The first 1980 layout identity pass uses circuit-history references including RacingCircuits.info, while the map source-lock uses explicitly licensed period maps, primarily Wikimedia Commons. These source assets are references for geometry extraction; they are never silently treated as runtime centerlines.

One database discrepancy is explicitly retained for follow-up: the current Imola 1980 baseline says 5.040 km, while period/race references commonly give about 5.000 km. The pipeline flags the conflict rather than silently rewriting the baseline.

## Expansion beyond 1980

The next season must use the same registry and assignment model. New seasons should add/reuse stable layout_id values rather than cloning layouts per year. A layout is reused across every season in which the same configuration was historically valid; a new layout_id is created only when the route/configuration materially changes.

The long-term target is therefore not one map per circuit, but a historical layout graph covering every F1 venue and every materially distinct configuration used by the championship.
