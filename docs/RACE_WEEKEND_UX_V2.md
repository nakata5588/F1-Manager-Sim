# Race Weekend UX v2

## Purpose

Stage 14 consolidates the complete race-weekend presentation into one coherent management experience.

The change is presentation and information architecture only.

The existing simulation systems remain authoritative for:

- Practice;
- setup;
- Qualifying;
- grid creation;
- strategy;
- live race;
- Race Control;
- incidents/reliability;
- classification;
- championship scoring.

## Weekend progression

The race weekend now uses one persistent progression model:

1. Practice
2. Setup
3. Qualifying
4. Grid & Strategy
5. Race
6. Results

The UI distinguishes:

- completed stages;
- active stage;
- upcoming stages.

No stage transition is moved into browser authority.

## Weekend briefing

Practice, Setup, Qualifying and Pre-Race continue to use the existing Race Weekend state.

The shared weekend presentation surfaces:

- round;
- circuit;
- date;
- weather;
- current weekend stage.

These values are projections only.

## Pre-Race

The Pre-Race view keeps the authoritative starting grid and existing strategy system but presents strategy more clearly.

Each controlled driver can show:

- planned stop count;
- planned stints;
- compound per stint;
- planned lap range;
- starting tyre control.

The stint timeline is calculated exclusively from the existing `targetLaps` in the projected strategy plan.

It does not predict future tyre life or invent alternative strategy outcomes.

## Race Desk

The live Race screen is reorganised around five operational areas:

### 1. Status strip

Shows existing projected state:

- current lap / total laps;
- race progress;
- current weather;
- Race Control state;
- running / retired field count;
- Race Position Projection precision.

No additional weather, grip or track-condition model is introduced.

### 2. Race Control banner

Race Control receives a persistent high-visibility banner.

Presentation states include:

- Green Flag;
- Yellow / restriction state;
- Safety Car;
- Virtual Safety Car;
- Red Flag;
- neutral fallback for other existing control enums.

This is a label/tone mapping over `liveRace.activeControl`.

The browser does not create or resolve Race Control events.

### 3. Live Race 2D + Timing Tower

The map continues to consume:

```text
raceWeekend.geometry
liveRace.trackPositions
```

The Timing Tower consumes:

```text
liveRace.order
```

and highlights:

- position;
- driver;
- team;
- Gap Index;
- tyre;
- status;
- player-controlled cars.

The Gap Index remains explicitly labelled simulation-relative.

It is not presented as seconds.

### 4. Pit Wall

The Pit Wall uses only existing strategy and live order projections.

Each controlled car may display:

- current position;
- current compound;
- tyre wear when available;
- current status;
- planned stint timeline;
- next-lap box instruction;
- replacement compound selection.

`BOX NEXT LAP` still submits the existing server-authoritative strategy instruction.

The browser does not decide whether the pit stop succeeds or when it is executed.

### 5. Event Feed / Engineering detail

The Event Feed groups existing notable events with presentation tones for:

- Race Control;
- retirements;
- incidents/damage;
- weather changes;
- strategy revisions.

The full engineering table remains available separately for detailed race state:

- Gap Index;
- compound;
- wear;
- thermal state;
- fuel;
- damage pace loss;
- pit stops;
- status.

This avoids forcing the compact Timing Tower to carry every technical column.

## Simulation controls

The existing controls remain:

- Pause;
- 1x;
- 2x;
- 4x;
- 8x;
- Step +1 Lap;
- Simulate to Finish.

Speed controls request authoritative future laps at different browser cadences.

They do not simulate additional race steps client-side.

## Results

Results now complete the same visible weekend progression rather than switching to an unrelated presentation.

The page highlights:

- race winner;
- classification;
- next Grand Prix;
- Drivers' Championship;
- Constructors' Championship.

The result remains sourced from the committed live-race classification.

## Circuit geometry boundary

The Race Desk works with both geometry states.

### Geometry reviewed

The 2D map can display the reviewed circuit.

Car markers still depend on Race Position Projection precision.

### Geometry unavailable

The existing no-fabrication fallback remains.

The UX does not create a synthetic track to fill the Race Desk.

The separate Circuit Layout / Geometry Pipeline can progressively unlock reviewed historical layouts without requiring another Race Desk redesign.

## Authority and safety

Stage 14 does not change:

- Historical Database rows;
- Save World schema;
- lap advancement;
- race pace;
- overtaking;
- pit-stop resolution;
- tyre model;
- fuel model;
- reliability;
- incident generation;
- Race Control logic;
- classification;
- championship scoring;
- circuit geometry authority.

It also preserves the rules:

```text
Gap Index != seconds
Gap Index != physical distance
browser speed != simulation authority
```

## P2 milestone

With Stage 14, the Race Presentation / Live Race Foundation block contains:

1. Circuit Geometry Model
2. Race Position Projection
3. Live Race 2D v0
4. Race Weekend UX v2

Future work can deepen telemetry, strategy and race interaction without replacing these presentation contracts.
