"""Independent historical reference checks for the first playable 1980 start.

These are starting-condition facts, not scripted save outcomes. They protect the
editor database from accidentally drifting toward modern circuit layouts,
incorrect car numbers or later engine packages.
"""

from __future__ import annotations

FORMULA1_ARGENTINA_GRID = "https://www.formula1.com/en/results/1980/races/80/argentina/starting-grid"
FORMULA1_1980_RACES = "https://www.formula1.com/en/results/1980/races"
MOTORSPORT_1980_RULES = "https://www.motorsportmagazine.com/articles/single-seaters/f1/politics-and-disrepute-1980-british-gp/"
LIGIER_HISTORY = "https://www.ligier.fr/adn-ligier/notre-histoire/"
ALFA_AUTODELTA_HISTORY = "https://www.media.stellantis.com/em-en/alfa-romeo/press/milan-autoclassica-alfa-romeo-celebrates-50-years-of-the-autodelta-team"

DRIVER_NUMBERS = {
    "Alan Jones": 27,
    "Jacques Laffite": 26,
    "Didier Pironi": 25,
    "Nelson Piquet": 5,
    "Elio de Angelis": 12,
    "Mario Andretti": 11,
    "Riccardo Patrese": 29,
    "Gilles Villeneuve": 2,
    "Jean-Pierre Jabouille": 15,
    "Carlos Reutemann": 28,
    "Jody Scheckter": 1,
    "Alain Prost": 8,
    "Keke Rosberg": 21,
    "Jochen Mass": 30,
    "Clay Regazzoni": 14,
    "Ricardo Zunino": 6,
    "John Watson": 7,
    "Jean-Pierre Jarier": 3,
    "René Arnoux": 16,
    "Bruno Giacomelli": 23,
    "Marc Surer": 9,
    "Derek Daly": 4,
    "Patrick Depailler": 22,
    "Emerson Fittipaldi": 20,
    "David Kennedy": 18,
    "Stefan Johansson": 17,
    "Jan Lammers": 10,
    "Eddie Cheever": 31,
}

RACE_LAPS = {
    1: 53,
    2: 40,
    3: 78,
    4: 80,
    5: 72,
    6: 76,
    7: 54,
    8: 76,
    9: 45,
    10: 54,
    11: 72,
    12: 60,
    13: 70,
    14: 59,
}

TEAM_BASE_COUNTRIES = {
    "TEAM0002": "France",  # Ligier
    "TEAM0011": "Italy",  # Alfa Romeo / Autodelta
}


def audit_1980_reference(world: dict) -> list[dict]:
    issues: list[dict] = []

    by_name = {row.get("driver_name"): row for row in world.get("start1980Drivers", [])}
    mismatched_numbers = []
    for name, expected in DRIVER_NUMBERS.items():
        row = by_name.get(name)
        if row is None:
            continue
        actual = _as_int(row.get("number"))
        if actual != expected:
            mismatched_numbers.append({"driver": name, "actual": actual, "expected": expected})
    if mismatched_numbers:
        issues.append(
            _issue(
                "warning",
                "HISTORICAL_1980_DRIVER_NUMBERS",
                "Start_1980_Drivers",
                None,
                f"{len(mismatched_numbers)} 1980 start driver numbers differ from the independent reference grid.",
                year=1980,
                source_url=FORMULA1_ARGENTINA_GRID,
                mismatches=mismatched_numbers,
            )
        )

    mismatched_laps = []
    for row in world.get("start1980Calendar", []):
        round_no = _as_int(row.get("round"))
        expected = RACE_LAPS.get(round_no)
        if expected is None:
            continue
        actual = _as_int(row.get("default_laps"))
        if actual != expected:
            mismatched_laps.append(
                {
                    "round": round_no,
                    "grand_prix": row.get("gp_name"),
                    "actual": actual,
                    "expected": expected,
                }
            )
    if mismatched_laps:
        issues.append(
            _issue(
                "warning",
                "HISTORICAL_1980_RACE_LAPS",
                "Start_1980_Calendar",
                None,
                f"{len(mismatched_laps)} 1980 calendar lap counts differ from the independent Formula 1 race record.",
                year=1980,
                source_url=FORMULA1_1980_RACES,
                mismatches=mismatched_laps,
            )
        )

    ligier = next((row for row in world.get("start1980Teams", []) if row.get("team_id") == "TEAM0002"), None)
    if ligier and str(ligier.get("power_unit") or "").lower() != "ford":
        issues.append(
            _issue(
                "warning",
                "HISTORICAL_1980_LIGIER_ENGINE",
                "Start_1980_Teams",
                ligier.get("_source", {}).get("row"),
                f"Ligier 1980 is stored with {ligier.get('engine_name')!r}/{ligier.get('power_unit')!r}; the 1980 race record identifies Ligier-Ford.",
                year=1980,
                source_url=FORMULA1_1980_RACES,
            )
        )

    teams = {row.get("team_id"): row for row in world.get("teams", []) if row.get("team_id")}
    country_mismatches = []
    for team_id, expected in TEAM_BASE_COUNTRIES.items():
        row = teams.get(team_id)
        if row and row.get("base_country") != expected:
            country_mismatches.append(
                {"team_id": team_id, "team": row.get("team_name"), "actual": row.get("base_country"), "expected": expected}
            )
    if country_mismatches:
        issues.append(
            _issue(
                "warning",
                "HISTORICAL_TEAM_BASE_COUNTRY",
                "Teams",
                None,
                f"{len(country_mismatches)} team base-country values conflict with independent team history/reference context.",
                year=1980,
                source_urls=[LIGIER_HISTORY, ALFA_AUTODELTA_HISTORY],
                mismatches=country_mismatches,
            )
        )

    rules = next((row for row in world.get("rules", []) if _as_int(row.get("year")) == 1980), None)
    if rules and not any(key in rules for key in ("driver_result_counting", "drop_score_rule", "counted_results_rule")):
        issues.append(
            _issue(
                "warning",
                "HISTORICAL_1980_DROP_SCORE_RULE_MISSING",
                "Rules",
                rules.get("_source", {}).get("row"),
                "1980 points values are present, but the Drivers' Championship best-5-of-first-7 + best-5-of-last-7 counting rule is not represented.",
                year=1980,
                source_url=MOTORSPORT_1980_RULES,
            )
        )

    return issues


def _as_int(value: object) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _issue(severity: str, code: str, sheet: str | None, row: int | None, message: str, **extra) -> dict:
    return {"severity": severity, "code": code, "sheet": sheet, "row": row, "message": message, **extra}
