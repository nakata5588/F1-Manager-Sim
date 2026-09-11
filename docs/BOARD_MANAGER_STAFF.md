# Phase 34 — Board, Manager Career & Staff Management

Phase 34 extends the persistent management world beyond driver recruitment. The manager is now a career entity inside the Save World, the board evaluates performance, staff can be recruited through a real employment/contract pipeline, and player responsibilities can be delegated without creating separate simulation rules.

## Architectural boundary

All Phase 34 state is Save World state.

Historical source data remains immutable and may provide starting information such as team reputation, staff ratings, salaries, contracts, facilities and car attributes. Board confidence, manager reputation, applications, job offers, responsibilities, staff advice and negotiation outcomes are not historical facts and never write back into the historical database.

The management flow is:

`World State -> Board / Staff / Career Event -> Inbox or Advice -> Player Decision -> Simulation Event -> Updated Save World`

## Board confidence

Each controlled team has a persistent board relationship with confidence from 0–100. The board reviews the current Save World monthly.

Initial objectives are generated from starting conditions rather than future historical outcomes:

- Constructors' Championship target from the starting reputation order;
- financial stability from known opening cash when available;
- car-development delivery only when a measurable component model exists.

Board confidence reacts to current championship position, financial control and development delivery. Repeated severe underperformance can trigger a warning and eventually dismissal.

The current board status bands are:

- `secure`
- `stable`
- `under_pressure`
- `at_risk`
- `dismissal_risk`

A dismissal requires both very low confidence and repeated board reviews; a single bad month does not instantly terminate the manager.

## Board requests

The first board requests are:

- development budget;
- staff capacity.

Requests are resolved from current board confidence and financial state. Approved development funding is simulation-owned Save World money, never retroactively claimed as a historical budget fact.

## Manager career

The player manager has persistent career state under `saveWorld.player.manager.career`:

- reputation;
- employment status;
- current team;
- appointment/departure/dismissal history;
- applications;
- job offers.

Board confidence and paddock reputation are intentionally separate. A manager may lose the confidence of the current board while retaining enough reputation to attract another F1 team.

Dismissal clears `player.controlledTeamIds`, making the manager genuinely unemployed. Accepted applications and job offers update the controlled team in the Save World and append career history.

Job-market decisions are deterministic for a given save seed and current world state. They are not scripted to reproduce historical team principals.

## Staff recruitment

Staff recruitment uses the same employment world as every other team.

Visible and F1-eligible staff can be evaluated by available specialist attributes. Candidate ability is derived from the staff data that actually exists, including technical, engineering, design, aero, strategy, leadership, scouting, mechanics and reliability fields where present.

Staff interest reacts to:

- team prestige;
- ambition and loyalty;
- team and contract satisfaction;
- transfer openness;
- staff-team relationships;
- representative behavior.

Contract expectations use real salary data when available. When a reliable monetary basis is missing, negotiations use an explicit abstract compensation index rather than invented historical currency values.

Accepted staff agreements emit the canonical `employment.contract_signed` event. Future agreements remain future assignments until their effective season.

## Responsibilities and delegation

The first responsibility areas are:

- Driver recruitment
- Staff recruitment
- Scouting
- Car development
- Race strategy
- Finances
- Commercial

Each area can be owned by the manager or marked delegated.

Delegation is a policy flag in the Save World; it must never create a second implementation of the same game system. Where automated behavior is implemented, delegated departments use the same underlying simulation rules as AI teams.

In Phase 34, car-development delegation is fully wired: a controlled team marked `carDevelopment = delegated` may start development projects through the existing AI development rules, using the same finances, facilities, project durations and component logic. Other responsibility flags are persisted now so later systems can consume the same contract without UI redesign.

## Staff advice

Senior employed staff can generate monthly advice. The first advice priorities are:

1. open team vacancy;
2. weak board confidence;
3. weakest measured car component;
4. no critical issue.

Advice is informational. It never mutates the authoritative car, finances or employment state merely because a message was generated.

## Developer Management Hub

`/management.html` now exposes:

- Inbox
- Board
- Career
- People
- Staff
- Drivers
- Driver Contracts
- Market
- Responsibilities

The browser remains a projection/instruction layer. It does not calculate board confidence, contract acceptance, manager applications or staff ability.

## Persistence and long-run behavior

Board state, manager career state, responsibilities, staff negotiations and staff people state all live inside the Save World and survive normal JSON serialization.

Regression coverage verifies:

- board initialization and objectives;
- delegated development behavior;
- board requests;
- future staff agreements;
- manager dismissal without deleting career history;
- unemployment and job offers;
- applications and team changes;
- serialization of the new management state.
