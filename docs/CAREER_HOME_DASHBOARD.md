# Career Home v2 — Operational Dashboard

## Goal

Career Home v2 makes Home the daily operational centre of a career rather than a passive collection of status cards.

The dashboard remains a **read-only presentation projection**. It does not own simulation state, time progression, Board confidence, Inbox decisions, technical development, finances, standings or world news.

## Inputs

Career Home reuses existing projections:

- `/api/state` — manager/team/date, active weekend, drivers, next race and standings;
- `/api/management` — Inbox summary, Board state and Commercial summary;
- `/api/inbox` — current actionable messages and decisions;
- `/api/technical` — development/manufacturing/facility status;
- `/api/world` — current alternative-history news and archived world events;
- `/api/profile?type=team` — controlled-team presentation identity and current financial projection.

No new mutable Home state is introduced.

## Operational hierarchy

The dashboard is deliberately ordered by what the manager may need to act on.

### 1. Career command strip

Shows the controlled team, manager/date and high-level current status:

- Constructors' position and points;
- Board confidence;
- cash balance / financial status;
- active sponsors and monthly sponsor income.

Team colours come from the current presentation-only Team Visual Identity.

### 2. Race focus

The leading event card resolves one of three states from current career data:

- active Race Weekend — stage, circuit/weather/date and direct return to the weekend;
- next Grand Prix — round/date and Calendar link;
- completed calendar — direct Offseason link.

It does not invent future race data.

### 3. Needs Attention / Inbox

Actionable conditions link directly to their existing systems:

- pending Inbox decisions;
- unread messages;
- Board pressure;
- financial distress;
- specifications ready for manufacture;
- pending sponsor activities;
- current/next race context.

No decision is resolved from Home itself.

### 4. Team operations

Home exposes compact operational summaries for:

- **Board** — confidence, objective target text and status;
- **Drivers** — current line-up, championship position/points and entity profiles;
- **Car & Development** — active designs, factory jobs, ready specs and facilities;
- **Finances & Sponsors** — cash, monthly net, sponsor income, active deals and negotiations;
- **F1 World** — latest simulation-owned news.

Each panel routes to the existing authoritative gameplay screen.

### 5. Championship / Calendar

Current top standings remain read-only links into the Championship Hub. Recent races plus the current/next race provide season context without duplicating the calendar model.

## Architecture

The flow remains:

`Save World -> Existing Domain Projections -> Career Home Model -> Browser Dashboard`

The model is deterministic and does not mutate source projections. Hidden future drivers, teams and outcomes are never accessed.

Financial values come from the controlled team's current profile projection; sponsor values come from the existing Commercial system. Home never calculates an alternative economy.

## Navigation

Career Home v2 integrates with Career Shell v2:

- Inbox -> Management / Inbox;
- Board -> Management / Board;
- Drivers -> Team / Profiles;
- Car & Development -> Technical Operations;
- Finances & Sponsors -> Commercial;
- World News -> F1 World;
- Calendar / Standings -> Championship Hub;
- active race weekend -> existing Race Weekend;
- season complete -> existing Offseason flow.

`CONTINUE` remains owned by the global Career Shell and existing time engine.
