# Phase 11 implementation notes

The v0.8 calibration layer is intentionally temporary per race weekend.

`world.carState` remains the evolving Save World car. The calibration system captures that developed state, projects SeasonPack v0.8 multidimensional performance estimates onto the component contract used by Race Weekend, adds the Save World development deltas, and restores the exact developed state when the completed-race event is processed.

This avoids three architectural traps:

1. historical estimates becoming authoritative mutable state;
2. R&D being overwritten by a historical baseline at every race;
3. constructor standings or points being used directly as a finishing-order shortcut.

The tyre bridge follows the same rule. Supplier ratings alter expected stint pace but are not translated into invented absolute tyre life. A hard tyre-life figure may only enter the temporal model when the database supplies an explicit lap-based durability value.
