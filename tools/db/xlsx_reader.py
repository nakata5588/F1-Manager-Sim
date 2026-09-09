"""Minimal, dependency-free XLSX reader for F1 Manager Sim data tooling.

The game never writes the master workbook. This module only reads cell values and
basic workbook structure from Office Open XML so the importer can be run in CI or
on a clean checkout without requiring Excel.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
_OFFICE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
_PACKAGE_REL = "http://schemas.openxmlformats.org/package/2006/relationships"


def _q(namespace: str, tag: str) -> str:
    return f"{{{namespace}}}{tag}"


def _column_index(cell_ref: str) -> int:
    match = re.match(r"([A-Z]+)", cell_ref)
    if not match:
        raise ValueError(f"Invalid XLSX cell reference: {cell_ref!r}")
    result = 0
    for char in match.group(1):
        result = result * 26 + (ord(char) - 64)
    return result - 1


@dataclass(frozen=True)
class SheetRow:
    row_number: int
    values: dict[str, object]


@dataclass(frozen=True)
class SheetData:
    name: str
    headers: tuple[str | None, ...]
    rows: tuple[SheetRow, ...]


class XlsxWorkbook:
    def __init__(self, sheets: dict[str, SheetData]):
        self.sheets = sheets

    def sheet(self, name: str) -> SheetData:
        try:
            return self.sheets[name]
        except KeyError as exc:
            raise KeyError(f"Workbook does not contain sheet {name!r}") from exc


def read_xlsx(path: str | Path) -> XlsxWorkbook:
    path = Path(path)
    with zipfile.ZipFile(path) as archive:
        workbook_root = ET.fromstring(archive.read("xl/workbook.xml"))
        rel_root = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        relationships = {
            relation.attrib["Id"]: relation.attrib["Target"]
            for relation in rel_root.findall(_q(_PACKAGE_REL, "Relationship"))
        }

        shared_strings = _read_shared_strings(archive)
        sheets: dict[str, SheetData] = {}
        sheet_nodes = workbook_root.find(_q(_MAIN, "sheets"))
        if sheet_nodes is None:
            return XlsxWorkbook(sheets)

        for sheet_node in sheet_nodes:
            name = sheet_node.attrib["name"]
            rel_id = sheet_node.attrib[_q(_OFFICE_REL, "id")]
            target = relationships[rel_id]
            xml_path = target.lstrip("/") if target.startswith("/") else f"xl/{target.lstrip('/')}"
            sheets[name] = _read_sheet(archive, xml_path, name, shared_strings)

        return XlsxWorkbook(sheets)


def _read_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    values: list[str] = []
    for string_item in root.findall(_q(_MAIN, "si")):
        values.append("".join((node.text or "") for node in string_item.iter(_q(_MAIN, "t"))))
    return values


def _read_sheet(
    archive: zipfile.ZipFile,
    xml_path: str,
    name: str,
    shared_strings: list[str],
) -> SheetData:
    root = ET.fromstring(archive.read(xml_path))
    sheet_data = root.find(_q(_MAIN, "sheetData"))
    if sheet_data is None:
        return SheetData(name=name, headers=tuple(), rows=tuple())

    parsed_rows: list[tuple[int, dict[int, object]]] = []
    for default_index, row_node in enumerate(sheet_data, start=1):
        row_number = int(row_node.attrib.get("r", default_index))
        cells: dict[int, object] = {}
        for cell in row_node.findall(_q(_MAIN, "c")):
            ref = cell.attrib.get("r")
            if not ref:
                continue
            cells[_column_index(ref)] = _cell_value(cell, shared_strings)
        parsed_rows.append((row_number, cells))

    if not parsed_rows:
        return SheetData(name=name, headers=tuple(), rows=tuple())

    _, header_cells = parsed_rows[0]
    max_header_index = max(header_cells, default=-1)
    headers: list[str | None] = []
    for index in range(max_header_index + 1):
        value = header_cells.get(index)
        if value is None or str(value).strip() in {"", "-"}:
            headers.append(None)
        else:
            headers.append(str(value).strip())

    rows: list[SheetRow] = []
    for row_number, cells in parsed_rows[1:]:
        values: dict[str, object] = {}
        for index, header in enumerate(headers):
            if header is None:
                continue
            value = cells.get(index)
            if value is not None:
                values[header] = value
        if any(value not in (None, "") for value in values.values()):
            rows.append(SheetRow(row_number=row_number, values=values))

    return SheetData(name=name, headers=tuple(headers), rows=tuple(rows))


def _cell_value(cell: ET.Element, shared_strings: list[str]) -> object:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        inline = cell.find(_q(_MAIN, "is"))
        if inline is None:
            return ""
        return "".join((node.text or "") for node in inline.iter(_q(_MAIN, "t")))

    value_node = cell.find(_q(_MAIN, "v"))
    if value_node is None:
        return None
    raw = value_node.text or ""

    if cell_type == "s":
        return shared_strings[int(raw)]
    if cell_type == "b":
        return raw == "1"
    if cell_type in {"str", "e"}:
        return raw

    try:
        if any(marker in raw.lower() for marker in (".", "e")):
            return float(raw)
        return int(raw)
    except ValueError:
        return raw
