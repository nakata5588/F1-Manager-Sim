# Stage 18 — Driver Availability, Injuries & Replacement Market

## Goal

Stage 18 makes driver participation a persistent consequence of the simulated world rather than an assumption that every contracted race driver is always available.

The core flow is:

`Race Timeline incident -> Medical outcome -> Driver unavailable -> Replacement market -> Race Entry -> Recovery -> Seat restoration / consequence`

## Authority boundaries

- `world.employment` remains contract/employment authority.
- `world.driverAvailability` owns medical availability, injuries, recovery and temporary replacement agreements.
- `world.driverMarketState` owns the driver's current F1-market pathway.
- `world.raceEntryState.current` remains race-participation authority.

A temporary substitute is never written into normal Employment merely to make Race Weekend accept the driver.

## Medical model

The temporal race engine already creates deterministic incidents with severity. Stage 18 consumes those incident records after the timeline is applied.

Medical probability can use explicit Season Database accident/safety inputs when available. When no injury probability exists, an explicitly labelled era gameplay fallback is used. This fallback is simulation policy and is not presented as historical medical truth.

Current injury classes are minor, moderate, serious and career-threatening. They control an expected absence window rather than claiming a specific diagnosis.

Recovery is evaluated by the Save World clock. When the driver is medically cleared, the replacement agreement ends and the original race seat is restored only if the driver still owns an appropriate Employment role with the same team.

## Replacement hierarchy

Emergency selection considers:

1. same-team reserve/test/third/development drivers;
2. active F1 free agents;
3. drivers currently represented in other motorsport.

Candidate ranking considers ability, reputation, adaptability, experience, recent F1 connection and team familiarity. It is not an Overall-plus-random selection.

If no eligible substitute exists, the injured driver's entry is removed and the seat remains vacant.

## Driver market pathways

Stage 18 separates F1 employed, F1 free agent, temporary replacement, other motorsport, outside F1, talent and retired pathways.

A driver who spends several years without an F1 seat can leave the active F1 free-agent pool for other motorsport. This does not delete the driver, force retirement or script a future career. Other-motorsport drivers can later return to the F1 market or be recalled for an emergency drive.

This is the first step toward reducing the long-run free-agent accumulation exposed by the Stage 16.5/17 ecosystem gate.

## Historical policy

Historical accident/safety data are inputs only. Once a career begins, exact incidents, injuries, recovery dates and replacement appointments are simulation outcomes. Historical real-world substitutes are not scripted into the career.

## Player-facing projection

Driver profiles expose medical status, race availability, expected return, market pathway and active replacement duty. Controlled teams also receive Inbox notifications when a substitute is appointed or the regular driver returns.

The browser remains a projection layer and does not decide medical outcomes or write Race Entry directly.

## Validation targets

Long-run validation checks that injured drivers cannot remain in the current Race Entry and reports total injuries, replacement agreements, active injured drivers, F1 free drivers, other-motorsport drivers and temporary replacements.

The 20-season multi-seed ecosystem gate is the calibration authority for whether injury frequency and driver-market population remain coherent.
