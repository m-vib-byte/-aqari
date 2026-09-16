import unittest
from lib.property_statement_pdf import owner_approved_discount

class PropertyStatementDiscountTests(unittest.TestCase):
    def test_discount_is_derived_from_saved_contract_and_current_rent_only(self):
        self.assertEqual(owner_approved_discount({'contract_rent_kd':250,'current_rent_kd':195}),55)
        self.assertEqual(owner_approved_discount({'contract_rent_kd':'250.125','current_rent_kd':'145'}),105.125)
        self.assertEqual(owner_approved_discount({'contract_rent_kd':195,'current_rent_kd':195}),0)
        self.assertEqual(owner_approved_discount({'contract_rent_kd':195,'current_rent_kd':260}),0)
        self.assertIsNone(owner_approved_discount({'contract_rent_kd':'','current_rent_kd':195}))
        self.assertIsNone(owner_approved_discount({'contract_rent_kd':'bad','current_rent_kd':195}))
        self.assertIsNone(owner_approved_discount({'contract_rent_kd':-1,'current_rent_kd':0}))

if __name__=='__main__':
    unittest.main()
