import unittest
from io import BytesIO
from pathlib import Path
from pypdf import PdfReader

from lib.property_statement_pdf import render_statement


class PropertyStatementSourceChargeTotalsTests(unittest.TestCase):
    def test_pdf_emits_saved_advance_and_cleaning_totals_from_rows(self):
        content=dict(
            property_name='Saved charge totals',
            period='2026-08',
            rows=[
                dict(unit='401',contract_rent_kd=250,current_rent_kd=195,paid_amount_kd=195,insurance_kd=50,advance_kd=15,cleaning_kd=2,payment_method_raw='K-Net',pending=None),
                dict(unit='402',contract_rent_kd=250,current_rent_kd=145,paid_amount_kd=100,insurance_kd=75,advance_kd=5,cleaning_kd=5,payment_method_raw='نقدي',pending=None),
            ],
            summary=dict(printed_totals=dict(rent_kd=340,advance_kd=0,cleaning_kd=5)),
        )
        text=' '.join(page.extract_text() for page in PdfReader(BytesIO(render_statement(content))).pages)
        self.assertIn('20.0',text)
        self.assertIn('7.0',text)

    def test_pdf_charge_totals_use_fail_closed_source_contract(self):
        source=(Path(__file__).parents[1]/'lib'/'property_statement_pdf.py').read_text(encoding='utf-8')
        self.assertIn("total_text('advance_kd')",source)
        self.assertIn("total_text('cleaning_kd')",source)
        self.assertIn('لا يُنشر مجموع العربون أو رسوم النظافة إذا كان أي صف يفتقد القيمة المحفوظة',source)


if __name__=='__main__':
    unittest.main()
