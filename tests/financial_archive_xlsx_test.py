"""Execute the production browser encoder; independently parse its ZIP and XML.

Synthetic inputs only. This is not an Excel application or hosted acceptance test.
"""
import copy
import datetime
import io
import json
from pathlib import Path
import subprocess
import unittest
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
RUNNER = """
import {readFileSync} from 'node:fs';
import {createArchiveXlsx} from './src/v267/reports/financial-archive-xlsx.js';
try { process.stdout.write(createArchiveXlsx(JSON.parse(readFileSync(0,'utf8')))); }
catch (error) { process.stderr.write(error.message); process.exitCode=2; }
"""


def fixture():
    return dict(month="2026-09", workspace="workspace-a", retrievedAt="2026-09-12T10:00:00Z",
                columns=["التاريخ", "نوع الحركة", "العقار", "الاتجاه", "المبلغ بالدينار", "الحالة", "المرجع", "البيان"],
                rows=[["2026-09-01", "تحصيل إيجار", "برج الاختبار", "استلام", "100.125", "ملغى", "000124", "سبب موثق"],
                      ["2026-09-02", "رصيد افتتاحي", "برج الاختبار", "دائن", "20.000", "مسجل", "=SUM(E2)", "رصيد قديم"]],
                totalRows=7, filters={"search": "برج الاختبار", "status": "", "stream": ""},
                period={"closed_at": "2026-10-01T00:00:00Z", "month": "2026-09-01"})


def encode(data):
    return subprocess.run(["node", "--input-type=module", "-e", RUNNER], cwd=ROOT,
                          input=json.dumps(data, ensure_ascii=False).encode(), capture_output=True, timeout=20)


