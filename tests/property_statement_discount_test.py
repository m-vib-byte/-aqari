import unittest
from pathlib import Path
from lib.property_statement_values import owner_approved_discount,source_remaining

class PropertyStatementDiscountTests(unittest.TestCase):
    def test_discount_is_derived_from_saved_contract_and_current_rent_only(self):
        self.assertEqual(owner_approved_discount({'contract_rent_kd':250,'current_rent_kd':195}),55)
        self.assertEqual(owner_approved_discount({'contract_rent_kd':'250.125','current_rent_kd':'145'}),105.125)
        self.assertEqual(owner_approved_discount({'contract_rent_kd':195,'current_rent_kd':195}),0)
        self.assertEqual(owner_approved_discount({'contract_rent_kd':195,'current_rent_kd':260}),0)
        self.assertIsNone(owner_approved_discount({'contract_rent_kd':'','current_rent_kd':195}))
        self.assertIsNone(owner_approved_discount({'contract_rent_kd':'bad','current_rent_kd':195}))
        self.assertIsNone(owner_approved_discount({'contract_rent_kd':-1,'current_rent_kd':0}))

    def test_source_remaining_is_derived_from_current_rent_and_saved_paid_only(self):
        self.assertEqual(source_remaining({'current_rent_kd':195,'paid_amount_kd':195}),0)
        self.assertEqual(source_remaining({'current_rent_kd':'195.125','paid_amount_kd':'145'}),50.125)
        self.assertEqual(source_remaining({'current_rent_kd':145,'paid_amount_kd':195}),0)
        self.assertIsNone(source_remaining({'current_rent_kd':'','paid_amount_kd':100}))
        self.assertIsNone(source_remaining({'current_rent_kd':195,'paid_amount_kd':'bad'}))

    def test_statement_pdf_keeps_saved_paid_remaining_and_nationality_source_fields_explicit(self):
        source=Path('lib/property_statement_pdf.py').read_text(encoding='utf-8')
        self.assertIn("('المدفوع بالمصدر','paid_amount_kd')",source)
        self.assertIn("('المتبقي بالمصدر','__source_remaining')",source)
        self.assertIn("('الجنسية بالمصدر','nationality_raw')",source)
        self.assertIn('المتبقي مشتق من الإيجار الحالي ناقص المدفوع بالمصدر ولا يحسب فرق الخصم كمتأخرات',source)
        self.assertIn('هذه القيم لا تستبدل التحصيل الفعلي المحمي',source)
        self.assertNotIn("paid_amount_kd') if",source)

if __name__=='__main__':
    unittest.main()
