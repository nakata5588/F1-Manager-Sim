# People, Mentality & Market Dynamics

## Purpose

Phase 33 makes drivers and staff persistent people inside the Save World rather than static ratings attached to contracts.

The architecture keeps four concepts separate:

1. **Historical personality input** — optional source data from the Season Database.
2. **Dynamic mentality** — morale, confidence, satisfaction, pressure and transfer openness that evolve during the career.
3. **Relationships** — mutable affinity, trust and rivalry between people and teams.
4. **Market state** — representatives, transfer interest, competing offers, poaching and transfer compensation.

Historical values define starting context only. Dynamic career outcomes are never read back from future history.

## Personality and historical provenance

Supported personality inputs currently include:

- ambition;
- loyalty;
- professionalism;
- adaptability;
- composure / pressure handling;
- teamwork.

When a source field is present it is preserved as a historical input and its provenance is recorded.

When it is missing, the gameplay model uses a neutral value of 50 with source `neutral_fallback`. It does not invent a historical personality claim for that person.

This means a future database bundle can add researched personality data without changing the Save World architecture.

## Dynamic mentality

Each active person can carry:

- morale;
- confidence;
- team satisfaction;
- role satisfaction;
- contract satisfaction;
- pressure;
- transfer openness.

These values belong to the Save World.

Monthly updates consider employment status, contract security, role, team relationship and — for drivers — sporting context. Race results can change confidence and morale. Contract agreements can improve contract satisfaction. Severe dissatisfaction emits an Inbox event for a controlled team.

The existing `careerState.morale` field is synchronized with the people model so race/career systems can consume the same evolving state rather than maintaining two independent morale systems.

## Relationships

Relationships are stored as directional mutable records with:

- affinity;
- trust;
- rivalry.

The first integrations include driver-team relationships and teammate rivalry/affinity. The structure is generic enough for driver-engineer, manager-staff and other relationships later.

## Representatives / agents

If historical agent or representative identifiers/names exist, they are consumed as source references.

If they do not exist, the simulation creates only a deterministic behavioral representative profile:

- negotiation rigidity;
- patience;
- reputation/selectivity weight;
- behavioral style.

Fallback representatives deliberately have no invented real-world name and are labelled `simulation_fallback`.

## Transfer interest

Transfer interest is dynamic and evaluated against the target team. It considers:

- target vs current team prestige;
- requested role vs current role;
- ambition;
- loyalty;
- team and contract satisfaction;
- transfer openness;
- driver-team relationships;
- representative selectivity;
- competing offers.

The result is expressed as a score and a player-facing level such as `very_interested`, `interested`, `open`, `reluctant` or `not_interested`.

A sufficiently uninterested driver can refuse to open negotiations.

## Transfer compensation / buyouts

An immediate move while a worker remains contracted can require compensation.

The data policy is:

1. if an explicit historical release/buyout/compensation value exists, use it;
2. otherwise, if a real salary is known, derive a clearly simulation-owned currency estimate from salary, remaining term and driver value;
3. otherwise use an explicitly abstract transfer-compensation index.

Abstract compensation is never converted into fake historical money.

Currency-mode signing bonuses and transfer compensation affect persistent team cash. A transfer fee credits the origin team and debits the destination team.

## Competing offers and poaching

External offers are persistent Save World objects with creation date, expiry date, target team, terms and transfer interest.

The market can:

- create a competing offer while the player negotiates with a driver;
- approach a controlled-team driver whose contract is nearing its end;
- let the driver accept or reject an external future move deterministically;
- close competing offers once the driver commits elsewhere;
- close a player's negotiation as `lost_to_rival` if another team signs the target first.

Accepted moves use the existing `employment.contract_signed` pipeline. Future contracts remain future assignments until their effective season.

## Vacancy coherence

Immediate transfers are observed before the employment reassignment is applied. If a worker leaves a team immediately, a real vacancy is created for the origin role.

AI teams can fill that vacancy through the same employment system. If the affected team is controlled by the player, the vacancy appears through the Management Inbox.

This prevents a transfer from silently deleting a seat from the world.

## Management Hub

The Developer Management Hub exposes:

- **Inbox** — people, market and contract events;
- **People** — mentality, personality provenance and representative profile;
- **Recruitment** — scouting plus transfer interest once knowledge is sufficient;
- **Contracts** — future deals, immediate approaches and transfer compensation;
- **Market** — relevant external/rival offers.

The browser only sends player instructions. Personality evaluation, mentality changes, market resolution, compensation, cash effects and employment changes remain server-side Save World/game-system responsibilities.

## Persistence

People state, relationships, representatives, external offers and negotiations are plain Save World data and survive the standard JSON serialization round-trip.
