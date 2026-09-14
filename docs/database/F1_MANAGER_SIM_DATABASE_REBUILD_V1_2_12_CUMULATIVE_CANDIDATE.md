# Database v1.2.12 — 1980 Driver Pathways, Availability & Historical Enrichment

## Status

`v1.2.12-1980-driver-pathways-availability-historical-enrichment-candidate` is integrated as the **latest cumulative 1980 database candidate**.

It is database-only and is **not** promoted to canonical by this change. The promoted canonical baseline remains `v1.2.5-1980-technical-source-lock-candidate`.

## Cumulative boundary

v1.2.12 is built directly on the real v1.2.11 cumulative artifact and preserves the previously integrated Technical, Finance/Contracts/Sponsors, Regulations/Tyres, Drivers/Ratings/Career, Driver Availability/Free Driver and Calendar/Circuits/Weather layers.

No intermediate candidate is replayed sequentially.

## Driver pathway corrections

The candidate adds an interval-aware historical starting-availability model so a single `career_start -> career_end` window no longer implies continuous free-agent availability.

For a 1980 start:

- Ayrton Senna is `talent_visible` and `scoutable_talent_not_free_driver`; he is not F1-eligible/free in 1980.
- Niki Lauda is `returnable_retired_inactive_not_seeking`; he is not an ordinary 1980 free driver.
- the external pool becomes 32 free drivers, 5 talent-visible/not-free drivers and 1 inactive returnable/not-seeking driver.
- 38 external drivers receive individual availability audit rows.
- 67 career-interval rows and 41 pathway-milestone rows provide historical starting context.
- 37 external multidimensional rating profiles are added as `derived_gameplay_baseline` values with uncertainty, never as historical facts.

## Authority boundary

Historical data may define the starting status of a driver in 1980. Once a career starts, availability, willingness, retirement, return, negotiations, transfers and contracts belong to Save World/simulation.

Future debut, future team, future contract, future retirement and future results remain hidden/reference context only. They must never force a Save World outcome.

## Audit of supplied bundle

The received ZIP SHA-256 is:

`d8cd3c8ebd4fafcdcd6d820e7c17e4c340d3977dba5b0ae5e5a27b11be5ac080`

The supplied archive contains an embedded `*_BUNDLE_SHA256.txt` value that does not match the finalized received ZIP. This value is retained only as an audit artifact. All 25 entries declared by the supplied `CHECKSUMS.json` independently match their bytes and SHA-256 values, and both SQLite databases pass `PRAGMA integrity_check`.

Therefore the repository pins the received ZIP hash as the external bundle identity while preserving the mismatch explicitly rather than silently rewriting the supplied source pack.

## Repository policy

Large Global/Season JSON, SQLite and editor XLSX files remain external authoring artifacts. Their exact hashes are pinned in the database baseline. The repository stores compact audit/source material, integration metadata and regression tests.

No `src/`, `playtest/`, simulation, gameplay or UI implementation is changed by this database integration.
