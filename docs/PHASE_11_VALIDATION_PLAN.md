# Phase 11 validation plan

Phase 11 is accepted only if all of the following hold:

- the standard Node simulation suite remains green;
- the Python database-tooling suite remains green;
- the real 1980 v0.8 SeasonPack initializes 15 calibrated team baselines after `carState` exists;
- qualifying and race calibration differ when the source model has different qualifying/race pace;
- component development deltas remain numerically intact through calibration;
- the pre-weekend developed car is restored after `race.completed`;
- changing historical constructor rank/points or the non-relational `primary_chassis_package` field cannot change calibrated components;
- supplier warm-up, wear resistance and wet performance change stint grip;
- tyre supplier ratings cannot create a hard durability-lap value by themselves.

Once CI is green, Phase 11 can merge to `main` and the next step becomes long-run calibration/balance rather than more database plumbing.
