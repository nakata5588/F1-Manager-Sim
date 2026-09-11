# Temporal Race Engine

## Purpose

The temporal race engine refines the multidimensional Race Weekend baseline through actual race progression before Championship scoring consumes the final classification.

It remains the single race engine for AI, headless simulation and future player-facing Race Day control.

## Current model

The current runtime is `sector_lap_v1_resumable`.

A race progresses by lap and, within each lap, by sectors. It models:

- tyre wear and compound suitability;
- explicit fuel load/burn when supplied;
- pit-stop timing and execution;
- sector-level traffic and overtaking;
- wet/damp driver performance;
- explicit weather transitions;
- sector-distributed mechanical failures and incidents;
- era-aware live Race Control;
- JSON-safe pause/resume;
- live strategy changes through the persistent Race Day controller.

The model is deterministic for the same Save World state and seed.

## Sector model

The engine supports two sector sources.

### Explicit sector data

If a Season Database supplies `sector_model`, `sector_profile`, `sectors` or `sector_traits`, those rows are authoritative for simulation. Sector rows may define:

- lap share/weight;
- overtaking difficulty;
- incident risk;
- power sensitivity;
- aero sensitivity;
- brake stress;
- technicality.

### Derived sector approximation

When no sector data exists, the engine derives three simulation sectors from existing circuit gameplay traits. This is explicitly tagged:

- `source: derived_track_traits`
- `dataStatus: simulation_approximation`

Derived sectors are gameplay scaffolding, not historical claims. A later Season Database can replace them without changing the race-engine contract.

## Sector traffic and overtaking

Cars accumulate abstract `raceIndex` cost rather than invented real-world lap times.

Passing checks now happen between adjacent cars in each sector and consider:

- theoretical pace advantage;
- both drivers' racecraft;
- sector overtaking difficulty;
- sector braking opportunity;
- deterministic uncertainty.

A failed move creates sector-specific traffic loss. Pit-cycle position changes remain separately identified.

## Reliability and incidents

The existing race-level reliability/crash probability is preserved, but its per-lap hazard is distributed across the sector weights. Incident distribution additionally considers each sector's incident risk.

This means moving from lap to sector simulation does not deliberately inflate the expected total retirement rate.

Retirements record both lap and `retirementSectorId` when applicable.

## Race Control

Incident events carry a sector. In eras with yellow flags, a local yellow is scoped to that sector when sector context exists.

Global mechanisms remain global:

- red flag;
- Safety Car, only when the era exposes it;
- VSC, only when the era exposes it.

For 1980, the engine does not invent a modern Safety Car or VSC.

## Resume and live strategy

The resume payload is plain JSON. A race can be paused at a lap boundary, the whole Save World serialized, then resumed without replaying previous laps.

Sector simulation preserves this invariant: uninterrupted simulation and pause/serialize/resume must produce the same classification, events and leaders if no strategy decision changes.

The persistent Live Race Controller can revise future strategy while preserving completed stints and race history.

## Save-size policy

The engine simulates sectors in memory but does not persist a full driver × sector × lap matrix.

Persistent history keeps:

- weather changes;
- pit stops;
- overtakes/position changes with sector IDs;
- retirements with sector IDs;
- Race Control interventions;
- leader by lap;
- periodic/event snapshots;
- tyre/fuel summaries;
- compact sector summaries;
- final classification.

This keeps long careers practical while preserving useful race history.

## Next race-engine layers

Likely next steps are:

1. richer sector/corner data when the Season Database provides it;
2. AI live strategy reaction to weather and Race Control;
3. tyre temperature and operating-window dynamics;
4. damage, repairability and pace loss;
5. era-aware refuelling/fuel strategy;
6. sporting penalties and steward decisions;
7. calibrated timing/gaps where reliable data supports real-time presentation.
