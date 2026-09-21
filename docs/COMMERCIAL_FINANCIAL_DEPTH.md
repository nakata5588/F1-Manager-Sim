# Stage 17 — Commercial & Financial Depth

## Goal

Stage 17 turns the existing finance-related systems into one coherent medium/long-term management layer without introducing a parallel economy.

The authority remains:

`Historical/Season starting inputs -> Save World systems -> world.teamState -> Financial Planning projection -> Decisions -> Save World consequences`

Cash is never owned by the UI or by Financial Planning itself.

## Existing authorities preserved

Stage 17 deliberately reuses:

- Team Economy for cash and monthly close;
- Commercial for sponsor contracts, renewals, activities and bonuses;
- Employment/contracts for driver and staff terms;
- Suppliers for engine agreements;
- Technical Operations for R&D, manufacturing and facilities;
- Reliability for component/engine maintenance;
- Offseason planning for strategic risk posture.

Financial Planning only connects these systems and provides a common affordability/risk contract.

## Financial strategies

Teams can operate with three Save World policies:

- **Conservative** — protects the largest reserve and requires more recurring runway;
- **Balanced** — default compromise between investment and resilience;
- **Aggressive** — protects a smaller reserve and allows earlier discretionary investment.

The strategy changes decision thresholds, not simulation results directly.

## Projection

For each team the financial projection exposes:

- cash and opening cash;
- monthly income / expenses / net;
- annualised net;
- protected reserve target;
- cash available to commit;
- runway in months where applicable;
- salary burden;
- sponsor coverage;
- recurring-cost and income breakdown;
- financial risk: Stable / Tight / Distressed / Critical;
- source/provenance for model-calibrated operating burn.

## Finance_Model policy

The 1980 Season Pack contains a gameplay `Finance_Model`. These values are not exact historical currency claims.

When the runtime has no explicit operating-cost row, Stage 17 may use `estimated_monthly_operating_burn` as an opening planning/risk calibration signal, but not as a monthly ledger debit.

Known recurring costs are calculated first:

`driver payroll + staff payroll + facilities + engine supplier`

The modeled burn remains a planning/calibration signal rather than a ledger transaction. Known payroll, facilities, supplier costs and any explicit operating-cost rows are the only recurring expenses posted to cash. This prevents a starting gameplay estimate from becoming an invented permanent historical bill.

## Affordability

The shared commitment assessment distinguishes immediate cash cost, recurring monthly cost, protected reserve, post-commitment runway and discretionary versus mandatory expenditure.

It is used by technical design/R&D, component manufacturing, facility upgrades, preseason testing, driver contract offers/counters, staff contract offers/counters and supplier offers/counters.

Emergency manufacturing and mandatory reliability work may use protected reserves, but still require actual cash. Abstract compensation remains abstract; Stage 17 does not fabricate currency merely to make the affordability model work.

## AI

AI teams use the same finance projection as player-controlled teams.

- Distressed/Critical teams defer discretionary R&D/facility investment;
- contract and supplier commitments are constrained by recurring affordability;
- Distressed/Critical teams prioritise higher-value viable sponsor opportunities;
- reliability necessities remain possible while cash exists.

This is not a separate difficulty handicap or simplified AI economy.

## Offseason

The existing offseason `financialRisk` choice now becomes the next season's Financial Planning strategy. A Conservative/Balanced/Aggressive choice therefore has persistent gameplay effect beyond the offseason screen.

## UI

The Management Hub's **Finances & Sponsors** area now presents reserve target, available-to-commit cash, cash runway, salary burden, sponsor coverage, annualised net, recurring-cost breakdown and financial strategy controls.

The browser calls server/domain actions; it never calculates authoritative affordability.

## Validation

Stage 17 must pass the full Node regression suite, database tooling, financial-depth tests, the real 1980 Playable Validation Gate and the CI 20-season multi-seed ecosystem gate.

The Stage 16.5 diagnostic baseline was 12 financially distressed teams out of 18 after 20 seasons in both sampled seeds. Stage 17 uses that number as a comparison signal, not as a scripted target or historical fact.


## Stage 19 extension — crisis and ownership

Stage 19 keeps Stage 17's `world.teamState` cash authority and layers a persistent crisis state over it:

`Team Economy -> Financial Planning -> Financial Crisis -> Rescue / Debt / Administration -> Team Evolution`

Financial distress no longer removes a team through a single annual probability roll. Crisis escalation is month-based and can impose a spending freeze before reaching emergency or administration.

Owner funding, bridge finance and ownership recapitalisation are explicit Save World transactions. Bridge finance creates debt whose interest and principal service are posted through the normal monthly Team Economy. Ownership rescue preserves the constructor's stable `teamId`.

Opening owner support/patience/risk values are deterministic gameplay profiles with explicit derived provenance. They are not claims about exact historical owner wealth or future ownership outcomes.

Controlled teams receive crisis-response decisions through the Inbox; AI teams use the same underlying intervention functions. A withdrawal remains subject to the active regulation package's minimum-grid rule.
