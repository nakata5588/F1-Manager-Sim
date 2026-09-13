# F1 Manager Sim — Database Rebuild v1.2.11

## 1980 Calendar / Circuits / Weather Recovery Candidate

Generated: `2026-09-13T15:45:00+01:00`  
Base artifact: `v1.2.10-1980-driver-availability-free-driver-candidate`  
Candidate version: `v1.2.11-1980-calendar-circuits-weather-recovery-candidate`

## Purpose

This is a **database-only** recovery/cumulative candidate.

It fixes the earlier publication gap where the planned v1.2.8 Calendar/Circuits/Weather source-lock layer was described but not actually materialized as real files. v1.2.11 is built on top of the real v1.2.10 artifact and preserves the real cumulative chain:

```text
v1.2.3
→ v1.2.4 technical source
→ v1.2.5 technical source-lock
→ v1.2.6 finance/contracts/sponsors source-lock
→ v1.2.7 regulations/tyres/race weekend source-lock
→ v1.2.9 drivers/ratings/career source-lock
→ v1.2.10 driver availability/free-driver
→ v1.2.11 recovered calendar/circuits/weather source-lock
```

Do **not** integrate a separate v1.2.8 artifact. It was not materialized. Use this v1.2.11 bundle as the latest cumulative 1980 database candidate.

## Added collections

| Collection | Rows |
|---|---:|
| `calendarCircuitWeatherSourceManifestV1211` | 5 |
| `calendarSourceLockAudit1980` | 14 |
| `circuitSourceLockAudit1980` | 14 |
| `circuitLayoutBaseline1980` | 14 |
| `weatherProfileBaseline1980` | 14 |
| `trackEvolutionBaseline1980` | 14 |
| `calendarCircuitWeatherUnknownFields1980` | 8 |
| `calendarCircuitWeatherDataPolicy` | 7 |
| `calendarCircuitWeatherMaterializerDeltaSpecV1211` | 6 |
| `calendarCircuitWeatherReadiness1980` | 8 |
| `v1211CumulativeIntegrityChecks` | 10 |

## Source-lock boundary

### Source-locked / historical starting data

- 1980 championship calendar round order.
- GP identity, race date and stable GP/track IDs.
- Circuit identity and country/location context.
- Spanish GP 1980 remains excluded from the championship calendar by default.

### Derived gameplay baseline

- Weather probabilities.
- Average temperature bands.
- Storm/wind baseline.
- Track evolution/rubbering indexes.
- Overtaking, tyre stress and grip-evolution simulation traits.

### Save World / simulation state

- Actual session weather.
- Rubbering-in during a weekend.
- Track temperature.
- Qualifying results.
- Race classifications.
- Incidents, flags and race-control state.
- Any post-start calendar changes.

## Period display-name recovery

v1.2.11 adds period-correct display-name handling while preserving stable track IDs. Flagged examples include:

| Track ID | Existing DB Name | Period-correct 1980 display |
|---|---|---|
| `tr_0018` | Autódromo Juan y Oscar GÃ¡lvez | Autódromo Municipal Ciudad de Buenos Aires |
| `tr_0028` | Autódromo JosÃ© Carlos Pace | Interlagos / Autódromo José Carlos Pace |
| `tr_0067` | Kyalami | Kyalami Grand Prix Circuit |
| `tr_0088` | Long Beach | Long Beach Street Circuit |
| `tr_0026` | Zolder | Circuit Zolder |
| `tr_0022` | Red Bull Ring | Österreichring |
| `tr_0058` | Circuit Park Zandvoort | Circuit Zandvoort |
| `tr_0047` | Autodromo Enzo e Dino Ferrari | Autodromo Dino Ferrari |
| `tr_0030` | Circuit Gilles Villeneuve | Circuit Île Notre-Dame |
| `tr_0090` | Watkins Glen | Watkins Glen Grand Prix Circuit |


Total period-name rows flagged: **10**.

These are display/source-lock corrections, not ID changes.

## Calendar coverage

1980 championship rounds: **14/14**.

The Season Definition retains 14 championship rounds and marks post-start results as `reference_only_hidden_after_career_start`.

## Validation

| Check | Result |
|---|---|
| Global SQLite integrity | `ok` |
| Season SQLite integrity | `ok` |
| Calendar audit coverage | `14/14` |
| Circuit audit coverage | `14/14` |
| Layout baseline coverage | `14/14` |
| Weather baseline coverage | `14/14` |
| Track evolution baseline coverage | `14/14` |
| v1.2.4-v1.2.10 real chain preserved | `PASS` |
| v1.2.8 planned scope recovered | `PASS` |
| Dynamic weather/race outcome stored as historical fact | `0` |
| Season sourceChecksum equals Global manifest.sourceSha256 | `PASS` |

## Development integration note

Recommended Development wording:

```text
Integrate v1.2.11 as the latest cumulative 1980 database candidate.
Do not integrate v1.2.8 separately: that scope is recovered inside v1.2.11.
v1.2.11 is built on v1.2.10 and preserves technical, finance, regulations/tyres, drivers and free-driver availability.
Keep Calendar/Circuits/Weather packs under reference/databaseContext; do not use weather/track evolution as scripted outcomes.
No gameplay/UI implementation in this data PR.
```

## Season interchange note

This does not change the architecture. The selected Season Database supplies starting conditions. The Main/Global Database and gameplay engines remain stable.

```text
Global/Main Database
→ selected Season Database
→ Save World
→ Simulation Engine
```

For now, only 1980 remains the supported target for these candidates.
