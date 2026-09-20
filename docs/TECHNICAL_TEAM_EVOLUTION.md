# Technical & Team Evolution

## Purpose

Stage 16 adds persistent technical identity to the existing physical technical lifecycle.

The project already models:

- technical staff;
- driver feedback;
- facilities;
- engine suppliers;
- component specifications;
- manufacturing;
- fitment;
- physical wear and reliability;
- preseason preparation;
- regulations;
- season strategy.

The missing piece was organisational memory.

Without it, two teams with different starting concepts could repeatedly make the same decisions and quickly become technically indistinguishable.

Stage 16 adds a small, persistent technical-memory layer that allows teams to develop recognisable strengths and weaknesses without replacing the existing staff/facility/car systems.

## Core principle

Technical identity is not a Team Overall.

It is persistent gameplay know-how by discipline:

- Aerodynamics
- Chassis
- Mechanical Systems
- Powertrain Integration
- Reliability

The identity begins from the relative shape of the opening car.

It then evolves only through Save World activity.

Historical starting component values remain immutable source inputs.

## Opening identity

At Career Start, the game reads the team's existing technical starting state and compares each discipline to that team's own opening-car average.

This creates small familiarity differences.

Example:

```text
Strong opening aero package
        ->
Aerodynamics familiarity above neutral
```

This is explicitly:

```text
derived_gameplay_technical_identity
```

It is not a claim that a historical constructor had a measured real-world "Aerodynamics 106" rating.

The opening effect is deliberately bounded.

Staff, facilities, engine, driver feedback and actual component specifications remain separate and more important systems.

## Persistent learning

When a design project is completed, its technical discipline gains a small amount of familiarity.

Learning depends on:

- the discipline;
- realised project gain;
- design focus.

A reliability-focused project also builds reliability know-how.

The identity records:

- completed projects per discipline;
- total completed projects;
- last project date;
- focus history;
- technical concept history.

A project that is merely started does not create expertise.

The learning is recorded only when the design actually completes.

## Development consequence

Existing development already depends on:

```text
Technical Staff
+ Facilities
+ Driver Feedback
+ Focus
+ Controlled Randomness
```

Stage 16 adds:

```text
× Technical Familiarity
× Regulation Development Efficiency
```

The identity modifier is intentionally modest.

It helps an established team exploit its expertise without making specialisation permanently dominant.

A weaker team can still improve through better staff, facilities, drivers, spending and repeated development.

## Regulations

The regulations system already contains:

- `carryoverRetention`
- `reliabilityRetention`
- `developmentEfficiencyModifier`
- `manufacturingCostModifier`

Before Stage 16, only part of this technical package affected the physical development lifecycle.

Stage 16 connects the remaining pieces.

### Development efficiency

`developmentEfficiencyModifier` now modifies real R&D project potential.

### Manufacturing cost

`manufacturingCostModifier` now changes the real cost of manufacturing specifications.

### Technical-memory carry-over

At Season Start, technical familiarity above or below neutral is compressed according to:

```text
carryoverRetention
```

Conceptually:

```text
new familiarity =
1 + (previous familiarity - 1) × carryover retention
```

A strong technical reset therefore reduces inherited know-how.

A continuity era preserves more of it.

This happens after Governance applies the new season's enacted regulation package.

## Physical-car regulation transition remains separate

The existing `applyTechnicalRegulationTransition()` continues to modify carried-over physical specifications toward the field median.

Stage 16 does not duplicate that system.

The separation is:

```text
Regulation Impact
    -> physical specification carry-over

Technical Evolution
    -> organisational technical-memory carry-over
```

Both use the same enacted regulation package.

## AI / delegated development

Previously, AI/delegated technical departments mostly selected the weakest current component.

Stage 16 makes the selection more coherent.

The AI now ranks candidate development areas using:

- current component weakness;
- accumulated technical familiarity;
- season technical focus;
- reliability sensitivity when relevant.

A balanced team still repairs weak areas.

A performance-focused team is more willing to exploit an established strength.

A reliability-focused team gives extra priority to reliability-sensitive systems.

This creates divergence without hardcoded constructor behaviour.

Williams, Ferrari, Renault, McLaren or any other team is not assigned a scripted future identity.

Identity emerges from:

```text
historical starting state
+ Save World decisions
+ staff/facilities
+ regulations
+ completed development
```

## AI facility investment

AI and delegated teams also use technical identity when considering facility investment.

An aero-led team is more likely to prioritise aero-related infrastructure when multiple upgrades are available.

A chassis/mechanical team may prefer chassis/manufacturing capacity.

This is a priority preference only.

Cash, availability, era locks and maximum facility levels still use the existing facility system.

## Technical Operations UI

Technical Operations now exposes:

### Technical Identity & Evolution

- current concept;
- current season focus;
- established strengths;
- developing areas;
- completed project count;
- familiarity per discipline;
- project count per discipline;
- regulation carry-over;
- regulation development efficiency;
- regulation manufacturing-cost modifier;
- last technical identity transition.

The UI labels familiarity explicitly as gameplay know-how.

It does not present it as a Team Overall.

### R&D project transparency

Active design projects show:

- component;
- discipline;
- focus;
- combined development modifier;
- target season;
- remaining duration;
- cost.

The combined development value is labelled:

```text
identity × regulations
```

Staff/facility/driver-feedback effects remain part of the authoritative server-side calculation and are not recomputed in the browser.

## Team lifecycle

Technical identity is mutable Save World state under:

```text
world.technical.evolution
```

When a team exits Formula One:

- active technical identity is removed from the live team bucket;
- it is archived under inactive technical evolution state;
- historical evolution records remain available.

Newly admitted teams receive identity lazily from their generated technical starting state and then use the same evolution rules as established teams.

## Persistence

Technical identity and learning history survive normal Save World serialization.

The system keeps:

- current per-team technical identity;
- discipline familiarity;
- project history counters;
- season transitions;
- durable technical-evolution history.

No Stage 16 state is written back into the Historical World Database.

## Historical boundary

Stage 16 never uses known real-world future constructor outcomes to decide development.

It does not encode:

- future championship strength;
- future winning concepts;
- future engine dominance;
- future staff appointments;
- future facility levels;
- future real-world R&D paths.

History supplies only the starting condition.

The simulation creates the future.

## Long-run intent

Over many seasons, two teams starting from the same field should be able to diverge because of different:

- development choices;
- project success;
- technical staff;
- facilities;
- engine supplier decisions;
- budgets;
- regulation resets;
- driver feedback;
- season strategies.

Technical identity provides continuity between those decisions.

It is organisational memory, not destiny.
