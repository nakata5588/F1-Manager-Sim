# Management Depth Pass

## Purpose

Stage 15 turns the existing collection of management systems into a coherent team-planning workflow.

The project already had real systems for:

- driver scouting and shortlists;
- driver contract negotiation;
- staff recruitment and contracts;
- people mentality;
- rival market approaches;
- team organisation and workload;
- Board confidence and requests;
- responsibilities;
- commercial management.

The missing layer was planning.

A manager could inspect each subsystem separately, but the game did not answer the Football Manager-style question:

> What decisions does my team need me to make now, and what should I plan for next?

Stage 15 adds that layer without creating a second authority for people, contracts or organisation.

## New Team Planning workspace

Management now contains:

```text
Team
  Overview
  Planning
  Responsibilities
```

`Planning` is a read-only application projection over current Save World state.

It does not store a second squad plan or duplicate contract records.

## Planning projection

`buildManagementPlanning(saveWorld, teamId)` combines existing authoritative systems into one player-facing projection.

It includes:

- management priorities;
- current driver retention planning;
- current staff retention planning;
- organisation departments and vacancies;
- current shortlist;
- scouting summary;
- active driver negotiations;
- active staff negotiations.

The local playtest exposes it through:

```text
GET /api/management/planning
```

## Management priorities

The planning layer creates an actionable decision queue from facts already present in Save World.

Possible triggers include:

- critical or vacant organisation departments;
- expiring driver contracts;
- expiring staff contracts;
- low morale;
- low team satisfaction;
- low contract satisfaction;
- high transfer openness;
- active rival approaches;
- driver counter-offers;
- staff counter-offers;
- severe Board-confidence pressure.

Priority rows are presentation decisions, not simulation events.

They link to the authoritative existing workspace where the player can act.

## Contract horizon

Current employment remains authoritative.

Planning derives a simple horizon from the current assignment:

```text
contractUntil <= current season  -> Expiring
contractUntil == next season     -> Next season
later contract                    -> Secure horizon
missing date                      -> Unknown
```

No new contract date is generated.

## Retention signals

The planning layer deliberately avoids a single hidden "retention rating".

It exposes the concrete reasons behind a risk label.

Examples:

- Contract expires this season
- Low contract satisfaction
- Low team satisfaction
- Low morale
- Open to a move
- Active rival approach

The overall `low / medium / high` flag is only a UI triage level derived from these visible facts.

It is not a hidden worker ability or a new simulation attribute.

## Organisation planning

Stage 15 makes the existing Staff & Organisation Depth model player-visible.

The Planning workspace can show:

- organisation status;
- current staff count;
- open vacancies;
- Board-approved capacity;
- functional departments;
- members and roles;
- workload state;
- department status;
- open staff roles.

The UI does not expose the organisation model's internal quality/effectiveness calculations as a staff Overall rating.

The player sees operational state such as:

```text
Technical
Strained
2 staff
Busy workload
1 vacancy
```

rather than a synthetic department Overall.

The organisation model remains the existing Save World-derived system used by gameplay.

## Driver planning

For current drivers, Planning can show:

- role;
- contract end season;
- contract horizon;
- morale;
- contract satisfaction;
- active rival approaches;
- explicit retention signals.

`Open talks` reuses the existing driver-negotiation endpoint.

The Planning workspace does not implement contract acceptance itself.

## Staff planning

The same concept applies to current staff.

Ownership/governance identities remain protected by the existing recruitment eligibility rule.

An owner/chairman/founder role cannot suddenly become an ordinary recruitable staff contract because Planning recommends action.

## Succession / shortlist

Planning exposes the current driver shortlist as succession context.

Only drivers already visible through the canonical scouting visibility system can appear.

The Planning projection exposes:

- identity;
- nationality;
- age;
- current team;
- contract horizon when known;
- scouting knowledge;
- whether a report exists;
- F1 eligibility.

It does **not** expose raw CA or PA.

Scouting reports and attribute ranges remain in the dedicated Recruitment workflow.

## Hidden-future boundary

Stage 15 preserves:

```text
exists internally != visible != scoutable != F1 eligible
```

The shortlist is built through `listRecruitmentCandidates(... shortlisted=true)`.

A hidden future driver cannot enter Planning merely because the entity exists internally.

Automated regression tests reject hidden-future names and IDs in the Planning projection.

## Existing actions, not duplicate systems

Planning routes into existing authority:

```text
Driver retention  -> Driver Contracts
Staff retention   -> Staff Recruitment & Contracts
Vacancy pressure  -> Staff Recruitment
Succession        -> Driver Recruitment
Board pressure    -> Board
```

Direct renewal buttons call the existing contract-negotiation endpoints.

Counter-offer priorities open the existing negotiation.

No browser-side contract resolution is added.

## What Stage 15 does not do

It does not add:

- a worker Overall;
- a hidden squad score;
- a new transfer engine;
- a new contract database;
- automatic player signings;
- scripted future line-ups;
- hidden future identities;
- arbitrary historical staffing charts;
- duplicate organisation state.

## Long-term value

This creates a reusable Football Manager-style management layer.

Future systems can add planning signals for:

- technical succession;
- facilities;
- supplier contracts;
- sponsor renewals;
- budget commitments;
- generated talent pathways;

without changing the principle:

```text
Authoritative Save World systems
        ->
Planning projection
        ->
Player decision
        ->
Existing authoritative action
```

The planning layer tells the player what matters.

It does not make the decision for them.
