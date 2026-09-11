# Live Race Controller and In-Race Strategy

The live controller is the persistent gameplay boundary for interactive race execution. It sits above the resumable temporal/sector engine and below the application/UI layer.

## Save World ownership

An interactive race is stored in `world.liveRaceState`.

The active session owns:

- the stable race/weekend key;
- current and total lap;
- paused/running/completed status;
- a mutable runtime copy of the race weekend and locked strategies;
- the semantic `raceStartBaseline` used to initialize the field;
- the JSON-safe temporal `resumeState`;
- recent race events and notable attention events;
- an ordered audit trail of pre-race and live strategy revisions.

Because this data belongs to the Save World, saving and reloading during a race does not require replaying previous laps.

## Controller API

The controller exposes the following engine-level contract:

- `startLiveRaceSession(saveWorld, weekend, { raceStartBaseline })` prepares lap 0 without simulating a race result;
- `advanceLiveRaceSession(saveWorld, { laps | toLap })` advances only the requested future laps;
- `getLiveRaceSession(saveWorld)` reads a safe clone of the current session;
- `applyPreRaceStartingTyre(...)` changes the starting compound only before lap 1;
- `applyLiveStrategyInstruction(...)` changes strategy only at a paused lap boundary;
- `recommendLiveStrategyInstruction(...)` can provide the same tyre-change decision primitive to player delegation or AI;
- `clearCompletedLiveRaceSession(...)` clears the completed active slot after the caller has consumed it.

The standard autonomous/headless pipeline remains supported and can still complete a race without pausing.

## Race-start baseline

Interactive races no longer need an aggregate race classification before lights out.

`createRaceStartBaseline()` provides initial driver/team/grid performance and reliability state only. It contains no finishing position, DNF, retirement reason or race outcome.

For backwards compatibility, the temporal engine still consumes a classification-shaped internal baseline. The live controller adapts `raceStartBaseline` only inside its cloned runtime weekend. The authoritative active weekend remains classification-free until the real live race completes.

This keeps the gameplay pipeline semantically correct:

`Grid -> Strategy -> raceStartBaseline -> Live Race -> Classification`

## Pre-race tyre changes

`applyPreRaceStartingTyre()` is valid only while the session is paused at lap 0.

It re-evaluates the already locked strategy with the requested starting compound and preserves the rest of the existing stint structure. The revision is recorded as `kind: starting_tyre` in the strategy audit trail.

The UI therefore edits a simulation-owned strategy plan rather than maintaining a second strategy representation.

## Live tyre changes

The live instruction currently supported is `box`.

A live box instruction specifies a tyre compound and the lap after which the stop should occur. The strategy revision:

1. preserves every fully completed stint;
2. preserves the current tyre up to the newly requested pit lap;
3. cancels only future superseded stints;
4. adds the requested new compound for the remaining race distance;
5. re-evaluates the new pit stop through the existing pit-crew model;
6. records revision lap, compound, reason and source.

A decision made after lap N cannot retroactively pit at the end of lap N. The earliest new stop is after lap N+1. This makes the pause boundary unambiguous.

## Attention events

Each advance records only the events produced by the newly simulated interval in `latestEvents`.

The controller also identifies notable events such as:

- incidents;
- damage;
- retirements;
- Race Control deployment/clear/restart;
- weather changes;
- strategy revisions.

The application can use `latestAttentionEvents` to auto-pause without moving any incident/Race Control logic into the browser.

## Weather/delegation hook

`recommendLiveStrategyInstruction` checks the active tyre strategy against a requested track condition and uses the canonical tyre availability model to propose a compatible compound when a change is needed.

The recommendation is not silently executed for a human-controlled team. Player, delegated and AI paths call the same strategy-revision primitive.

## Persistence invariant

Regression tests serialize the whole Save World after live strategy changes and then finish the race from the reloaded object. Strategy revisions must remain intact.

A stepped race with no live changes is also required to produce the same final classification and temporal event history as the uninterrupted temporal engine.

## Current limitation

The live timing model exposes a simulation-relative elapsed/race index, not calibrated wall-clock seconds. The Developer Playtest therefore labels the value as **Gap Index** rather than pretending it is a real time gap.

A later timing-calibration phase can add absolute lap/sector seconds without changing the controller ownership boundary.