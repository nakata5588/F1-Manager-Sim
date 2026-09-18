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
- audits/<year>.json|csv — research/coverage matrix for a season.

Runtime-reviewed geometry is intentionally not stored in a venue-wide track_id field. The future authoritative geometry collection uses layout_id and must carry source URL/repository, original source, license, retrieval date, geometry hash, geometry status and historical status.

## Status policy

The safe progression is:

    GEOMETRY_MISSING
      -> candidate found
      -> MATCHED_NEEDS_REVIEW / CURRENT_LAYOUT_ONLY / CANDIDATE_LENGTH_MISMATCH
      -> historical shape + direction + S/F + pit-lane review
      -> MATCHED_REVIEWED

Automated venue and length matching can never emit MATCHED_REVIEWED. Only reviewed geometry may be exposed as layout_geometry to the runtime. This keeps the existing geometry_unavailable fallback authoritative whenever historical coordinates are not ready.

## 1980 pilot

The 1980 registry has 14/14 stable season assignments and 14/14 historical layout identities. The first bacinger/f1-circuits audit finds 11 same-venue candidates, but no candidate has yet been promoted to reviewed geometry. Three venues (Long Beach, Zolder and Brands Hatch) have no matching venue line in that upstream library.

The same importer, matcher and validator are designed to be reused as later seasons and additional historical sources are added. Do not create season-specific geometry code.
