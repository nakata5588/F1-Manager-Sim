# Phase 35 — Sponsors, Marketability & Commercial

Phase 35 turns sponsorship from passive historical income into a persistent commercial market inside the Save World.

The historical database remains immutable. Historical sponsor rows and gameplay calibration models may seed a new career, but every renewal, negotiation, activity, bonus, satisfaction change and marketability change after career creation belongs to the evolving Save World.

## Data boundary

Three value provenances are kept distinct:

- `historical_contract:*` — a monetary value explicitly present on a historical sponsor contract;
- `gameplay_model_estimate` — a Sponsor/Finance model estimate used for simulation calibration where exact money is unavailable;
- `simulation_negotiation` — a value created by an in-career sponsor agreement.

A fourth state, `abstract_only`, is retained when no reliable monetary basis exists.

`Sponsor_Model` is never added on top of historical sponsor contracts. Once the commercial system initializes, historical active contracts are materialized once into mutable Save World deals and that commercial portfolio becomes the single source for ongoing sponsor cash. This prevents double counting.

## Commercial state

Persistent state lives under:

`saveWorld.world.management.commercial`

It contains:

- team commercial profiles;
- active and historical sponsor deals;
- sponsor negotiations;
- sponsor activities;
- deterministic ID counters.

Commercial history is stored under:

`saveWorld.history.commercial`

Finance consequences such as sponsor income, upfront payments and performance bonuses are also recorded in normal finance history.

## Era-aware commercial model

The commercial market changes by era instead of applying a 2020s sponsorship structure to every historical season.

Current commercial eras are:

- `pre-sponsorship` — before 1968;
- `early-commercial` — 1968–1987;
- `global-expansion` — 1988–2005;
- `corporate-global` — 2006–2016;
- `digital-global` — 2017 onward.

Era profiles influence the available title/major/partner slots, sponsor activation intensity and value scaling.

The model is simulation policy rather than a claim that every real team used an identical sponsorship structure in that period.

## Team marketability

Team marketability is dynamic. It is not copied once from the historical database and frozen.

The current score combines:

- team reputation;
- employed-driver marketability;
- recent race performance;
- current Constructors' Championship position;
- relevant commercial/hospitality facility quality when available;
- a limited calibration signal from the starting Sponsor Model when available.

A team that overperforms in an alternative history can therefore become more commercially attractive. A historically prestigious team can also lose commercial strength if the simulated world moves against it.

## Driver marketability

Driver marketability currently reacts to:

- reputation;
- recent wins and podiums;
- confidence from the people/mentality system.

This allows driver recruitment to have a commercial consequence without reducing a driver to a single performance rating.

## Sponsor market

Sponsors are exposed through the existing world-visibility boundary. Hidden future sponsors are not leaked to the player.

Sponsor interest responds to:

- team marketability;
- sponsor prestige;
- national market fit;
- requested sponsorship tier;
- sponsor portfolio saturation;
- category conflicts.

Unknown sponsor categories are kept explicitly uncategorized rather than being assigned an invented historical industry.

## Tiers and category exclusivity

The first tiers are:

- title;
- major;
- partner.

Active partners can block another sponsor from the same known category. The exclusivity rule uses explicit source categories when available; missing categories do not create false conflicts.

Each era defines slot capacity for the three tiers.

## Negotiations and renewals

Player and AI teams use the same negotiation pipeline:

`Open negotiation -> Submit terms -> Accept / Counter / Reject -> Deal activation`

Terms currently include:

- annual value;
- duration;
- upfront payment percentage;
- performance bonus percentage;
- sponsor activities per season.

Counter-offers enter the generic management Inbox as decisions. Renewal reminders are generated for player-managed commercial departments as current agreements approach expiry.

AI and delegated commercial departments use the same domain functions as the player. There is no separate simplified sponsor-signing engine for AI teams.

## Sponsor satisfaction and activities

Active sponsor deals keep a satisfaction score.

Commercial activities create real choices:

- fulfil the commitment — sponsor satisfaction and team marketability improve;
- skip it — sponsor satisfaction falls.

Player-managed activities appear as Inbox decisions and in the Commercial Hub. AI/delegated teams resolve their own obligations deterministically from the save seed.

## Performance objectives and bonuses

Sponsor tiers may include race-performance objectives.

After a race, the commercial system can:

- change sponsor satisfaction based on the team's best result;
- pay a performance bonus when the target is met;
- write the payment into team cash and finance history;
- recalculate team marketability.

The race result remains the authoritative sporting outcome; the commercial system only consumes it after classification exists.

## Finance integration

Before Phase 35, Team Economy read historical `sponsorContracts` directly every month.

After commercial initialization:

`Historical starting contracts -> Save World commercial deals -> monthly Team Economy sponsor income`

This gives one mutable commercial source of truth and allows contracts to expire, renew or be replaced naturally.

## Responsibilities and delegation

The Phase 34 `Commercial` responsibility now has gameplay effect.

- `manager` — sponsor approaches, renewals and activities require player action;
- `delegated` — the controlled team uses the same commercial market and negotiation rules as AI teams.

When a manager leaves a team, the former team automatically resumes normal AI commercial behavior through the existing dynamic-control boundary.

## Inbox and Management Hub

Commercial events use the persistent generic Inbox for:

- sponsor counter-offers;
- renewal reminders;
- sponsor activities;
- signed agreements;
- rejected/expired negotiations;
- expired agreements;
- performance bonuses.

The Developer Playtest Management Hub exposes a `Commercial` tab with:

- team marketability;
- monthly sponsor income;
- slot usage by tier;
- current sponsor portfolio and satisfaction;
- renewal actions;
- sponsor market search;
- interest and expected terms;
- negotiations and offers;
- pending sponsor activities.

Browser code remains a projection/instruction layer. It never decides sponsor interest, calculates marketability or writes contracts directly.

## Long-run behavior

The real 1980 SeasonPack long-run regression continues to simulate ten autonomous seasons with the commercial system active.

Additional Phase 35 tests cover:

- materializing historical sponsor contracts once;
- no sponsor-income double counting;
- category exclusivity;
- player negotiations and upfront payments;
- counter-offers;
- sponsor activities;
- performance bonuses;
- delegated commercial behavior;
- normal Save World serialization;
- era-aware sponsor-market projections.
