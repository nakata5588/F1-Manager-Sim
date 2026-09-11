# F1 Manager Sim Database Rebuild v1.0 Candidate

Generated: 2026-09-11T19:23:57.788620+00:00

## Baseline status

This bundle is the first accepted database baseline for Phase 29. The canonical source identity is pinned in `data/database-baselines/v1.0-candidate/baseline.json`.

Large editorial/runtime mirrors are deliberately not duplicated in the source tree. The original bundle contains the Global JSON, Global SQLite, editor workbook, Season Definition 1980 JSON, Season Definition SQLite, editor workbook, CSV exports and audit files. The baseline manifest records the exact filenames and SHA-256 hashes needed to identify those artifacts.

## Source inputs

| Source | Role | SHA-256 |
|---|---|---|
| `f1_db(2).xlsx` | Global/Master candidate input | `9d29b8d004dbbc371b935e155a396bd6f33410f635de9ebdae4e808f8e2cc097` |
| `F1_Manager_Sim_SeasonPack_1980_v0.9_payload.json` | 1980 SeasonPack overlay/spec | `7de5e72f24f62d23c7bb05b130665de513733a27788df5b2c82794b81c8279ff` |
| `F1 Archive.zip` | Historical archive/reference | `3a2dd137b20941aca6286961ecbd74ae08214cbb50d382bf42712433218b59f6` |

## Rebuild decisions

1. Global IDs are canonical. SeasonPack IDs are stored as aliases/crosswalks.
2. Loader-safe 1980 staff missing from Global were promoted into `staff`, `staffRatings`, and `staffContracts`.
3. 1980 tyre supplier data was promoted into a temporal `tyreCatalog` because the uploaded Global tyre sheet was empty.
4. 1980 gameplay calibration remains in the Season Definition overlay, not as immutable global truth.
5. Season Definition 1980 materializes past into `snapshot.historicalArchive`, present into active snapshot fields and future entities/structure as hidden reference with future results excluded.

## Key counts

| Metric | Value |
|---|---:|
| Global rows total | 30,727 |
| Global drivers | 863 |
| Global staff after promotion | 59 |
| Global teams | 212 |
| Global calendar races | 1,125 |
| Global race-result rows | 26,759 |
| 1980 active teams | 15 |
| 1980 active drivers | 50 |
| 1980 active staff | 55 |
| 1980 races | 14 |
| 1980 hidden future driver pool | 237 |
| Pre-career race results | 7,927 |

## Readiness

| Season | Status | Active Teams | Driver Contracts | Staff Contracts | Races | Failed Checks |
|---:|---|---:|---:|---:|---:|---:|
| 1980 | READY | 15 | 28 | 51 | 14 | 0 |
| 2000 | BLOCKED | 0 | 0 | 0 | 17 | 3 |

## Calendar reference

The Season Definition carries hidden structural calendar reference for 1981-2024. This is non-authoritative structure only: race winners, finishing positions, points, champions and other future outcomes are excluded.

The first seasons prove why the simulation must not assume a fixed race count:

- 1980: 14
- 1981: 15
- 1982: 16
- 1983: 15
- 1984: 16
- 1985-1994: 16 per season
- 1995: 17

The complete reference count index is pinned in the baseline manifest and is used by Phase 29 regression tests.

## Important caveats

- This is a **v1.0 candidate**, not final v1.0.
- Original import issues remain recorded rather than silently deleted.
- 2000 remains blocked because broad historical archive data exists but the active gameplay start-state is incomplete.
- The 1980 Season Definition is materially stronger than the Global-only 1980 view because it incorporates the v0.9 SeasonPack overlay.
- Phase 20 visibility selectors are already present in `main`; the bundle report predates that merge by a few minutes, so its former visibility-selector TODO is now obsolete.

## Update policy

Every replacement database bundle must be diffed against this baseline before promotion. At minimum the update audit checks source/database checksums, canonical IDs and aliases, readiness, 1980 materialization counts, future-visibility boundaries, future-outcome leakage and calendar/reference continuity.
