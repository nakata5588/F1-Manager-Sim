# Phase 37 — Suppliers, Reliability & Preseason

Phase 37 extends the physical technical lifecycle introduced in Phase 36. The car is no longer only a set of fitted specifications: the engine supplier can change through contracts, fitted units accumulate condition loss, mechanical failures damage persistent physical state, spares matter, and preseason testing creates preparation rather than a scripted performance result.

## Core boundary

The historical database still defines starting conditions only.

`Historical team-engine assignment -> Save World supplier contract -> Future negotiation -> Season activation`

`Fitted specification -> Physical unit condition -> Race wear / failure -> Replace / rebuild -> Next race`

`Preseason test -> Development knowledge / reliability preparation / setup knowledge -> Season consequences`

Historical `teamEngines` remains the opening supplier assignment. Historical component/facility baselines remain immutable. Everything negotiated, worn, repaired, manufactured or tested after career start belongs to Save World.

## Engine suppliers

`world.technical.suppliers` owns mutable supplier state.

Each team has:

- an active supplier contract;
- at most one agreed future supplier deal;
- persistent negotiations and offer history.

The initial supplier assignment is seeded from `teamEngines` and labelled `historical_season_assignment`.

If the historical source does not provide a reliable monetary value, the opening contract does **not** receive invented cash terms. It uses an abstract/unknown value mode and therefore does not create a fictional monthly supplier expense.

Player, AI and delegated teams use the same supplier market and deterministic negotiation model. Supplier interest considers team reputation, engine quality and the incumbent relationship. New agreements normally begin in the following season, so signing a faster engine does not swap the current car's power unit early.

When a negotiated currency contract activates, its annual value becomes a real Team Economy expense. If no replacement deal exists at season rollover, the incumbent can be continued for one season through an explicitly labelled `simulation_continuity_renewal`, preventing an operationally impossible team with no power unit.

## Engine supplier performance

Race-start and autonomous race calculations now read the active Save World supplier rather than treating the original historical `teamEngines` assignment as permanently authoritative.

This means alternative history can genuinely diverge: a team may move to another engine supplier and subsequently inherit that supplier's power and reliability characteristics.

## Persistent physical condition

Each technical team owns per-car reliability state:

`world.technical.teams[teamId].reliability.cars.car1`

`world.technical.teams[teamId].reliability.cars.car2`

Each fitted component unit tracks:

- specification ID;
- condition;
- races used;
- failures;
- failed/serviceable state;
- fit/service dates and provenance.

Each car also owns an engine unit with the same type of persistent condition information.

A starting condition of `100` is a **derived serviceable gameplay baseline**, not a claim that historical teams began the selected date with mathematically perfect or brand-new parts. It exists because the source database currently describes fitted starting specifications but does not source individual-unit wear.

## Race wear

A completed race applies deterministic wear to the physical units that actually ran.

Wear responds to:

- completed race distance;
- component type;
- specification reliability where available;
- engine reliability;
- preseason reliability preparation;
- deterministic seeded variation.

The most wear-sensitive systems include engine, gearbox, cooling, electronics and brakes. Chassis/aero/suspension also wear, but at different rates.

The resulting condition persists into the next event. A worn car therefore does not silently reset between races.

## Reliability and performance consequences

Physical condition modifies effective race reliability. Severe condition loss can also reduce the race-start performance index.

This applies to both:

- the interactive/live race path through `createRaceStartBaseline()`;
- the autonomous/headless race weekend simulation.

The same Save World therefore drives player races and long-run AI simulation.

## Mechanical failures

When the race engine produces a mechanical DNF, Phase 37 maps that failure onto a deterministic physical subsystem for the affected car.

The failed unit becomes:

- condition `0`;
- `failed = true`;
- unavailable as a serviceable returned spare.

The simulation does not retroactively invent a historically documented failure cause. The subsystem selection is explicitly simulation state derived from the race's mechanical-failure outcome.

## Spares and replacement

Replacement now consumes physical stock.

A component can be replaced only when a manufactured unit of the same specification is available. Replacement:

1. consumes one matching spare;
2. restores the fitted physical unit to serviceable condition;
3. preserves the specification/rating;
4. records the maintenance action in Save World history.

When a new specification is fitted, the old fitted unit returns to stock only if it is still serviceable. A badly worn or failed component is removed as unusable rather than magically becoming a fresh spare.

