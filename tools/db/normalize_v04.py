"""Normalize Master Database v0.4+ into the stable Historical World contract.

v0.4 deliberately changed the editor schema: canonical DRV/TEAM/CIR IDs, activity
periods, activation rules and materialized 1980 start tables now live in the
workbook. The simulation consumes a stable runtime contract, so this adapter
translates the editor schema without rewriting the source workbook.
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path
import re

from .audit_v04 import audit_v04_structure
from .normalize import canonicalize_header, excel_serial_to_iso, normalize_value, sha256_file
from .reference_1980 import audit_1980_reference

SCHEMA_VERSION = 2

SHEET_COLLECTIONS = {
    "README": "sourceReadme",
    "Table_Index": "tableIndex",
    "Data_Sources": "dataSources",
    "Season_Support": "seasonSupport",
    "Snapshot_1980_Validation": "snapshot1980Validation",
    "Start_1980_Manifest": "start1980Manifest",
    "Start_1980_Teams": "start1980Teams",
    "Start_1980_Drivers": "start1980Drivers",
    "Start_1980_Staff": "start1980Staff",
    "Start_1980_Calendar": "start1980Calendar",
    "Future_Entity_Queue_1980": "futureEntityQueue1980",
    "Data_Quality": "dataQuality",
    "Historical_Coverage": "historicalCoverage",
    "Availability_Timeline": "availabilityTimeline",
    "World_Activation_Rules": "worldActivationRules",
    "Driver_F1_Activity_Periods": "driverActivityPeriods",
    "Team_F1_Activity_Periods": "teamActivityPeriods",
    "Drivers": "drivers",
    "Driver_Season_Stats": "driverSeasonStats",
    "Driver_Ratings": "driverRatings",
    "Driver_Career_Other": "driverCareer",
    "Teams": "teams",
    "Team_Lineage": "teamLineage",
    "Team_Brands": "teamBrands",
    "Driver_Contracts": "contracts",
    "Staff": "staff",
    "Staff_Ratings": "staffRatings",
    "Staff_Contracts": "staffContracts",
    "Circuits": "tracks",
    "Calendar": "calendar",
    "Series": "series",
    "Driver_Attribute_Weights": "driverAttributeWeights",
    "Driver_Attributes": "driverAttributeDefinitions",
    "Staff_Attributes": "staffAttributeDefinitions",
    "Roles": "roles",
    "Engines": "engines",
    "Team_Engines": "teamEngines",
    "Car_Parts": "carParts",
    "Car_Performance": "carStats",
    "Facilities_Catalog": "facilityCatalog",
    "Team_Facilities": "facilities",
    "R&D_Projects": "rdProjects",
    "Pitcrew": "pitCrew",
    "Finance_Ledger": "financeLedger",
    "Weather_Profiles": "weatherProfiles",
    "Sponsors": "sponsorCatalog",
    "Sponsor_Contracts": "sponsorContracts",
    "Tyre_Manufacturers": "tyreCatalog",
    "Event_Templates": "eventTemplates",
    "News_Templates": "newsTemplates",
    "Achievements": "achievements",
    "Rules": "rules",
    "Qualifying_Rules": "qualifyingRules",
    "Safety_Eras": "eraSafety",
    "Accident_Model": "accidentModel",
    "Custom_Entities": "customEntities",
}

REQUIRED_SHEETS = {
    "Season_Support",
    "World_Activation_Rules",
    "Drivers",
    "Driver_Ratings",
    "Driver_Contracts",
    "Teams",
    "Team_Brands",
    "Staff",
    "Staff_Ratings",
    "Staff_Contracts",
    "Circuits",
    "Calendar",
    "Engines",
    "Team_Engines",
    "Car_Performance",
    "Team_Facilities",
    "Rules",
    "Qualifying_Rules",
    "Safety_Eras",
    "Accident_Model",
    "Start_1980_Manifest",
    "Start_1980_Teams",
    "Start_1980_Drivers",
    "Start_1980_Staff",
    "Start_1980_Calendar",
}

# Stable issue-sheet names used by the existing readiness validator to scope
# issues to the correct season even when source/editor sheet names evolve.
ISSUE_SHEET_NAMES = {
    "Driver_Ratings": "driver_ratings",
    "Driver_Career_Other": "driver_career",
    "Driver_Contracts": "contracts",
    "Staff_Ratings": "staff_ratings",
    "Staff_Contracts": "staff_contracts",
    "Team_Brands": "team_brands",
    "Team_Engines": "team_engines",
    "Car_Performance": "car_stats_by_year",
    "Team_Facilities": "facilities",
    "Calendar": "calendar",
}

NUMERIC_TEXT_FIELDS = {
    "year", "round", "salary", "starting_budget", "manufacturing_level",
    "target_gain", "cost", "duration_weeks", "result_delta", "avg_time",
    "consistency", "error_rate", "training_load", "amount", "month",
    "avg_temp", "rain_chance", "storm_chance", "contract_start",
    "contract_until", "contract_years_left", "supply_cost", "overall",
    "power", "reliability", "fuel_efficiency", "ers_recovery",
    "chassis_integration", "reputation", "innovation", "availability",
    "current_ability", "potential_ability", "entries", "wins", "podiums",
    "poles", "fastest_laps", "points", "best_finish", "avg_grid",
    "chassis_spec", "aero_spec", "gearbox_spec", "suspension_spec",
    "brakes_spec", "cooling_spec", "electronics_spec", "turbo_spec",
    "kers_spec", "ers_mgu_k", "ers_mgu_h", "battery_pack", "weight",
    "wind_tunnel_level", "simulator_level", "aero_dept_level",
    "chassis_shop_level", "pitcrew_training_level", "youth_program_level",
    "maintenance_cost", "start_year", "end_year", "first_f1_year",
    "last_f1_year", "annual_income", "cash_upfront", "monthly_fee",
    "bonus_win", "bonus_podium", "bonus_championship", "market_value",
}


def is_v04_workbook(workbook) -> bool:
    """Return True when the workbook uses the v0.4 canonical editor schema."""
    return "Drivers" in workbook.sheets and "Start_1980_Manifest" in workbook.sheets


def normalize_workbook_v04(workbook, source_path: str | Path) -> tuple[dict, list[dict]]:
    source_path = Path(source_path)
    issues: list[dict] = []
    world: dict[str, object] = {collection: [] for collection in SHEET_COLLECTIONS.values()}

    for sheet_name, collection in SHEET_COLLECTIONS.items():
        sheet = workbook.sheets.get(sheet_name)
        if sheet is None:
            if sheet_name in REQUIRED_SHEETS:
                issues.append(_issue("error", "MISSING_SHEET", sheet_name, None, f"Required v0.4 source sheet {sheet_name!r} is missing."))
            continue

        normalized_rows = []
        for source_row in sheet.rows:
            row = {}
            for header, value in source_row.values.items():
                canonical_header = canonicalize_header(header)
                normalized = normalize_value(canonical_header, value)
                if canonical_header == "date" and isinstance(normalized, str) and re.fullmatch(r"\d+(?:\.\d+)?", normalized.strip()):
                    normalized = excel_serial_to_iso(float(normalized.strip()))
                row[canonical_header] = _normalize_numeric_text(canonical_header, normalized)

            # Runtime compatibility: the simulation currently calls canonical
            # CIRxxxx identifiers track_id. Preserve circuit_id as source data too.
            if collection in {"tracks", "calendar", "start1980Calendar"} and row.get("circuit_id"):
                row["track_id"] = row["circuit_id"]

            # Temporary compatibility aliases while generalized start-season
            # loading moves fully to the v0.4 activation/activity-period model.
            if collection == "drivers":
                if row.get("talent_pool_entry_year") not in (None, ""):
                    row["career_start_year"] = row["talent_pool_entry_year"]
                if row.get("f1_debut_reference_year") not in (None, ""):
                    row["f1_rookie_season"] = row["f1_debut_reference_year"]

            row["_source"] = {"sheet": sheet_name, "row": source_row.row_number}
            normalized_rows.append(row)
        world[collection] = normalized_rows

    _validate_core_ids(world, issues)
    issues.extend(audit_v04_structure(workbook, world))
    issues.extend(audit_1980_reference(world))

    checksum = sha256_file(source_path)
    source_version = _source_database_version(workbook)
    world["manifest"] = {
        "schemaVersion": SCHEMA_VERSION,
        "sourceSchema": "master-v0.4+",
        "sourceDataVersion": source_version,
        "databaseVersion": f"f1db-{source_version or 'v04'}-{checksum[:12]}",
        "sourceFilename": source_path.name,
        "sourceSha256": checksum,
        "historicalResultsStorage": "companion-sqlite",
    }
    return world, issues


def _normalize_numeric_text(field: str, value: object) -> object:
    if field not in NUMERIC_TEXT_FIELDS or not isinstance(value, str):
        return value
    raw = value.strip().replace("_", "")
    if not raw:
        return None
    try:
        number = float(raw)
    except ValueError:
        return value
    return int(number) if number.is_integer() else number


def _validate_core_ids(world: dict, issues: list[dict]) -> None:
    specs = (
        ("drivers", "driver_id", "Drivers"),
        ("teams", "team_id", "Teams"),
        ("staff", "staff_id", "Staff"),
        ("tracks", "track_id", "Circuits"),
        ("engines", "engine_id", "Engines"),
    )
    master_ids: dict[str, set[object]] = {}
    for collection, id_field, source_sheet in specs:
        seen: Counter = Counter()
        for row in world.get(collection, []):
            value = row.get(id_field)
            source = row.get("_source", {})
            if value in (None, ""):
                issues.append(_issue("error", "MISSING_PRIMARY_ID", source_sheet, source.get("row"), f"{collection} record is missing {id_field}.", field=id_field))
                continue
            seen[value] += 1
        for value, count in seen.items():
            if count > 1:
                issues.append(_issue("error", "DUPLICATE_PRIMARY_ID", source_sheet, None, f"Duplicate {collection}.{id_field}={value!r} ({count} rows).", field=id_field))
        master_ids[collection] = set(seen)

    relationships = (
        ("driverRatings", "driver_id", "drivers", "Driver_Ratings"),
        ("contracts", "driver_id", "drivers", "Driver_Contracts"),
        ("contracts", "team_id", "teams", "Driver_Contracts"),
        ("staffRatings", "staff_id", "staff", "Staff_Ratings"),
        ("staffContracts", "staff_id", "staff", "Staff_Contracts"),
        ("staffContracts", "team_id", "teams", "Staff_Contracts"),
        ("teamBrands", "team_id", "teams", "Team_Brands"),
        ("teamEngines", "team_id", "teams", "Team_Engines"),
        ("teamEngines", "engine_id", "engines", "Team_Engines"),
        ("carStats", "team_id", "teams", "Car_Performance"),
        ("facilities", "team_id", "teams", "Team_Facilities"),
        ("calendar", "track_id", "tracks", "Calendar"),
        ("driverActivityPeriods", "driver_id", "drivers", "Driver_F1_Activity_Periods"),
        ("teamActivityPeriods", "team_id", "teams", "Team_F1_Activity_Periods"),
    )
    for collection, field, target, source_sheet in relationships:
        valid_ids = master_ids.get(target, set())
        for row in world.get(collection, []):
            value = row.get(field)
            if value in (None, ""):
                continue
            if value not in valid_ids:
                source = row.get("_source", {})
                issues.append(
                    _issue(
                        "error",
                        "BROKEN_FOREIGN_KEY",
                        ISSUE_SHEET_NAMES.get(source_sheet, source_sheet),
                        source.get("row"),
                        f"{collection}.{field}={value!r} does not resolve to {target}.",
                        year=_as_int(row.get("year") or row.get("start_year")),
                        source_sheet=source_sheet,
                        field=field,
                    )
                )


def _source_database_version(workbook) -> str | None:
    readme = workbook.sheets.get("README")
    if readme:
        for source_row in readme.rows:
            values = list(source_row.values.values())
            if len(values) >= 2 and str(values[0]).strip().lower() == "data version":
                match = re.search(r"(\d+\.\d+)", str(values[1]))
                if match:
                    return match.group(1)
        for header in readme.headers:
            match = re.search(r"v(\d+\.\d+)", str(header or ""), re.IGNORECASE)
            if match:
                return match.group(1)
    return None


def _as_int(value: object) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _issue(severity: str, code: str, sheet: str | None, row: int | None, message: str, **extra) -> dict:
    return {"severity": severity, "code": code, "sheet": sheet, "row": row, "message": message, **extra}
