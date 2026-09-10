"""Structural/editor audits specific to Master Database v0.4+."""

from __future__ import annotations

from collections import Counter, defaultdict
from difflib import SequenceMatcher
import re


def audit_v04_structure(workbook, world: dict) -> list[dict]:
    issues: list[dict] = []
    _audit_editor_index(workbook, world, issues)
    _audit_identity_collisions(world, issues)
    _audit_reference_tables(world, issues)
    _audit_contract_placeholders(world, issues)
    _audit_declared_support(world, issues)
    return issues


def _audit_editor_index(workbook, world: dict, issues: list[dict]) -> None:
    for row in world.get("tableIndex", []):
        sheet_name = row.get("sheet")
        if not sheet_name or sheet_name not in workbook.sheets:
            continue
        sheet = workbook.sheets[sheet_name]
        actual_rows = len(sheet.rows)
        actual_columns = sum(1 for header in sheet.headers if header not in (None, "", "-"))
        declared_rows = _as_int(row.get("data_rows"))
        declared_columns = _as_int(row.get("columns"))
        if declared_rows != actual_rows or declared_columns != actual_columns:
            issues.append(
                _issue(
                    "warning",
                    "TABLE_INDEX_MISMATCH",
                    "Table_Index",
                    row.get("_source", {}).get("row"),
                    f"{sheet_name}: index declares {declared_rows} rows/{declared_columns} columns; "
                    f"actual is {actual_rows} rows/{actual_columns} non-empty columns.",
                    indexed_sheet=sheet_name,
                )
            )


def _audit_identity_collisions(world: dict, issues: list[dict]) -> None:
    groups: dict[tuple[object, object], list[dict]] = defaultdict(list)
    for row in world.get("drivers", []):
        dob = row.get("dob")
        country = row.get("country_code") or row.get("country_name")
        if dob and country:
            groups[(dob, country)].append(row)

    for (dob, country), candidates in groups.items():
        if len(candidates) < 2:
            continue
        for index, left in enumerate(candidates):
            for right in candidates[index + 1 :]:
                a = _simple_name(left.get("display_name"))
                b = _simple_name(right.get("display_name"))
                if not a or not b:
                    continue
                if SequenceMatcher(None, a, b).ratio() >= 0.72:
                    issues.append(
                        _issue(
                            "warning",
                            "POSSIBLE_DUPLICATE_PERSON",
                            "Drivers",
                            right.get("_source", {}).get("row"),
                            f"Possible duplicate driver identity: {left.get('driver_id')} {left.get('display_name')!r} "
                            f"and {right.get('driver_id')} {right.get('display_name')!r} share DOB {dob} / {country}.",
                            canonical_candidate=left.get("driver_id"),
                            duplicate_candidate=right.get("driver_id"),
                        )
                    )


def _audit_reference_tables(world: dict, issues: list[dict]) -> None:
    team_ids = {row.get("team_id") for row in world.get("teams", []) if row.get("team_id")}
    driver_ids = {row.get("driver_id") for row in world.get("drivers", []) if row.get("driver_id")}
    track_ids = {row.get("track_id") for row in world.get("tracks", []) if row.get("track_id")}
    legacy_track_ids = {row.get("legacy_track_id") for row in world.get("tracks", []) if row.get("legacy_track_id")}

    _warn_noncanonical_ids(world, issues, "rdProjects", "team_id", team_ids, "R&D_Projects")
    _warn_noncanonical_ids(world, issues, "pitCrew", "team_id", team_ids, "Pitcrew")
    _warn_noncanonical_ids(world, issues, "financeLedger", "team_id", team_ids, "Finance_Ledger")
    _warn_noncanonical_ids(world, issues, "achievements", "team_id", team_ids, "Achievements")
    _warn_noncanonical_ids(world, issues, "achievements", "driver_id", driver_ids, "Achievements")

    weather_rows = world.get("weatherProfiles", [])
    unresolved_weather = [
        row for row in weather_rows
        if row.get("track_id") not in track_ids and row.get("track_id") not in legacy_track_ids
    ]
    if unresolved_weather:
        issues.append(
            _issue(
                "warning",
                "WEATHER_TRACK_REFERENCES_UNRESOLVED",
                "Weather_Profiles",
                None,
                f"{len(unresolved_weather)} weather profiles use track IDs that resolve to neither canonical CIR IDs nor Circuits.legacy_track_id.",
                unresolved_count=len(unresolved_weather),
            )
        )


