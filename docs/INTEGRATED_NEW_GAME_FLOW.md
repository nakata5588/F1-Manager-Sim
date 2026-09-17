# Integrated New Game Flow

## Purpose

Phase 46 introduced the explicit game-facing New Game wizard. The Playable Validation front door now places that wizard behind the Main Menu:

`Launch -> Main Menu -> New Game -> Database -> Decade -> Season -> Team -> Manager -> Career`

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

## Public presentation metadata

Historical source identity and player-facing labels are separate contracts.

The runtime keeps the original `databaseVersion`, `releaseName`, source checksum, stable IDs and manifests intact for validation and persistence. `DeveloperPlaytestSession.setup()` additionally projects presentation-only metadata:

- database name — for example `Official Historical Database`;
- season name — for example `1980 Formula One World Championship`;
- concise version label — for example `v1.2.16`;
- player-facing description.

The browser catalog consumes these public fields. Technical release filenames, candidate/audit labels and source-lock terminology must never be used as visible card titles or subtitles. The catalog retains internal identity fields beneath the presentation layer so career creation and compatibility validation continue to use the authoritative source identity.

Legacy/single-season setup payloads without presentation metadata receive safe browser fallbacks. A semantic version prefix may be shortened for display, but an arbitrary technical identifier is never shown as the version label.

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
- Continue Game restores the most recently saved slot that passes the current Season Database compatibility gate.
- Load Game lists save slots at the Main Menu and disables corrupt or incompatible saves.
- The fixed developer SAVE / LOAD dock is career-only and is not shown on the Main Menu or New Game wizard.
- Manual Save remains available only after a career is active.

## Team Selection v2

The Team stage is an opening-world comparison surface, not a historical-results or power-ranking screen.

Each selectable team may project:

- public team name and nationality;
- opening driver line-up;
- car numbers when supplied by the opening entry data;
- engine identity/manufacturer when available;
- chassis/model identity when explicitly present in the selected Season Database;
- presentation-only team colours and Media Pack logo.

Opening driver context prefers explicit Career Start / Round 1 entry data. If that surface is absent, the UI may fall back to contracts that are already active at Career Start. Future-season contracts and later same-season start dates are excluded from the New Game card.

The Team stage must not derive or expose:

- championship results after Career Start;
- historical final standings;
- predicted finishing positions;
- team strength rankings or overall ratings;
- later-season driver moves;
- hidden future teams or people.

Missing source identity remains missing. For example, if a chassis model name is not present in the opening database snapshot, the UI omits the chassis row rather than inventing one from a performance index or external assumption.

Visual identity and media are presentation-only and never influence simulation performance.

## Current UI stages

1. **Database** — historical database identity currently supplied by the server.
2. **Decade** — derived only from career-ready seasons in that database.
3. **Season** — validated Season Database starting year.
4. **Team** — active teams from that Season Database snapshot.
5. **Manager** — manager identity and final Career Setup review.

The final action creates the career through the existing server endpoint and reloads the normal Career shell from the resulting Save World.

## Expansion rule

When later decades are implemented, expand the server setup/catalog source rather than hardcoding years in the browser. A future season should appear in New Game only after its Season Database is validated and declared career-ready.
