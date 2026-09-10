# Career Simulation Model

## Purpose

Career evolution belongs to the mutable Save World. Historical data establishes the starting condition; it does not prescribe the future.

A driver who historically retired in 1980 is not forced to retire in 1980 once a career has started. Likewise, a future prospect becoming eligible does not guarantee an F1 seat.

## Current Ability is not race performance

`currentAbility` and `potentialAbility` are development-management concepts. They are not a single race-result score.

Race performance will continue to emerge from individual attributes plus car, team, circuit, setup, conditions, strategy, reliability, form and controlled randomness.

The career system therefore evolves both a CA reference and individual dynamic attributes.

## Annual driver development

At each season transition:

- age is recalculated from date of birth;
- young drivers can improve rapidly when meaningful potential remains;
- development slows through the prime years;
- raw pace tends to decline earlier than experience-led skills;
- racecraft, consistency, technical feedback, pressure handling and leadership can continue improving while raw speed is flattening;
- crash likelihood can improve with experience;
- free agents develop more slowly than employed drivers;
- morale and form influence development slightly and regress toward neutral between seasons;
- a seeded noise component prevents identical career curves while keeping saves reproducible.

No historical future rating is copied into the Save World after career start.

## Staff development

Staff careers use a slower curve than drivers. Technical performance can plateau while leadership, communication, negotiation and other experience-led skills continue to improve.

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

## Future work

Later systems will feed career evolution with race participation, performance, injuries, morale, team quality, development programmes, testing mileage and reputation changes. The annual model is intentionally modular so those inputs can be added without coupling it to a specific Master Database or Season Database schema.
