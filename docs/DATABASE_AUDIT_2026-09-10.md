# Legacy Master Database Audit — 2026-09-10

Source inspected: uploaded `f1_db.xlsx`.

The original workbook is treated as read-only source material. This audit records structural findings; normalization must happen in the ingestion layer rather than by silently rewriting the source workbook.

## High-level result

The workbook is a strong foundation for the first playable historical world. It contains **39 worksheets** covering historical entities, season-specific ratings and contracts, car/team systems, calendars/results, regulations, events and game-supporting catalogs.

The preferred first season, **1980**, already has a coherent cross-section of team, driver, engine, car, facility and calendar data. After canonical importer normalization it currently passes all 18 initialization-readiness gates, with source-data warnings documented separately.

## Workbook inventory

| Worksheet | Data rows |
| --- | ---: |
| TO DO | 11 |
| driver_attribute_weights | 16 |
| core_driver_attributes | 22 |
| core_staff_attributes | 13 |
| core_roles | 12 |
| Series | 9 |
| drivers | 863 |
| driver_ratings | 49 |
| driver_career | 362 |
| staff_core | 29 |
| staff_ratings | 29 |
| staff_contracts | 34 |
| teams | 212 |
| team_brands | 57 |
| contracts | 85 |
| team_engines | 25 |
| core_engines | 7 |
| car_parts | 15 |
| car_stats_by_year | 25 |
| facilities | 25 |
| facilities_catalog | 8 |
| rd_projects | 15 |
| pitcrew_roster | 15 |
| finance_ledger | 79 |
| core_tracks | 77 |
| calendar | 1,125 |
| weather_profiles | 17 |
| race_results | 26,759 |
| core_sponsors_catalog | 25 |
| sponsors_contracts | 24 |
| tyers_catalog | 0 |
| events | 0 |
| event_templates | 93 |
| news_template | 180 |
| achievements | 43 |
| rules | 3 |
| qualifying_rules | 4 |
| era_safety | 2 |
| accident_model | 2 |

## 1980 starting-world coverage

The current workbook contains the following season-specific 1980 records:

| Area | 1980 rows |
| --- | ---: |
| Active team brands | 15 |
| Driver contracts | 28 |
| Driver ratings | 29 |
| Staff contracts | 21 |
| Staff ratings | 25 |
| Team-engine records | 15 |
| Car-stat records | 15 |
| Facility records | 15 |
| Calendar races | 14 |
| Historical race-result rows | 383 |

This is enough to make 1980 the first target historical snapshot, subject to canonical normalization and continued source-data cleanup.

## Historical coverage observed

- `calendar`: 1950–2024, 1,125 race rows.
- `race_results`: 1950–2024, 26,759 driver-result rows.
- `driver_career`: 1968–1993 in the current populated records.
- `driver_ratings`: populated season rows from 1980 to 2004.
- `team_brands`, contracts, engines, car stats and facilities include 1980 plus later sample/season data up to 2004.

Historical race results are reference/history data only. They must **not** be used to force outcomes after a career starts.

## Referential integrity checks

The initial structural audit found:

- no duplicate primary IDs in `drivers.driver_id`;
- no duplicate primary IDs in `teams.team_id`;
- no duplicate primary IDs in `staff_core.staff_id`;
- no duplicate primary IDs in `core_tracks.track_id`;
- driver ID values from ratings, career and contracts generally point to syntactically valid `drivers` IDs;
- team references from contracts, staff contracts, team brands, car stats and facilities resolve to `teams`;
- calendar track references resolve to `core_tracks`;
- race-result driver and track references resolve to their core tables.

### Semantic identity mismatch discovered

A second-pass semantic check comparing redundant IDs **and names** found that structural foreign-key validity alone is not sufficient.

All 29 1980 `driver_ratings` rows use an older temporary ID sequence that collides with the current canonical `drivers` table. For example, the source rating row identifies Alan Jones as `d_0001`, while `drivers.d_0001` is Lewis Hamilton. Alan Jones exists uniquely as `d_0178`.

The same legacy identity pattern affects 169 `driver_career` rows across the workbook. Four named 2004 `staff_contracts` rows also omit staff IDs despite uniquely matching existing staff records.

