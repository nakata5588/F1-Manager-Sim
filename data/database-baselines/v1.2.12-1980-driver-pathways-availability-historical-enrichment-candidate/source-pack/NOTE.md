# v1.2.12 source-pack integration note

This folder contains the compact audit/source material supplied with the cumulative v1.2.12 1980 database candidate. Large Global/Season JSON, SQLite and editor XLSX artifacts remain external and are pinned by SHA-256 in `../CHECKSUMS.json`.

The received ZIP SHA-256 is `d8cd3c8ebd4fafcdcd6d820e7c17e4c340d3977dba5b0ae5e5a27b11be5ac080`. The archive also contains an embedded `*_BUNDLE_SHA256.txt` value `9f84d4f3c5235c6b6994652c7a1d191bea2f2514b322dcb44a9845b71af669a7` which does **not** match the finalized received ZIP. All 25 artifacts declared by the supplied `CHECKSUMS.json` were independently re-hashed and matched exactly, and both SQLite databases passed `PRAGMA integrity_check`. Therefore the repository treats the received ZIP hash as the external bundle identity and the embedded value as a non-authoritative pre-finalization/repackaging artifact.

The full bundle remains the authoritative external candidate payload. The repository stores the audit material needed to verify cumulative identity, starting-driver availability policy, readiness, unresolved boundaries and migration status. No gameplay or UI files are part of this candidate.
