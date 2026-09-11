# Management Core

## Purpose

Phase 32 begins the player-facing management layer without moving simulation authority into the browser.

The core loop is:

`Continue -> World change -> Inbox / information -> Player decision -> Save World consequence -> Continue`

The first implemented management domains are:

1. Inbox / decision framework;
2. driver scouting and recruitment knowledge;
3. contract negotiations;
4. future-contract activation.

These systems are deliberately tolerant of incomplete historical data so the Global/Season Database can improve independently.

## Architectural boundary

Historical data remains immutable source material:

`Global Database -> Season Database -> Save World -> Simulation / Game Systems -> UI projection`

Management state belongs to the Save World under `world.management`.

The browser never becomes authoritative for scouting knowledge, negotiation outcomes, employment, contracts or inbox decisions.

## Inbox and decisions

`world.management.inbox` stores persistent messages with stable IDs, unread/archive state and optional decisions.

A decision contains:

- a semantic `kind`;
- a referenced system object (`refId`);
- explicit options;
- pending/resolved status;
- the chosen option and resolution date.

The first real decision type is `contract_counter`.

The inbox is generic by design. Board requests, sponsor proposals, staff advice, regulation votes, media questions and operational dilemmas should later use the same decision contract rather than inventing separate UI-only state machines.

## Scouting and recruitment

Recruitment reads only visibility-safe driver projections.

A driver must be at least `talent_visible` to appear in recruitment. Hidden future identities never appear in lists, searches, shortlists or reports.

Scouting knowledge is player/save-specific dynamic state, not historical truth.

Initial knowledge is deliberately conservative:

- controlled-team drivers: full knowledge;
- other active F1 drivers: partial public knowledge;
- visible available talent: lower public knowledge.

Scouting assignments progress with `DAY_ADVANCED` events. Completion creates a report and an Inbox item.

Reports expose ability, potential, reputation and ratings as estimated ranges rather than leaking exact source values. Uncertainty decreases as knowledge increases.

Recruitment search/filtering does not rank candidates by hidden CA/PA.

## Contract negotiation

Driver contract negotiations live under `world.management.contracts`.

A negotiation tracks:

- driver/team;
- opening/expiry dates;
- earliest legal start season under the current simplified model;
- expected terms;
- submitted offers;
- counter-offers;
- accepted terms;
- final status.

### Compensation data policy

When the historical database provides a usable salary, negotiation uses real currency fields (`annualSalary`, `signingBonus`).

When it does not, the system uses an explicit `abstract_index` compensation mode.

This is intentional: the game must not invent historical monetary values merely to satisfy a gameplay schema. A future database bundle can supply salary data without changing the negotiation architecture.

### Transfer boundary

Phase 32 does not yet implement transfer fees / compensation agreements for buying a driver out of an active contract.

For a driver employed by another team, the earliest contract start defaults to the season after the known current contract end. If the end is unknown, the system refuses to pretend a transfer is possible.

## Future contracts

`employment.futureAssignments` separates an announced future agreement from current employment.

Signing a future contract:

- records the agreement;
- preserves the driver's current team until the effective season;
- keeps the future assignment in Save World;
- activates it on `SEASON_STARTED`;
- then updates employment and career state.

This avoids the previous incorrect behaviour where any `CONTRACT_SIGNED` event immediately replaced the driver's current team.

## Developer Playtest

The local playtest server exposes management APIs for:

- Inbox read/archive/decision actions;
- recruitment search and shortlist;
- scouting assignments;
- contract negotiation creation;
- offer submission and withdrawal.

A dedicated `/management.html` Developer Playtest surface consumes only those application APIs.

It contains no scouting, negotiation or employment logic.

## Database integration contract

The database conversation can safely add richer historical fields later, including salary, bonuses, contract status, reputation, personality, agents and marketability.

Management code must continue to follow these rules:

- missing historical values remain unknown or use an explicitly labelled simulation abstraction;
- dynamic morale/interest/knowledge/negotiation state belongs to Save World;
- future historical contracts never force career outcomes;
- hidden future identities remain inaccessible to recruitment until visibility allows them.

## Next management layers

The next logical systems are:

1. personalities, mentality and relationships;
2. richer contracts (clauses, options, buyouts, agents, competing bids);
3. staff scouting/recruitment and delegation;
4. board confidence/objectives;
5. sponsors/marketability/commercial negotiation;
6. player-controlled R&D, facilities and manufacturing;
7. news/events/staff advice using the Inbox decision framework.