class WorkbookTests(unittest.TestCase):
    def workbook(self, data=None):
        result = encode(data or fixture())
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        archive = zipfile.ZipFile(io.BytesIO(result.stdout))
        self.assertIsNone(archive.testzip())  # Independent CRC and size validation.
        for name in archive.namelist():
            ET.fromstring(archive.read(name))
        return archive

    def reject(self, data):
        result = encode(data)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stdout, b"")
        self.assertTrue(result.stderr)

    def test_package_relationships_and_no_active_content(self):
        with self.workbook() as archive:
            self.assertEqual(len(archive.namelist()), 7)
            for path in archive.namelist():
                self.assertNotIn("..", path)
                root = ET.fromstring(archive.read(path))
                for el in root.iter():
                    self.assertNotEqual(el.tag.rsplit("}", 1)[-1], "f")
                    self.assertNotEqual(el.get("TargetMode"), "External")
            workbook = ET.fromstring(archive.read("xl/workbook.xml"))
            self.assertEqual([el.get("name") for el in workbook.findall("s:sheets/s:sheet", NS)], ["الحركات", "بيانات التقرير"])
            relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
            for rel in relationships:
                self.assertIn("xl/" + rel.get("Target"), archive.namelist())

    def test_numeric_money_sortable_dates_rtl_freeze_filters_and_text_identifiers(self):
        with self.workbook() as archive:
            sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
            cells = {c.get("r"): c for c in sheet.findall("s:sheetData/s:row/s:c", NS)}
            self.assertEqual(cells["E2"].find("s:v", NS).text, "100.125")
            self.assertIsNone(cells["E2"].get("t"))
            serial = (datetime.date(2026, 9, 1) - datetime.date(1899, 12, 30)).days
            self.assertEqual(int(cells["A2"].find("s:v", NS).text), serial)
            self.assertEqual(cells["G2"].find("s:is/s:t", NS).text, "000124")
            self.assertEqual(cells["G3"].get("t"), "inlineStr")
            self.assertEqual(cells["G3"].find("s:is/s:t", NS).text, "=SUM(E2)")
            self.assertEqual(sheet.find("s:sheetViews/s:sheetView", NS).get("rightToLeft"), "1")
            self.assertEqual(sheet.find("s:sheetViews/s:sheetView/s:pane", NS).get("state"), "frozen")
            self.assertEqual(sheet.find("s:autoFilter", NS).get("ref"), "A1:H3")
            styles = ET.fromstring(archive.read("xl/styles.xml"))
            self.assertIn("#,##0.000", [el.get("formatCode") for el in styles.findall("s:numFmts/s:numFmt", NS)])

    def test_metadata_retains_scope_filters_loaded_count_and_closed_period(self):
        with self.workbook() as archive:
            sheet = ET.fromstring(archive.read("xl/worksheets/sheet2.xml"))
            values = [[c.find("s:is/s:t", NS).text for c in row] for row in sheet.findall("s:sheetData/s:row", NS)]
            metadata = dict(values)
            self.assertEqual(metadata["الحركات المصدرة"], "2")
            self.assertEqual(metadata["حركات الشهر المعادة قبل التصفية"], "7")
            self.assertEqual(metadata["مساحة العمل"], "workspace-a")
            self.assertEqual(metadata["حالة الفترة"], "مقفلة")
            self.assertEqual(metadata["البحث"], "برج الاختبار")
            self.assertIn("لا يمثل صافي ربح", metadata["نطاق التقرير"])

    def test_arabic_xml_special_characters_emoji_and_literals_are_preserved(self):
        data = fixture()
        value = 'نص & < > " 🔑\r\n_x0041_ =CMD()'
        data["rows"][0][7] = value
        with self.workbook(data) as archive:
            sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
            stored = sheet.find('.//s:c[@r="H2"]/s:is/s:t', NS).text
            self.assertEqual(stored, value.replace("_x0041_", "_x005F_x0041_"))

    def test_empty_filtered_report_keeps_headers_and_zero_result_count(self):
        data = fixture()
        data["rows"] = []
        with self.workbook(data) as archive:
            sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
            self.assertEqual(len(sheet.findall("s:sheetData/s:row", NS)), 1)
            self.assertEqual(sheet.find("s:autoFilter", NS).get("ref"), "A1:H1")

    def test_date_epoch_handles_real_1900_boundary_without_accepting_fake_leap_day(self):
        for day, expected in [("1900-01-01", 1), ("1900-02-28", 59), ("1900-03-01", 61)]:
            data = fixture()
            data["month"] = day[:7]
            data["rows"] = [[day, "مصروف", "عقار", "صرف", "0", "معتمد", "1", ""]]
            with self.workbook(data) as archive:
                sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
                self.assertEqual(int(sheet.find('.//s:c[@r="A2"]/s:v', NS).text), expected)

    def test_rejects_missing_negative_excess_precision_and_excel_overflow_money(self):
        for value in [None, "", "1.0001", "-1", "NaN", {}, True, "1000000000000.000"]:
            with self.subTest(value=value):
                data = fixture()
                data["rows"][0][4] = value
                self.reject(data)

    def test_rejects_wrong_month_impossible_date_and_pre_excel_dates(self):
        for value in ["2026-08-01", "2026-09-31", "2026-09-1", "1900-02-29", "1899-12-31"]:
            data = fixture()
            data["rows"][0][0] = value
            self.reject(data)

    def test_rejects_invalid_cells_without_silent_truncation_or_xml_repair(self):
        for value in ["a" * 32768, "a\0b", "a\ud800b", {"bad": "shape"}]:
            data = fixture()
            data["rows"][0][7] = value
            # ASCII JSON safely transports deliberately invalid surrogate input.
            result = subprocess.run(["node", "--input-type=module", "-e", RUNNER], cwd=ROOT,
                                    input=json.dumps(data).encode(), capture_output=True, timeout=20)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(result.stdout, b"")

    def test_row_and_size_limits_refuse_instead_of_truncating(self):
        data = fixture()
        data["rows"] = [copy.deepcopy(data["rows"][0]) for _ in range(10001)]
        data["totalRows"] = len(data["rows"])
        self.reject(data)
        data["rows"] = data["rows"][:600]
        for row in data["rows"]:
            row[7] = "م" * 32000
        self.reject(data)

    def test_identity_shape_and_total_count_must_be_valid(self):
        for field, value in [("month", "0000-01"), ("workspace", ""), ("retrievedAt", "invalid"), ("columns", []), ("totalRows", 1), ("rows", [[1, 2]])]:
            data = fixture()
            data[field] = value
            self.reject(data)


if __name__ == "__main__":
    unittest.main()
