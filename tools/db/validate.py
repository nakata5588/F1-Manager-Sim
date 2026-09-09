"""Validation and season-readiness rules for canonical Historical World data."""

from __future__ import annotations

from collections import Counter


def readiness_for_season(world: dict, season: int, global_issues: list[dict] | None = None) -> dict:
    year = int(season)
    checks: list[dict] = []

    teams = {row.get("team_id"): row for row in world.get("teams", []) if row.get("team_id")}
    drivers = {row.get("driver_id"): row for row in world.get("drivers", []) if row.get("driver_id")}
    staff = {row.get("staff_id"): row for row in world.get("staff", []) if row.get("staff_id")}
    engines = {row.get("engine_id"): row for row in world.get("engines", []) if row.get("engine_id")}
    tracks = {row.get("track_id"): row for row in world.get("tracks", []) if row.get("track_id")}

    team_brands = _year(world.get("teamBrands", []), year)
    active_team_ids = {row.get("team_id") for row in team_brands if row.get("team_id")}
    contracts = [row for row in _year(world.get("contracts", []), year) if row.get("team_id") in active_team_ids and row.get("driver_id")]
    ratings = _year(world.get("driverRatings", []), year)
    rating_ids = {row.get("driver_id") for row in ratings if row.get("driver_id")}
    staff_contracts = [row for row in _year(world.get("staffContracts", []), year) if row.get("team_id") in active_team_ids and row.get("staff_id")]
    staff_rating_ids = {row.get("staff_id") for row in _year(world.get("staffRatings", []), year) if row.get("staff_id")}
    team_engines = [row for row in _year(world.get("teamEngines", []), year) if row.get("team_id") in active_team_ids]
    car_stats = [row for row in _year(world.get("carStats", []), year) if row.get("team_id") in active_team_ids]
    facilities = [row for row in _year(world.get("facilities", []), year) if row.get("team_id") in active_team_ids]
    calendar = _year(world.get("calendar", []), year)

    _check(checks, "teams", bool(active_team_ids), f"{len(active_team_ids)} active teams")
    _check(checks, "team-identities", all(team_id in teams for team_id in active_team_ids), "all season team IDs resolve")

    drivers_per_team = Counter(row.get("team_id") for row in contracts)
    _check(checks, "driver-contracts", bool(contracts) and all(drivers_per_team[team_id] >= 1 for team_id in active_team_ids), f"{len(contracts)} driver contracts; every active team has at least one")
    _check(checks, "contract-driver-ids", all(row.get("driver_id") in drivers for row in contracts), "all contracted driver IDs resolve")
    missing_driver_ratings = sorted({row.get("driver_id") for row in contracts if row.get("driver_id") not in rating_ids})
    _check(checks, "contracted-driver-ratings", not missing_driver_ratings, f"{len(ratings)} ratings; missing contracted ratings: {missing_driver_ratings}")

    staff_per_team = Counter(row.get("team_id") for row in staff_contracts)
    _check(checks, "staff-contracts", bool(staff_contracts) and all(staff_per_team[team_id] >= 1 for team_id in active_team_ids), f"{len(staff_contracts)} staff contracts; every active team has at least one")
    _check(checks, "staff-ids", all(row.get("staff_id") in staff for row in staff_contracts), "all contracted staff IDs resolve")
    missing_staff_ratings = sorted({row.get("staff_id") for row in staff_contracts if row.get("staff_id") not in staff_rating_ids})
    _check(checks, "contracted-staff-ratings", not missing_staff_ratings, f"missing contracted staff ratings: {missing_staff_ratings}")

    engines_per_team = Counter(row.get("team_id") for row in team_engines)
    _check(checks, "engine-assignment", all(engines_per_team[team_id] >= 1 for team_id in active_team_ids), f"{len(team_engines)} team-engine rows")
    _check(checks, "engine-ids", all(row.get("engine_id") in engines for row in team_engines), "all season engine IDs resolve")

    car_team_ids = {row.get("team_id") for row in car_stats}
    facility_team_ids = {row.get("team_id") for row in facilities}
    _check(checks, "car-state", active_team_ids <= car_team_ids, f"{len(car_stats)} car-stat rows")
    _check(checks, "facilities", active_team_ids <= facility_team_ids, f"{len(facilities)} facility rows")

    calendar_rounds = sorted(row.get("round") for row in calendar if isinstance(row.get("round"), (int, float)))
    expected_rounds = list(range(1, len(calendar_rounds) + 1))
    _check(checks, "calendar", len(calendar) > 0 and calendar_rounds == expected_rounds, f"{len(calendar)} races with sequential rounds")
    _check(checks, "calendar-tracks", all(row.get("track_id") in tracks for row in calendar), "all calendar track IDs resolve")

    _check(checks, "sporting-rules", _effective(world.get("rules", []), year) is not None, "sporting/points rule available")
    _check(checks, "qualifying-rules", _effective(world.get("qualifyingRules", []), year) is not None, "qualifying rule available")
    _check(checks, "safety-era", _effective(world.get("eraSafety", []), year) is not None, "safety era available")
    _check(checks, "accident-model", _effective(world.get("accidentModel", []), year) is not None, "accident model available")

    relevant_errors = []
    relevant_warnings = []
    for issue in global_issues or []:
        row_year = _issue_year(world, issue)
        if row_year not in (None, year):
            continue
        if issue.get("severity") == "error":
            relevant_errors.append(issue)
        elif issue.get("severity") == "warning":
            relevant_warnings.append(issue)

    failed = [check for check in checks if not check["passed"]]
    if failed or relevant_errors:
        status = "BLOCKED"
    elif relevant_warnings:
        status = "READY_WITH_WARNINGS"
    else:
        status = "READY"

    return {
        "season": year,
        "status": status,
        "summary": {
            "activeTeams": len(active_team_ids),
            "driverContracts": len(contracts),
            "driverRatings": len(ratings),
            "staffContracts": len(staff_contracts),
            "staffRatings": len(_year(world.get("staffRatings", []), year)),
            "teamEngines": len(team_engines),
            "carStats": len(car_stats),
            "facilities": len(facilities),
            "calendarRaces": len(calendar),
            "failedChecks": len(failed),
            "errors": len(relevant_errors),
            "warnings": len(relevant_warnings),
        },
        "checks": checks,
        "errors": relevant_errors,
        "warnings": relevant_warnings,
    }


