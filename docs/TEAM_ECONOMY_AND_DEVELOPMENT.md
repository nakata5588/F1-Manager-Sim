# Team Economy and Development

## Purpose

Teams must evolve through the same persistent Save World as drivers and staff. Historical finance/car data defines the starting condition only.

## Season Database inputs

The runtime can consume season-scoped inputs for:

- starting cash or budget;
- driver and staff salaries;
- sponsor income;
- facility maintenance;
- optional operating costs;
- starting car component performance;
- facility levels.

Missing financial data is not silently invented. A team with no known budget starts with an `unknown` financial status until a season package supplies a value.

## Monthly cashflow

On each month boundary the economy system records:

- sponsor income;
- driver salaries;
- staff salaries;
- facility maintenance;
- operating costs;
- monthly net result;
- closing cash.

Multi-season contracts remain financially active until their actual contract end rather than disappearing because their source row was created in an earlier year.

## Dynamic car state

The starting `carStats` row is copied into mutable `carState`. From that point the historical car is no longer authoritative.

Car component performance can therefore diverge from real history and later feed the race engine.

## AI development

AI teams inspect their weakest known car component, their available cash and facility efficiency. They can start one development project at a time when sufficient cash remains above a reserve.

Projects have:

- a real cash cost;
- a target component;
- a deterministic target gain;
- a duration in months;
- explicit started/completed history.

Facility quality affects project speed and gain. Randomness is seeded by save, date and team so results remain reproducible.

Human-controlled teams do not auto-start R&D projects. Later player-facing management systems will create projects through the same underlying project model.

## Architectural boundary

The Master Database can continue growing independently. The Season Database materializes only the economic and technical starting data required for the chosen season, and the Save World owns every subsequent financial and development change.
