# 1980 Database Readiness Baseline

Baseline source: uploaded `f1_db.xlsx` audited on 2026-09-10.

- Database version: `f1db-9d29b8d004db`
- Source SHA-256: `9d29b8d004dbbc371b935e155a396bd6f33410f635de9ebdae4e808f8e2cc097`
- Workbook sheets: 39
- Readiness status: **READY_WITH_WARNINGS**
- Required readiness checks: **18 passed / 18**

This status means the current workbook can initialize a coherent 1980 Historical Season Snapshot after deterministic importer normalization. It does **not** yet certify race-balance quality, historical rating accuracy or completeness of every future game system.

## 1980 initialization coverage

| Domain | Result |
| --- | ---: |
| Active teams | 15 |
| Driver contracts | 28 |
| Driver ratings | 29 |
| Staff contracts | 21 |
| Staff ratings | 25 |
| Team-engine assignments | 15 |
| Car-stat rows | 15 |
| Facility rows | 15 |
| Calendar races | 14 |
| Readiness check failures | 0 |
| 1980 validation errors | 0 |
| 1980 validation warnings | 45 |

The canonical 1980 runtime snapshot produced from this source currently contains 15 teams, 50 career-eligible/rated/contracted drivers, 25 relevant staff records, 5 active engine definitions, 14 circuits and 14 race weekends.

## Important identity finding

Structural foreign-key checks alone were not sufficient. The 1980 `driver_ratings` rows use an older temporary driver-ID scheme that collides with the current `drivers` master table.

Example:

- source `driver_ratings`: `d_0001` / Alan Jones;
- current master `drivers`: `d_0001` / Lewis Hamilton;
- unique canonical match by name: Alan Jones / `d_0178`.

All **29** 1980 driver-rating identity mismatches can currently be resolved unambiguously by exact normalized driver name. The importer therefore repairs the canonical relationship while preserving the original source ID and emits an `IDENTITY_LINK_REPAIRED` warning.

There are a further **16** such repair warnings in 1980 `driver_career` rows. Consequently 1980 is `READY_WITH_WARNINGS`, not clean `READY`, until the source workbook itself is corrected.

The game never writes those fixes back into the Excel source automatically.

## Whole-workbook findings in this baseline

Across the full workbook, the importer reports:

- 202 unambiguous identity-link repairs:
  - 29 in `driver_ratings`;
  - 169 in `driver_career`;
  - 4 in `staff_contracts`;
- 10 unresolved foreign-key errors in 2004 `team_engines`, because those engine IDs are not present in `core_engines`.

The 2004 engine errors do not block 1980 because readiness is season-scoped.

## Readiness gates passed for 1980

The validator confirms:

1. active teams exist;
2. all active team IDs resolve;
3. every active team has at least one driver contract;
4. all contracted driver IDs resolve after canonical normalization;
5. every contracted driver has a 1980 rating;
6. every active team has at least one staff contract;
7. all contracted staff IDs resolve;
8. every contracted staff member has a rating;
9. every active team has an engine assignment;
10. all 1980 engine references resolve;
11. every active team has car state;
12. every active team has facility state;
13. the calendar has sequential rounds;
14. every calendar circuit resolves;
15. sporting/points rules are available;
16. qualifying rules are available through effective-era resolution;
17. a safety-era model is available;
18. an accident model is available.

## Acceptance rule for future database versions

Every replacement master workbook should be run through the importer again. A new version is accepted for 1980 when it does not regress any of the 18 gates. Source-data improvements should progressively reduce the warning count until 1980 reaches clean `READY` status.
