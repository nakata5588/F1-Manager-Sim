# SeasonPack 1980 v0.8 Integration

## Purpose

SeasonPack 1980 v0.8 deepens the playable 1980 start without changing the core architecture:

`Master Historical Database -> SeasonPack -> immutable Historical World -> mutable Save World -> Simulation`

The v0.8 source extends v0.7 with technical calibration, financial, sponsor, board and external-driver-market models while also correcting later-season entrant loader flags.

## Versioned overlay packaging

The repository keeps the complete v0.7 payload as the stable base and stores v0.8 as a versioned overlay at:

`data/season-packs/1980/season-pack-1980.v0.8.overlay.json.gz`

The overlay contains only sheets that are new or changed relative to v0.7. This avoids duplicating unchanged historical tables while preserving an auditable version boundary.

The overlay records the SHA-256 of the original supplied v0.8 payload:

`6c3055674fa16e473c790241555a6837e1cfdc5062e43e2be2edfe5e6d571211`

Applying the overlay never mutates the v0.7 payload. Existing v0.7 consumers and saves remain supported and pinned to their original database version/checksum.

## Loader contract

A normal new 1980 career imports only the playable start state:

- 15 playable teams;
- 28 initial contracted/race-entry drivers;
- 51 staff assignments explicitly marked safe for a new 1980 save;
- 14 scheduled championship rounds.

Later substitutions, cameo entries, historical incidents and post-start historical outcomes remain reference context. They are not automatically replayed in Save World.

The v0.8 correction to `1980_Full_Entrants` is therefore authoritative for loader behavior: later-season entrant rows must not have `load_into_save_default=true`.

## v0.8 runtime models

The runtime adapter validates and exposes these v0.8 model tables:

- `1980_Car_Performance_Model`
- `1980_Chassis_Performance_Detail`
- `1980_Engine_Model`
- `1980_Tyre_Model`
- `1980_Finance_Model`
- `1980_Sponsor_Model`
- `1980_Board_Objectives`
- `1980_Team_Balance_Profile`
- `1980_External_Driver_Market`
- `1980_Race_Weekend_Data_Status`
- `1980_Technical_Regulations`

The adapter also keeps completeness/readiness/audit tables in SeasonPack context.

### Car performance

`Car_Performance_Model` is exposed as first-class calibration data and augments legacy `carStats` without deleting the existing component fields. Its values are baseline gameplay estimates, not measured historical telemetry.

Dynamic `Save World.carState` remains authoritative once development changes a team's components. The model is a historical-start calibration layer, not a hardcoded future performance order.

Constructor rank/points reference fields are context and calibration evidence. They must never be used directly as race-result formulas.

### Engines

`Engine_Model` enriches canonical engines and takes precedence for gameplay power, reliability, cooling demand, driveability, fuel efficiency and development characteristics where provided.

These fields are explicitly tagged by their source `data_status`. Historical engine identity and gameplay rating estimates remain distinguishable.

### Tyres

`Tyre_Model` is exposed alongside the existing tyre-package representation. The current runtime preserves legacy compound fields used by race strategy while adding v0.8 supplier-level calibration fields such as peak dry grip, warm-up, wear resistance, wet performance and operating-window width.

Supplier scope remains team-specific. v0.8 calibration must not create tyre access for teams that did not have that supplier at the start.

### Finance

`Finance_Model` uses the package's fictional gameplay unit system, `F1MS_1980_budget_units_millions`. Values are converted to scalar internal units for Save World calculations (`1.0 model million = 1,000,000 internal units`).

This is not historical currency or exact 1980 accounting. `cash_on_hand_start_m` seeds the team's runtime cash balance while the original model row and its `data_status` remain available for provenance.

### Sponsors

`Sponsor_Model` is exposed as a gameplay-estimate model but is kept separate from `sponsorContracts`. It is not automatically added to monthly sponsor income because doing so would double-count sponsorship already represented by contracts.

### Board objectives and team balance

Board objectives and team balance profiles are first-class historical-start gameplay context. They may drive future AI/player-facing systems, but they do not predetermine sporting results.

## External driver market

`1980_External_Driver_Market` is a scouting/availability/reference pool, not an authoritative list of active free agents.

The table can legitimately contain:

- repeated people in different reference contexts;
- drivers already represented elsewhere in the SeasonPack;
- rows without a canonical `driver_id` when the historical identity has not yet been fully reconciled;
- future talents who are not yet eligible for active competition.

For this reason, runtime validation requires a usable driver name but deliberately does not require unique/non-null driver IDs. Loading this table never creates employment, race entries or active drivers by itself. Eligibility and Save World systems remain responsible for activation.

## Historical facts vs gameplay estimates

The v0.8 package explicitly distinguishes source-backed identity/history from gameplay estimates. Runtime code must preserve this distinction.

Examples of estimate/status fields include:

- `historical_identity_plus_gameplay_estimate`
- `identity_confirmed_gameplay_estimate`
- `gameplay_estimate_not_historical_currency`
- `gameplay_design_estimate`

The UI and future simulation/debug tooling should never present these values as exact period measurements or accounting records.

## Materialization

v0.7 can still be materialized directly. v0.8 is materialized by applying the overlay:

```bash
npm run seasonpack:materialize -- \
  --season-pack data/season-packs/1980/season-pack-1980.v0.7.json \
  --overlay data/season-packs/1980/season-pack-1980.v0.8.overlay.json.gz \
  --out tmp/1980-loader-test.save.json \
  --seed 1980-loader-test
```

The generated Save World records `databaseVersion = season-pack-0.8` and the original supplied v0.8 source SHA-256.

## Regression guarantees

Automated integration tests verify that:

- v0.7 remains unchanged when the overlay is applied;
- v0.8 model coverage is complete for the 15 playable teams where required;
- all four engine packages and both tyre suppliers resolve;
- only 28 round-one entries seed the career;
- later entrants such as Nigel Mansell, Rupert Keegan and Mike Thackwell are not auto-loaded as starters;
- David Kennedy remains a valid round-one starter;
- the external-driver-market table remains contextual only;
- Save World can diverge without mutating the immutable historical snapshot;
- gameplay-estimate provenance remains attached to the new models.

## Next simulation step

The next race-engine integration should consume v0.8 as calibration, not as a fixed finishing-order table:

1. derive track-sensitive start-of-1980 car baselines from the multidimensional car model;
2. let dynamic component/R&D deltas move teams away from that baseline;
3. use tyre supplier warm-up/wear/wet traits in stint performance;
4. retain the v0.8 engine model for power/reliability trade-offs;
5. validate outcomes through seeded long-run simulations rather than matching historical winners race by race.
