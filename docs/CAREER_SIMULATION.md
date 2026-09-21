# Career Simulation Model

## Purpose

Career evolution belongs to the mutable Save World. Historical data establishes the starting condition; it does not prescribe the future.

A driver who historically retired in 1980 is not forced to retire in 1980 once a career has started. Likewise, a future prospect becoming eligible does not guarantee an F1 seat.

## Current Ability is not race performance

`currentAbility` and `potentialAbility` are development-management concepts. They are not a single race-result score.

Race performance will continue to emerge from individual attributes plus car, team, circuit, setup, conditions, strategy, reliability, form and controlled randomness.

The career system therefore evolves both a CA reference and individual dynamic attributes.

## Development 2.0 evidence

Stage 20 adds a persistent Save World evidence layer under `world.developmentState`.

For drivers it records, by season:

- race starts and finishes;
- practice/qualifying exposure;
- teammate-relative race and qualifying performance;
- preseason testing sessions and role-weighted mileage;
- team/organisation environment;
- staff coaching quality;
- veteran mentoring for younger drivers;
- injury days and severity burden.

For staff it records:

- employed months;
- race-weekend exposure;
- preseason test participation;
- department effectiveness;
- workload factor;
- peer learning from more experienced colleagues in the same functional department.

Morale, form and confidence remain separate dynamic people/career states. They influence how effectively existing potential is realised, but they do not manufacture potential or directly determine race results.

## Annual driver development

At each season transition:

- age is recalculated from date of birth;
- young drivers can improve rapidly when meaningful potential remains;
- development slows through the prime years;
- raw pace tends to decline earlier than experience-led skills;
- racecraft, consistency, technical feedback, pressure handling and leadership can continue improving while raw speed is flattening;
- crash likelihood can improve with experience;
- free agents develop more slowly than employed drivers;
- meaningful race/testing opportunity improves the chance of realising potential;
- strong coaching, organisation and mentoring can accelerate learning without creating ability beyond PA;
- teammate-relative performance contributes a controlled learning signal rather than rewarding finishing position in isolation;
- injury burden can slow development and accelerate loss of raw pace;
- morale, form and confidence influence development slightly and regress toward neutral between seasons;
- a seeded noise component prevents identical career curves while keeping saves reproducible.

No historical future rating is copied into the Save World after career start.

## Staff development

Staff careers use a slower curve than drivers. Technical performance can plateau while leadership, communication, negotiation and other experience-led skills continue to improve. Stage 20 also makes staff growth depend on real employment, department quality/workload, race/test exposure and peer learning rather than age alone.

## Retirement

Retirement is probabilistic and evaluated annually. The main inputs are:

- age;
- employment status;
- current ability;
- reputation;
- deterministic save seed.

Drivers have no ordinary age-driven retirement chance before their early thirties. Probability rises progressively afterwards, but strong and reputable drivers can remain longer. Free agents are more likely to retire than employed peers.

Staff careers use a much later age curve.

Extremely old active workers have a forced upper horizon to prevent impossible immortal careers. This is a simulation safeguard, not a historical retirement date.

## Driver availability and other motorsport

Race incidents can now create persistent medical unavailability. An injured driver keeps the underlying Employment contract unless a separate contract/career event changes it. Race participation is removed from Race Entry instead.

A temporary replacement can come from a reserve/test/development driver already employed by the team, an F1 free agent, or a driver currently represented as competing outside F1. Temporary race duty is not promoted to a normal Employment contract automatically.

Being outside the active F1 market is also distinct from retirement. A driver without an F1 seat for several seasons may continue in `other_motorsport`, remain part of the simulated world and later return to the F1 market or accept an emergency substitute drive.

## Employment consequences

When an employed driver or staff member retires:

1. the worker is removed from the employment assignment and free-agent pool;
2. the team vacancy is recorded explicitly;
3. AI teams can react through the same employment market used for contract expiries;
4. the new contract and transfer are written into the Save World;
5. human-controlled teams remain protected from automatic hiring.

## Determinism

Development and retirement random streams are derived from:

`save seed + season + system + worker ID`

This allows a simulation to be reproduced while still permitting different saves from the same historical starting database to create different futures.

## Authority and historical policy

Historical source ratings seed the opening career state only. After Career Start, `world.careerState` is the mutable rating/attribute authority and `world.developmentState` is the evidence authority.

Development resolution remains deterministic for the same save seed and evidence, but two careers can diverge naturally because opportunity, performance, injuries, teams, coaches and morale diverge.

CA/PA are not exposed as a universal performance formula. Individual dynamic attributes remain the inputs used by race, technical and management systems. From Stage 20 onward, driver CA is derived from current attributes and driver PA is derived from static attribute ceilings.

## Future work

Later development passes can add explicit rehabilitation programmes, training plans, driver academies, staff education/certification and richer role-specific testing allocation without replacing the Stage 20 evidence boundary.


## Driver career-stage rating curve

Drivers now progress through:

`Academy -> Prospect -> Rookie -> Developing -> Prime -> Veteran -> Decline`

Each skill has a static talent ceiling. Career stage determines how much of that ceiling is currently reachable, and the Development Ledger determines how quickly the driver moves toward the stage target.

Raw pace/qualifying mature and decline earlier. Racecraft, consistency and tyre management can keep improving later. Technical feedback, adaptability and leadership use a later curve.

For future historical drivers, the Global Database's yearly rating history is never replayed season-by-season. The materializer collapses available historical rows into a single static talent reference, preserving talent information without scripting the real career trajectory.
