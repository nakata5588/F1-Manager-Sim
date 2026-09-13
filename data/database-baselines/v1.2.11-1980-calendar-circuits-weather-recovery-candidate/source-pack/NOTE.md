# v1.2.11 cumulative 1980 candidate source pack

This directory pins the small audit/source files from the uploaded **v1.2.11 1980 Calendar/Circuits/Weather Recovery Candidate**.

Integration rules:

- v1.2.11 is cumulative on the real v1.2.10 artifact.
- Do **not** integrate v1.2.8 separately; its planned Calendar/Circuits/Weather scope is recovered here.
- Preserve v1.2.4 technical, v1.2.5 technical source-lock, v1.2.6 finance/contracts/sponsors, v1.2.7 regulations/tyres, v1.2.9 drivers/ratings/career, and v1.2.10 free-driver availability.
- Weather probability rows and track-evolution rows are **derived gameplay baselines**, never source-locked session outcomes.
- Actual weather, qualifying, live track state, incidents, flags and race results remain Save World / simulation authority.
- This integration is data-only. It does not add gameplay or UI behavior.

Large JSON, SQLite and XLSX artifacts remain external. Their exact hashes are pinned in `../CHECKSUMS.json`.
