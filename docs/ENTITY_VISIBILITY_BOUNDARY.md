# Entity Visibility Boundary

## Purpose

The historical database may know that a person, team, staff member or sponsor will exist later. The Save World may also need that identity internally so lifecycle systems can activate it at the correct time. Neither fact makes the entity player-visible.

This document freezes the Phase 20 boundary between **runtime existence**, **player visibility**, **scouting visibility**, **F1 eligibility** and **historical reference dates**.

## Canonical concepts

| Concept | Meaning | Player-facing consequence |
| --- | --- | --- |
| `birth_date` | Historical date of birth/creation where applicable. | Identity fact only. It does not make a driver scoutable or F1-eligible by itself. |
| `world_visible_from` / `known_from` | Earliest season the entity may be known to the simulated world. | Before this season the entity must not appear in player-facing selectors. |
| `talent_visible_from` | Earliest season the entity may appear as a scoutable/researchable talent. | May appear in scouting, but this does not imply F1 contract eligibility. |
| `f1_eligible_from` | Earliest season the entity may enter the F1 employment/entry lifecycle. | Employment and F1 activation systems may act from this season. |
| `f1_debut_reference` | Historical real-world F1 debut reference. | Reference only. It must never be treated as destiny or as the sole visibility boundary. |
| `career_end_reference` | Historical real-world last F1/career reference. | Reference only after career start. It must not force retirement in an alternative-history save. |

The resulting player visibility states are:

- `hidden`
- `world_visible`
- `talent_visible`
- `f1_eligible`

A driver can therefore exist internally before the player can see them, become visible to the world before being scoutable, become scoutable before being F1-eligible, and become F1-eligible before or after their historical F1 debut reference in an alternative timeline.

## Runtime versus player-facing data

The following raw collections are internal implementation details and must never be bound directly to UI, scouting, recruitment, market or player history views:

- `world.futureEntities`
- `world.futureDrivers`
- `world.futureTeams`
- `world.futureStaff`
- `world.futureSponsors`
- `reference.hiddenExternalDriverMarket`
- `reference.futureStructure`

Player-facing systems must use the visibility selectors exported from `src/domain/entityVisibility.js`:

- `isEntityVisibleInSeason(entity, season)`
- `isEntityTalentVisibleInSeason(entity, season)`
- `isEntityF1EligibleInSeason(entity, season)`
- `listVisibleDrivers(saveWorld)`
- `listVisibleTeams(saveWorld)`
- `listVisibleStaff(saveWorld)`
- `listVisibleSponsors(saveWorld)`

These list selectors return a safe projection and deliberately remove hidden future-reference fields such as historical debut, historical career end and internal activation dates.

## Employment market rule

`ENTITY_EVENT.ELIGIBLE` is an **F1 eligibility** event, not a generic existence or scouting event.

The employment market may only receive a future driver/staff member after `f1_eligible_from` has been reached. A `talent_visible` driver may be shown by scouting while remaining absent from the free-agent market and active F1 driver collection.

Entities already in the authoritative active `world` are treated as visible even when an older SeasonPack row lacks the newer visibility metadata. This is a backwards-compatibility rule for historical start rosters, not a shortcut for future pools.

## Historical archive rule

A historical driver whose real career ended before the selected start season belongs in `history.preCareer`/the pre-career archive. They must not be promoted into the active driver market merely because their identity exists in the Global Database.

Historical future race results, standings, winners and other outcomes remain excluded from the Save World. Future structural calendar references may exist under `reference.futureStructure`, with outcome fields stripped.

## Legacy compatibility

SeasonPack v0.7/v0.8 uses combined fields such as `activation_year` or `world_or_talent_activation_year`. The visibility layer accepts these as compatibility inputs. New/updated Global and Season Database data should prefer the dedicated fields above.

`f1_rookie_season` and other historical debut aliases are accepted only as a last-resort compatibility fallback when old data supplies no dedicated F1 eligibility metadata. They are not the canonical visibility rule.

The v0.8 package already separates future/context data from the initial 1980 load and contains an external driver market/scouting roadmap. Raw `externalDriverMarket` data is moved into `SaveWorld.reference.hiddenExternalDriverMarket` so a future UI cannot accidentally expose it directly.

## SeasonPack v0.9 status

The repository currently carries the v0.7 base plus the v0.8 overlay/runtime integration. Phase 20 visibility hardening does not require a wholesale migration to v0.9. When a v0.9 bundle is available to the repository/tooling, its validation/spec sheets should be compared against this frozen contract and represented by tests rather than copied blindly into runtime state.

## Invariants

1. Future identity may exist internally without being visible.
2. Visibility does not imply scouting visibility.
3. Scouting visibility does not imply F1 eligibility.
4. F1 eligibility does not force the historical F1 debut/team/career path.
5. Historical career-end dates do not force simulated retirement.
6. No player-facing system reads raw future pools directly.
7. No post-start historical race outcome is authoritative simulation input.
