import unittest

from tools.db.normalize import canonicalize_header, excel_serial_to_iso, normalize_name


class NormalizeTests(unittest.TestCase):
    def test_known_legacy_headers_are_canonicalized(self):
        self.assertEqual(canonicalize_header("agression"), "aggression")
        self.assertEqual(canonicalize_header("team name"), "team_name")
        self.assertEqual(canonicalize_header("manufacturing_leve"), "manufacturing_level")
        self.assertEqual(canonicalize_header("1980"), "active_1980")
        self.assertEqual(canonicalize_header("driverId"), "driver_id_arch")
        self.assertEqual(canonicalize_header("driver_id"), "driver_id")

    def test_excel_dates_are_stable(self):
        self.assertEqual(excel_serial_to_iso(29221), "1980-01-01")

    def test_names_normalize_accents_and_punctuation(self):
        self.assertEqual(normalize_name("René Arnoux"), "renearnoux")
        self.assertEqual(normalize_name("Rene-Arnoux"), "renearnoux")


if __name__ == "__main__":
    unittest.main()
