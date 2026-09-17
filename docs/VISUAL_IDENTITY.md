# Team Visual Identity

## Purpose

Team visual identity is a presentation layer that lets the game display coherent colours, logos, cars and future livery templates without making artwork part of the simulation model.

The implementation lives in `src/presentation/teamVisualIdentity.js`.

It is designed for the longer-term path:

```text
Team identity
  -> colours / logo / visual templates
  -> car and livery renderer
  -> circuit-map car markers
  -> sponsor/livery presentation
```

None of these presentation steps can affect car performance, finances, recruitment or race outcomes unless a separate authoritative game system explicitly models such an effect.

## Projection

A team visual identity currently exposes:

```text
teamId
displayName
colours
  primary
  secondary
  tertiary
templates
  car
  livery
  suit
media
  logo
  car
  backdrop
provenance
simulationAuthority = false
```

Media fields contain stable-ID descriptors. The playtest server resolves them through the selected Media Pack before they reach the browser.

## Source priority

Visual identity uses an explicit priority order:

1. current Save World presentation override;
2. source presentation hint on the team row;
3. deterministic presentation-only fallback palette.

This allows an alternative-history save to change its visual identity after Career Start while retaining the stable team ID.

For example, a rebrand can change the displayed name and future livery without replacing the team entity that owns championship history, staff, facilities, finances or records.

## Historical data and provenance

A historical colour or template should only be described as historical when it is supported by an appropriate source/provenance path.

When no such data exists, the runtime uses `derived_presentation_fallback`. That fallback exists only so teams remain visually distinguishable during development. It must not be presented as an authentic 1980 livery or colour scheme.

Current provenance values are:

- `save_world_presentation_override`
- `source_presentation_hint`
- `derived_presentation_fallback`

All returned colours are normalized to six-digit uppercase hexadecimal values.

## Save World boundary

A future Save World may persist presentation changes such as an alternative livery or rebrand under a dedicated presentation state. This is valid because an alternative future may develop a new visual identity.

However, presentation state remains structurally separate from performance. Code that calculates pace, reliability, R&D, commercial terms or race results must not read visual colours or Media Pack files.

The current projection explicitly returns:

```text
simulationAuthority: false
```

as an architectural guardrail and documentation aid.

## Media Packs

Visual identity refers to media by semantic descriptor:

```text
logo     -> { kind: "teamLogo", entityId: teamId }
car      -> { kind: "car", entityId: teamId }
backdrop -> { kind: "teamBackdrop", entityId: teamId }
```

It does not know filesystem paths.

This keeps the dependency direction clean:

```text
Save World / historical team identity
             ↓
Team Visual Identity projection
             ↓
Media Pack resolver
             ↓
UI
```

A user can therefore install or replace a Media Pack without invalidating a career save.

## Future livery renderer

The `car`, `livery` and `suit` template keys are intentionally present before procedural rendering exists.

The planned renderer should use a neutral template plus presentation colours and, later, sponsor placement metadata. The renderer must remain deterministic for the same presentation state and must never become a source of simulation state.

A likely future pipeline is:

```text
car/livery template
  + primary / secondary / tertiary colours
  + sponsor visual slots
  + Media Pack overrides
  -> rendered team car
```

This is conceptually inspired by useful recolourable-livery patterns seen in other management games, but F1 Manager Sim will use its own data model, renderer and assets.

## Race-map relationship

The same colours and car media descriptors will later feed the top-view race presentation.

The authoritative order remains:

```text
Race Engine state
  -> driver/team stable IDs
  -> Team Visual Identity
  -> 2D renderer
```

The renderer must never infer an overtake or race position from where an icon happens to be drawn.

## Tests

`tests/teamVisualIdentity.test.js` verifies:

- deterministic fallback identity;
- presentation-only authority boundary;
- explicit source hints;
- snake/camel-case source aliases;
- Save World override priority;
- safe colour validation and normalization.

`tests/entityProfiles.test.js` verifies that a team profile carries the visual identity while preserving the dynamic team name and `simulationAuthority: false` boundary.
