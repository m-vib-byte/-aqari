import unittest
from pathlib import Path
from lib.property_statement_values import owner_approved_discount

class PropertyStatementDiscountTests(unittest.TestCase):
    def test_discount_is_derived_from_saved_contract_and_current_rent_only(self):
        self.assertEqual(owner_approved_discount({'contract_rent_kd':250,'current_rent_kd':195}),55)
        self.assertEqual(owner_approved_discount({'contract_rent_kd':'250.125','current_rent_kd':'145'}),105.125)
        self.assertEqual(owner_approved_discount({'contract_rent_kd':195,'current_rent_kd':195}),0)
        self.assertEqual(owner_approved_discount({'contract_rent_kd':195,'current_rent_kd':260}),0)
        self.assertIsNone(owner_approved_discount({'contract_rent_kd':'','current_rent_kd':195}))
        self.assertIsNone(owner_approved_discount({'contract_rent_kd':'bad','current_rent_kd':195}))
        self.assertIsNone(owner_approved_discount({'contract_rent_kd':-1,'current_rent_kd':0}))

    def test_statement_pdf_keeps_saved_paid_and_nationality_source_fields_explicit(self):
        source=Path('lib/property_statement_pdf.py').read_text(encoding='utf-8')
        self.assertIn("('المدفوع بالمصدر','paid_amount_kd')",source)
        self.assertIn("('الجنسية بالمصدر','nationality_raw')",source)
        self.assertIn('المدفوع بالمصدر قراءة من الكشف المحفوظ ولا يستبدل التحصيل الفعلي المحمي',source)
        self.assertNotIn("paid_amount_kd') if",source)

if __name__=='__main__':
    unittest.main()
