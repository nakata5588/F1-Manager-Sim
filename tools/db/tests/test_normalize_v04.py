import tempfile
import unittest
from pathlib import Path

from tools.db.normalize_v04 import REQUIRED_SHEETS, is_v04_workbook, normalize_workbook_v04
from tools.db.xlsx_reader import SheetData, SheetRow, XlsxWorkbook


def make_sheet(name, rows):
    headers = tuple(rows[0].keys()) if rows else tuple()
    return SheetData(
        name=name,
        headers=headers,
        rows=tuple(SheetRow(row_number=index + 2, values=row) for index, row in enumerate(rows)),
    )


def minimal_v04_workbook():
    sheets = {name: make_sheet(name, []) for name in REQUIRED_SHEETS}
    sheets["README"] = SheetData(
        name="README",
        headers=("F1 MANAGER SIM — MASTER DATABASE v0.4", "Value"),
        rows=(
            SheetRow(
                row_number=9,
                values={"F1 MANAGER SIM — MASTER DATABASE v0.4": "Data version", "Value": "0.4 — test"},
            ),
        ),
    )
    sheets["Drivers"] = make_sheet("Drivers", [{
        "driver_id": "DRV0001",
        "display_name": "Test Driver",
        "talent_pool_entry_year": "1978",
        "f1_debut_reference_year": "1980",
    }])
    sheets["Teams"] = make_sheet("Teams", [{"team_id": "TEAM0001", "team_name": "Test Team"}])
    sheets["Staff"] = make_sheet("Staff", [{"staff_id": "st_0001", "staff_name": "Test Staff"}])
    sheets["Circuits"] = make_sheet("Circuits", [{"circuit_id": "CIR0001", "track_name": "Test Circuit"}])
    sheets["Calendar"] = make_sheet("Calendar", [{
        "year": "1980", "round": "1", "circuit_id": "CIR0001", "race_date": "1980-01-13"
    }])
    sheets["Engines"] = make_sheet("Engines", [{"engine_id": "eg_0001", "engine_name": "Test Engine"}])
    sheets["Team_Facilities"] = make_sheet("Team_Facilities", [{
        "team_id": "TEAM0001", "year": "1980", "manufacturing_leve": "7"
    }])
    sheets["Finance_Ledger"] = make_sheet("Finance_Ledger", [{
        "entry_id": "fin_1", "team_id": "TEAM0001", "date": "29221", "amount": "500_000"
    }])
    return XlsxWorkbook(sheets)


class V04NormalizeTests(unittest.TestCase):
    def test_v04_schema_is_detected(self):
        workbook = minimal_v04_workbook()
        self.assertTrue(is_v04_workbook(workbook))

    def test_v04_normalizes_to_runtime_contract_without_rewriting_source_ids(self):
        workbook = minimal_v04_workbook()
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "master.xlsx"
            source.write_bytes(b"test-master")
            world, issues = normalize_workbook_v04(workbook, source)

        self.assertEqual(world["manifest"]["sourceDataVersion"], "0.4")
        self.assertEqual(world["manifest"]["sourceSchema"], "master-v0.4+")
        self.assertEqual(world["tracks"][0]["circuit_id"], "CIR0001")
        self.assertEqual(world["tracks"][0]["track_id"], "CIR0001")
        self.assertEqual(world["calendar"][0]["track_id"], "CIR0001")
        self.assertEqual(world["drivers"][0]["career_start_year"], 1978)
        self.assertEqual(world["facilities"][0]["manufacturing_level"], 7)
        self.assertEqual(world["financeLedger"][0]["date"], "1980-01-01")
        self.assertEqual(world["financeLedger"][0]["amount"], 500000)
        broken_calendar = [
            issue for issue in issues
            if issue["code"] == "BROKEN_FOREIGN_KEY" and issue.get("source_sheet") == "Calendar"
        ]
        self.assertEqual(broken_calendar, [])


if __name__ == "__main__":
    unittest.main()