The new importer repairs only identity links that can be resolved to exactly one canonical entity by normalized name, preserves the original ID in provenance and emits an `IDENTITY_LINK_REPAIRED` warning. Ambiguous or unresolved identity mismatches remain hard validation errors.

For the current 1980 baseline, 45 such warnings are relevant to the season: 29 in `driver_ratings` and 16 in `driver_career`. This is why 1980 is currently classified `READY_WITH_WARNINGS` rather than clean `READY`.

See `docs/DATABASE_READINESS_1980.md` and `docs/DATABASE_SOURCE_FIXES.md`.

### Known broken relationship

`team_engines.engine_id` contains **10 IDs that do not exist in `core_engines`**:

- `eg_bmw04`
- `eg_cos04`
- `eg_cos04b`
- `eg_ferr04`
- `eg_frd04`
- `eg_hon04`
- `eg_mer04`
- `eg_pet04`
- `eg_ren04`
- `eg_toy04`

These belong to 2004 team-engine records and must be resolved before 2004 can be considered fully supported. They do not block the 1980 target because readiness validation is season-scoped.

## Schema inconsistencies normalized

The source contains several naming inconsistencies/typos that are mapped at import time while preserving the original workbook:

- worksheet `tyers_catalog` → canonical tyre catalog collection;
- `compund_id` → `compound_id`;
- `manufacturing_leve` → `manufacturing_level`;
- `_chassis_shop_level` → `chassis_shop_level`;
- `circtuiId_arch` → `circuit_id_arch`;
- `agression` → `aggression`;
- `prefered_number` → `preferred_number`;
- `team name` → `team_name`;
- mixed-case historical source IDs such as `driverId`, `raceId`, `constructorId`, `resultId` and `statusId` are kept distinct from canonical game IDs.

The ingestion layer exposes canonical field names while keeping per-row sheet/row provenance for auditability.

## Data-shape observations

- `drivers` contains 863 people, far more than the currently rated F1-season subset. This is useful for historical careers, junior pools and future talent systems.
- `driver_ratings` already uses a multi-attribute model including Current Ability, Potential Ability, pace, qualifying, starts, racecraft, wet skill, consistency, tyre management, intelligence, technical feedback, adaptability, mentality, aggression, crash likelihood, pressure handling, leadership, teamwork, development impact and reputation.
- `staff_ratings` similarly contains role-relevant attributes instead of one overall score.
- `race_results` is formula-heavy and is ingested as cached values with source provenance rather than used directly as simulation state.
- `tyers_catalog` and `events` currently contain headers only; tyre-era data and save-world events therefore need dedicated implementation/population.
- `event_templates` and `news_template` are populated and may be useful reference material for the future event/news system.

## Decisions from this audit

1. **1980 remains the first fully supported target season.**
2. The master workbook remains immutable/read-only.
3. A canonical normalized data contract sits between Excel and the simulation.
4. Historical race results belong to history/reference data, not the mutable career world.
5. Import validation fails loudly on unresolved required relationships for any season declared supported.
6. Safe, unique identity repairs are allowed only in canonical output and are always reported with provenance.
7. Source typos are mapped, not silently corrected in-place.
8. Season readiness is measured explicitly across entities, relationships, ratings, teams, engines, cars, facilities, calendar and rules.
9. Existing saves record the historical database version/checksum used at career creation.

## Implemented Phase 0 data tooling

The repository now contains a reproducible, dependency-free Python data pipeline under `tools/db/` that can:

- read `.xlsx` without mutating the workbook;
- capture source sheet/row provenance;
- normalize known source aliases and typos;
- preserve archival external IDs separately from canonical IDs;
- validate primary IDs and foreign keys;
- detect semantic ID/name mismatches;
- auto-repair only unique, unambiguous identity links;
- compute a SHA-256-based database version;
- generate season readiness reports;
- optionally emit the canonical Historical World JSON.

The current uploaded workbook produces database version `f1db-9d29b8d004db` and a 1980 result of `READY_WITH_WARNINGS` with 18/18 readiness checks passing.
