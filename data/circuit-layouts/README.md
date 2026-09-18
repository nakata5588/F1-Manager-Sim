# Historical Circuit Layout Data

This directory separates a physical F1 venue from the historical configuration used by a specific Grand Prix.

    track / venue
      -> circuit layout
      -> reviewed layout geometry
      -> season / Grand Prix assignment

track_id is a stable venue identity and must never be repurposed to mean a layout. layout_id is a stable configuration identity. A season assignment selects the layout that was historically used for a race.

## Data files

- layouts.json — cross-season layout registry. The initial slice identifies the 14 layouts required by 1980, but the schema is global.
- season-assignments/<year>.json — one historical layout assignment per Grand Prix.
- candidate-libraries/ — provenance-aware geometry candidate manifests. Candidates are research inputs, not runtime geometry.
- historical-map-sources/<year>.json — licensed period-correct map sources used to lock historical topology before geometry extraction.
- audits/<year>.json|csv — research/coverage matrix for a season.

Runtime-reviewed geometry is intentionally not stored in a venue-wide track_id field. The future authoritative geometry collection uses layout_id and must carry source URL/repository, original source, license, retrieval date, geometry hash, geometry status and historical status.

## Status policy

The safe progression is:

    historical layout identity
      -> licensed historical map source
      -> vector/centerline extraction
      -> topology + direction review
      -> start/finish + pit-lane review
      -> geometry hash + provenance lock
      -> MATCHED_REVIEWED

Generic candidate libraries remain useful for discovery, but a close lap length is never enough. A candidate can be CURRENT_LAYOUT_ONLY, CANDIDATE_LENGTH_MISMATCH or CANDIDATE_CONFIGURATION_MISMATCH even when it belongs to the correct venue.

Automated venue and length matching can never emit MATCHED_REVIEWED. Only reviewed geometry may be exposed as layout_geometry to the runtime. This keeps the existing geometry_unavailable fallback authoritative whenever historical coordinates are not ready.

## 1980 pilot

The 1980 registry has 14/14 stable season assignments, 14/14 historical layout identities and 14/14 licensed historical map sources. Runtime geometry remains 0/14 reviewed until those maps are converted into centerlines and separately checked.

The first bacinger/f1-circuits audit still finds 11 same-venue candidates, but none is promoted to reviewed geometry. Three venues (Long Beach, Zolder and Brands Hatch) have no matching venue line in that upstream library. Paul Ricard and Watkins Glen are now explicitly treated as configuration mismatches despite close lap lengths, because their period topology requirements are not satisfied by the generic candidates.

The same importer, matcher and validator are designed to be reused as later seasons and additional historical sources are added. Do not create season-specific geometry code.
