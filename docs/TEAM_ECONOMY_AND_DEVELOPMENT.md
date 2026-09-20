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

Missing financial data is not silently invented. A team with no known budget starts with an `unknown` financial status until a season package supplies a value. When a Season Pack includes `Finance_Model`, its estimates are explicitly gameplay calibration rather than historical accounting.

## Monthly cashflow

On each month boundary the economy system records:

- sponsor income;
- driver salaries;
- staff salaries;
- facility maintenance;
- operating costs;
- monthly net result;
- closing cash;
- protected reserve target;
- available commitment capacity;
- runway and financial-risk state;
- an explicit recurring-cost breakdown.

Multi-season contracts remain financially active until their actual contract end rather than disappearing because their source row was created in an earlier year.

## Financial planning

Stage 17 keeps cash authority in `world.teamState` and adds a planning projection over the same state.

The projection derives:

- Conservative / Balanced / Aggressive reserve policy;
- protected cash reserve;
- cash available for discretionary commitments;
- current runway when recurring cashflow is negative;
- salary burden and sponsor coverage;
- annualised net position;
- Stable / Tight / Distressed / Critical risk.

Discretionary technical investment, preseason testing and new currency-denominated driver/staff/supplier commitments use this shared affordability boundary. Mandatory reliability repairs may breach the protected reserve but cannot spend cash that does not exist.

`Finance_Model.estimated_monthly_operating_burn` is a planning/calibration signal only. It can shape the opening risk/reserve projection, but it is not posted to the monthly ledger as an invented operating bill. Monthly cashflow contains only authoritative/explicit recurring costs. This avoids double-counting and prevents a one-season gameplay estimate from compounding as historical truth across alternative seasons.

## Dynamic car state

The starting `carStats` row is copied into mutable `carState`. From that point the historical car is no longer authoritative.

Car component performance can therefore diverge from real history and later feed the race engine.

## AI development

AI teams inspect technical need, technical identity, facilities and the same Financial Planning projection used by the player. They defer discretionary development when risk is Distressed/Critical or protected commitment room is insufficient.

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
