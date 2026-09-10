# Race Strategy, Tyres and Pit Stops

## Scope

This layer sits between Grid and final Race classification. It does not replace the Race Weekend engine.

The core order is:

`Grid -> Strategy Lock -> Race -> Strategy Application -> Championship`

The strategy system is authoritative in the Save World. The UI will later write player plans into the same structure instead of owning strategy state itself.

## Tyre catalogue

The Season Database may provide a season-scoped tyre catalogue through canonical `tyres` data. The historical loader also accepts adapter aliases while the database format is evolving.

Recognised concepts include:

- compound ID/name;
- dry and wet grip;
- condition/type;
- explicit durability or expected stint life.

A tyre with explicit validity years is included only when valid for the chosen starting season.

If no tyre data exists, the simulation does **not** invent historical compounds. The race receives an `unspecified` one-stint strategy with zero planned stops. This keeps the career playable without making a false historical claim.

## Strategy generation

A strategy may come from:

- `player` — an explicit plan for a human-controlled team;
- `delegated` — the human team has delegated the decision;
- `ai_generated` — an AI team selected the plan;
- `*_unspecified` — the Season Database has no tyre data.

When tyre durability is available, the AI estimates effective stint life using compound durability and driver tyre-management skill. It compares viable compounds and creates enough stints to cover the race distance.

There is no artificial mandatory two-compound rule unless a future era-rule strategy explicitly supplies one.

## Pit stops

Every transition between planned stints creates a pit stop.

Pit-stop execution is influenced by employed staff `pitstop_management` and deterministic uncertainty from the save seed.

If the circuit/race data supplies a pit-lane time loss, the stop stores an estimated time loss in seconds. If no such historical/season data exists, the stop uses an abstract performance penalty and keeps `timeLossSeconds = null` rather than inventing a fake number.

## Race effect

Strategy produces a bounded performance modifier based on:

- average compound grip;
- over-running an explicitly known tyre life;
- number of stops;
- pit-stop execution quality;
- track pit-loss data when available.

The modifier is applied to the underlying multidimensional race performance before Championship scoring consumes the result.

## Player control

A player strategy is stored under the Save World race strategy plans for the weekend and driver. The simulation validates the requested compounds and stint lengths before using it.

If no player plan is present, a human-controlled team can continue in delegated mode. This supports Football Manager-style delegation rather than forcing the player to micromanage every race.

## Still to come

This is a stint-level foundation, not lap-by-lap strategy simulation. Future layers include:

- lap-level tyre wear and temperature;
- evolving track grip;
- fuel mass and era-specific refuelling;
- live strategy reactions;
- undercut/overcut logic;
- traffic after pit stops;
- pit-crew errors and component damage;
- changing weather and crossover decisions;
- safety-car/red-flag strategy;
- era-specific tyre allocation and mandatory-compound regulations.

These systems should extend this contract rather than replace it.
