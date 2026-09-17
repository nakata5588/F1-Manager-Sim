# Phase 47 — Career Shell & Navigation

## Goal

Phase 47 turns the previously separate Developer Playtest surfaces into one coherent career workspace without introducing a second gameplay authority.

The persistent player path is now presented as:

`New Game -> Career Shell -> Home / Team / Operations / Competition / Season -> Existing game-system action -> Save World consequence`

## Authority boundary

The Career Shell is presentation and navigation only.

It does not own:

- career state;
- calendar progression;
- Inbox decisions;
- employment or contracts;
- technical state;
- finances or sponsorships;
- governance;
- offseason state;
- race-weekend state;
- history or records.

Those remain owned by the existing Save World, simulation and game-system modules.

The shell reads existing player-facing projections from `/api/state` and `/api/management`. `CONTINUE` uses the existing `/api/continue` action. During an active race weekend it routes the player back to the existing interactive Race Weekend rather than bypassing session guards. Once the race calendar is complete it routes into the existing Offseason surface.

## Navigation model

The shared navigation groups are:

### Career

- Home
- Inbox
- Calendar

### Team

- Team
- Drivers
- Staff

### Operations

- Car & Development
- Finances & Sponsors

### Competition

- Standings
- F1 World
- Governance

### Season

- Offseason & New Season

Where a dedicated screen already exists, the shell routes directly to it. Where functionality already exists as a Management tab, the shell uses a deep link and activates that existing tab. No duplicate Inbox, recruitment, staff or commercial state is introduced.

`Calendar` and `Standings` currently deep-link to the corresponding Home projections. They are navigation destinations, not new authoritative data models.

## Shared context

Every career page now receives the same persistent context bar with:

- manager;
- controlled team;
- current Save World date;
- current season;
- next Grand Prix or active race-weekend context;
- contextual Continue / Race Weekend / Offseason action.

The shell disappears entirely during New Game so Phase 46 retains its dedicated onboarding experience.

## Existing modules preserved

Phase 47 intentionally keeps the mature module implementations intact:

- `playtest/app.js` — Career Home and interactive Race Weekend;
- `playtest/management.js` — Inbox, Board, career, people, staff, recruitment, contracts, market, commercial, responsibilities;
- `playtest/technical.js` — Car, development, suppliers, manufacturing, facilities and reliability;
- `playtest/governance.js` — regulation and grid/team governance;
- `playtest/offseason.js` — season review, planning and new-season preparation;
- `playtest/world.js` — F1 World, news, history and records.

The shared shell hides their old local navigation chrome where necessary, but does not replace their gameplay logic.

## Future extension

The shell is deliberately stable enough for later dedicated Calendar, Team, Drivers, Staff, Car, Development, Finances, Sponsors and Standings projections. Those future screens can replace current deep links one by one without changing the Save World authority boundary or the global navigation contract.
