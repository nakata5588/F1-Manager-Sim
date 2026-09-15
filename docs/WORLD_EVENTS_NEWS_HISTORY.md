# Phase 42 — World Events, News, History & Records Foundation

Phase 42 adds a persistent narrative layer over the existing autonomous Formula One world.

The governing flow is:

`Simulation Event -> Authoritative Gameplay Consequence -> Updated Save World -> News / History / Records Projection`

The narrative layer is deliberately last in the core-system order. It observes outcomes that have already been resolved by the owning gameplay system and never emits replacement outcomes of its own.

## Authority boundary

Existing systems remain authoritative:

- Race Weekend / Live Race owns classifications.
- Championship owns standings and title resolution.
- Employment / Contracts owns assignments and transfers.
- Career Lifecycle owns retirement state.
- Governance owns regulation and team-evolution decisions.
- Manager Career owns appointments and dismissals.

Phase 42 does **not** create parallel transfer, championship, race, regulation or career state.

Instead it uses three existing/purpose-specific Save World surfaces:

- `world.media.news.stories` — player-facing editorial projection;
- `history.events` — durable career/world timeline;
- `history.records` — stable milestone records.

`history.races`, `history.championships`, `history.transfers`, `history.retirements`, `history.teamEvolution` and other domain histories remain the authoritative detailed histories for their own systems.

## News stories

Stories have stable IDs plus:

- date / season;
- category;
- importance (`low`, `normal`, `high`, `major`);
- headline / summary;
- source simulation event ID/type;
- entity references;
- tags;
- `simulation_event_projection` provenance.

The same source event and story key are deduplicated.

Current foundation stories cover:

- career start;
- race winners / podium context;
- championship archive/title resolution;
- immediate and future driver/staff signings;
- future-contract activation;
- driver/staff retirement;
- regulation vote resolution and enactment;
- team entry acceptance/rejection/activation;
- team exit/rebrand;
- player-manager appointment/dismissal.

Future phases can add rumours, media reactions, richer technical/commercial stories and editorial variation without changing the event-authority boundary.

## World history

`history.events` stores a compact durable timeline of the important world consequences projected into news.

History rows retain:

- source event identity;
- semantic event type/category;
- title/summary;
- involved entities;
- compact event data;
- `simulation_event_history` provenance.

This is not a second simulation log. It is the human-readable career chronology built from already-resolved simulation events.

## Records foundation

`history.records` stores stable milestones rather than recalculating historical claims from external data.

The initial milestone set includes:

- first Formula One win;
- selected win-count milestones;
- Drivers' Championship wins;
- Constructors' Championship wins.

`worldRecordsSummary()` also derives live career statistics from authoritative Save World race/championship history:

- starts;
- wins;
- podiums;
- championships;
- season champions;
- recorded milestones.

These statistics therefore reflect the alternative career only. Historical future winners/champions are never loaded as simulated achievements.

## Historical boundary

Phase 42 never turns future historical reference data into news merely because it exists in the Global/Season Database.

A future driver/team/regelation becomes newsworthy only after a real Save World simulation event makes it relevant. Hidden future identities remain hidden until the existing visibility/governance systems legitimately activate them.

This preserves the project rule:

**Historical starting conditions. Dynamic alternative future.**

## Persistence

News, timeline events and records live inside Save World and therefore survive the existing serialization round-trip without a parallel persistence format.

No UI is authoritative. A future F1 World / History / Records screen will consume these projections and query helpers; it will not calculate or mutate simulation outcomes in the browser.
