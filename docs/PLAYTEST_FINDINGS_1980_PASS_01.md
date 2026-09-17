# 1980 Playtest Findings — Pass 01

Status: active Development backlog after PR #59.

These findings come from the first human-facing 1980 playtest after the v1.2.16 Database -> Runtime integration. They are gameplay/UX findings, not database promotion gates.

## P0 — Simulation / game-rule correctness

### Ownership and governance roles are not recruitable staff

Owners, chairmen/presidents, founders/proprietors and equivalent ownership/governance identities must remain visible in team/person profiles but must not enter the ordinary staff recruitment market or contract-negotiation flow.

Mixed roles containing an ownership identity (for example `Owner/Team Principal`) are ownership-locked unless the ownership role ends in Save World through a future team-governance system.

### Facility availability is era-aware

A facility concept existing in the global model does not mean that it is available to every historical start.

Facilities require an availability state separate from level:

- unavailable_future_technology
- available_unbuilt
- operational
- upgrading

A zero or absent historical source field must not silently become an immediately buildable modern facility. In particular, the 1980 `simulator` baseline is not evidence that an F1 driver-in-the-loop simulator is available in 1980.

Facility unlock dates/rules must be explicit simulation/gameplay metadata with provenance. Historical opening baselines describe what the team has; era availability describes what the sport can build.

### Tyre strategy must expose actual choices

The race engine already supports compound-specific live box instructions. The player experience must expose all supplier-compatible, era-appropriate tyre choices before the race and during a live pit call.

If historical tyre compound granularity is unavailable, the runtime may use clearly labelled derived gameplay compound families rather than pretending modern Soft/Medium/Hard labels are historical 1980 facts.

The player must be able to:

- choose starting tyre per car;
- inspect available dry/wet tyre alternatives;
- call BOX and choose the tyre fitted at that stop;
- revise a future stint without rewriting completed race history.

## P1 — Football Manager-style information architecture

### Entity names are links

Driver, staff and team names should be navigable entities throughout the UI. A single reusable entity-profile route/model should back links from Home, Team, Drivers, Staff, standings, qualifying, race timing, inbox/news and recruitment.

Profiles must read current Save World state and historical reference/provenance without allowing the UI to become simulation authority.

### Media / image pipeline

The UI needs image slots for drivers, staff, teams, circuits and eventually cars/sponsors. Media is presentation metadata, separate from authoritative simulation data.

Do not scrape arbitrary copyrighted imagery into the repository. Media records should carry source/license/provenance metadata and support local fallbacks/silhouettes when no distributable asset is available.

## P1 — Race weekend depth

The first race playtest exposes insufficient interactive depth. Expand automated and human tests around:

- multi-compound strategy;
- dry/wet transitions;
- pit calls and pit timing;
- traffic and overtaking;
- undercut/overcut consequences;
- damage and repairs;
- mechanical failures;
- flags/red flags/era race control;
- fuel when era-appropriate;
- tyre wear/temperature;
- setup effects;
- qualifying/grid edge cases;
- DNQ/classification rules;
- pause/resume determinism.

Race outcomes must continue to emerge from driver + car + team + circuit + conditions + setup + strategy + reliability + form/morale + controlled randomness.

## P2 — Race presentation

The current race view is a developer timing screen, not the intended final race-management experience. Improve it only on top of authoritative live-race state.

Target presentation:

- richer timing tower;
- tyre icon/compound and wear/temperature per car;
- gaps/intervals and pit-stop state;
- weather/track-state strip;
- race-control banner;
- strategy timeline;
- clearer pit-wall controls;
- circuit/map visualization when suitable data exists;
- event feed with incidents, overtakes, stops and failures.

Presentation must never directly calculate or overwrite race state.

## Recommended implementation sequence

1. Recruitment/governance role lock.
2. Facility era-availability model and 1980 simulator lock.
3. Tyre catalogue/runtime fallback audit and full pre-race/live tyre controls.
4. Reusable entity-profile model/router and clickable names.
5. Race-engine regression/depth pass.
6. Race presentation upgrade.
7. Media asset pipeline and licensed/open assets.

This sequence deliberately fixes game-rule correctness before visual polish while keeping profile/navigation foundations early enough for continued human playtesting.
