# Phase 48 — Career Home / Dashboard & Calendar Experience

## Goal

Phase 48 turns Career Home into an actual management dashboard instead of a small collection of static race and championship cards.

The dashboard remains a **read-only UI projection**. It does not own simulation state, time progression, Board confidence, Inbox decisions, technical development, standings or world news.

## Dashboard inputs

Career Home aggregates existing Developer Playtest projections:

- `/api/state` — manager/team/date, active weekend, drivers, next race and standings;
- `/api/management` — Inbox summary, Board state and Commercial summary;
- `/api/inbox` — current actionable messages and decisions;
- `/api/technical` — development/manufacturing/facility status;
- `/api/world` — current alternative-history news and archived world events.

No new mutable Career Home state is introduced.

## Player-facing sections

Career Home now presents:

- **Needs Attention** — pending decisions, unread Inbox, Board pressure, ready technical specifications and current race context;
- **Inbox priorities** — the highest-priority current messages, with pending decisions surfaced first;
- **Board** — confidence and current objectives;
- **Drivers** — the controlled team's current line-up with championship position/points;
- **Car & Development** — active designs, manufacturing, ready specifications and facility upgrades;
- **F1 World News** — latest simulation-owned news stories;
- **Calendar** — recent completed race history plus the next authoritative Grand Prix;
- **Standings** — current top driver and constructor championship positions.

## Calendar boundary

The dashboard deliberately does not fabricate future races that are unavailable from the current runtime projection. It shows archived race history and the next race already exposed by the authoritative career state. Historical expansion or a later dedicated calendar projection can widen this without changing the dashboard architecture.

## Architecture

The flow is:

`Save World -> Existing Domain Projections -> Career Home Model -> Browser Dashboard`

The Career Home model is deterministic and does not mutate its source projections.

Hidden future drivers, teams and outcomes are never accessed by the dashboard model.

## Navigation

The dashboard links back into the existing Career Shell surfaces instead of creating duplicate gameplay screens:

- Inbox / Board / Team -> Management Hub;
- Car & Development -> Technical Operations;
- World News -> F1 World;
- Calendar / Standings -> Career Home focused sections.

The global Career Shell remains the navigation authority introduced by Phase 47.
