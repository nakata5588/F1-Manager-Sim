# Temporal Race Engine v1

## Purpose

The temporal race layer evolves a completed Race Weekend classification through the race distance before Championship scoring consumes the result.

It does not replace the existing driver/car/circuit performance model. The aggregate Race Weekend model establishes the multidimensional baseline; the temporal engine then applies lap-dependent effects.

## Current lap model

Each lap can change the race through:

- tyre wear and grip;
- explicit fuel load and fuel burn;
- pit-stop timing and execution;
- traffic loss and overtaking;
- wet/damp driver performance;
- explicit weather transitions;
- mechanical failures;
- driver incidents.

The model uses deterministic seeded randomness. The same Save World seed and state produce the same race.

## Historical-data rules

The engine must not invent historical facts to fill database gaps.

### Fuel

Fuel load is active only when the Season Database supplies both starting fuel and per-lap fuel consumption. Otherwise fuel has no temporal performance effect and the race is marked `no_explicit_fuel_data`.

### Weather

Weather can change during a race when the Season Database supplies an explicit weather timeline or transition lap. A single race weather condition remains constant. Missing weather defaults to a neutral dry simulation state and is marked `unspecified_default`.

### Tyres

Tyre wear consumes the locked strategy produced by the existing strategy system. When there is no tyre catalogue/strategy data, the temporal tyre effect is neutral.

## Traffic and overtaking

Cars accumulate abstract `raceIndex` cost rather than fake real-world lap times. Lower accumulated cost is better.

When a following car has theoretical pace to move ahead, an adjacent passing check considers:

- theoretical pace advantage;
- both drivers' racecraft;
- circuit overtaking difficulty;
- deterministic uncertainty.

A failed move creates traffic loss. Position changes caused by a pit cycle are distinguished from on-track overtakes.

This is intentionally a foundation, not a final wheel-to-wheel physics model.

## Reliability and incidents

Race-level reliability and crash risk are converted into lap hazards. A retirement records the lap and reason (`mechanical`, `incident`, or `fuel`). Retired cars are classified behind finishers and ordered primarily by completed distance.

## Save-size policy

The engine calculates every active car on every lap in memory but does not archive a full driver-by-lap matrix.

Persistent race history stores:

- weather changes;
- pit stops;
- overtakes/position changes;
- retirements;
- leader by lap;
- periodic and event-triggered position snapshots;
- tyre/fuel summaries;
- final classification.

This keeps 10–20 season saves manageable while preserving useful race history.

## Event order

`GRID_SET`
→ strategy lock
→ aggregate `RACE_COMPLETED`
→ temporal race refinement
→ final classification
→ Championship update

The temporal layer marks strategy as consumed so the aggregate strategy modifier cannot be applied twice.

## Next layers

The next race-engine iterations should add:

1. live strategy decisions after weather/traffic changes;
2. tyre-temperature and compound suitability models;
3. era-aware refuelling and fuel strategy;
4. lap-time calibration where reliable circuit/car data exists;
5. yellow flags, Safety Car, Virtual Safety Car where era-appropriate, and red flags;
6. damage and repairability;
7. race-control rules and penalties;
8. resumable live race state for the player-facing UI.
