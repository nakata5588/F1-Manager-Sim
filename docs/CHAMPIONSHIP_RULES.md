# Championship scoring architecture

Championship scoring is resolved from the Season Database and applied only to the mutable Save World.

## 1980 source rule

SeasonPack 1980 supplies:

- race points: `9-6-4-3-2-1` for the first six finishers;
- Drivers' Championship: best five results from rounds 1-7 plus best five results from rounds 8-14;
- Constructors' Championship: all rounds count and all scoring finishes are retained.

The simulation engine does not use historical 1980 results to calculate the championship. Only simulated Save World race results enter the standings.

## Runtime representation

Each driver and constructor retains:

- `grossPoints`: every point scored before discard rules;
- `countedPoints`: points contributing to the official standings under the active era rule;
- `droppedPoints`: points excluded by discard rules;
- `results`: lossless per-race scoring records;
- `countedResults`: results currently counted;
- `droppedResults`: positive-scoring results currently discarded.

`points` remains the compatibility/display field and equals `countedPoints` once an era counting rule is active.

For 1980 drivers, the engine recomputes the best five results independently inside rounds 1-7 and 8-14 after every race. Constructors retain all points from all scoring finishes.

## Rule resolution

`src/sim/championshipRules.js` resolves the championship contract from `SeasonPack.rulesDetail` and the canonical points system. This deliberately avoids hardcoding a `season === 1980` branch in the championship engine.

A future Season Database can provide an explicit `world.championshipRules` contract instead; the same engine can consume it without rewriting standings logic.

## Final champions and tie-breaks

A champion is never declared before the championship calendar is complete.

A final champion is declared when:

1. the points system is known;
2. era-specific driver and constructor counting rules are complete;
3. the expected championship rounds have been completed; and
4. the leading counted-points total is unique, or a separately sourced tie-break contract resolves the tie.

SeasonPack 1980 currently supports the scoring/counting rules but does not provide a complete machine-readable tie-break hierarchy. Therefore a final tie on counted points is stored as `final_tiebreak_unresolved`; the engine must not invent a champion by silently treating its display sort fallback as an official rule.

The display standings can still use wins/podiums as a deterministic secondary sort for presentation, but this does not constitute an official championship tie-break until that rule is explicitly sourced and modelled.

## Season rollover

The archived championship preserves gross, counted and dropped results plus any officially resolved champion IDs. If the next season has no complete Season Database championship contract, the new championship remains provisional rather than silently reusing a historical rule from the previous year.
