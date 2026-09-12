# Canonical Career Bootstrap

## Purpose

Phase 29 defines one authoritative path from an accepted historical database release into a new mutable career:

`Global Database -> Season Database -> Save World -> Simulation`

The game must not assemble a career directly from raw Global tables or from UI state. The Global Database is editorial/historical source material. A Season Database is the immutable, validated starting package for one supported season. A Save World is created from that package and owns every post-start outcome.

## Runtime entry point

Use:

```js
createCareerFromSeasonDatabase(seasonDatabasePayload, options)
```

The function:

1. validates the Season Database envelope;
2. optionally verifies it belongs to the supplied Global Database version/checksum;
3. loads the immutable season snapshot;
4. creates an independent mutable Save World;
5. records the Season Database identity in save metadata;
6. preserves pre-career history under `history.preCareer`;
7. preserves hidden future structure under `reference.futureStructure`;
8. never treats future historical outcomes as authoritative.

If `options.globalDatabase` is supplied, the bootstrap rejects mismatched database versions/checksums, blocked seasons and seasons not declared supported by the Global manifest.

## CLI

A career save can be materialized from JSON or gzip-compressed JSON:

```bash
npm run save:from-season-db -- F1_Manager_Sim_SeasonDefinition_1980_v1.2.3_canonical_candidate.json \
  --global-world F1_Manager_Sim_Global_Database_v1.2.3_canonical_candidate.json \
  --out build/saves/1980.save.json \
  --seed 1980-playtest
```

Both `season-database` and `global-world` inputs may end in `.json.gz`.

## 1980 baseline

The current promoted canonical baseline is recorded in:

`data/database-baselines/v1.2.3-canonical-candidate/baseline.json`

It pins:

- Global database release/version/checksum;
- the immutable source workbook hash;
- Season Definition 1980 version/checksum;
- readiness and materialization counts;
- management/people starting-context counts;
- source-lock and relationship audit counts;
- promotion-blocker status.

The earlier v1.0 and v1.2.2 baseline folders remain in the repository as historical audit records. They are not the current canonical baseline and must not be applied sequentially on top of v1.2.3.

The actual career runtime uses the external Season Database content, not the baseline manifest. The baseline manifest is a reproducibility/audit contract used to detect accidental source drift between database releases. Large JSON/SQLite/XLSX artifacts stay outside git; the repository pins their hashes and the small source/audit packs needed to explain the release.

## v1.2.3 source identity

For the canonical v1.2.3 promotion:

- Global `databaseVersion`: `v1.2.3-canonical-candidate`;
- Global `manifest.databaseVersion`: `v1.2.3-canonical-candidate`;
- Global source SHA-256: `9d29b8d004dbbc371b935e155a396bd6f33410f635de9ebdae4e808f8e2cc097`;
- Season 1980 `sourceChecksum`: the same source SHA-256;
- Global JSON SHA-256: `e247978c04d3ed88d1ade9e354892666e1f24bbfcc3e39e34fc4444e91c3d95f`;
- Season 1980 JSON SHA-256: `136d662040427f9ce1e12597c6b52fd11985c2c34e0e40a4ce2d088103ce75d5`.

The Season Database therefore validates against the same immutable Global source identity rather than against an unexplained generated-artifact checksum.

## Calendar policy

A Season Database may carry hidden non-outcome historical calendar structure for later seasons. Season rollover consumes that reference before using the previous-season fallback.

For the promoted v1.2.3 baseline the opening sequence remains:

`1980: 14 -> 1981: 15 -> 1982: 16 -> 1983: 15 -> 1984: 16`

This structure is allowed because it does not prescribe race winners, classifications, points, champions, transfers or other outcomes. If no future structural reference exists, the simulator may generate/fallback from the previous season until richer regulation/calendar generation exists.

## Database update rule

When a replacement database bundle is supplied, do not silently overwrite the current baseline. First compare:

- source and generated checksums;
- release identity in both top-level and embedded manifest fields;
- canonical IDs and alias/crosswalk integrity;
- readiness and supported seasons;
- active 1980 entity counts;
- historical archive continuity;
- future entity visibility boundaries;
- future outcome leakage;
- calendar/reference continuity;
- compatibility with the current Save World and simulation contracts.

Only after that audit should the baseline manifest be promoted to the new release.
