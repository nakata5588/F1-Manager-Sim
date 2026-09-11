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
npm run save:from-season-db -- F1_Manager_Sim_SeasonDefinition_1980_v1.0_candidate.json \
  --global-world F1_Manager_Sim_Global_Database_v1.0_candidate.json \
  --out build/saves/1980.save.json \
  --seed 1980-playtest
```

Both `season-database` and `global-world` inputs may end in `.json.gz`.

## 1980 baseline

The first accepted baseline is recorded in:

`data/database-baselines/v1.0-candidate/baseline.json`

It pins:

- Global database version/checksum;
- Season Definition 1980 version/checksum;
- readiness and materialization counts;
- hidden future pool counts;
- pre-career history counts;
- historical structural calendar race counts from 1980 through 2024.

The actual career runtime uses the Season Database content, not the baseline manifest. The baseline manifest is a reproducibility/audit contract used to detect accidental source drift between database releases.

## Calendar policy

A Season Database may carry hidden non-outcome historical calendar structure for later seasons. Season rollover consumes that reference before using the previous-season fallback.

For the accepted v1.0 candidate baseline the opening sequence is:

`1980: 14 -> 1981: 15 -> 1982: 16 -> 1983: 15 -> 1984: 16`

This structure is allowed because it does not prescribe race winners, classifications, points, champions, transfers or other outcomes. If no future structural reference exists, the simulator may generate/fallback from the previous season until richer regulation/calendar generation exists.

## Database update rule

When a replacement database bundle is supplied, do not silently overwrite the current baseline. First compare:

- source and generated checksums;
- canonical IDs and alias/crosswalk integrity;
- readiness and supported seasons;
- active 1980 entity counts;
- historical archive continuity;
- future entity visibility boundaries;
- future outcome leakage;
- calendar/reference continuity;
- compatibility with the current Save World and simulation contracts.

Only after that audit should the baseline manifest be promoted to the new release.
