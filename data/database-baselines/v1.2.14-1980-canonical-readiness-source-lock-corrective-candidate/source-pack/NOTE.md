# v1.2.14 r3 source-pack integration note

This folder stores the compact audit material used to integrate the cumulative 1980 v1.2.14 r3 candidate. The large Global/Season JSON, SQLite and EDITOR XLSX artifacts remain external and are pinned by SHA-256 in `../CHECKSUMS.json`.

Received ZIP SHA-256: `a7f21e6f5577257e062351dc7a03b215aeaf98f715bff24ec238467aa120f2c6`.

The supplied bundle validated 43/43 payload checksums, 80/80 materialized promotion checks, both SQLite integrity checks, zero foreign-key violations, zero hard semantic orphans and zero authoritative/composite references to retired duplicate driver ID `d_0862`.

This integration marks v1.2.14 r3 as the latest cumulative 1980 candidate only. v1.2.5 remains the promoted canonical baseline. Historical source gaps remain explicit: staff 7, external-driver opening availability 30, sponsors 5 and regulations open/partial 5.

Audit caveat: the legacy `staffSourceLock1980` surface retains older pending-role classifications for some rows already upgraded by `staffSourceLockReview1980V1214`. For current canonical-readiness assessment, the v1.2.14 review surface is authoritative; this legacy provenance surface is not used to promote additional historical facts.
