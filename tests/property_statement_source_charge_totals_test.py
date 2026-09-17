import unittest
from pathlib import Path

from lib.property_statement_values import statement_source_totals


class PropertyStatementSourceChargeTotalsTests(unittest.TestCase):
    def test_saved_advance_and_cleaning_totals_are_derived_only_from_complete_source_rows(self):
        rows=[
            dict(current_rent_kd='195',paid_amount_kd='195',insurance_kd='50',advance_kd='15',cleaning_kd='2',payment_method_raw='K-Net'),
            dict(current_rent_kd='145',paid_amount_kd='100',insurance_kd='75',advance_kd='5',cleaning_kd='5',payment_method_raw='نقدي'),
        ]
        totals=statement_source_totals(rows)
        self.assertEqual(totals['advance_kd'],20.0)
        self.assertEqual(totals['cleaning_kd'],7.0)
        self.assertIsNone(statement_source_totals([dict(rows[0],advance_kd=''),rows[1]])['advance_kd'])
        self.assertIsNone(statement_source_totals([rows[0],dict(rows[1],cleaning_kd='bad')])['cleaning_kd'])

    def test_pdf_source_wires_fail_closed_saved_charge_totals(self):
        source=(Path(__file__).parents[1]/'lib'/'property_statement_pdf.py').read_text(encoding='utf-8')
        self.assertIn("total_text('advance_kd')",source)
        self.assertIn("total_text('cleaning_kd')",source)
        self.assertIn('لا يُنشر مجموع العربون أو رسوم النظافة إذا كان أي صف يفتقد القيمة المحفوظة',source)


if __name__=='__main__':
    unittest.main()
