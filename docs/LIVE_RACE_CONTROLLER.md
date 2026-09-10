# Live Race Controller and In-Race Strategy

Phase 15 turns the resumable temporal engine into a persistent gameplay boundary that can later be controlled by the Race Day UI.

## Save World ownership

An interactive race is stored in `world.liveRaceState`.

The active session owns:

- the stable race/weekend key;
- current and total lap;
- paused/running/completed status;
- a mutable copy of the race weekend and locked strategies;
- the JSON-safe temporal `resumeState`;
- an ordered audit trail of live strategy revisions.

Because this data belongs to the Save World, saving and reloading during a race does not require replaying previous laps.

## Controller API

The controller exposes a small engine-level contract:

- `startLiveRaceSession(saveWorld, weekend)` prepares lap 0 without simulating the race;
- `advanceLiveRaceSession(saveWorld, { laps | toLap })` advances only the requested future laps;
- `getLiveRaceSession(saveWorld)` reads a safe clone of the current session;
- `applyLiveStrategyInstruction(...)` changes strategy only at a paused lap boundary;
- `recommendLiveStrategyInstruction(...)` can provide the same tyre-change decision primitive to player delegation or AI;
- `clearCompletedLiveRaceSession(...)` clears the completed active slot after the caller has consumed it.

The standard autonomous/headless pipeline is unchanged and can still complete a race without pausing.

## Live tyre changes

The first live instruction is `box`.

A live box instruction specifies a tyre compound and the lap after which the stop should occur. The strategy revision:

1. preserves every fully completed stint;
2. preserves the current tyre up to the newly requested pit lap;
3. cancels only future superseded stints;
4. adds the requested new compound for the remaining race distance;
5. re-evaluates the new pit stop through the existing pit-crew model;
6. records revision lap, compound, reason and source.

A decision made after lap N cannot retroactively pit at the end of lap N. The earliest new stop is after lap N+1. This makes the pause boundary unambiguous.

## Weather/delegation hook

`recommendLiveStrategyInstruction` checks the active tyre strategy against a requested track condition and uses the canonical tyre availability model to propose a compatible compound when a change is needed.

The recommendation is not silently executed for a human-controlled team. Player, delegated and AI paths should all call the same strategy-revision primitive.

## Persistence invariant

Regression tests serialize the whole Save World to JSON after a live strategy change and then finish the race from the reloaded object. The planned pit stop and strategy revision must remain intact.

A stepped race with no live changes is also required to produce the same final classification and temporal event history as the uninterrupted temporal engine.

## Next

Sector-level simulation is intentionally the next separate phase. It will refine local-yellow scope, sector-specific traffic/overtaking and incident location without changing the live controller contract introduced here.
