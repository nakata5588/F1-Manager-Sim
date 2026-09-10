#!/usr/bin/env python3
"""CLI: import/audit an F1 Manager Sim master workbook without modifying it."""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from tools.db.normalize import dump_json, normalize_workbook, strip_provenance
    from tools.db.normalize_v04 import is_v04_workbook, normalize_workbook_v04
    from tools.db.validate import readiness_for_season
    from tools.db.xlsx_reader import read_xlsx
else:
    from .normalize import dump_json, normalize_workbook, strip_provenance
    from .normalize_v04 import is_v04_workbook, normalize_workbook_v04
    from .validate import readiness_for_season
    from .xlsx_reader import read_xlsx


def main() -> int:
    parser = argparse.ArgumentParser(description="Import and validate the evolving F1 Manager Sim historical master workbook.")
    parser.add_argument("workbook", type=Path, help="Path to the source .xlsx file (read-only).")
    parser.add_argument("--out", type=Path, default=Path("build/historical"), help="Output directory for normalized data and reports.")
    parser.add_argument("--season", type=int, action="append", dest="seasons", help="Season readiness gate to evaluate. Repeat for multiple seasons.")
    parser.add_argument("--full-world", action="store_true", help="Also emit canonical-world.json (can be large).")
    parser.add_argument("--no-provenance", action="store_true", help="Strip per-row source provenance from emitted full-world JSON.")
    args = parser.parse_args()

    if not args.workbook.exists():
        parser.error(f"Workbook not found: {args.workbook}")
    if args.workbook.suffix.lower() != ".xlsx":
        parser.error("The importer currently expects an .xlsx workbook.")

    workbook = read_xlsx(args.workbook)
    if is_v04_workbook(workbook):
        world, issues = normalize_workbook_v04(workbook, args.workbook)
    else:
        world, issues = normalize_workbook(workbook, args.workbook)

    seasons = args.seasons or [1980]
    readiness = [readiness_for_season(world, season, issues) for season in seasons]

    issue_counts = Counter(issue["severity"] for issue in issues)
    code_counts = Counter(issue["code"] for issue in issues)
    row_counts = {key: len(value) for key, value in world.items() if isinstance(value, list)}
    manifest = {
        **world["manifest"],
        "importedAt": datetime.now(timezone.utc).isoformat(),
        "sheetCount": len(workbook.sheets),
        "rowCounts": row_counts,
        "issueCounts": dict(sorted(issue_counts.items())),
        "issueCodes": dict(sorted(code_counts.items())),
        "readiness": {str(item["season"]): item["status"] for item in readiness},
        "supportedSeasons": [item["season"] for item in readiness if item["status"] in {"READY", "READY_WITH_WARNINGS"}],
    }
    world["manifest"] = manifest

    args.out.mkdir(parents=True, exist_ok=True)
    dump_json(args.out / "manifest.json", manifest)
    dump_json(args.out / "validation.json", {"issues": issues})
    for report in readiness:
        dump_json(args.out / f"readiness-{report['season']}.json", report)

    if args.full_world:
        output_world = world if not args.no_provenance else strip_provenance(world)
        dump_json(args.out / "canonical-world.json", output_world)

    print(json.dumps({
        "databaseVersion": manifest["databaseVersion"],
        "sourceSchema": manifest.get("sourceSchema", "legacy"),
        "readiness": manifest["readiness"],
        "issues": manifest["issueCounts"],
    }, indent=2))
    return 1 if any(item["status"] == "BLOCKED" for item in readiness) else 0


if __name__ == "__main__":
    raise SystemExit(main())
