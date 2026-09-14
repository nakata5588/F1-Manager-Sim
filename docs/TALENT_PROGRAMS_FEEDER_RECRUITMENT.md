# Phase 41 — Talent Programmes, Feeder Series & Recruitment

Phase 41 extends the Phase 40 renewable driver population into a competitive pre-F1 ecosystem:

`Junior -> Talent Visible -> Team Talent Programme -> Feeder Development -> F1 Eligible -> Existing Employment Market -> F1 Career`

## Era-aware structure

A modern academy is not projected backwards onto 1980. Save World talent capability uses era-aware gameplay structures:

- to 1989: `informal_talent_network`;
- 1990–1999: `junior_relationships`;
- 2000–2008: `junior_program`;
- 2009 onward: `driver_academy`.

These are simulation abstractions, not claims that a historical team operated a formally named academy. Programme quality is a derived gameplay baseline and never overwrites the historical database.

## Agreements and visibility

A talent-programme agreement is separate from F1 employment. It records stable driver/team IDs, term, programme type and development support.

It does **not** make a driver an F1 employee, bypass `f1_eligible_from`, guarantee a seat or create an automatic debut. Existing Employment/Contracts remain authoritative once a driver becomes F1 eligible.

Only `talent_visible` drivers may enter junior recruitment. Hidden future entities remain inaccessible. The controlled team is never auto-assigned a junior by AI.

## AI competition

AI teams evaluate unaffiliated visible juniors using CA, PA, recent simulated feeder performance, age, programme quality and deterministic uncertainty. PA is therefore not treated as perfect knowledge.

Multiple teams can target the same prospect. Driver preference uses programme quality, team standing and seeded uncertainty, so the same historical starting world can develop different talent pathways in different saves.

## Development authority

Phase 41 does not directly add Current Ability. Programme support improves junior morale/form before the existing `career.development` system runs. That system remains the single authority for annual CA and attribute progression.

F1-employed drivers receive no junior-programme support bonus.

## Feeder series

Phase 40 already produces abstract annual performance for `national_junior`, `formula_three`, `formula_two` and `international_formula`.

Phase 41 groups those records into annual Save World series summaries with field size, champion, top three and represented talent programmes. Programme affiliation/support is annotated onto feeder records when applicable.

These are explicit simulation outcomes with Save World provenance, not historical F2/F3 claims. No race-by-race junior engine is introduced yet.

## Save World and ordering

Mutable state lives under `world.management.talentPrograms` with `programs`, `agreements`, `recruitmentHistory` and `feederSeriesHistory`.

Season-boundary order is:

`Talent Pipeline -> Visibility -> Career Lifecycle -> Talent Recruitment/Support -> Career Development -> Employment Market`

Historical rows remain immutable. Future expansion can add regional scouting, programme budgets, feeder-team partnerships and richer UI without changing this authority boundary.
