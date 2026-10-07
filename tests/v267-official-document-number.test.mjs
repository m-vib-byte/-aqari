import test from 'node:test';
import assert from 'node:assert/strict';
import {validOfficialDocumentNumber as valid} from '../src/v267/components/official-document-number.js';
test('saved legacy reservations remain usable without renumbering',()=>{
 assert.equal(valid('AQ-20261006-00000123','rent_receipt'),true);
});
test('new numbers bind the exact document kind and retain large serials',()=>{
 assert.equal(valid('AQ-RENT_RECEIPT-20261006-00000001','rent_receipt'),true);
 assert.equal(valid('AQ-RENT_RECEIPT-20261006-100000000','rent_receipt'),true);
 assert.equal(valid('AQ-RENT_RECEIPT-20261006-00000001','payment_voucher'),false);
});
test('malformed or zero typed serials cannot confirm a reservation',()=>{
 for(const value of [null,{},'AQ-RENT_RECEIPT-20261006-00000000','AQ-RENT_RECEIPT-20261006-1','AQ-RENT_RECEIPT-20261006-00000001<script>'])assert.equal(valid(value,'rent_receipt'),false);
 assert.equal(valid('AQ-RENT_RECEIPT-20261006-00000001','.*'),false);
});
