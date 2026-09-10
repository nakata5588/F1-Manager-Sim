# Historical Database Packaging

F1 Manager Sim separates editorial historical data from runtime season packages.

## Layers

1. **Master Database** — complete editorial/research source spanning many eras. It may contain entities that are not yet active in a given starting season. The game does not load this file directly into a career.
2. **Season Database** — immutable, versioned package materialized from the Master Database for a specific start season (for example 1980). It contains the historical starting world plus the future-entity metadata required for that career to evolve.
3. **Save World** — mutable career state cloned from the selected Season Database. From the first simulated event onward, the save may diverge from real history.

## Design rules

- Master Database size and editor complexity must not affect runtime loading cost.
- A Season Database is a build artifact, never the source of historical truth.
- Every Season Database stores provenance: master version/checksum, build schema version and start season.
- Existing saves keep the historical package provenance they were created from; later database improvements must not silently rewrite active careers.
- Future entities can be shipped with a season package before their eligibility date. Historical debut/opening dates define plausibility boundaries, not scripted outcomes.
- Race results and later historical careers are calibration/reference data only; they never force future save-world results.

## Intended build pipeline

`Master Database -> validate -> materialize season -> validate season package -> game loads package -> create Save World`

The importer/adapter boundary is responsible for absorbing workbook/schema changes. Simulation systems depend only on the canonical Historical World / Season Database contract.
