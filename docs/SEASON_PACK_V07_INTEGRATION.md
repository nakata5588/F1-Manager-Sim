# Season Pack v0.7 Integration

The 1980 Season Pack is a materialized start package between the broad immutable Master Database and the evolving Save World.

## Loader boundary

`Season Pack payload -> canonical historical snapshot -> createSaveWorld() -> Simulation Engine`

The simulation does not depend on workbook sheet names. Only the loader knows the Season Pack matrix format.

## v0.7 precedence rules

Some v0.7 sheets intentionally retain legacy/reference values beside corrected period-specific data. The loader therefore uses explicit precedence rather than copying one sheet blindly.

### Circuit data

For each championship round:

1. `1980_Circuit_Layouts` supplies period layout length, scheduled laps and historical layout identity.
2. `1980_Circuit_Gameplay_Traits` supplies simulation traits such as power/aero sensitivity, tyre wear, passing difficulty and incident risk.
3. `1980_Calendar` supplies event identity/date and is the fallback only when a period override is absent.

This prevents modern Interlagos (`4.309 km / 71 laps`) or other generic circuit values from replacing the 1980 layout (`7.873 km / 40 laps`).

### Staff

Only staff IDs present in `1980_Staff_Loadout` with `import_on_new_1980_save = TRUE` are materialized as active start-save staff. Context/transition/future rows remain research data and are not silently employed.

### Engines

`1980_Team_Engines` retains the stable engine ID used by the game. `1980_Engine_Catalog` overrides race-model performance/reliability fields when a source-engine mapping exists through the entrant data. `Reference_Engines` remains the fallback.

### Tyres

`1980_Tyre_Packages` is loaded as supplier-level tyre data. It does **not** contain explicit stint life in laps, so the game must not convert the durability rating into a fabricated pit-stop schedule. `1980_Full_Entrants` supplies the tyre manufacturer attached to each start entry/team.

### Rules

`1980_Race_Model_Params` is materialized into `raceModelParams` and supplements the simple Rules/Qualifying sheets. In particular v0.7 explicitly states:

- 9-6-4-3-2-1 points;
- two qualifying sessions;
- no forced historical substitutions;
- race refuelling disabled;
- modern Safety Car disabled;
- elevated mechanical attrition calibration.

Race-control features are era-aware and must not assume modern mechanisms when these parameters disable them.

## Start entries versus employment

`1980_Full_Entrants` contains a source-supported round-one entry state. This is kept separately as `startingRaceEntries` because an entry and an employment role are not always identical concepts. Later historical substitutions are reference only; they are not forced after career start.

## Future entities

`Future_Entity_Queue_1980` is loaded only for entities not already active in the start snapshot. Eligibility means the entity may enter the simulated world when appropriate; it never scripts its real-world F1 team, debut, success or retirement.

## Known v0.7 source issues retained outside the authoritative runtime

- legacy driver-contract number columns still contain several pre-correction numbers; round-one entry/car-number data takes precedence for race entry identity;
- legacy weather profiles still use old `tr_...` IDs and are not authoritative until mapped to canonical `CIR...` IDs;
- legacy pit-crew rows still use old team IDs and should be migrated before they become authoritative runtime inputs;
- supplier-level tyre durability is a rating, not a stint-life measurement.

The loader preserves these boundaries rather than guessing conversions.