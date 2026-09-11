# SeasonPack 1980 v0.9 — validation/spec crosswalk

## Status

SeasonPack 1980 v0.9 is treated as a **specification and validation reference**, not as the current runtime package.

The repository still materializes 1980 from:

- `season-pack-1980.v0.7.json`
- `season-pack-1980.v0.8.overlay.json.gz`

This is intentional. Phase 12 already implemented the important championship/runtime rules and Phase 20 now hardens the historical visibility boundary. A wholesale v0.9 migration is not required just to preserve those rules.

The known v0.9 bundle added 16 validation/spec sheets (84 sheets total). This document records how those sheets map to current executable tests and where exact v0.9 fixture ingestion is still intentionally absent.

## Crosswalk

| v0.9 sheet | Current repository coverage | Status |
| --- | --- | --- |
| `1980_Championship_Rules` | `src/sim/championshipRules.js`, `tests/championship1980.test.js` | Covered behavior |
| `1980_Points_System` | 9-6-4-3-2-1 asserted in `tests/championship1980.test.js` | Covered behavior |
| `1980_Drop_Score_Rules` | five best from rounds 1-7 + five best from rounds 8-14 asserted | Covered behavior |
| `1980_Constructor_Scoring_Rules` | all scoring finishes / all rounds asserted | Covered behavior |
| `1980_Classification_Status_Rules` | race classification/status pipeline is tested, but exact v0.9 status fixture rows are not loaded | Partial / spec reference |
| `1980_Championship_Tiebreakers` | runtime deliberately refuses to invent an unsourced tie-break; exact v0.9 tie-break rows are not integrated | Partial / conservative fallback |
| `1980_Reference_Result_Policy` | future outcomes excluded by Global/Season/Save boundary and visibility tests | Covered principle |
| `1980_Race_Weekend_Reference_Index` | round-entry and historical weekend context remain reference-only | Covered principle; exact index not ingested |
| `1980_Drop_Score_Fixture_Drivers` | synthetic executable fixtures validate drop-score behavior | Functional coverage; exact v0.9 fixture not ingested |
| `1980_Constructor_Fixture` | synthetic executable constructor fixture validates all-round scoring | Functional coverage; exact v0.9 fixture not ingested |
| `1980_Phase12_Acceptance_Tests` | spread across `championship1980`, SeasonPack integration and long-run tests | Covered behavior |
| `1980_Long_Run_Invariants` | `tests/longRunValidation.test.js` and the 10-season SeasonPack soak | Covered core invariants |
| `1980_Long_Run_Scenarios` | 10-season autonomous scenario exists; not every v0.9 scenario row is loaded verbatim | Partial |
| `1980_Phase12_Integration_Contract` | SeasonPack -> Save World contracts and championship integration tests | Covered behavior |
| `1980_Championship_Audit_Notes` | reference/documentation only | Spec-only |
| `1980_v0.9_Source_Register` | provenance/reference only; current v0.8 checksum/provenance remains enforced | Spec-only |

## Visibility relevance

The v0.9 package must not weaken the definitive visibility contract:

- future identity may exist internally without being player-visible;
- `birth_date` is identity/history only;
- `world_visible_from` / `known_from` controls first world visibility;
- `talent_visible_from` controls scouting visibility;
- `f1_eligible_from` controls F1 employment eligibility;
- `f1_debut_reference` is historical reference only;
- `career_end_reference` is historical reference only after career start;
- future race results, standings, winners and transfers never become authoritative post-start outcomes.

Any future v0.9 runtime migration should therefore be an explicit compatibility/integration task, not a blind package replacement.

## Remaining optional v0.9 integration work

If/when the actual v0.9 payload is committed to the repository, the next narrow validation step is:

1. load its 16 validation/spec sheets as test fixtures only;
2. compare exact drop-score and constructor fixtures with current executable results;
3. decide whether the sourced championship tie-break sheet is complete enough to replace the current conservative `tiebreak_required` outcome;
4. keep audit notes and source register out of mutable Save World state;
5. retain v0.9 historical reference results as non-authoritative context only.
