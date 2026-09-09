# Historical Database Workflow

The historical database is expected to evolve continuously while the game engine is developed. The importer and simulation must therefore be designed so database enrichment can happen in parallel without destabilizing the game.

## Parallel workstreams

### A. Historical database enrichment

The master workbook may be expanded, corrected and researched independently. Typical changes include:

- new drivers and staff;
- more season-specific ratings;
- team identities and contracts;
- engines, cars and facilities;
- sponsors and finances;
- circuits, calendars and weather;
- regulations and safety systems;
- historical results and records;
- future/debut data for people or organizations that do not yet exist at the selected game start date.

The workbook is source material, not live save state.

### B. Importer and validator

The importer owns the translation from the evolving source workbook into a canonical game schema.

It must:

- preserve source sheet and column provenance;
- map known legacy typos and aliases to canonical field names;
- tolerate new optional columns without breaking;
- warn about unknown columns rather than silently discarding them;
- fail validation when required fields or relationships are broken for a season declared supported;
- produce a repeatable audit report for every database version;
- never modify the source workbook as part of import.

### C. Simulation development

The simulation reads only the canonical normalized Historical World contract. Simulation code must not know whether a source value came from Excel, JSON, SQL or another future database format.

This allows the source database to improve without requiring the race engine, contract engine or UI to be rewritten each time the workbook changes.

## Data flow

`Master Historical Database -> Import/Audit -> Canonical Historical World -> Season Snapshot -> Save World -> Simulation`

Only the Save World evolves during a career.

## Versioning

Every imported historical dataset should eventually receive a manifest containing at least:

- database version;
- source filename;
- source checksum/hash;
- import timestamp;
- importer schema version;
- supported seasons;
- warning/error counts;
- row counts by entity;
- readiness status by season.

A save should record the historical database version it was created from. Updating the master database must not retroactively rewrite existing careers.

## Season readiness

A season is not considered fully supported merely because it has a calendar. Readiness is evaluated across required domains.

For the initial 1980 target, the readiness gate should include at minimum:

- teams and season identities;
- race-driver contracts and driver ratings;
- required staff and staff contracts/ratings;
- engine assignment and valid engine references;
- car performance state;
- facilities;
- complete race calendar and valid circuit references;
- applicable sporting/qualifying/points/safety rules;
- no unresolved required foreign keys;
- enough source data to initialize a coherent Save World.

Historical race results are useful for records, history, calibration and validation but are never used to force simulated career outcomes.

## Future entities

The database may contain entities that are not yet active at the chosen start date, similar to a long-form historical wrestling database.

Examples:

- a driver born or entering motorsport later;
- a future F1 team or constructor identity;
- staff who have not yet entered F1;
- future circuits or events;
- future engine manufacturers or suppliers.

Such records remain hidden/inactive until their eligibility window is reached. Their real-world future career is reference data only: once the simulation begins, employment, success, retirement and competitive outcomes may diverge.

This lets a 1980 career develop naturally into later decades without requiring the game to invent every future person from scratch while still avoiding predetermined history.

## Branching/concurrency rule

Database enrichment and engine development should avoid editing the same concerns in the same branch.

Recommended convention:

- `phase-*` / `feature-*` branches: code, schemas, simulation and importer work;
- `data-*` branches: substantial historical database enrichment or corrections when source data is stored in the repository;
- merge database changes through the importer/validator before declaring a season ready.

The current `phase-0-foundations` branch can therefore continue while the master database is being improved elsewhere. A newer workbook can be dropped into the audit pipeline at any point and should produce a new readiness/diff report rather than requiring manual rewrites of game code.

## Database update acceptance

When a new master database version arrives, the normal cycle is:

1. preserve the previous source version;
2. run structural and referential audit;
3. compare row counts/schema/IDs against the previous version;
4. normalize through the canonical importer;
5. run season readiness checks, initially focused on 1980;
6. run simulation foundation tests against the newly generated Historical World;
7. report regressions and newly completed areas;
8. accept the version once critical validation passes.

This workflow deliberately supports continuous database research and continuous simulation development at the same time.
