# F1 Manager Sim Database v1.2.15 — Corrective Historical Source Enrichment Freeze

## Scope
DATABASE-ONLY corrective revision of `v1.2.15-1980-historical-source-enrichment-candidate`.
No gameplay, simulation engine, Save World runtime, UI or GitHub changes are part of this bundle.

Candidate revision: `historical_source_enrichment_corrective_r3_temporal_opening_audit`.

## Corrective findings resolved

1. `baseline.json` now derives `season1980Counts.activeTeams` from `SeasonDefinition.snapshot.teams`: **15**, not 0.
2. `openingEmploymentAudit1980V1215` is regenerated from the actual v1.2.15 authoritative opening surfaces. It contains 66 rows and is the current audit. `openingEmploymentAudit1980V1214` is retained only as a versioned historical audit and is explicitly superseded by policy.
3. Beppe Gabbiani is no longer an ordinary `free_driver`. The source proves general drive-seeking in an F2 context, but does not prove F1-specific seeking/availability at Career Start. He is `external_candidate_availability_unverified`.
4. A uniform temporal gate is applied to 1980 programme evidence. Andrea de Cesaris, Chico Serra, Eliseo Salazar, Emilio de Villota, Manfred Winkelhock and Mike Thackwell are returned to `external_candidate_availability_unverified` because their 1980 programmes are documented but the available sources do not establish that the commitments were already effective on **13 January 1980**.

## Temporal gate preserved opening classifications

The following enriched states remain because their evidence covers or precedes Career Start sufficiently for this database boundary:

- Derek Warwick / Stephen South — Toleman selection explicitly before Christmas 1979.
- Miguel Ángel Guerra — Minardi team/1980 car entrusted to Guerra from the team foundation on 19 December 1979.
- Stefan Bellof — Walter Lechner Racing contract interval 1979–1981.
- Nigel Mansell — Lotus test after October 1979 audition and signing as 1980 test driver.
- Roberto Moreno — first-person account states a 1980 works Formula Ford drive negotiated from his 1979 results and continuation with Van Diemen.
- Patrick Tambay and Vittorio Brambilla retain their prior v1.2.14 source-locked non-F1/test states; this corrective does not reopen those established rows.

## Driver opening-state outcome

- current F1: 28
- external opening availability unverified: 23
- active non-F1 contracted: 6
- scoutable talent not free: 5
- reserve/test/development: 2
- inactive returnable/not seeking: 1
- available non-F1, F1 eligibility unverified: 1
- ordinary source-safe free drivers: **0**

The database does not target a desired number of free drivers. Free-driver status requires row-level evidence of realistic **F1-specific** availability/seeking at Career Start.

## Preserved v1.2.15 enrichment

The staff and sponsor enrichment from the original v1.2.15 is preserved. No historical gaps are artificially closed by this corrective revision. Regulations remain partially open where primary/period rule-page evidence is still missing.

## Source / authority boundary

1980 programme participation is useful historical context but does not retroactively determine opening employment or market availability unless the evidence covers the 13 January 1980 Career Start. Future F1 debuts, later 1980 contracts/moves/results, future retirements and later returns remain non-authoritative for Save World initialization.

## Publication

This remains a non-canonical cumulative 1980 candidate. The promoted canonical baseline remains v1.2.5 pending a separate promotion decision.


## Corrective publication validation

The final corrective materialized dataset passed **137/137** pre-checksum validation gates before sealing.

Key enforced invariants include:

- `baseline.season1980Counts.activeTeams = 15` and matches `SeasonDefinition.snapshot.teams`.
- `openingEmploymentAudit1980V1215` is regenerated from current v1.2.15 surfaces and passes 66/66 consistency rows.
- Beppe Gabbiani remains `external_candidate_availability_unverified`; ordinary source-safe free drivers = 0.
- Seven programme-based classifications without demonstrated 13-Jan-1980 commitment are non-authoritative for opening employment.
- Geoff Lees has no accidental opening temporal authority; Vittorio Brambilla retains the correct v1.2.14 test/development source-lock.
- Senna, Lauda, David Kennedy, semantic-reference, Round 1, contract-authority, future-outcome and Save World boundary regressions remain enforced.
- Global and Season SQLite integrity checks return `ok`; foreign-key violations = 0.

The machine-readable exact path diff from the originally distributed v1.2.15 to this corrective freeze contains **4,613 changed/added/removed JSON leaf paths** across Global and Season. The high count is expected because corrected opening availability propagates to synchronized derived/audit surfaces; it does not represent 4,613 independent historical fact changes.

## Integration decision

This corrective freeze is intended for integration as the **latest cumulative 1980 database candidate** only after the sealed bundle passes re-extraction audit. It is **not** a canonical promotion. The promoted canonical remains `v1.2.5-1980-technical-source-lock-candidate`.
