# 1980 Database -> Runtime Integration

## Purpose

The Global Database and the 1980 Season Database are not passive archives. Career creation must materialize their valid opening-state data into Save World while keeping audit/reference data outside mutable simulation state.

The boundary is:

`Global Database -> validated Season Database -> opening-state adapters -> Save World -> simulation`

Historical source data remains immutable. Once the career begins, mutable outcomes belong to Save World.

## v1.2.16 opening-state integration

### Directly authoritative at Career Start

The following Season Database surfaces define opening facts or explicit opening availability and are consumed by runtime systems:

- `teams`, `drivers`, `staff` — active identities/profiles;
- `contracts`, `staffContracts` — opening employment assignments;
- `driverAvailabilitySnapshot1980` — opening driver-market authority;
- `startingRaceEntries` / entry surfaces — opening grid/role state where supplied;
- current rules/scoring/safety surfaces — era rules;
- technical component/facility/engine/tyre assignments — starting technical state;
- sponsor presence/contracts where source-locked — starting commercial associations.

`driverAvailabilitySnapshot1980` is applied after the generic employment market is initialized. A driver covered by that surface is an opening free agent only when the database explicitly says so. This prevents `external_candidate_availability_unverified`, scout-only talent and inactive/returnable drivers from becoming signable merely because they have no F1 contract row.

This authority is **opening-state only**. After Career Start, contracts, transfers, retirements and availability are simulation-owned.

### Materialized gameplay baselines

Some database rows are not already in the shape consumed by the simulation. `databaseOpeningState.js` materializes them before Save World is created.

#### Team finance

`teamFinanceBaseline1980` seeds `teamFinancials` and therefore opening team cash/budget.

The database marks these values as gameplay/abstract baselines where historical monetary evidence is unavailable. The game must not present an `abstract_index` as a sourced historical currency amount.

#### Period-correct circuit layout baselines

`circuitLayoutBaseline1980` overrides modern/global lap-length/layout references and gameplay traits for the 1980 runtime season. It does **not** provide coordinate geometry. It can supply:

- period-correct lap length;
- scheduled laps and race distance;
- period-correct track name;
- power/aero/brake/tyre/overtaking/incident sensitivity baselines where present.

This changes only the season-scoped runtime copy. It never rewrites the Global Database track identity.

Exact 1980 centerline / pit-lane / corner coordinates remain deferred research. The separate Circuit Geometry Model must report geometry as unavailable until explicit reviewed coordinates are supplied; it must not infer a historical-looking map from these performance/layout baselines.

#### Track evolution

`trackEvolutionBaseline1980` seeds the existing track-dynamics model. Rubbering/evolution values become the starting model inputs; actual session track state remains simulation-owned.

#### Weather

`weatherProfileBaseline1980` contains climate/probability baselines, not historical session outcomes. On weekend start, the runtime uses the save seed plus the database probabilities to generate an actual weather timeline into Save World.

Rules:

- same save seed + same weekend -> deterministic weather;
- a supplied explicit weather timeline always wins;
- generated weather is labelled `save_world_generated_from_database_probability_baseline`;
- the probability baseline is never represented as the real historical 1980 weekend weather.

### Operational regulation fallbacks

v1.2.16 includes `operationalRegulationFallbacks1980V1216`.

The championship countback fallback is consumed when explicitly present:

- points ties are compared by counts of highest finishing positions in descending order;
- the resulting champion status is labelled `resolved_operational_countback`;
- the rule retains `historical_fact_claim: false` and its database source status.

Older databases without this explicit fallback retain the conservative `tiebreak_required` behaviour.

The 90% race-classification fallback remains research debt and is **not** promoted into a hard classification rule by this integration. Exact classified/unclassified handling needs a dedicated sporting-rules implementation rather than a silent approximation.

## Intentionally not converted into historical money

`payrollCompensationBaseline1980` provides `salary_index` / `abstract_index` values because exact historical salaries are not source-locked. These values can support relative gameplay valuation, negotiation expectations or future finance balancing, but they are not converted into historical currency by this integration.

Likewise, sponsor rows whose commercial value is `unknown_do_not_store` establish sponsor presence but do not create invented historical contract values.

This follows the database finance policy:

- role/team/date can be opening facts;
- compensation is independently sourced;
- unknown historical money stays unknown;
- post-start cash movement belongs to Save World.

## Reference-only quarantine

Audit, source-lock, readiness, publication, supersession and canonical-closure surfaces are useful evidence but are not gameplay state. `createSaveWorld()` moves these into:

`reference.databaseContext`

rather than leaving them in mutable `world` state.

Operational surfaces are explicitly exempted from quarantine when a runtime system legitimately consumes them.

## Historical authority rule

No v1.2.16 integration may turn later historical outcomes into simulation instructions.

Examples:

- historical future debut != automatic F1 signing;
- historical future team entry != automatic championship entry;
- weather probability != historical weather result;
- later contract != opening employment;
- historical retirement reference != scripted retirement;
- track model seed != fixed race evolution.

The database establishes the historical starting world. The Save World creates the alternative future.
