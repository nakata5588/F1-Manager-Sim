# Integrated New Game Flow

## Purpose

Phase 46 turns the Developer Playtest bootstrap into an explicit game-facing New Game path:

`New Game -> Database -> Decade -> Season -> Team -> Manager -> Career`

The flow is presentation/orchestration only. It does not create a second historical database model and it does not move simulation authority into the browser.

## Current scope

1980 remains the first and only fully supported starting season.

Therefore Database, Decade and Season currently expose the validated runtime Season Database supplied to the playtest server rather than inventing additional historical options. The catalog contract is deliberately multi-database and multi-season capable so later historical expansion can add real validated choices without redesigning the wizard.

The UI must never display a decade or season merely because a year exists in reference data. A choice becomes selectable only when a career-ready Season Database is present in the New Game catalog.

## Authority boundary

The creation path remains:

`New Game selection -> POST /api/career -> DeveloperPlaytestSession.startCareer() -> createCareerFromSeasonDatabase() -> Save World`

The browser sends only player choices. The server-side career bootstrap remains responsible for:

- Season Database validation;
- Global / Season compatibility when a Global Database is supplied;
- immutable historical starting snapshot materialization;
- independent Save World creation;
- deterministic career seed creation;
- simulation initialization.

No historical source row is mutated by the New Game flow.

## Historical safety

The flow preserves the existing rule:

`exists internally != visible != scoutable != F1 eligible`

Team choices come only from `snapshot.teams` exposed by the active Season Database setup projection. Hidden future teams, drivers, staff, sponsors and structural reference pools remain unavailable to the player.

Selecting 1980 does not grant authority to later historical results, contracts, transfers, retirements or championships. Those remain reference-only inputs where applicable; Save World owns all post-start outcomes.

## Browser catalog contract

`playtest/new-game-flow.js` normalizes the setup projection into a catalog containing:

- databases;
- seasons per database;
- derived selectable decades;
- active teams per season.

For backward compatibility, the current single-Season `GET /api/setup` response is automatically normalized into a one-database catalog.

The same helper already accepts an explicit multi-database catalog shape for later expansion. Tests verify that unsupported seasons are never synthesized.

## Persistence interaction

Phase 45 Save / Load remains independent of New Game.

- New Game creates a fresh Save World.
- Load restores an existing Save World through the provenance compatibility gate.
- The fixed persistence dock remains available on the New Game screen for loading an existing career.
- Manual Save stays disabled until a career exists.

## Current UI stages

1. **Database** — historical database identity currently supplied by the server.
2. **Decade** — derived only from career-ready seasons in that database.
3. **Season** — validated Season Database starting year.
4. **Team** — active teams from that Season Database snapshot.
5. **Manager** — manager identity and final Career Setup review.

The final action creates the career through the existing server endpoint and reloads the normal Career shell from the resulting Save World.

## Expansion rule

When later decades are implemented, expand the server setup/catalog source rather than hardcoding years in the browser. A future season should appear in New Game only after its Season Database is validated and declared career-ready.
