# Phase 39 — Offseason & New Season Preparation

Phase 39 closes the career loop between the final Grand Prix of one season and the first Grand Prix of the next.

## Core principle

The offseason is a coordinator, not a replacement for existing management systems.

Contracts remain authoritative in Contracts/Employment. Engine agreements remain authoritative in Suppliers. Sponsor deals remain authoritative in Commercial. Regulations and grid changes remain authoritative in Governance. Technical specifications and manufacturing remain authoritative in the Phase 36/37 technical systems.

The offseason reads those systems, exposes readiness, records a strategic plan, advances the calendar through the quiet months and hands the resulting state into the next season.

The lifecycle is:

`Season Finale -> Championship Review -> Offseason Planning -> Final Checks -> Season Rollover -> Preseason -> First Grand Prix`

## Persistent state

Phase 39 stores:

`world.management.offseason`

with:

- `current` — the active or most recently completed cycle;
- `history` — completed cycles;
- `nextCycleId` — stable event identity.

A cycle records:

- closing season;
- target season;
- stage and stage history;
- immutable closing championship review snapshot;
- per-team strategic plan;
- live preparation checklist;
- season-transition date;
- completion date.

This state survives normal Save World serialization.

## Opening the offseason

The cycle opens automatically when `championship.updated` reports a completed championship.

For the controlled team the system also performs a final Board review. The closing championship standings are copied into the cycle review before the next season resets championship state.

Opening a cycle is idempotent: repeated championship refreshes cannot create multiple offseason cycles for the same closing season.

## Preparation checklist

The checklist is a projection over existing systems rather than duplicated mutable data.

It currently reports:

### Driver and staff contracts

- employed driver/staff count;
- contracts expiring before the target season;
- future deals already signed;
- whether action is required.

### Engine supplier

- active engine;
- current contract end season;
- future supplier agreement;
- whether the target season is covered.

### Commercial

- active sponsor deals;
- deals that cover the target season;
- current monthly sponsor income.

### Governance and grid

- open regulation proposals for the target season;
- pending/accepted team-entry applications affecting the target season.

### Next-season car

- completed specifications targeted at the next season;
- active next-season design projects.

Future specifications created by the player's own R&D are visible to this checklist. This is safe Save World knowledge, not hidden historical future data. Manufacturing and fitment still reject those specifications until their target season becomes active.

### Preseason

Once January rollover has happened, the checklist reads the existing preseason-testing state: test sessions, reliability preparation and development knowledge.

## Strategic plan

Each team receives a season plan with four independent dimensions:

- Technical focus: `balanced`, `performance`, `reliability`;
- Staffing approach: `retain`, `selective`, `rebuild`;
- Commercial approach: `retain`, `expand`;
- Financial risk: `conservative`, `balanced`, `aggressive`.

AI plans are confirmed automatically. The controlled team's plan is player-editable and starts unconfirmed.

The plan does not create a second management model. Phase 39 currently hands the technical and financial-risk dimensions into the existing AI/delegated technical department:

- technical focus becomes the design focus for new projects;
- financial risk changes the minimum cash reserve used before AI/delegated R&D spending.

The staffing and commercial dimensions are persisted now so later AI long-term planning can consume the same season plan without changing the save contract.

If the player has not confirmed a plan by January 1, the current choices are auto-carried into the new season and explicitly marked `auto_carried_at_season_start`. Continue therefore never deadlocks a save waiting for a UI action.

## Board and finance renewal

At the start of the target season:

### Finance

No free cash or second budget currency is created.

The team's existing `cash` remains authoritative. Phase 39 simply sets the new season's `openingCash` equal to the actual current cash and archives the previous opening/closing baseline in `seasonOpeningHistory`.

This makes existing Board financial objectives meaningful on a season-by-season basis.

### Board

`renewBoardSeason()` archives the previous Board objective set and produces a new set for the active season.

The Constructors' target responds to:

- previous finishing position;
- current Board confidence;
- current grid size.

The existing Board-confidence system remains authoritative; Phase 39 does not reset confidence to a neutral value each January.

## Continue flow

Before Phase 39, Developer Playtest `Continue` only knew how to jump to the next race. After the final race there was no target, so the interactive career stopped even though headless simulation could roll into January.

The playtest server now routes central Continue through an offseason-aware calendar coordinator:

- during the racing season: unchanged, Continue jumps to the next race;
- after the final race with an active offseason and no future race in the current calendar: Continue advances to the next first-of-month boundary;
- November and December therefore execute all normal monthly systems;
- January 1 emits `SEASON_STARTED`, Governance applies accepted changes, Season Rollover creates the new calendar and Phase 39 prepares the new season;
- the next Continue can then use the normal race path again.

The time engine remains authoritative; the UI never edits dates directly.

## Preseason handoff

On `SEASON_STARTED`, Phase 39:

1. applies/auto-confirms each team's season plan;
2. archives and resets the finance opening baseline;
3. renews Board objectives;
4. stores the season strategy on the team's technical state;
5. moves the cycle into `preseason`.

Phase 37 remains authoritative for actual test sessions and their cost/knowledge/reliability consequences.

The offseason cycle closes on the first `RACE_DAY` of the target season and is copied to history.

## Developer Playtest

Open:

`http://127.0.0.1:3000/offseason.html`

Endpoints:

- `GET /api/offseason`
- `POST /api/offseason/plan`
- `POST /api/offseason/confirm`
- `POST /api/continue` — now offseason-aware

The page exposes:

- championship review;
- final team position/points;
- Board confidence and objectives;
- readiness checklist;
- strategic plan;
- central calendar Continue.

## Changeability and save safety

The design intentionally separates policy from identity/state.

Low-risk playtest changes normally require only local formula/configuration changes plus tests:

- when planning/final-check stages occur;
- which readiness thresholds display warning/action-required states;
- default AI season-plan choices;
- R&D reserve percentages for conservative/balanced/aggressive plans;
- Board ambition adjustment between seasons;
- UI wording/layout.

These do not require a save migration because the persisted cycle and plan shape remains valid.

Medium-risk changes include adding a new planning dimension or new checklist category. These can normally be introduced with defaults for older saves.

Higher-risk changes are limited to changing the meaning or structure of persisted `world.management.offseason` records. Those changes should include a compatibility bridge. Historical IDs or source-lock corrections still belong to the database promotion process rather than this gameplay system.
