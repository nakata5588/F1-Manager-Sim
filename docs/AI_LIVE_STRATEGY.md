# AI Live Race Strategy

## Purpose

AI teams use the same live tyre-strategy contract as the player. There is no second AI race simulator and no direct result manipulation.

The decision layer produces the same `box` instruction consumed by `reviseRaceStrategy`, and the temporal engine then executes the resulting stint/pit plan.

## Which strategies may be automated

Live AI may manage plans whose source is:

- `ai_generated`;
- `ai_unspecified`;
- `ai_live`;
- `delegated`;
- `delegated_unspecified`.

It never rewrites `player` or `player_live` plans. This preserves the distinction between direct control and delegation without requiring special race physics for either path.

## Current decisions

### Weather mismatch

At the start of a lap, the AI compares the current/next tyre condition with the actual race condition. If a supplier-compatible tyre exists for the new condition, it can schedule a stop at the end of that lap.

The AI does not invent wet/dry compounds. If the canonical tyre model does not expose a suitable compound, no switch is made.

### Tyre wear

A heavily worn tyre can trigger a stop when enough race distance remains. The AI avoids replacing a stop that is already due within the next few laps.

### Safety Car / VSC opportunity

When the era actually exposes Safety Car or VSC and one is live, the AI can lower its wear threshold for a stop. The temporal engine models the relative pit-loss opportunity with deterministic simulation tuning:

- Safety Car: lower relative pit-loss factor;
- VSC: smaller reduction;
- no reduction for local yellow/red flag.

These factors are gameplay calibration, not claims about exact historical seconds, and race events record `lossModel: neutralisation_simulation_tuning` when applied.

1980 remains unaffected by modern Safety Car/VSC logic because those mechanisms are unavailable in its era rules.

## Determinism and save/resume

AI live revisions are deterministic for the same Save World, race state and seed.

Resume tokens persist AI-managed strategy state. On resume, stored AI plans are restored only if the current plan is still AI-managed. A `player_live` instruction issued while paused therefore has priority and is never overwritten by the resume token.

An uninterrupted race and a pause/serialize/resume race must produce identical decisions and results when the player makes no new intervention.

## Auditability

Each autonomous revision becomes a temporal event with:

- lap;
- driver/team;
- trigger (`weather_mismatch`, `tyre_wear`, `race_control_window`);
- requested compound;
- scheduled pit lap;
- observed wear when relevant;
- active Race Control mechanism when relevant.

The final timeline also exposes `aiStrategyRevisions` for compact analysis.

## Next improvements

Future balancing can add team strategy skill, risk appetite, championship context, undercut/overcut evaluation, rival response and forecast uncertainty. Those should alter decision quality, not create a separate race model.
