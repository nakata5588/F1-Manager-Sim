# Playable Validation Gate #1 — 1980 / Williams

## Purpose

This gate freezes the first supported playable path as a regression contract:

`Launch -> Main Menu -> New Game -> Database -> 1980s -> 1980 -> Williams -> Manager -> Career Home -> Continue -> Argentine Grand Prix -> Practice -> Qualifying -> Pre-Race -> Race -> Results -> Championship`

The gate is a Development milestone. It does not promote or rewrite the Historical Database.

## Evidence boundary

The full v1.2.16 Season Definition JSON is not stored in the Git repository. The repository stores its baseline identity, hashes, counts and runtime integration contract.

Gate #1 therefore uses two complementary sources:

1. **v1.2.16 latest-candidate baseline**
   - confirms the latest integrated candidate identity;
   - locks 15 active teams;
   - locks the 14-round 1980 calendar;
   - confirms Development integration readiness without silently changing canonical-promotion state.

2. **Versioned 1980 Season Pack v0.8 runtime fixture**
   - is stored in the repository;
   - materializes the opening 1980 runtime world;
   - contains the 15 opening teams, 28 Round 1 starters and 14-round calendar;
   - is used to execute the complete application/simulation smoke path.

This avoids fabricating a local v1.2.16 artifact or checking a copied database snapshot into Development merely for tests.

## Locked opening-world expectations

The gate fails if any of these regress:

- exactly 15 active opening teams;
- Williams is selectable;
- Williams Round 1 drivers are Alan Jones and Carlos Reutemann;
- Career Start is `1980-01-01`;
- Round 1 is the Argentine Grand Prix;
- Round 1 date is `1980-01-13`;
- a new career has no archived races;
- initial driver and constructor championship points/wins are zero;
- player-facing New Game / Career / Results projections do not expose hidden future entity pools.

## New Game contract

The smoke path uses the same application components as the browser flow:

- `DeveloperPlaytestSession.setup()`;
- Team Selection v2 projection;
- `buildNewGameCatalog()`;
- New Game selection validation;
- Manager Profile v1 validation;
- `DeveloperPlaytestSession.startCareer()`.

The selected manager is a test identity only. No manager profile is written into historical source data.

## Race weekend contract

The gate executes the authoritative runtime sequence:

`Career Home -> Continue -> Practice -> Practice Results -> Qualifying Results -> Pre-Race -> Live Race -> Results`

It asserts that:

- the calendar advances to the real Round 1 fixture;
- the controlled team has both opening drivers;
- Practice completes for both Williams cars;
- Qualifying produces a classification;
- the grid and live-race session exist before lights out;
- no race result is archived before the live race finishes;
- the finished race is archived exactly once;
- Results identify the Argentine Grand Prix;
- driver and constructor standings score points after the race.

The test does not assert the historical 1980 race result. The simulated winner/order is free to diverge.

## Future-history boundary

The player-facing projections checked by the gate must never serialize raw:

- `futureDrivers`;
- `futureTeams`;
- `futureStaff`;
- `futureSponsors`;
- `futureEntities`;
- `futureStructure`.

Calendar fixtures are allowed opening-world data. Future historical results, transfers and hidden entity pools are not.

## Relationship to later gates

Gate #1 proves that the first vertical slice remains playable.

It does **not** replace:

- long-run 10–20 season soak validation;
- full season/offseason validation;
- save/load interruption tests;
- broader management balancing;
- final race presentation validation;
- later historical-season expansion gates.

Those remain later milestones.
