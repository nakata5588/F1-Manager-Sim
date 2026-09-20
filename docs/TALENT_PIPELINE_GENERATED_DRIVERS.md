# Phase 40 — Talent Pipeline & Generated Drivers

## Purpose

Phase 40 gives long careers a renewable driver population without turning historical future careers into scripted outcomes.

Historical drivers remain immutable starting/reference data. Generated drivers exist only inside the Save World and are explicitly marked as simulation-created entities.

The canonical lifecycle is:

`Generated Junior → World Visible → Talent Visible → F1 Eligible → F1 Free Driver / Contract → F1 Career / Other Motorsport → possible F1 return`

The existing visibility, scouting, employment, contract, career-development and race systems remain authoritative for their own domains.

## Save World authority

Generated talent is written to Save World collections only:

- `world.futureDrivers`
- `world.futureEntities`
- `world.driverRatings`
- `world.careerState.drivers`
- `world.management.talentPipeline`

Every generated profile carries:

- `generated: true`
- `source: simulation_generated`
- `provenance: save_world_generated_talent`
- a stable generated `driver_id`
- explicit `world_visible_from`
- explicit `talent_visible_from`
- explicit `f1_eligible_from`

Generated drivers do **not** receive historical debut or retirement reference fields.

## Cohorts

A deterministic cohort is created for each career season. The default cohort size scales conservatively with the active team count and is bounded between three and six drivers per season.

The same save seed and season produce the same cohort. A different save seed may produce a different alternative future.

Cohort creation is idempotent. Re-processing the same season never creates a second cohort.

The generator creates young drivers aged 15–16 with separate Current Ability and Potential Ability plus multidimensional attributes including:

- pace;
- qualifying;
- starts;
- racecraft;
- wet ability;
- consistency;
- tyre management;
- race intelligence;
- technical feedback;
- adaptability;
- mentality;
- aggression;
- pressure handling;
- teamwork;
- car-development impact;
- crash likelihood.

Generated performance is never reduced to one Overall value.

## Visibility boundary

A generated junior is not exposed immediately at the historical career start.

The profile uses the existing entity visibility system:

`hidden → world_visible → talent_visible → f1_eligible`

This means:

- hidden juniors are not available to UI/scouting/recruitment;
- world-visible juniors may exist in the simulated motorsport world without being recruitment targets;
- talent-visible juniors enter the existing scouting/recruitment projection;
- only F1-eligible drivers can enter the F1 employment market.

No generated-driver-specific shortcut bypasses `entityVisibility.js`.

## Feeder development

Before F1 employment, generated juniors receive an abstract annual feeder record. Phase 40 intentionally models a generic progression layer rather than claiming historically exact lower-series calendars/results.

Current tiers are simulation categories:

- `national_junior`
- `formula_three`
- `formula_two`
- `international_formula`

Annual feeder performance considers the driver's evolving ability, consistency, racecraft, pressure handling and deterministic seeded uncertainty. Records may contain an abstract performance index, tier rank, events, wins and podiums.

These are Save World simulation outcomes. They are not historical facts.

The feeder result affects form and morale, then the existing `career.development` system remains responsible for annual attribute and Current Ability evolution. This avoids introducing a second driver-development authority.

## F1 market handoff

`career.talent-pipeline` runs before `world.entity-availability` on season boundaries.

When a generated driver reaches `f1_eligible_from`:

1. `entityAvailability` emits the normal eligibility event;
2. `careerLifecycle` activates the future profile into the live driver world;
3. `employmentMarket` adds the driver as a free agent when no team contract exists;
4. scouting, negotiations and AI recruitment use the same rules as for any other driver;
5. prolonged absence of an F1 seat can move the driver to `other_motorsport`, where the identity remains active in the Save World and may later return to the F1 market or accept an emergency replacement drive.

There is no automatic F1 debut, team assignment or race entry.

## Historical-data boundary

Phase 40 never mutates historical future-driver rows. Historical future drivers continue to use their database-provided visibility and eligibility metadata.

Generated talent does not use historical future championships, team moves, race results or debut outcomes as authority.

The database remains:

`Historical source → Season Database → Save World`

Generated talent begins only after the Save World boundary.

## Long-career objective

The system is designed to keep the employment/scouting ecosystem populated after historical source coverage becomes sparse and to make two careers from the same historical start capable of producing genuinely different driver generations. Stage 18 also prevents every F1-eligible driver from accumulating indefinitely in one free-agent bucket.

Future expansion may add deeper feeder-series championships, team academies, national/regional talent pools, junior contracts, pay-driver pathways and staff-generated development programmes. Those systems should extend this pipeline rather than create a parallel driver population model.
