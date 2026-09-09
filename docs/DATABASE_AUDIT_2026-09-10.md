# Legacy Master Database Audit — 2026-09-10

Source inspected: uploaded `f1_db.xlsx`.

The original workbook is treated as read-only source material. This audit records structural findings; normalization must happen in the ingestion layer rather than by silently rewriting the source workbook.

## High-level result

The workbook is a strong foundation for the first playable historical world. It contains **39 worksheets** covering historical entities, season-specific ratings and contracts, car/team systems, calendars/results, regulations, events and game-supporting catalogs.

The preferred first season, **1980**, already has a coherent cross-section of team, driver, engine, car, facility and calendar data.

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

This is enough to make 1980 the first target historical snapshot, subject to semantic validation of individual values.

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
- driver references from ratings, career and contracts resolve to `drivers`;
- team references from contracts, staff contracts, team brands, car stats and facilities resolve to `teams`;
- calendar track references resolve to `core_tracks`;
- race-result driver and track references resolve to their core tables.

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

These appear to belong to later-season engine records and must be resolved before those seasons can be considered fully supported. They do not block the 1980 target if all 1980 engine references validate.

## Schema inconsistencies to normalize

The source contains several naming inconsistencies/typos that should be mapped at import time while preserving the original workbook:

- worksheet `tyers_catalog` should normalize to a tyre catalog domain name;
- `compund_id`;
- `manufacturing_leve`;
- `_chassis_shop_level`;
- `circtuiId_arch`;
- `agression`;
- `prefered_number`;
- mixed casing such as `Ovrl`, `Innovation`, `Availability`, `Country`, `Year`;
- `team name` versus `team_name`.

The ingestion layer should expose canonical field names and keep source-column metadata for auditability.

## Data-shape observations

- `drivers` contains 863 people, far more than the currently rated F1-season subset. This is useful for historical careers, junior pools and future talent systems.
- `driver_ratings` already uses a multi-attribute model including Current Ability, Potential Ability, pace, qualifying, starts, racecraft, wet skill, consistency, tyre management, intelligence, technical feedback, adaptability, mentality, aggression, crash likelihood, pressure handling, leadership, teamwork, development impact and reputation.
- `staff_ratings` similarly contains role-relevant attributes instead of one overall score.
- `race_results` is formula-heavy and should be ingested as values with provenance rather than used directly as simulation state.
- `tyers_catalog` and `events` currently contain headers only; tyre-era data and save-world events therefore need dedicated implementation/population.
- `event_templates` and `news_template` are populated and may be useful reference material for the future event/news system.

## Decisions from this audit

1. **1980 remains the first fully supported season.**
2. The master workbook remains immutable/read-only.
3. A canonical normalized data contract will sit between Excel and the simulation.
4. Historical race results belong to history/reference data, not the mutable career world.
5. Import validation must fail loudly on broken stable-ID relationships for any season declared supported.
6. Source typos are mapped, not silently corrected in-place.
7. Season readiness will be measured explicitly (entities, relationships, ratings, teams, engines, cars, facilities, calendar, rules and validation status).

## Next database work

The next Phase 0/1 step is to build a reproducible importer/auditor that can:

- read the workbook without mutating it;
- capture original sheet/column names;
- normalize into canonical entities;
- validate stable IDs and foreign keys;
- generate a 1980 season-readiness report;
- emit versioned historical data artifacts for the game;
- preserve enough provenance to trace any normalized value back to the source workbook.
