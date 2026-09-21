# Stage 21 — Dynamic Calendar & Promoters

## Goal

Stage 21 makes the Formula One calendar part of the evolving Save World.

A career still begins with the authentic historical opening calendar supplied by the selected Season Database. After career start, later historical calendars are **reference candidates**, not mandatory future schedules.

The governing rule is:

`Historical opening calendar -> promoter contracts -> annual review -> dynamic future calendar -> Save World history`

This preserves the project principle:

`Historical Starting Conditions -> Dynamic Alternative Future`

## Authority

The authoritative runtime state is:

`world.calendarEvolution`

It owns:

- simulated promoter contracts;
- promoter commercial health, organisational stability and safety confidence;
- annual calendar plans;
- renewals;
- Grand Prix additions and removals;
- calendar decision history.

The active race schedule remains:

`world.calendar`

Stage 21 does not move race scheduling authority into the UI and does not mutate the Historical Database.

## Historical future policy

`reference.futureStructure.calendars` is no longer consumed as a scripted next-season result.

Future historical calendar rows can provide:

- known venue/circuit candidates;
- structural calendar-size context;
- race-order/date context;
- track identities that may become eligible for materialisation.

They do **not** guarantee:

- that a Grand Prix enters;
- that an existing Grand Prix leaves;
- an exact race count;
- an exact round order;
- an exact future historical calendar.

Historical result/outcome fields are stripped before candidate rows become Save World calendar events.

## Promoter contracts

Every opening-calendar event receives a simulated promoter contract with stable Save World identity.

A contract tracks:

- `eventKey`;
- promoter identity;
- circuit identity;
- contract start/end season;
- commercial health;
- promoter stability;
- safety confidence;
- provenance;
- latest annual decision.

These are gameplay state, not claims about historically exact promoter finances or organisations.

When the source does not provide a real promoter identity, Stage 21 uses a generic simulation identity rather than inventing a historical person/company.

## Annual lifecycle

The normal annual path is:

`Current Season -> November/December Promoter Review -> Finalised Next-Season Plan -> January Season Rollover -> Active Calendar`

The November/December review:

1. evolves active promoter health;
2. checks whether contracts still cover the target season;
3. reviews expiring contracts;
4. evaluates historical-structure candidates;
5. can renew, drop, restore or add events;
6. builds the next-season schedule;
7. records the decision in Save World;
8. publishes the confirmed calendar into World News/History.

If a save reaches January without a prebuilt plan, Season Rollover performs the same deterministic planning just in time.

## Calendar size

Calendar size evolves within era-aware guardrails.

The opening-world scale is respected so minimal test worlds and unusual historical eras are not artificially expanded to a modern race count.

Future historical race counts can influence the structural signal, but validation deliberately does not require the simulation to reproduce them.

## Determinism

Promoter and calendar decisions use the Save World seed.

For the same:

- seed;
- promoter state;
- calendar;
- candidate pool;
- target season;

the resulting plan is reproducible.

Different saves may therefore produce different Formula One calendars from the same historical starting season.

## Offseason integration

Offseason preparation now exposes whether the target-season calendar is:

- pending; or
- finalised.

When finalised it includes:

- planned Grand Prix count;
- target count;
- added events;
- dropped events;
- renewed promoter contracts.

## World history

A confirmed future calendar becomes a world event.

World News/History records:

- target season;
- race count;
- additions;
- removals;
- promoter review context.

This makes calendar evolution part of the persistent alternative-history record.

## Long-run validation

Long-run validation no longer asserts that every future season must match the Historical Database's real race count.

It now validates:

- a calendar exists;
- dynamic calendar summaries exist;
- event keys are unique;
- race counts remain inside active era/opening-world bounds;
- promoter history remains structurally valid.

The ecosystem gate also tracks:

- calendar race-count distribution;
- Grand Prix additions;
- Grand Prix removals;
- promoter renewals;
- active promoter contracts.

A completely static calendar across long multi-seed runs is reported as an ecosystem warning.

## Non-goals

Stage 21 does not yet implement:

- player-controlled negotiations with Grand Prix promoters;
- hosting fees with exact real-world monetary values;
- local-government politics;
- detailed circuit-construction projects;
- travel/logistics optimisation;
- sprint-format/calendar-format governance;
- weather-climate relocation logic.

Those can be layered on the Stage 21 authority later without replacing it.