def _year(rows: list[dict], year: int) -> list[dict]:
    return [row for row in rows if _as_int(row.get("year")) == year]


def _effective(rows: list[dict], year: int) -> dict | None:
    eligible = [row for row in rows if (_as_int(row.get("year")) is not None and _as_int(row.get("year")) <= year)]
    if not eligible:
        return None
    return max(eligible, key=lambda row: _as_int(row.get("year")))


def _as_int(value: object) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _check(checks: list[dict], code: str, passed: bool, detail: str) -> None:
    checks.append({"code": code, "passed": bool(passed), "detail": detail})


def _issue_year(world: dict, issue: dict) -> int | None:
    sheet = issue.get("sheet")
    row_number = issue.get("row")
    if not sheet or not row_number:
        return None
    collection_map = {
        "driver_ratings": "driverRatings",
        "driver_career": "driverCareer",
        "contracts": "contracts",
        "staff_ratings": "staffRatings",
        "staff_contracts": "staffContracts",
        "team_brands": "teamBrands",
        "team_engines": "teamEngines",
        "car_stats_by_year": "carStats",
        "facilities": "facilities",
        "calendar": "calendar",
    }
    collection = collection_map.get(sheet)
    if not collection:
        return None
    for row in world.get(collection, []):
        source = row.get("_source", {})
        if source.get("row") == row_number:
            return _as_int(row.get("year"))
    return None
