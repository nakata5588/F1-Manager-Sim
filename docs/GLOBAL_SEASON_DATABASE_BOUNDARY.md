# Global Database → Season Database → Save World

## Purpose

The historical Master/Global Database is the complete editorial source. A career never runs directly against that mutable source.

Starting a career for a selected season materializes a season-scoped database boundary:

`Global Database -> Season Database -> Save World -> Simulation Engine`

The selected season is a historical starting point, not a historical script.

## Data policy at career start

For a career beginning in season `Y`:

### Past (`< Y`)

Historical temporal records are materialized into `historicalArchive` and then stored in the Save World as `history.preCareer`.

This includes source-supported prior calendars, race results, career rows, team/contract timelines, regulations, events and other dated historical collections available in the Global Database.

These records are immutable reference history. They are not replayed by the simulation.

### Present (`Y`)

Only the selected season's active state is materialized into the active `world`:

- active teams/brands;
- drivers and staff relevant to the start state;
- contracts;
- engines/car/facility/finance state;
- selected-season calendar;
- effective rules and safety model;
- other selected-season gameplay data.

Known future-outcome profile fields such as a driver's later retirement/career end are removed from active/future profiles where they would reveal or script the alternative future.

### Future (`> Y`)

Historical future outcomes are excluded.

The Season Database never imports future race results, winners, championship results, transfers, injuries, deaths or other predetermined outcomes into the Save World.

Two controlled future channels are retained:

1. `futureEntities` / `futureDrivers` / `futureTeams` / `futureStaff` — identity and eligibility pools so real people/organisations that did not yet exist in the selected season can become available later without scripting their real careers;
2. `futureStructure` — hidden, non-authoritative structural reference. It currently carries future calendar structures and track identities so a 1980 career can know that 1981 had a different number/list of scheduled Grands Prix without importing the real 1981 results.

`futureStructure` is stored under `save.reference`, not in the active `world` and not in player career history.

## Calendar rollover

At a new season the rollover priority is:

1. an already materialized active-world calendar, if present;
2. hidden Global historical calendar structure for that season;
3. previous-season calendar fallback only when no historical structural reference exists.

Historical calendar structure defines a baseline schedule, not race outcomes. Future calendar-evolution systems may later alter that baseline as the alternative timeline diverges.

## 1980 and 2000 examples

A 1980 Season Database contains:

- history through 1979;
- active 1980 state and calendar;
- future entity pools;
- hidden structural calendars from 1981 onward when present in the Global Database;
- no post-start historical race results.

A 2000 Season Database uses the same rules:

- history through 1999;
- active 2000 state;
- future entity pools and hidden structure from 2001 onward;
- no post-start historical outcomes.

No special-case 1980 logic is required.

## Materialization commands

Audit an Excel Master Database and emit the canonical Global Database:

```bash
npm run db:audit -- /path/to/master.xlsx --season 1980 --full-world
```

Materialize a standalone Season Database:

```bash
npm run seasondb:materialize -- build/historical/canonical-world.json --season 1980 --out build/season-databases/1980.json
```

The same command works for another validated season:

```bash
npm run seasondb:materialize -- build/historical/canonical-world.json --season 2000 --out build/season-databases/2000.json
```

Run a long simulation directly from the Global Database boundary:

```bash
npm run sim:long-run -- --global-world build/historical/canonical-world.json --season 1980 --seasons 10
```

For the current highly calibrated 1980 SeasonPack, the Global boundary can be layered onto the SeasonPack state:

```bash
npm run sim:long-run -- \
  --global-world build/historical/canonical-world.json \
  --season 1980 \
  --season-pack data/season-packs/1980/season-pack-1980.v0.7.json \
  --overlay data/season-packs/1980/season-pack-1980.v0.8.overlay.json.gz \
  --seasons 10
```

This preserves the richer 1980 gameplay calibration while using the Global Database for pre-career history and hidden future calendar structure.

## Non-negotiable invariant

A historical future result may exist in the Global Database for research/history purposes, but once a career starts it must never become an authoritative future result in that Save World.

History is the starting condition. The simulation owns everything after Start Career.
