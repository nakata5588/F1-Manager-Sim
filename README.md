# F1 Manager Sim

**Historical starting conditions. Dynamic alternative future.**

F1 Manager Sim is a long-form Formula One management and world simulation game. A new career begins from an authentic historical season where reliable data exists, then the simulation is free to diverge: drivers move teams, staff careers evolve, competitive order changes, regulations shift and new champions emerge.

## Current development phase

**Phase 0 — Audit & Foundations**

The first fully supported target season is **1980**. The immediate goal is to build the simulation foundation before UI depth:

1. audit and normalize the recovered historical master database;
2. create an immutable Historical World snapshot;
3. create independent mutable Save Worlds;
4. implement deterministic simulation primitives and time progression;
5. validate the world through automated and long-run tests;
6. only then layer management systems and the Football Manager-style UI on top.

## Architecture rule

The project keeps five concerns separate:

- **Historical World Database** — immutable source data.
- **Save World** — evolving career state.
- **Simulation Engine** — systems that advance and change the world.
- **Game Systems** — contracts, development, finances, staff, sponsors and management mechanics.
- **UI** — presentation and player interaction; never the authoritative simulation state.

See `docs/ARCHITECTURE.md` and `docs/DATABASE_AUDIT_2026-09-10.md`.

## Development

Requires Node.js 22+.

```bash
npm test
```

The repository is intentionally starting with a small dependency-free simulation core. UI/framework dependencies will be added when the domain and save boundaries are stable.

## Legacy project

`nakata5588/F1-Manager-Light` is reference-only. Useful concepts and data may be adapted, but new development happens exclusively in this repository.
