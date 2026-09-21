# Stage 20 — Driver & Staff Development 2.0

## Goal

Stage 20 makes career growth emerge from what people actually experience in the simulated world rather than mostly from age plus annual noise.

The core flow is:

`Participation / Employment / Organisation / Medical Events -> Development Evidence -> Season Resolution -> Dynamic CA / Attributes -> Career Consequences`

## Authority boundaries

- `world.careerState` owns mutable CA, PA, form, morale and dynamic attributes.
- `world.developmentState` owns accumulated season-development evidence.
- Employment owns jobs/contracts.
- Race Entry and completed Race Weekend own participation.
- People dynamics owns confidence/morale/relationships.
- Driver Availability owns injury state.
- Organisation owns department effectiveness/workload.

The development system reads those authorities; it does not duplicate them.

## Drivers

Driver evidence includes race starts/finishes, practice and qualifying exposure, teammate-relative performance, testing mileage, team environment, staff coaching, mentoring and injury burden.

Younger drivers can benefit from experienced teammates when the mentor has useful leadership, teamwork and technical-feedback qualities. Reserve/test/development roles receive more preseason testing exposure than full-time race drivers when the same test session is run.

Good results do not directly add rating points. Relative performance is a bounded learning/form signal, while actual race performance remains Driver Attributes + Car + Team + Circuit + Conditions + Setup + Strategy + Reliability + controlled randomness.

## Staff

Staff evidence includes employed months, race weekends, testing, department effectiveness, workload and same-department peer learning.

This means a young engineer working in a strong technical department can develop differently from an equally talented engineer who is unemployed or overloaded in a weak structure.

## CA / PA

CA and PA remain management/development concepts.

Positive development is capped by PA. Confidence, morale, opportunity, coaching and performance can change how quickly potential is realised, but cannot create unlimited ability. Age-related decline can still reduce CA after a worker has reached or passed their peak.

## Injury effects

Stage 18 medical events feed Stage 20 as duration/severity burden. The development model does not invent a medical diagnosis. Serious absences can reduce annual development and can specifically hurt raw pace more than experience-led skills.

## Determinism

Annual resolution uses the Save World seed, season, worker ID and accumulated evidence. Identical states reproduce identical outcomes; alternative careers diverge because their evidence diverges.

## UI

Controlled driver and staff profiles expose current-season development evidence. This is explanatory telemetry only; profiles do not write ratings or evidence.

## Long-run validation

The ecosystem gate now tracks active driver/staff ability distributions, driver form, annual driver/staff development deltas, archived evidence seasons and total development records. Warnings detect rating saturation near the ceiling.
