# Stage 19 — Team Financial Crisis & Ownership

## Goal

Stage 19 turns financial distress into a persistent gameplay state with rescue, restructuring and ownership consequences instead of allowing a team to disappear through a single annual probability roll.

The core flow is:

`Team Economy -> Financial Planning -> Financial Crisis -> Board / Owner / Creditor Response -> Recovery / Ownership Change / Administration / Withdrawal`

## Authority boundaries

- `world.teamState` remains the cash and monthly-cashflow authority.
- `world.financialCrisis` owns crisis stage, owner support, emergency debt, interventions and dynamic ownership changes.
- `world.governance.teamEvolution` owns active/inactive team identity and grid structure.
- `teamId` remains stable through ownership changes.
- UI and Inbox are projections/decision surfaces only.

## Crisis stages

The current crisis ladder is:

`stable -> watch -> warning -> spending_freeze -> emergency -> administration`

Escalation is driven by persistent monthly financial pressure and negative cash rather than one isolated poor month. Recovery also requires sustained improvement before crisis restrictions are cleared.

## Spending freeze

From the spending-freeze stage onward, new discretionary commitments are blocked through the same Stage 17 affordability boundary.

Essential reliability and supplier commitments remain eligible for the existing cash/reserve checks. The crisis system therefore constrains the normal management systems rather than creating separate technical or contract rules.

## Owner support

Opening ownership is represented by a deterministic gameplay profile containing support, patience and risk-appetite indices plus a finite support budget.

These values are explicitly `derived_gameplay_ownership_profile`. They do not claim historically exact owner wealth, intentions or future decisions.

An owner may inject emergency capital. Repeated rescues consume the available support budget and become less likely. A newly completed ownership rescue may also include a 36-month Save World operating guarantee sized against the team's current recurring deficit; that support is posted through normal Team Economy income rather than silently changing costs.

## Bridge finance

If owner support is unavailable or insufficient, a team in emergency can arrange bridge finance.

Bridge finance is deliberately not an endlessly renewable cash source: an existing debt-capacity ceiling and an 18-month facility cooldown apply before another bridge can be raised.

Bridge finance creates explicit Save World debt with:

- principal;
- annual interest rate;
- repayment term;
- monthly interest;
- monthly principal service.

Debt service is posted through normal Team Economy monthly expenses. It is not hidden inside a crisis score.

## Administration and ownership sale

Administration does not immediately remove a team from Formula One.

The crisis system first creates a sale/restructuring mandate. A successful buyer recapitalises the team, may refinance part of the crisis debt and receives a new dynamic ownership record.

A sale preserves the stable constructor `teamId`. Branding may later change through the existing rebrand system, but historical records, contracts and championship references do not lose identity continuity.

## Withdrawal

An unresolved AI-team administration can eventually produce a championship withdrawal. A player-controlled team is never silently removed by an AI-only financial roll.

The controlled manager receives crisis responses through the Inbox:

- freeze discretionary spending;
- request owner support;
- seek new investment / buyer;
- prepare withdrawal during emergency/administration.

A financial withdrawal is completed only if the active regulation package remains above its minimum-team threshold. Otherwise the team stays in administration and another solution must be pursued.

If the controlled team does withdraw, the manager becomes unemployed rather than the career ending. The existing manager job market remains available.

## Exit/archive behavior

When a financial withdrawal completes, the existing team-exit pipeline remains authoritative:

- active team removed from `world.teams`;
- stable identity retained in `world.inactiveTeams`;
- drivers/staff released;
- Race Entry and future commitments cleaned by existing systems;
- finance/car/technical state archived;
- crisis/ownership state moved to `world.financialCrisis.inactiveTeams`.

## Historical policy

Historical starting financial/team data remains immutable. Stage 19 never scripts a real future bankruptcy, sale, merger or takeover simply because it happened historically.

After Career Start, owner funding, bridge debt, administration, ownership changes and withdrawals are alternative-history Save World outcomes.

Unknown historical money is still not converted into invented factual salary/owner wealth. Simulation-generated crisis finance carries explicit gameplay provenance.

## Validation

Long-run ecosystem validation now reports:

- active crisis stages;
- teams in administration;
- teams under spending freeze;
- crisis-debt distribution;
- owner-funding interventions;
- bridge-finance interventions;
- ownership changes;
- ownership-change rate per active-team season;
- financial-crisis team exits;
- ordinary distressed-team share.

Structural validation also checks that active crisis records reference active teams, archived crisis records reference inactive teams, debt never becomes negative and each active crisis record retains an ownership identity.
