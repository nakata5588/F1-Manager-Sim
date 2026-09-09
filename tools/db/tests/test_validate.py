import unittest

from tools.db.validate import readiness_for_season


def minimal_ready_world():
    return {
        "teams": [{"team_id": "t1"}],
        "drivers": [{"driver_id": "d1"}],
        "staff": [{"staff_id": "s1"}],
        "engines": [{"engine_id": "e1"}],
        "tracks": [{"track_id": "tr1"}],
        "teamBrands": [{"year": 1980, "team_id": "t1"}],
        "contracts": [{"year": 1980, "team_id": "t1", "driver_id": "d1"}],
        "driverRatings": [{"year": 1980, "driver_id": "d1"}],
        "staffContracts": [{"year": 1980, "team_id": "t1", "staff_id": "s1"}],
        "staffRatings": [{"year": 1980, "staff_id": "s1"}],
        "teamEngines": [{"year": 1980, "team_id": "t1", "engine_id": "e1"}],
        "carStats": [{"year": 1980, "team_id": "t1"}],
        "facilities": [{"year": 1980, "team_id": "t1"}],
        "calendar": [{"year": 1980, "round": 1, "track_id": "tr1"}],
        "rules": [{"year": 1980}],
        "qualifyingRules": [{"year": 1950}],
        "eraSafety": [{"year": 1980}],
        "accidentModel": [{"year": 1980}],
    }


class ReadinessTests(unittest.TestCase):
    def test_minimal_complete_season_is_ready(self):
        report = readiness_for_season(minimal_ready_world(), 1980, [])
        self.assertEqual(report["status"], "READY")
        self.assertEqual(report["summary"]["failedChecks"], 0)

    def test_missing_contracted_driver_rating_blocks_season(self):
        world = minimal_ready_world()
        world["driverRatings"] = []
        report = readiness_for_season(world, 1980, [])
        self.assertEqual(report["status"], "BLOCKED")
        failed_codes = {item["code"] for item in report["checks"] if not item["passed"]}
        self.assertIn("contracted-driver-ratings", failed_codes)


if __name__ == "__main__":
    unittest.main()
