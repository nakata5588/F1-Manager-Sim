# Race Damage and Repairability

## Purpose

Phase 18 separates three concepts that were previously equivalent in the temporal race engine:

1. an **incident** happens;
2. the incident can create **damage**;
3. only sufficiently severe outcomes force a **retirement**.

This allows cars to continue with degraded performance and makes pit repairs part of race strategy without introducing a second race model.

## Historical/data policy

Damage type, exact severity and repair time are simulation outcomes. They are not presented as historical facts for real races.

When the Season Database supplies an explicit repair rule such as `pit_repairs_allowed` / `race_repairs_allowed`, that rule is authoritative. Otherwise the engine uses the labelled fallback:

`simulation_default_limited_repairs`

The fallback allows only limited in-race repairs and keeps component-specific repairability thresholds.

## Incident damage

A sector incident receives a deterministic severity score. Severity and sector traits influence a deterministic damage type:

- aero;
- suspension;
- brakes;
- bodywork.

An incident may then be:

- `terminal` — immediate retirement;
- `repairable` — the car can continue with pace loss and the damage can be addressed during a pit stop;
- `persistent` — the car can continue, but the damage cannot be repaired during the race under the current model.

Critical severity is always terminal; lower severity has a controlled probability of terminal damage.

## Performance effect

Survivable damage creates an abstract `paceLossIndex`. The temporal engine adds that loss sector by sector while the damage remains active.

Multiple damage items can accumulate. The total active loss is the sum of non-repaired, non-terminal items.

The final classification records:

- `damagePaceLoss`;
- `damageAtFinish`;
- `repairsCompleted`.

## Pit repair

If a damaged car makes a scheduled/live pit stop, all currently repairable damage is serviced automatically in this foundation version.

Repair execution considers the team's available staff through:

- technical skill;
- pit-stop management.

A repair adds an explicit `repairLossIndex` on top of the normal pit-stop loss. The race history records a separate `repair` event containing repaired damage IDs/types, execution capability and recovered pace loss.

A future player-facing Race Day layer can add the choice to skip or prioritise individual repairs. Phase 18 intentionally establishes the authoritative mechanics first.

## Race Control

Race Control now reacts to the **incident itself**, even when the car survives. Therefore a survivable crash can still produce a local yellow, red flag review, Safety Car or VSC when the era permits it.

Legacy timelines containing only `retirement(reason=incident)` remain supported. The post-race audit de-duplicates an incident plus its terminal retirement.

## AI strategy

AI/delegated strategies can recognise repairable damage. If the pace loss justifies a stop, the AI can issue the same live `box` instruction used for tyre decisions.

Safety Car/VSC can lower the AI threshold for a repair stop, but only in eras where those mechanisms actually exist.

`player` and `player_live` plans are never automatically rewritten.

## Persistence

Damage state is part of the JSON-safe temporal resume state. Saving and loading a race does not heal the car.

The current temporal contract is:

- resume state version: `4`;
- timeline model: `sector_lap_v3_damage_resumable`.

Older resume-state versions remain accepted and receive empty/default damage state when restored.

## Future extensions

Likely extensions include:

- component-specific handling/power/reliability penalties;
- punctures and tyre damage;
- progressive mechanical degradation;
- optional/priority repairs controlled by player or team AI;
- spare-parts availability and cost;
- post-race car rebuild consequences;
- driver injury/safety consequences kept separate from car damage;
- richer era-specific repair restrictions when supplied by the Season Database.
