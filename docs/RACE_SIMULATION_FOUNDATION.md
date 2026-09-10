# Race Simulation Foundation

## Purpose

This phase connects the persistent world to on-track consequences for the first time. It is deliberately a headless foundation, not the final lap-by-lap race engine.

The key architectural requirement is already enforced: historical results are never replayed as scripted career outcomes.

## Entrants

Race entrants come from the mutable employment state in the Save World. Retired workers and reserve/test/development roles are excluded from ordinary race entry.

This means transfers, contract expiries and retirements can change the grid without changing historical source data.

## Qualifying

The first qualifying model combines:

- driver qualifying ability;
- raw pace;
- current mutable car performance;
- engine power;
- driver form;
- a small deterministic uncertainty term.

Current Ability is not used as a direct qualifying score.

## Race performance

The first race-performance index combines several independent inputs:

- pace;
- racecraft;
- consistency;
- tyre management;
- race intelligence;
- wet skill when conditions require it;
- mutable car performance;
- grid position influence;
- form;
- controlled deterministic uncertainty.

Circuit power/aero/technical dependencies are consumed when they exist in the Season Database. Missing circuit traits use neutral simulation coefficients rather than historical outcomes.

## Reliability and incidents

Reliability is evaluated separately from pace. The current foundation considers:

- engine reliability;
- gearbox/cooling/electronics/brake state;
- driver crash likelihood;
- separate deterministic mechanical and incident random streams.

A fast driver/car can therefore retire, while a slower package can finish. DNFs retain a reason and completed-lap estimate.

The probability model is intentionally tunable and will later be calibrated by era using the Accident Model, component reliability and historical aggregate rates. It must not hardcode specific historical retirements.

## Persistent race history

Every completed weekend writes an immutable-at-the-time record into Save World history containing:

- date / season / GP / round / circuit;
- qualifying classification;
- race classification;
- finish/DNF state;
- reliability information;
- performance indices used for diagnostics and balancing.

## Championship foundation

Race results update a persistent championship state using the Season Database race-points system when supplied.

The engine keeps **gross points** losslessly. It does not yet claim those standings are the official era-correct championship when additional counting rules are missing.

This matters for 1980 because the drivers' championship used a split best-results/discard system. Constructor scoring has also changed between eras. Until those rules are explicitly represented in the Season Database, the UI and history must describe these as provisional/gross standings rather than official champions.

If no points system exists at all, the engine records results but awards no invented fallback points.

## Dynamic season rollover

A career can continue beyond the source season without loading future historical outcomes.

Until a full calendar-planning system exists, a new season receives a generated baseline calendar copied from the previous Save World season with dates shifted to the new year. The generated races receive new IDs and record their source provenance.

This is a simulation fallback, not a claim that the real next-season calendar was identical. Later systems may alter rounds, circuits, regulations and team entries inside the Save World.

## Not implemented yet

This foundation does **not** yet simulate:

- Practice sessions;
- qualifying sub-formats by era;
- individual laps;
- tyre compounds and degradation curves;
- pit stops;
- fuel strategy;
- traffic and overtaking interactions;
- safety cars / red flags;
- detailed weather evolution;
- setup work;
- damage states;
- team strategy calls;
- era-specific official championship discard/count-back logic.

Those systems should be layered on top of the same event/result contracts rather than replacing the persistent-world architecture.

## Next race-engine milestone

The next major race milestone is:

`Weekend created -> Practice -> Qualifying -> Grid -> Race simulation -> Classification -> Championship -> News/history`

with deterministic seeds and era-aware rules throughout.
