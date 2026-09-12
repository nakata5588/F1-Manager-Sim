# Phase 36 — Technical Development & Operations

Phase 36 replaces direct monthly car-rating gains with a persistent technical lifecycle inside the Save World.

## Core boundary

The historical database remains an immutable starting source. Technical projects, new specifications, manufactured parts, fitment, facility upgrades and operating costs after career start are simulation state.

The lifecycle is:

`Historical starting car -> Design / Research -> Specification -> Manufacture -> Inventory -> Fit to Car -> Race`

A completed design is not a fitted upgrade. The car only changes after a physical unit has been manufactured and fitted.

## Technical Save World state

`world.technical.teams[teamId]` owns the mutable technical operation state:

- starting component baselines;
- technical specifications;
- inventory;
- Car 1 / Car 2 fitment;
- design projects;
- manufacturing jobs;
- facility state;
- facility upgrade projects.

`world.carState[teamId].components` remains the compatibility projection consumed by the existing performance-calibration path. It is refreshed from fitted specifications and is not a second technical authority.

## Starting specifications

Historical car component values become fitted starting specifications on both cars. They are labelled `historical_start_input`.

The game does not invent spare stock at career creation. Starting fitment means the component is physically on the car; it does not imply additional units in inventory.

## Player-controlled R&D

When `Car Development` responsibility belongs to the manager, the player may start a design programme for a component that actually exists on the era-specific starting car.

Design inputs include:

- component;
- focus (`balanced`, `performance`, `reliability`);
- current-season development or next-season research.

Project cost and duration are simulation values. Efficiency responds to employed technical staff, relevant facilities and driver technical feedback. Randomness is deterministic from the Save World seed and is controlled rather than dominant.

## Current vs next-season development

Current-season projects create a specification that can be manufactured after design completion.

Next-season research creates a `future` specification. It cannot be manufactured or fitted during the current season. On the target `SEASON_STARTED`, the specification is released to manufacturing.

This creates the first real trade-off between spending technical resources on the current championship and the following car.

## Manufacturing

Manufacturing is separate from design.

A manufacturing job:

- requires a valid current-season specification;
- consumes real team cash;
- has a quantity;
- uses manufacturing capacity;
- has a lead time;
- may use emergency production at increased cost.

Completion adds physical stock to inventory. No car improves merely because manufacturing finishes.

## Car-specific fitment

Car 1 and Car 2 maintain separate fitted specification IDs.

Fitting:

- consumes one unit of the new specification from stock;
- returns the replaced specification to stock;
- updates the team compatibility car-state projection;
- affects the specific driver's race-start car projection.

This allows limited stock to create a genuine decision over which driver receives an upgrade first.

## Race integration

`createRaceStartBaseline()` now reads the technical fitment associated with the driver's car slot when technical state exists.

The existing calibrated team car remains the baseline, while car-specific fitment applies the appropriate component delta. A unit test or legacy path with no technical state remains read-only and falls back to the existing team car data.

## Facilities

Known starting facility levels become technical starting inputs without mutating the historical rows.

Phase 36 supports the facility concepts already represented by source fields where available:

- Wind Tunnel;
- Simulator;
- Aero Department;
- Chassis Shop;
- Manufacturing.

If manufacturing capability is absent, an explicit `derived_gameplay_baseline` is used because physical production requires operational capacity. It is not presented as a sourced historical fact.

Facility upgrades:

- cost real team cash;
- take multiple months;
- improve the mutable Save World facility level;
- add ongoing maintenance cost;
- never rewrite the historical `facilities` row.

## Finance integration

Design, manufacturing and facility construction consume real `world.teamState[teamId].cash`.

Facility upgrades add a dynamic annual maintenance delta, consumed by Team Economy on top of historical starting maintenance.

No derived technical value is retroactively written into the historical database.

## AI and delegation

AI teams and a player team with `Car Development = Delegated` use the same technical domain:

1. progress active work;
2. manufacture better completed specifications;
3. fit available upgrades to the cars;
4. start a new design for the weakest area when finances permit;
5. occasionally invest in the weakest facility when financially strong.

The player does not have a separate simplified R&D model.

## Inbox

Controlled-team technical milestones generate Inbox information, including:

- design completion;
- manufacturing completion;
- facility upgrade completion;
- next-season research becoming production-ready.

The Inbox remains informational for these milestones; authoritative state was already changed by the relevant simulation event.

## Developer Technical Operations UI

The local playtest server exposes:

- `GET /api/technical`
- `POST /api/technical/design`
- `POST /api/technical/manufacture`
- `POST /api/technical/fit`
- `POST /api/technical/facility`

Open:

`http://127.0.0.1:3000/technical.html`

The page exposes current fitment, active design programmes, specifications, stock, manufacturing capacity/jobs and facilities.

The browser never calculates project outcomes, costs, manufacturing completion or car performance. It only sends management instructions to the server-side Save World.

## Explicit Phase 36 limits

Phase 36 deliberately does not yet implement:

- engine/supplier contract negotiations;
- full component wear and race-to-race inventory consumption;
- crash-damage inventory replacement;
- preseason testing;
- regulation-change research multipliers;
- homologation rules;
- a full multi-project staff allocation UI.

Those are natural follow-ups rather than reasons to duplicate or over-expand this phase.
