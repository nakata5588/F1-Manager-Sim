# Tyre Temperature & Track Evolution

## Purpose

Phase 19 adds temporal tyre-temperature and circuit-grip behaviour to the authoritative sector race engine.

It does **not** introduce real-world tyre temperatures in degrees Celsius. The historical database does not currently support that level of trustworthy detail across eras, so the runtime uses a dimensionless `temperatureIndex` and clearly labels simulation tuning where explicit data is absent.

## Relationship with tyre calibration

The Season Pack v0.8 performance-calibration layer already uses supplier ratings such as:

- `warmup`;
- `wear_resistance`;
- `wet_performance`;
- `operating_window_width`.

That calibration establishes expected average stint performance. The temporal thermal model does not charge the same penalty again. Instead it redistributes the expected warm-up/window effect through the stint:

1. a fresh tyre begins below its ideal index;
2. sector load moves it toward or away from the operating window;
3. a tyre inside the window can recover part of the average calibration penalty;
4. a tyre outside the window receives a temporal pace penalty.

This keeps pre-race calibration and live-race behaviour complementary rather than additive duplicates.

## Temperature index

Each running car stores a resumable tyre thermal state containing:

- current `temperatureIndex`;
- ideal index for current conditions;
- operating-window width;
- state: `cold`, `optimal`, or `hot`;
- current compound/stint key;
- laps completed on the tyre;
- supplier-model provenance.

The state is updated sector by sector and is serialized inside the existing race resume state.

### Inputs

Thermal evolution can react to:

- tyre supplier warm-up rating;
- operating-window width;
- current dry/damp/wet condition;
- sector brake load;
- sector technicality;
- sector aero load;
- evolving track grip;
- Safety Car, VSC or red-flag neutralisation.

Local yellow does not globally cool every car; only global neutralisation mechanisms trigger the stronger cooling path.

## Track evolution

`resolveTrackEvolutionModel(track)` first looks for explicit circuit data:

- `track_evolution_rate`;
- `grip_evolution`;
- `rubbering_rate`.

If one is present, the model is marked `explicit`. Otherwise the race uses a conservative default tagged `simulation_tuning`.

### Dry track

A dry racing surface gradually gains grip/rubber through the active weather segment. The runtime records a compact grip index and pace modifier.

### Damp/wet track

A weather transition starts a new evolution segment. Damp and wet conditions reset the dry rubbering progression to a lower-grip state rather than pretending the previous dry-track progression remains unchanged.

The current model deliberately avoids claiming historically exact rubber levels, drying-line geometry or surface temperatures.

## Race-engine integration

The temporal race engine now applies, per sector:

`base race pace`
+ `sector car/driver modifier`
+ `Race Control modifier`
+ `damage modifier`
+ `tyre thermal modifier`
+ `track evolution modifier`

Track evolution also feeds its grip index into the tyre thermal response, so the two systems are coupled rather than independent cosmetic summaries.

## Persistence and save size

Thermal state lives inside each driver's resumable race state. A pause → JSON save → reload → resume must produce the same classification, events and thermal summary as uninterrupted simulation.

To keep long saves compact, the game does not store a tyre-temperature value for every car in every sector. It stores:

- current thermal state in an active/resumable race;
- cold/optimal/hot lap counts;
- status-transition events only when the state changes;
- final compact thermal summaries;
- track-evolution checkpoints at important/periodic laps.

## Historical-data policy

The following are simulation mechanics unless a Season Database explicitly supplies equivalent values:

- absolute temperature-index values;
- default track-evolution rate;
- thermal response coefficients;
- neutralisation cooling strength.

They must not be presented as historical measurements.

Explicit future Season Database values override the corresponding fallback inputs without requiring a separate race simulator.

## Validation gates

Phase 19 requires:

- direct warm-up/window tests;
- neutralisation cooling tests;
- dry-track evolution and weather-reset tests;
- pause/JSON/resume equivalence with live thermal state;
- existing simulation regression suite;
- real 1980 v0.8 ten-season autonomous soak.
