# F1 Manager Sim Database Rebuild v1.2.12 — 1980 Driver Pathways, Availability & Historical Enrichment Candidate

## Scope
DATABASE-ONLY cumulative candidate built on v1.2.11. No gameplay, UI, Save World state or scripted historical outcomes are added.

## What was wrong/incomplete in v1.2.11
- Driver availability still depended too much on a single `career_start -> career_end` window.
- Niki Lauda was classified as an ordinary 1980 `free_driver` despite being in a retirement/hiatus interval.
- Ayrton Senna was classified as 1980 `f1_eligible + free_driver`, but the evidence supports 1980 karting/talent visibility and Formula Ford only from 1981.
- 37 external/recruitment-pool drivers had no full multidimensional 1980 rating row.
- Junior/feeder/pre-F1 evidence was not materialized enough to explain visibility/readiness.
- Old DB-001..DB-010 backlog statuses were stale.

## What was corrected/added
- Added interval-aware driver availability definitions and career interval audit.
- Audited all 38 external 1980 drivers.
- Corrected Senna to `talent_visible / scoutable_talent_not_free_driver / not F1 eligible in 1980`.
- Corrected Lauda to `returnable_retired_inactive_not_seeking / not free_driver in 1980`.
- Added 37 full derived multidimensional external driver rating profiles with uncertainty metadata.
- Added pathway milestones for Senna, Lauda and provisional external-driver junior/feeder contexts.
- Added staff, sponsor and regulations review surfaces without inventing unknown facts.
- Cleaned old migration backlog into DONE / SUPERSEDED / PARTIALLY_COMPLETE / STILL_OPEN.

## Key counts
- External drivers audited: 38
- Free drivers after correction: 32
- Talent-visible not free: 5
- Inactive/returnable not seeking: 1
- External rating profiles added: 37
- Career interval rows: 67
- Pathway milestones: 41

## Deliberately unknown / Save World-owned
- Post-start availability, morale, negotiations, transfers, retirements and returns are Save World state.
- Money values, sponsor value, release clauses and salary remain null/abstract unless sourced.
- Named agents and personal relationships are not invented.
- Future debuts/championships/results/retirements are hidden/reference only and never script a 1980 career.
