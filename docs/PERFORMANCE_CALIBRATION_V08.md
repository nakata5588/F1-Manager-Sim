# Phase 11 — SeasonPack v0.8 Performance Calibration

## Goal

Turn the SeasonPack 1980 v0.8 gameplay models into race-engine starting conditions without turning historical standings into scripted outcomes.

The calibration layer sits between mutable team development state and the existing Race Weekend engine:

`SeasonPack v0.8 model -> session calibration -> existing race engine -> temporal race -> result`

The team's persistent `carState` remains the authoritative evolving development state. Calibration is temporary for the active race weekend and is restored after the race.

## Car model

The v0.8 `Car_Performance_Model` supplies multidimensional starting estimates:

- qualifying pace;
- race pace;
- aero efficiency;
- mechanical grip;
- straight-line speed;
- low-speed performance;
- high-speed performance;
- tyre-wear control;
- cooling margin;
- reliability.

The calibration bridge projects those dimensions onto the existing car component contract used by Race Weekend. It is deliberately session-specific: qualifying uses `qualifying_pace`, while race calibration uses `race_pace`.

Circuit gameplay traits change the projection through power sensitivity, aero sensitivity, brake stress and tyre wear. The existing Race Weekend engine still applies its own circuit dependency weights, so the result remains multidimensional rather than a single Overall score.

## R&D divergence

When a career starts, the calibration system records the source car component baseline. Before a race weekend it measures the current mutable `carState` against that source baseline.

The resulting development deltas are carried into the calibrated qualifying/race package. A team that has gained +5 aero through Save World R&D therefore keeps that +5 advantage over its v0.8 historical-start calibration.

After the weekend, the temporary calibrated component set is removed and the exact pre-weekend developed car is restored. This prevents calibration drift and ensures R&D remains authoritative.

## Historical-result isolation

The following v0.8 fields are explicitly not read by the race-performance projection:

- `constructor_1980_rank_reference`;
- `constructor_1980_points_reference`;
- `primary_chassis_package` when it is only a package/reference value.

Automated regression tests change these fields radically and require identical calibrated race components.

Historical standings are evidence used when authoring gameplay estimates. They are never a runtime result formula.

## Engine model

SeasonPack v0.8 engine rows are already materialized into canonical engines by the runtime loader. The existing Race Weekend engine consumes canonical engine `power` and `reliability`, so the v0.8 engine model now feeds on-track pace/reliability through the normal engine contract.

This preserves the architecture: the race engine does not know or care whether the engine calibration came from v0.7, v0.8 or a future historical database adapter.

## Tyre model

The new supplier-level tyre calibration uses:

- dry peak grip;
- warm-up;
- wear resistance;
- wet performance;
- operating-window width;
- circuit tyre-wear severity.

These values refine the stint grip already produced by the strategy system before the race is archived and before the temporal lap model consumes it.

### No invented tyre life

A supplier wear-resistance rating is not converted into an invented number of laps. Hard stint-life limits remain `null` unless explicit durability-lap data exists.

Wear resistance, warm-up and operating-window ratings instead change expected stint pace. This keeps uncertainty useful without pretending an estimated 0–100 rating is an exact historical tyre-life measurement.

## Event ordering

The core system order is important:

1. team development owns persistent `carState`;
2. race strategy locks the team's stint plan on `race.grid_set`;
3. performance calibration applies the race package and supplier tyre traits;
4. Race Weekend creates the aggregate classification;
5. the temporal race engine refines it lap by lap;
6. the calibrated car is restored to the persistent development state.

The strategy system must remain before performance calibration for `race.grid_set`, otherwise tyre traits would be applied after Race Weekend had already archived the weekend payload.

## Current boundary

Phase 11 does not yet model live setup changes, tyre temperatures, per-corner car behavior, engine modes or component-specific failure trees.

It establishes the correct data/simulation boundary so those systems can be added later without importing historical winners or fixed season outcomes.