This closes an important physical loop from Phase 36:

`Design -> Manufacture -> Inventory -> Fit -> Wear -> Replace / Rebuild -> Inventory pressure`

## Rebuild and engine service

A team can rebuild a fitted component when stock is unavailable. Rebuilds cost real cash and restore the unit to a strong but not perfect serviceable condition.

Engine units can likewise be serviced/rebuilt. Engine service uses the active supplier profile, costs real team cash and restores serviceability without pretending the historical source supplied a real-world overhaul invoice.

AI and delegated technical departments use these same actions when condition becomes critical and finances permit.

## Reliability-focused design

Phase 36 already exposed design focus values. Phase 37 makes the `reliability` focus mechanically meaningful.

Completed simulation-designed specifications now gain a persistent `reliabilityRating` derived from:

- reliability focus;
- the current fitted component reliability baseline;
- project execution quality;
- controlled deterministic variation.

Performance-focused development can trade some reliability certainty for pace, while reliability-focused work produces a larger reliability improvement.

These are simulation-created specification properties, not historical source facts.

## Preseason testing

Each team receives a seasonal preseason programme with up to three supported test sessions.

Test focus can be:

- `balanced`;
- `reliability`;
- `development`.

Effectiveness responds to technical staff, driver technical feedback/adaptability, relevant facilities and deterministic seeded variation.

Testing costs real cash and generates three Save World preparation values:

- **Development Knowledge** — modestly improves subsequent design execution, especially future-season research;
- **Reliability Preparation** — reduces race wear and slightly improves effective reliability;
- **Setup Knowledge** — improves practice/setup learning in the race-weekend model.

The test window closes when the first race date is reached. Testing therefore cannot be spammed during the season.

AI teams and a controlled team with `Car Development = Delegated` use the same preseason system. The player's manager-controlled team must issue its own testing decisions.

## Finance integration

Phase 37 adds new real cash flows to the existing team economy:

- negotiated engine-supplier contracts become monthly expenses after activation;
- component rebuilds consume cash;
- engine service/rebuild consumes cash;
- preseason tests consume cash;
- spare manufacturing continues to use the Phase 36 manufacturing costs.

Unknown historical supplier values do not become fabricated money merely to make the ledger look complete.

## Inbox

Controlled-team technical events generate Inbox information for:

- supplier counter-offers;
- future supplier agreements;
- supplier activation/continuity;
- critical wear warnings;
- mechanical component failure;
- component replacement/rebuild;
- engine service;
- preseason test completion;
- design completion with reliability/preseason effects.

Routine noncritical wear is deliberately not spammed into the Inbox.

## Technical Operations UI

The Developer Technical Operations page now exposes:

- current and future engine supplier;
- engine supplier market, interest and expected simulation terms;
- supplier negotiation/counter controls;
- preseason programme and focus;
- per-car engine and component condition;
- matching spare stock;
- replace/rebuild/service actions;
- existing R&D, manufacturing, fitment and facility controls.

The browser remains a projection/action surface. It does not calculate negotiation outcomes, wear, failures, repair costs, supplier performance or test effectiveness.

## AI / delegation parity

AI teams and delegated player teams share the same Phase 37 domain:

1. preseason testing;
2. supplier-market evaluation;
3. supplier negotiation;
4. race wear and failures;
5. spare manufacturing;
6. component replacement/rebuild;
7. engine service.

A player-managed technical department does not receive hidden simplified advantages.

## Persistence

Supplier contracts, negotiations, preseason preparation, physical component condition and engine condition all survive normal Save World serialization.

No Phase 37 post-start state is written back into the Historical World Database or Season Database.

## Explicit Phase 37 limits

Phase 37 deliberately does not yet implement:

- period-perfect real engine-contract clauses where the database does not source them;
- exact historical individual engine/chassis serial-number allocations;
- real-world sourced spare-part counts;
- detailed workshop repair lead times measured in days/hours;
- parc fermé / homologation restrictions;
- technical regulation change envelopes;
- supplier exclusivity politics and works/customer priority beyond the current interest model;
- full preseason track-session simulation with lap-by-lap mileage;
- driver injury consequences from failures/incidents.

Those are later systems. Phase 37's responsibility is to establish one coherent supplier/reliability/preseason foundation without pretending missing historical details are known.
