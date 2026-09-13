# F1 Manager Sim — Database v1.2.11 cumulative 1980 candidate integration

## Status

`v1.2.11-1980-calendar-circuits-weather-recovery-candidate` is integrated as the **latest cumulative 1980 database candidate**.

It is **not promoted to canonical by this PR**. The previously promoted canonical baseline remains `v1.2.5-1980-technical-source-lock-candidate` until a separate promotion decision is made.

## Cumulative chain

The supplied v1.2.11 bundle is built from the real v1.2.10 artifact and preserves:

```text
v1.2.3
→ v1.2.4 technical source
→ v1.2.5 technical source-lock
→ v1.2.6 finance/contracts/sponsors source-lock
→ v1.2.7 regulations/tyres/race-weekend source-lock
→ v1.2.9 drivers/ratings/career source-lock
→ v1.2.10 driver availability/free-driver
→ v1.2.11 recovered Calendar/Circuits/Weather source-lock
```

There is deliberately **no separate v1.2.8 integration**. The missing planned v1.2.8 Calendar/Circuits/Weather scope is recovered inside v1.2.11.

## Independent bundle audit

The uploaded bundle was independently checked before integration:

- 21/21 listed file checksums match;
- Global SQLite `PRAGMA integrity_check` = `ok`;
- Season SQLite `PRAGMA integrity_check` = `ok`;
- Global `databaseVersion` and embedded `manifest.databaseVersion` both identify v1.2.11;
- Global `manifest.sourceSha256` and Season `sourceChecksum` both equal `9d29b8d004dbbc371b935e155a396bd6f33410f635de9ebdae4e808f8e2cc097`;
- 1980 calendar = 14 championship rounds;
- calendar source-lock audit = 14/14;
- circuit source-lock audit = 14/14;
- circuit layout baseline = 14/14;
- weather baseline = 14/14;
- track-evolution baseline = 14/14;
- 10 period-display-name corrections are explicitly flagged without changing stable track IDs;
- Spanish GP 1980 remains excluded/reference-only rather than becoming a championship round;
- cumulative integrity checks for v1.2.4 through v1.2.10 all report `PASS`;
- dynamic weather/race outcome authority stored as a historical starting fact = 0.

## Calendar / circuit authority

The following are historical starting/reference data:

- championship round order;
- GP identity;
- race date;
- stable GP ID;
- stable track ID;
- circuit identity and location context;
- period-correct display-name overrides.

These facts establish the starting world only. They do not prescribe post-career outcomes.

## Derived gameplay baselines

The following remain explicitly classified as `derived_gameplay_baseline`:

- rain probability;
- average air-temperature baseline;
- storm/wind baseline;
- rubbering rate;
- green-track penalty;
- qualifying evolution index;
- race grip stability;
- off-line marble risk;
- circuit performance-trait indexes where the bundle labels them derived.

They are calibration inputs, not historical facts.

## Save World / simulation authority

The database must **not** script:

- actual session weather;
- track temperature;
- live rubbering/grip state;
- qualifying classification;
- race classification;
- incidents;
- flags / race-control state;
- post-start calendar changes.

Historical race results remain reference/archive data only for a career starting in 1980.

## Repository policy

The source repository keeps only compact reproducibility/audit material:

- `baseline.json`;
- `CHECKSUMS.json`;
- the original small source/audit CSV pack;
- the bundle report;
- the latest-candidate pointer.

The large Global JSON, Season JSON, SQLite files and editor XLSX remain external and are identified by SHA-256.

No gameplay or UI implementation belongs in this integration PR.
