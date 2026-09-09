"""Normalize the evolving master workbook into the canonical Historical World contract."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import re
import unicodedata

from .xlsx_reader import XlsxWorkbook

SCHEMA_VERSION = 1

SHEET_COLLECTIONS = {
    "driver_attribute_weights": "driverAttributeWeights",
    "core_driver_attributes": "driverAttributeDefinitions",
    "core_staff_attributes": "staffAttributeDefinitions",
    "core_roles": "roles",
    "Series": "series",
    "drivers": "drivers",
    "driver_ratings": "driverRatings",
    "driver_career": "driverCareer",
    "staff_core": "staff",
    "staff_ratings": "staffRatings",
    "staff_contracts": "staffContracts",
    "teams": "teams",
    "team_brands": "teamBrands",
    "contracts": "contracts",
    "team_engines": "teamEngines",
    "core_engines": "engines",
    "car_parts": "carParts",
    "car_stats_by_year": "carStats",
    "facilities": "facilities",
    "facilities_catalog": "facilityCatalog",
    "rd_projects": "rdProjects",
    "pitcrew_roster": "pitCrew",
    "finance_ledger": "financeLedger",
    "core_tracks": "tracks",
    "calendar": "calendar",
    "weather_profiles": "weatherProfiles",
    "race_results": "raceResults",
    "core_sponsors_catalog": "sponsorCatalog",
    "sponsors_contracts": "sponsorContracts",
    "tyers_catalog": "tyreCatalog",
    "events": "events",
    "event_templates": "eventTemplates",
    "news_template": "newsTemplates",
    "achievements": "achievements",
    "rules": "rules",
    "qualifying_rules": "qualifyingRules",
    "era_safety": "eraSafety",
    "accident_model": "accidentModel",
}

EXACT_HEADER_ALIASES = {
    "driverId": "driver_id_arch",
    "driverID_arch": "driver_id_arch",
    "raceId": "race_id_arch",
    "raceID_arch": "race_id_arch",
    "constructorId": "constructor_id_arch",
    "resultId": "result_id_arch",
    "statusId": "status_id_arch",
}

HEADER_ALIASES = {
    "1980": "active_1980",
    "driverid_arch": "driver_id_arch",
    "team name": "team_name",
    "ovrl": "overall",
    "innovation": "innovation",
    "availability": "availability",
    "country": "country",
    "prefered_number": "preferred_number",
    "agression": "aggression",
    "tire_management": "tyre_management",
    "manufacturing_leve": "manufacturing_level",
    "_chassis_shop_level": "chassis_shop_level",
    "circtuiid_arch": "circuit_id_arch",
    "layoutr_year": "layout_year",
    "pitr_lane_loss": "pit_lane_loss",
    "compund_id": "compound_id",
    "sposor_name": "sponsor_name",
    "anual_income": "annual_income",
}

DATE_FIELDS = {"dob", "death_date", "race_date", "date"}
NUMERIC_STRING_FIELDS = {
    "reliability_override",
    "era_safety_index",
    "car_safety",
    "medical_response",
    "marshals_quality",
    "minor_prob",
    "damage_dnf_prob",
    "injury_prob",
    "fatality_prob",
}


def normalize_workbook(workbook: XlsxWorkbook, source_path: str | Path) -> tuple[dict, list[dict]]:
    source_path = Path(source_path)
    issues: list[dict] = []
    world: dict[str, object] = {collection: [] for collection in SHEET_COLLECTIONS.values()}

    for sheet_name, collection in SHEET_COLLECTIONS.items():
        sheet = workbook.sheets.get(sheet_name)
        if sheet is None:
            issues.append(_issue("error", "MISSING_SHEET", sheet_name, None, f"Required source sheet {sheet_name!r} is missing."))
            continue
        normalized_rows = []
        for source_row in sheet.rows:
            row = {}
            for header, value in source_row.values.items():
                canonical_header = canonicalize_header(header)
                row[canonical_header] = normalize_value(canonical_header, value)
            row["_source"] = {"sheet": sheet_name, "row": source_row.row_number}
            normalized_rows.append(row)
        world[collection] = normalized_rows

    _repair_identity_links(world, issues)
    _validate_primary_ids(world, issues)
    _validate_foreign_keys(world, issues)

    checksum = sha256_file(source_path)
    world["manifest"] = {
        "schemaVersion": SCHEMA_VERSION,
        "databaseVersion": f"f1db-{checksum[:12]}",
        "sourceFilename": source_path.name,
        "sourceSha256": checksum,
    }
    return world, issues


def canonicalize_header(header: object) -> str:
    raw = str(header).strip()
    if raw in EXACT_HEADER_ALIASES:
        return EXACT_HEADER_ALIASES[raw]
    alias_key = raw.lower()
    if alias_key in HEADER_ALIASES:
        return HEADER_ALIASES[alias_key]
    if re.fullmatch(r"\d{4}", raw):
        return f"active_{raw}"
    snake = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode("ascii")
    snake = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", snake)
    snake = re.sub(r"[^A-Za-z0-9]+", "_", snake).strip("_").lower()
    return HEADER_ALIASES.get(snake, snake)


def normalize_value(field: str, value: object) -> object:
    if field in DATE_FIELDS and isinstance(value, (int, float)):
        return excel_serial_to_iso(value)
    if field in NUMERIC_STRING_FIELDS and isinstance(value, str):
        stripped = value.strip()
        try:
            return float(stripped)
        except ValueError:
            return value
    return value


def excel_serial_to_iso(value: int | float) -> str:
    base = datetime(1899, 12, 30, tzinfo=timezone.utc)
    result = base + timedelta(days=float(value))
    return result.date().isoformat()


def normalize_name(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def _repair_identity_links(world: dict, issues: list[dict]) -> None:
    specs = [
        ("driverRatings", "driver_id", "driver_name", "drivers", "driver_id", "display_name"),
        ("driverCareer", "driver_id", "driver_name", "drivers", "driver_id", "display_name"),
        ("contracts", "driver_id", "driver_name", "drivers", "driver_id", "display_name"),
        ("staffRatings", "staff_id", "staff_name", "staff", "staff_id", "staff_name"),
        ("staffContracts", "staff_id", "staff_name", "staff", "staff_id", "staff_name"),
        ("teamBrands", "team_id", "team_name", "teams", "team_id", "team_name"),
        ("contracts", "team_id", "team_name", "teams", "team_id", "team_name"),
        ("staffContracts", "team_id", "team_name", "teams", "team_id", "team_name"),
        ("teamEngines", "team_id", "team_name", "teams", "team_id", "team_name"),
        ("carStats", "team_id", "team_name", "teams", "team_id", "team_name"),
    ]
    for collection, id_field, name_field, master_collection, master_id, master_name in specs:
        masters = world.get(master_collection, [])
        by_id = {row.get(master_id): row for row in masters if row.get(master_id)}
        by_name: dict[str, list[dict]] = defaultdict(list)
        for row in masters:
            if row.get(master_name):
                by_name[normalize_name(row.get(master_name))].append(row)

        for row in world.get(collection, []):
            source_id = row.get(id_field)
            source_name = row.get(name_field)
            if not source_id and not source_name:
                continue
            target = by_id.get(source_id)
            if target is not None and (not source_name or normalize_name(source_name) == normalize_name(target.get(master_name))):
                continue

            candidates = by_name.get(normalize_name(source_name), []) if source_name else []
            if len(candidates) == 1:
                canonical_id = candidates[0].get(master_id)
                source_meta = row.setdefault("_source", {})
                source_meta.setdefault("original_ids", {})[id_field] = source_id
                row[id_field] = canonical_id
                issues.append(
                    _issue(
                        "warning",
                        "IDENTITY_LINK_REPAIRED",
                        source_meta.get("sheet"),
                        source_meta.get("row"),
                        f"{collection}.{id_field} normalized from {source_id!r} to {canonical_id!r} using unique name {source_name!r}.",
                        field=id_field,
                        source_id=source_id,
                        canonical_id=canonical_id,
                    )
                )
            else:
                source_meta = row.get("_source", {})
                issues.append(
                    _issue(
                        "error",
                        "IDENTITY_LINK_UNRESOLVED",
                        source_meta.get("sheet"),
                        source_meta.get("row"),
                        f"Could not resolve {collection}.{id_field}={source_id!r} / {name_field}={source_name!r} to exactly one canonical {master_collection} record.",
                        field=id_field,
                    )
                )


def _validate_primary_ids(world: dict, issues: list[dict]) -> None:
    for collection, id_field in (("drivers", "driver_id"), ("teams", "team_id"), ("staff", "staff_id"), ("tracks", "track_id"), ("engines", "engine_id")):
        seen: dict[object, dict] = {}
        for row in world.get(collection, []):
            value = row.get(id_field)
            source = row.get("_source", {})
            if not value:
                issues.append(_issue("error", "MISSING_PRIMARY_ID", source.get("sheet"), source.get("row"), f"{collection} record is missing {id_field}.", field=id_field))
                continue
            if value in seen:
                issues.append(_issue("error", "DUPLICATE_PRIMARY_ID", source.get("sheet"), source.get("row"), f"Duplicate {collection}.{id_field}={value!r}.", field=id_field))
            else:
                seen[value] = row


def _validate_foreign_keys(world: dict, issues: list[dict]) -> None:
    driver_ids = {row.get("driver_id") for row in world.get("drivers", [])}
    staff_ids = {row.get("staff_id") for row in world.get("staff", [])}
    team_ids = {row.get("team_id") for row in world.get("teams", [])}
    track_ids = {row.get("track_id") for row in world.get("tracks", [])}
    engine_ids = {row.get("engine_id") for row in world.get("engines", [])}

    relationships = [
        ("driverRatings", "driver_id", driver_ids, "drivers"),
        ("driverCareer", "driver_id", driver_ids, "drivers"),
        ("contracts", "driver_id", driver_ids, "drivers"),
        ("staffRatings", "staff_id", staff_ids, "staff"),
        ("staffContracts", "staff_id", staff_ids, "staff"),
        ("teamBrands", "team_id", team_ids, "teams"),
        ("contracts", "team_id", team_ids, "teams"),
        ("staffContracts", "team_id", team_ids, "teams"),
        ("teamEngines", "team_id", team_ids, "teams"),
        ("teamEngines", "engine_id", engine_ids, "engines"),
        ("carStats", "team_id", team_ids, "teams"),
        ("facilities", "team_id", team_ids, "teams"),
        ("calendar", "track_id", track_ids, "tracks"),
        ("raceResults", "driver_id", driver_ids, "drivers"),
        ("raceResults", "track_id", track_ids, "tracks"),
    ]
    for collection, field, valid_ids, target in relationships:
        for row in world.get(collection, []):
            value = row.get(field)
            if value in (None, ""):
                continue
            if value not in valid_ids:
                source = row.get("_source", {})
                issues.append(_issue("error", "BROKEN_FOREIGN_KEY", source.get("sheet"), source.get("row"), f"{collection}.{field}={value!r} does not resolve to {target}.", field=field))


def _issue(severity: str, code: str, sheet: str | None, row: int | None, message: str, **extra) -> dict:
    return {"severity": severity, "code": code, "sheet": sheet, "row": row, "message": message, **extra}


def sha256_file(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def strip_provenance(value: object) -> object:
    if isinstance(value, list):
        return [strip_provenance(item) for item in value]
    if isinstance(value, dict):
        return {key: strip_provenance(item) for key, item in value.items() if key != "_source"}
    return value


def dump_json(path: str | Path, value: object) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
