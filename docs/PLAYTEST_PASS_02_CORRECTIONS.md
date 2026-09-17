# 1980 Playtest Pass 02 — Priority Corrections

This pass closes the first three correctness findings from Issue #60 without changing Historical Database authority.

## Ownership / governance recruitment boundary

Owners, co-owners, chairmen/chairwomen/chairpersons, presidents, proprietors, founders and co-founders remain visible people but are not ordinary staff-market candidates.

The rule is enforced in the management domain, not only in the UI:

- recruitment lists exclude ownership/governance identities;
- opening a normal staff negotiation is blocked;
- submitting an offer is blocked;
- accepting a counter-offer is blocked.

A normal Team Principal remains movable staff unless the same identity also carries an ownership/governance role.

## Era-aware facilities

Facility existence in the world model is now distinct from technology availability in the current era.

Runtime facility states support:

- `unavailable_future_technology`;
- `available_unbuilt`;
- `operational`;
- `upgrading`.

The simulator is unavailable in the 1980 opening world unless explicit future-era availability metadata unlocks it. No exact historical unlock year is fabricated by this pass.

Additional corrections:

- source/derived facility level `0` remains zero rather than being normalized to level 1;
- unavailable future technology cannot be built or upgraded;
- unavailable facilities do not contribute to design efficiency;
- AI/delegated team development obeys the same availability boundary;
- existing saves quarantine legacy simulator state and cancel stale active simulator upgrades before monthly technical processing.

## 1980 tyre strategy choices

The 1980 database currently reaches the runtime primarily as supplier-level tyre packages rather than a sourced list of individual historical compounds.

When only one supplier-package row exists, the runtime now derives a clearly marked gameplay family:

- `<Supplier> Dry — Grip`;
- `<Supplier> Dry — Endurance`;
- `<Supplier> Wet`.

These are tagged `derived_gameplay_compound_family_from_supplier_package` and are not presented as historical source facts. Modern `Soft / Medium / Hard` naming is deliberately not invented.

Supplier restrictions remain authoritative, so teams cannot select rival-supplier tyres. The derived choices are used by the same race-strategy system for player and AI decisions and expose meaningful grip/durability trade-offs for pre-race and live BOX instructions.

## Validation

Regression coverage includes:

- governance identities excluded while ordinary Team Principals remain recruitable;
- server/domain guards against direct owner negotiation actions;
- 1980 simulator lock and exclusion from design efficiency;
- explicit future-era facility unlock support;
- migration of stale existing-save simulator state/upgrades;
- multiple supplier-scoped dry choices and a wet option;
- AI tyre strategy respecting supplier scope;
- no invented modern compound labels.

The full simulation suite and 10-season autonomous soak pass with these changes.