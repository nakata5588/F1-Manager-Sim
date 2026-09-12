# Phase 38 — Regulations, Governance & Team Evolution

Phase 38 makes the Formula One world structurally dynamic. Regulations can be proposed, voted on, rejected or enacted; eligible future team identities may apply to enter; active teams can leave the championship; and team brands can evolve without replacing stable team identity.

The governing rule remains:

`Historical starting conditions -> dynamic alternative future`

Future historical rules, entries, exits and rebrands are references or identities. They are never mandatory career outcomes.

## Save World ownership

Phase 38 state lives under:

- `world.governance.regulations`
- `world.governance.teamEvolution`
- `history.governance`
- `history.teamEvolution`

The Historical/Season Database is not modified by governance outcomes.

A career therefore owns its own regulatory and grid history. Two saves beginning in 1980 may vote differently, accept different new teams, lose different teams and produce different technical resets.

## Regulation state

The active regulation package is divided into three independent areas:

- **technical** — carry-over and reliability retention plus extension points for later detailed cost/development controls;
- **grid** — minimum and maximum active-team bounds;
- **sporting** — the currently active sporting rule patch.

The starting package is materialized from the active-season rules plus era-aware simulation defaults. Those defaults are gameplay policy and do not claim that every historical governing process used the same voting structure.

## Future historical regulations are references, not destiny

`reference.futureStructure.rules` remains hidden structural reference data.

When a future historical rule row becomes relevant, Phase 38 may turn it into a governance proposal with:

- `source = historical_reference_hidden`
- `provenance = reference_not_mandatory_outcome`

Outcome-like fields such as winners, champions, classifications and points scored are stripped before a row can become a proposal.

The proposal must still be voted on. It may be accepted or rejected. This preserves historical context without scripting the alternative future.

## Governance calendar

The first governance cadence is deliberately simple and deterministic:

- **July** — next-season regulation proposals open;
- **August** — an eligible future team may submit an entry application;
- **October** — pending team-entry applications are reviewed;
- **November** — regulation proposals are resolved;
- **Season start** — accepted regulation packages and accepted entries become effective.

These months are simulation policy rather than claims about every historical FIA/FISA procedure. They are intentionally isolated constants/decision points so later era-specific governance calendars can replace them without changing the underlying state contract.

## Voting

Each active team can vote:

- `yes`
- `no`
- `abstain`

Controlled teams vote through the Governance playtest surface. AI teams use the same proposal object and vote record.

AI preference currently reacts to:

- the team's relative car strength;
- whether a proposal increases or reduces technical carry-over;
- grid expansion pressure;
- financial distress;
- deterministic seeded uncertainty.

Weaker teams therefore tend to support stronger technical resets, while leading teams generally prefer continuity, without forcing either behaviour.

Votes are stored permanently on the proposal. Resolution stores the eligible count, yes/no/abstain totals, required yes votes and any regulator tie-break.

## Technical regulation transition

An accepted technical regulation does not simply overwrite car ratings.

At the target season boundary, `applyTechnicalRegulationTransition()`:

1. calculates field medians per component and reliability;
2. identifies specifications carried over from an older season;
3. moves those specifications toward the field median according to `carryoverRetention`;
4. applies the same principle to reliability using `reliabilityRetention`;
5. leaves specifications explicitly designed for the new season untouched;
6. records the transition season on each affected specification;
7. refreshes the existing `carState` projection.

This means a regulation reset compresses inherited technical advantage without destroying the physical specification/history model introduced in Phase 36.

The transition is idempotent for a specification/season pair.

## Team entry lifecycle

A future team follows:

`hidden identity -> eligible identity -> entry candidate -> application -> governance decision -> active team`

Eligibility still comes from the established entity-visibility system. Phase 38 never invents a future team identity merely because the grid has room.

An eligible future team does **not** automatically join in its historical debut year. Its historical identity makes it available; simulation governance decides whether and when it enters.

## New-team activation

When an accepted application reaches its target season, the new team is activated through the normal Save World systems.

The team receives:

- its stable historical `team_id` identity;
- a generated opening financial baseline derived from the current field;
- generated car and facility starting baselines derived from the current field;
- Phase 36 technical state;
- an engine supplier chosen through the Phase 37 supplier market;
- Phase 37 reliability state;
- commercial initialization where applicable;
- two driver vacancies;
- Technical Director and Chief Designer vacancies.

