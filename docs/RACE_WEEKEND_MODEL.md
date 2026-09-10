# Race Weekend Model

## Purpose

The Race Weekend is a simulation pipeline, not a UI shortcut. The UI may pause between sessions later, but the authoritative state belongs to the Save World and Simulation Engine.

Current event flow:

`calendar.race_day -> race.weekend_started -> race.practice_completed -> race.qualifying_completed -> race.grid_set -> race.completed`

The headless simulator can process the full chain automatically. A future player-facing command layer can stop between these events without changing the underlying simulation contracts.

## Practice

Practice creates circuit-specific setup knowledge for every race driver.

Learning is influenced by:

- driver technical feedback;
- adaptability;
- consistency;
- team engineering support from employed staff;
- the number of practice windows supplied by season rules;
- deterministic uncertainty from the save seed.

The current setup model contains four abstract axes:

- aero balance;
- mechanical grip;
- gearing;
- cooling.

The circuit creates the ideal target. Practice moves each driver's setup toward that target and produces two separate values:

- **Setup Knowledge** — how well the driver/team understand the configuration;
- **Setup Quality** — how close the resulting configuration is to the circuit target.

These values are persistent within the weekend and influence later sessions.

If the Season Database does not define a practice-session count, the simulation uses two internal practice windows and explicitly marks the source as `simulation_default`. This is a gameplay fallback, not a historical claim.

## Qualifying

Qualifying uses:

- qualifying skill;
- raw pace;
- mutable car performance;
- engine power;
- form;
- setup quality/knowledge;
- deterministic controlled randomness.

Current qualifying supports a configurable number of sessions from the Season Database. Each driver retains per-session performance and the best value determines the classification.

If the Season Database supplies a starter/grid limit (`max_starters`, `race_grid_size`, `grid_size` or `max_grid_size`), drivers outside that limit receive `DNQ` and do not start the race.

The exact historical elimination formats of later eras are not yet simulated. They will be added as explicit qualifying rule strategies rather than hardcoded year checks.

## Grid

The grid is a separate authoritative session result between qualifying and the race. This boundary exists so later systems can add:

- grid penalties;
- engine/component penalties;
- disqualifications;
- parc ferme changes;
- withdrawals;
- pit-lane starts;
- era-specific grid procedures.

No grid penalties are invented when the Season Database/Save World does not provide them.

## Race

The current race foundation uses the qualifying grid and combines:

- driver pace;
- racecraft;
- consistency;
- tyre-management skill as a driver trait;
- race intelligence;
- wet ability when relevant;
- start/launch skill;
- mutable car performance;
- circuit dependencies;
- setup quality;
- form;
- controlled deterministic randomness.

Reliability is evaluated separately from performance. Mechanical failures use car/engine reliability and setup stress; incidents use driver crash likelihood. DNFs include an explicit reason and completed-lap estimate.

Current race performance does **not** use Current Ability as a race-result Overall.

## Deliberate limitations

This phase is not lap-by-lap yet. The following remain future systems:

- tyre compounds and degradation curves;
- fuel loads and era-specific refuelling;
- pit stops and pit-crew execution;
- strategy decisions and reactions;
- traffic and dirty-air effects;
- overtaking attempts and defensive driving;
- evolving weather and track state;
- safety cars, virtual safety cars and red flags where era-appropriate;
- damage/component wear;
- detailed incidents and injuries;
- practice programmes and player setup choices;
- multi-stage qualifying rule strategies;
- session scheduling on real weekend dates.

These layers should consume the current session contracts rather than replace them.

## Historical principle

Historical data defines the opening conditions and era rules. Historical Practice, Qualifying or Race results never drive a Save World's future outcomes.
