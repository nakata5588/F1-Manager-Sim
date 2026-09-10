# Long-Run Simulation Validation

The project quality target is not merely to complete one historical season. A Save World must remain coherent for 10–20 autonomous seasons after the historical start.

## Purpose

The long-run harness starts from an immutable historical Season Pack, creates an independent Save World, and advances the normal core simulation systems year by year. It does not load later historical outcomes.

For the initial 1980 target, the checked-in SeasonPack 1980 v0.8 is used as the real integration fixture. The baseline CI soak covers ten complete seasons: 1980 through 1989, reaching 1990 after ten season rollovers.

## Current invariants

A long-run run fails when it detects structural world corruption, including:

- a simulated season with no races;
- a season with a different race count from the supplied baseline when an expected count is configured;
- missing or duplicate archived championship seasons;
- races with empty classifications, duplicate drivers, non-contiguous positions, unknown driver IDs or unknown team IDs;
- invalid temporal race lap counts;
- current race entries containing duplicate, missing or retired drivers;
- employment assignments pointing at unknown workers or teams;
- non-finite numeric state in team finances, mutable car state or career state;
- failure to reach the expected final world season.

Warnings are retained separately for conditions that are incomplete but not necessarily corrupt, such as future seasons without a complete championship scoring contract.

## Running locally

```bash
npm run sim:long-run
```

Defaults:

- SeasonPack: `data/season-packs/1980/season-pack-1980.v0.7.json`
- overlay: `data/season-packs/1980/season-pack-1980.v0.8.overlay.json.gz`
- seasons: `10`
- seed: `seasonpack-1980-long-run`

A longer soak can be requested explicitly:

```bash
npm run sim:long-run -- --seasons 20 --seed twenty-season-soak
```

The command prints yearly checkpoints plus final health metrics and exits non-zero if structural validation fails.

## What this gate does not guarantee yet

Passing the soak test proves continuity and structural coherence, not final game balance. It does not yet assert realistic championship diversity, financially sustainable budgets, historically plausible transfer frequency, field-size targets, competitive convergence/divergence or regulation-era evolution.

Those become quantitative balancing gates once the relevant systems have stable mechanics. The first rule remains: a long simulation must never be made to pass by replaying historical future data.
