# Source Database Corrections Queue

This file records issues detected by the importer that should be fixed in the evolving Excel master database. The importer can normalize some of these safely so game development is not blocked, but the source should progressively become clean.

## 1980 driver rating IDs

All 29 `driver_ratings` rows for 1980 currently use an older temporary ID sequence that collides with the canonical `drivers` master IDs. The importer repairs these by unique driver name and preserves the original source ID as provenance.

| Driver | Current source ID | Canonical driver ID |
| --- | --- | --- |
| Alan Jones | d_0001 | d_0178 |
| Carlos Reutemann | d_0002 | d_0199 |
| Gilles Villeneuve | d_0003 | d_0203 |
| Jody Scheckter | d_0004 | d_0222 |
| Nelson Piquet | d_0005 | d_0137 |
| Jacques Laffite | d_0006 | d_0172 |
| Didier Pironi | d_0007 | d_0202 |
| René Arnoux | d_0008 | d_0163 |
| Elio de Angelis | d_0009 | d_0173 |
| Jean-Pierre Jabouille | d_0010 | d_0219 |
| Riccardo Patrese | d_0011 | d_0119 |
| Keke Rosberg | d_0012 | d_0177 |
| John Watson | d_0013 | d_0187 |
| Derek Daly | d_0014 | d_0206 |
| Jean-Pierre Jarier | d_0015 | d_0197 |
| Emerson Fittipaldi | d_0016 | d_0224 |
| Alain Prost | d_0017 | d_0117 |
| Jochen Mass | d_0018 | d_0200 |
| Bruno Giacomelli | d_0019 | d_0152 |
| Mario Andretti | d_0020 | d_0207 |
| Clay Regazzoni | d_0021 | d_0223 |
| Ricardo Zunino | d_0022 | d_0217 |
| Marc Surer | d_0023 | d_0176 |
| Patrick Depailler | d_0024 | d_0221 |
| David Kennedy | d_0025 | d_0862 |
| Jan Lammers | d_0026 | d_0136 |
| Stefan Johansson | d_0027 | d_0140 |
| Eddie Cheever | d_0028 | d_0158 |
| Niki Lauda | d_0029 | d_0182 |

## Driver career identity links

`driver_career` currently contains 169 rows where `driver_id` resolves to a real master driver but the redundant `driver_name` belongs to a different person. All 169 are currently uniquely repairable by normalized name.

This appears to be the same legacy temporary-ID scheme as the 1980 ratings and should be corrected in the source workbook.

## 2004 staff contracts

Four named 2004 staff-contract rows have a blank `staff_id` even though the people exist in `staff_core`:

- Jean Todt → `st_0026`
- Rory Byrne → `st_0027`
- Ross Brawn → `st_0028`
- Chris Dyer → `st_0029`

The importer currently fills these only in the canonical output and records a warning.

## 2004 engine definitions

The following `team_engines.engine_id` values do not exist in `core_engines` and therefore remain true validation errors:

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

These should be added to `core_engines` or the corresponding `team_engines` references corrected.

## Acceptance target

For 1980, the immediate source-data target is to reduce the readiness status from `READY_WITH_WARNINGS` to clean `READY` without losing any of the 18 currently passing readiness gates.
