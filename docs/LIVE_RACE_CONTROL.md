# Live Race Control and Resumable Temporal Race

Phase 14 moves Race Control from a post-race review into the temporal race loop and introduces a serializable pause/resume boundary.

## Era availability is authoritative

Race Control mechanisms are enabled only when the current Save World era/rule contract exposes them.

- Yellow flags may create a local-yellow period.
- Red flags may stop/neutralize a severe incident and create a restart boundary.
- Modern Safety Car is unavailable unless the era explicitly enables it.
- Virtual Safety Car is unavailable unless the era explicitly enables it.

For the 1980 starting world this means the simulator can use flag control while it must not invent a modern Safety Car.

The existence of a mechanism is never inferred from the current real-world rulebook.

## Live intervention hierarchy

For one incident, the strongest era-available response wins:

1. red flag for the highest-severity incidents when red flags are available;
2. Safety Car when the era has the modern Safety Car and the incident reaches its threshold;
3. VSC when that mechanism is available and reaches its threshold;
4. local yellow when yellow flags are available.

Interventions are recorded inside the race timeline with their start/end lap, severity, source and relevant restart data.

## Current control effects

The first live model intentionally stays compact:

- overtaking is suppressed during active neutralization;
- Safety Car compresses the running field;
- red flag strongly compresses the field and creates an explicit restart event;
- VSC slows the field without bunching it;
- local yellow currently uses a global no-overtaking approximation because a sector model does not yet exist.

A control triggered by an incident affects end-of-lap ordering immediately. Neutralized pace cost begins on subsequent fully controlled laps. This avoids pretending that the simulator knows the precise sector/time of an incident before sector simulation exists.

If exact control-period durations are supplied by the Season Database/rules, they are used. Otherwise the engine uses deterministic simulation defaults and labels the policy accordingly. Mechanism availability itself still requires era data.

## Pause and resume

`simulateTemporalRace(saveWorld, weekend, options)` now accepts:

- `stopAfterLap`: stop after a specified lap;
- `resumeState`: resume from a previously returned state.

A partial simulation returns:

- `classification: null`;
- `timeline.completed: false`;
- a `resumeState` token.

The resume token contains only JSON-safe data: current lap, order, driver race state, event log, snapshots, leaders, active Race Control period and weather state. It can therefore be stored inside a save file or passed through a future UI/controller without replaying earlier laps.

A completed simulation returns the normal final classification and `resumeState: null`.

Regression coverage requires an uninterrupted race and a JSON-serialized pause/resume race to produce identical final classification, event history, leader history and snapshots for the same seed.

## Current headless behavior

The normal core world pipeline still completes a race in one call. The resumable API is an engine boundary for the future interactive Race Day controller; it does not force headless/AI simulations to pause artificially.

This preserves one simulation engine for player and AI while allowing the UI to gain Pause/Continue/live strategy controls later.

## Next layers

The current model deliberately does not yet implement:

- sector-level yellow zones;
- physical Safety Car train/lapped-car procedure;
- era-specific red-flag aggregate timing and countback rules;
- restart grid formation by historical era rules;
- in-race player strategy changes at pause boundaries;
- race director discretion/personality.

Those features must build on this resumable state rather than adding a second race simulation path.
