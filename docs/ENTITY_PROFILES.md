# Entity Profiles

## Purpose

Entity profiles provide reusable Football Manager-style views for current Formula One people and teams during the developer playtest. They are presentation projections over the current Save World. They are not a second source of simulation state.

Supported profile types:

- `driver`
- `staff`
- `team`

The browser route is:

`/profile.html?type=<type>&id=<stable-id>`

The playtest API route is:

`GET /api/profile?type=<type>&id=<stable-id>`

## Authority boundary

Profiles read from the active Save World and existing visibility, employment, scouting, organisation, championship and governance systems.

They must never:

- mutate career state;
- make a hidden future entity visible;
- use a historical future result as current Save World truth;
- expose private rival ratings merely because a direct URL is known;
- replace stable IDs with presentation names as authority.

Dynamic team branding is presentation only. A rebrand may change the displayed team name while the stable `teamId` remains unchanged.

## Visibility and knowledge

Direct profile URLs use the same visibility boundary as the rest of the game. A hidden future driver, staff member or team cannot be revealed by manually entering its ID.

For controlled-team employees, the player may see known internal current-state information and exact attributes where the management model already permits it.

For rival people, the profile respects the current scouting/knowledge boundary and does not expose exact private ratings.

Ownership and governance identities remain valid visible profiles even when recruitment rules make them ineligible for ordinary staff hiring.

## Presentation links

`playtest/entity-links.js` provides the shared profile-link renderer. Current playtest surfaces use stable IDs to build links from areas including:

- Career/Home and current team context;
- team drivers and staff;
- recruitment and contract negotiations;
- qualifying, grid, live timing and race results;
- championship standings and calendar results;
- F1 World records/history where an entity ID is available.

The link layer only formats navigation. It does not infer identity from display text.

## Media boundary

Profiles currently render a deterministic initials placeholder. The profile projection exposes media metadata as a hook for the Media Pack resolver planned in the next development step.

Future media resolution must remain read-only presentation data. Missing portraits, logos, helmets or cars must fall back gracefully and must never alter Save World behaviour.

## Tests

`tests/entityProfiles.test.js` covers the core authority boundary:

- hidden future entities cannot be opened directly;
- controlled drivers expose current Save World state and known attributes;
- visible rivals do not leak exact private ratings;
- team profiles follow current dynamic branding while preserving stable identity and visible rosters.

`tests/playtestAssets.test.js` also checks that profile assets exist and that the JavaScript entry points parse successfully.

These tests run alongside the normal full simulation suite and long-run autonomous soak, so profile work cannot silently bypass core world-simulation regressions.