Generated entry resources are explicitly marked as simulation baselines. They are not retroactively claimed as historical facts.

Once active, a new team uses the same economy, recruitment, suppliers, development, reliability and race systems as existing teams.

## Team exits

An uncontrolled team can become an automatic exit candidate after at least two consecutive distressed seasons, provided the grid remains above the regulation minimum.

The initial exit probability remains deliberately conservative and deterministic from the Save World seed.

A player-controlled team is excluded from this automatic mechanism. A future dedicated insolvency/ownership system should handle a player team's collapse rather than silently ending the career through an AI-only rule.

When a team exits:

- it is removed from the active `world.teams` roster;
- its identity is preserved in `world.inactiveTeams`;
- active drivers and staff return to the employment market;
- current race entries are removed;
- future employment commitments are cancelled;
- open vacancies are cancelled;
- financial/car/technical/supplier state is archived into inactive buckets.

Completed historical race results therefore keep a valid stable team identity, while active systems no longer process a ghost team.

This active-vs-inactive identity distinction was added after the first Phase 38 long-run gate exposed exactly this class of problem.

## Rebrands

Rebranding changes presentation identity, not simulation identity.

`team_id` remains stable.

A rebrand appends a new `teamBrands` timeline row and records the old/new display names in `history.teamEvolution`.

This is important for long careers because results, contracts, records and relationships continue to reference the same stable team identity even when branding changes.

## Governance Inbox

Governance events generate Inbox information for the controlled manager:

- proposal opened;
- proposal approved/rejected;
- package enacted;
- technical transition applied;
- team entry application/decision/activation;
- team exit;
- team rebrand.

Voting is intentionally performed through the dedicated Governance action rather than the generic Inbox-decision resolver. The Inbox is therefore informative and cannot accidentally mark a vote resolved without actually changing governance state.

## Developer Governance UI

Run the normal Developer Playtest and open:

`http://127.0.0.1:3000/governance.html`

The page exposes:

- active-team count and permitted grid range;
- technical carry-over;
- open regulation proposals;
- proposal provenance;
- player team Yes / No / Abstain voting;
- future team entry candidates;
- entry applications;
- team exits;
- recent governance results;
- controlled-team rebranding.

API endpoints:

- `GET /api/governance`
- `POST /api/governance/vote`
- `POST /api/governance/rebrand`

The browser is not authoritative. It sends commands to the Save World domain.

## Changeability and playtest tuning

Phase 38 is deliberately divided into small domains so balancing errors found during playtest can usually be corrected without rewriting saves or unrelated systems.

### Low-risk changes

Normally code/configuration + tests only:

- proposal months/cadence;
- voting threshold;
- AI vote preferences;
- generated regulation frequency;
- technical carry-over/reliability retention ranges;
- entry readiness thresholds;
- grid min/max defaults;
- team-exit distress duration/probability;
- Inbox wording;
- Governance UI presentation.

These values do not define entity identity and normally require no save migration.

### Low-to-moderate changes

Usually localized domain change + regression update:

- technical reset formula;
- new-team opening cash/car/facility formula;
- supplier-selection policy for entrants;
- entry/exit decision flow;
- rebrand rules.

Existing saves normally remain usable because proposal/application/team IDs and histories are stable.

### Changes that need migration care

Changing the shape or meaning of already-persisted `world.governance.*` fields after careers exist may require a save-schema compatibility bridge. The code is modular enough for that bridge to be localized, but the migration must be explicit.

If a bug has already written incorrect state into a specific existing save, correcting the formula prevents future bad writes; repairing the already-written state may additionally require a one-off migration/replay from the stored governance history.

### High-care changes

Historical IDs, source-lock status, Global/Season database boundaries and canonical historical data still use the database promotion/materializer gate. Phase 38 never bypasses those provenance rules.

## Explicit Phase 38 limits

Phase 38 does not yet attempt to model every historical governing body, political agreement or regulatory voting procedure.

It also does not yet include:

- owner/shareholder transactions;
- a dedicated player-team insolvency/game-over process;
- generated brand-new fictional constructors when the future identity pool is exhausted;
- entry fees/concorde-style commercial agreements;
- detailed homologation or testing restrictions by regulation article;
- political relationships between governing bodies, suppliers and constructors;
- calendar bidding/promoter negotiations.

These can be layered onto the same event/state boundaries rather than replacing them.
