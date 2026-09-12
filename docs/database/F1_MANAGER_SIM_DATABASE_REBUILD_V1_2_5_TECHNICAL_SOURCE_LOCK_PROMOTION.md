# F1 Manager Sim Database Rebuild v1.2.5 — 1980 Technical Source-Lock Promotion

## Status

`v1.2.5-1980-technical-source-lock-candidate` is the current promoted canonical database baseline for 1980 after Development integration and validation.

The bundle is cumulative. It supersedes `v1.2.4-1980-technical-source-candidate`, which in turn extended the v1.2.3 canonical publication. **Do not apply v1.2.4 and v1.2.5 sequentially.**

Large Global/Season JSON, SQLite and XLSX artifacts remain external. The repository pins their identities/checksums and keeps the small policy/readiness/source-manifest outputs required for auditability.

## Independent bundle audit

Development inspected both supplied v1.2.4 and v1.2.5 ZIPs directly.

For v1.2.5:

- all 20 published checksum entries match the actual bundled files byte-for-byte;
- Global SQLite `PRAGMA integrity_check` returns `ok`;
- Season 1980 SQLite `PRAGMA integrity_check` returns `ok`;
- Global top-level and embedded manifest identities agree;
- Season 1980 `sourceChecksum` equals Global `manifest.sourceSha256`;
- source identity remains `9d29b8d004dbbc371b935e155a396bd6f33410f635de9ebdae4e808f8e2cc097`;
- duplicate driver/staff/team/entity-alias IDs: 0;
- duplicate technical baseline/seed/audit IDs: 0;
- recursive inspection of `futureStructure` found no race-result/champion/classification authority;
- the eight canonical-ID publication repairs from v1.2.3 remain applied on active and audit fact surfaces.

## Why v1.2.4 is not integrated separately

The v1.2.5 baseline declares itself cumulative and explicitly supersedes v1.2.4.

Development compared the technical starting arrays in both Global/Season publications. The core starting values are unchanged:

- 90 technical component baselines;
- 90 starting specification seeds;
- 90 facility baselines;
- 15 manufacturing-capacity baselines;
- component/facility definitions and technical data policy.

v1.2.5 adds the row-level technical source-lock/audit layer rather than silently changing those starting values.

## 1980 invariants

The existing canonical 1980 world remains intact:

- active teams: 15;
- active drivers: 50;
- active staff: 55;
- races: 14;
- recruitment pool: 66;
- contract negotiation baseline: 79;
- initial Inbox events: 90.

Technical additions:

- technical component baselines: 90 (6 per team);
- starting specification seeds: 90 (6 per team);
- technical facility baselines: 90 (6 per team);
- manufacturing capacity baselines: 15 (1 per team);
- technical source-lock audit rows: 285;
- unknown technical fields documented: 7;
- suppressed dynamic-state rules: 6.

## Source-lock classification

The 285 audit rows classify as:

- `database_source_locked_starting_input`: 165;
- `derived_from_database_source_locked_starting_input`: 90;
- `derived_gameplay_baseline`: 15;
- `database_source_locked_or_derived_capacity_index`: 15.

The 15 `derived_gameplay_baseline` rows are the absent 1980 simulator concept. They remain explicitly `derived_not_source_locked` and must never be presented as sourced historical facility facts.

Component values are relative game baselines carried from the existing `carStats` database rows. Their source-lock policy explicitly forbids describing them as exact measured real-world engineering values.

## Technical database / Save World boundary

The canonical lifecycle remains:

`Historical starting car -> Design / Research -> Specification -> Manufacture -> Inventory -> Fit to Car -> Race`

Database-owned reference inputs:

- component/facility concept definitions;
- 1980 component baselines;
- starting specification seeds;
- facility baselines;
- manufacturing capacity baseline/index;
- technical data/source-lock policies;
- source-lock audit/readiness/manifests;
- unknown-field and suppression rules.

At career creation the source baselines seed mutable `world.technical` fitted starting state. The original source rows then live under `reference.databaseContext` rather than the mutable world.

Dynamic Save World-only state includes:

- post-start designs;
- new specifications;
- manufacturing jobs/queues;
- produced inventory;
- fitment changes;
- facility upgrades;
- dynamic maintenance deltas.

The v1.2.5 bundle itself contains none of those dynamic states.

## Zero-inventory policy

All 90 starting specification seeds have `initial_inventory_units = 0`.

A fitted starting specification represents the part already on each car. It does not imply spare stock. Inventory only appears after a Save World manufacturing completion unless a future source-locked starting inventory pack explicitly provides a count.

## Runtime integration

Development added a technical database materializer that:

1. materializes technical blocks from Global Database by season;
2. derives the 90 fitted-start specification seeds from source-locked component baselines when materializing from Global;
3. replaces pre-materialized Season technical copies instead of appending/duplicating them;
4. seeds `world.technical.teams[teamId]` and `world.carState` at Save World creation;
5. preserves source provenance on starting specs/facilities;
6. keeps the 1980 simulator at level `0` with source `derived_gameplay_baseline`, rather than the old implicit runtime fallback;
7. creates no spare inventory from zero-inventory seeds;
8. moves all technical source/audit rows to `reference.databaseContext` after bootstrap.

Older Season snapshots without technical database blocks keep the existing Phase 36 fallback initialization, preserving backward compatibility.

## Canonical identities

- databaseVersion: `v1.2.5-1980-technical-source-lock-candidate`
- source SHA-256: `9d29b8d004dbbc371b935e155a396bd6f33410f635de9ebdae4e808f8e2cc097`
- Global JSON SHA-256: `315fdd58ef24b02bc6aeb073876d8fa1966839c134751979d8800393b83a36cd`
- Season Definition 1980 JSON SHA-256: `e22b89da311991fad300d873973513cba438ebac38b450e8bf5248f61dfc9303`
- Global SQLite SHA-256: `1676259db4a50b2e596c38c030a9152f9d5d587b2627b48fe7196553dfa4992c`
- Season SQLite SHA-256: `85027332b8045454eecedcdb7a684bf9997c66063d990e1440f43d46bc7c4495`

## Next database boundary

The bundle identifies the next useful data-only step as source-locking the shared starting financial context used by Phase 35/36: contracts, sponsors, finances and technical costs. That work should remain database-only and must not move post-start commercial/technical outcomes back into the Historical World Database.