def _warn_noncanonical_ids(world: dict, issues: list[dict], collection: str, field: str, valid_ids: set, source_sheet: str) -> None:
    rows = [row for row in world.get(collection, []) if row.get(field) not in (None, "")]
    unresolved = [row for row in rows if row.get(field) not in valid_ids]
    if unresolved:
        issues.append(
            _issue(
                "warning",
                "NONCANONICAL_REFERENCE_IDS",
                source_sheet,
                None,
                f"{len(unresolved)}/{len(rows)} populated {collection}.{field} values do not use the canonical master IDs.",
                field=field,
                unresolved_count=len(unresolved),
            )
        )


def _audit_contract_placeholders(world: dict, issues: list[dict]) -> None:
    driver_rows = world.get("contracts", [])
    vacancy_rows = [row for row in driver_rows if row.get("team_id") and not row.get("driver_id")]
    empty_rows = [row for row in driver_rows if not row.get("year") and not row.get("team_id") and not row.get("driver_id")]
    if vacancy_rows:
        issues.append(
            _issue(
                "warning",
                "VACANCY_ROWS_IN_DRIVER_CONTRACTS",
                "Driver_Contracts",
                None,
                f"{len(vacancy_rows)} Driver_Contracts rows describe vacant seats rather than contracts; move them to a vacancy/start-state table.",
                unresolved_count=len(vacancy_rows),
            )
        )
    if empty_rows:
        issues.append(
            _issue(
                "warning",
                "EMPTY_DRIVER_CONTRACT_ROWS",
                "Driver_Contracts",
                None,
                f"{len(empty_rows)} Driver_Contracts rows contain no year/team/driver identity.",
                unresolved_count=len(empty_rows),
            )
        )

    staff_placeholders = [row for row in world.get("staffContracts", []) if row.get("team_id") and not row.get("staff_id")]
    if staff_placeholders:
        years = Counter(_as_int(row.get("year")) for row in staff_placeholders)
        issues.append(
            _issue(
                "warning",
                "UNRESOLVED_STAFF_CONTRACT_IDENTITIES",
                "Staff_Contracts",
                None,
                f"{len(staff_placeholders)} Staff_Contracts rows have a team but no canonical staff_id (years: {dict(years)}).",
                unresolved_count=len(staff_placeholders),
            )
        )


def _audit_declared_support(world: dict, issues: list[dict]) -> None:
    declared = {
        _as_int(row.get("season")): row
        for row in world.get("seasonSupport", [])
        if _as_int(row.get("season")) is not None
    }
    start_manifest = {row.get("property"): row.get("value") for row in world.get("start1980Manifest", []) if row.get("property")}
    snapshot_status = str(start_manifest.get("snapshot_status") or "")
    row_1980 = declared.get(1980)
    if row_1980 and "FULL" in str(row_1980.get("support_status") or "").upper() and "partial" in snapshot_status.lower():
        issues.append(
            _issue(
                "warning",
                "SUPPORT_STATUS_INCONSISTENT",
                "Season_Support",
                row_1980.get("_source", {}).get("row"),
                "1980 is declared PLAYABLE_FULL_START_V1 while Start_1980_Manifest explicitly says staff depth is still partial.",
                year=1980,
            )
        )


def _simple_name(value: object) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def _as_int(value: object) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _issue(severity: str, code: str, sheet: str | None, row: int | None, message: str, **extra) -> dict:
    return {"severity": severity, "code": code, "sheet": sheet, "row": row, "message": message, **extra}
