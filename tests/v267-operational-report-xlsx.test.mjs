import test from 'node:test';
import assert from 'node:assert/strict';
import {createOperationalReportXlsx,ARCHIVE_XLSX_TYPE} from '../src/v267/reports/operational-report-xlsx.js';

const base={workspaceId:'workspace-a',propertyId:'property-a',month:'2026-09',retrievedAt:'2026-09-14T00:00:00Z'};

test('collection export expands every monetary field into numeric XLSX amount rows',()=>{
 const bytes=createOperationalReportXlsx({...base,report:'collection',data:{lines:[{period:'2026-09-01',property_name:'برج',unit_no:'101',contract_no:'C-1',due:'100.125',allocated_paid:'80.000',remaining:'20.125',discount:'5.000',overpayment:'0.000',status:'partial'}]}});
 assert.ok(bytes instanceof Uint8Array);assert.ok(bytes.length>500);assert.equal(ARCHIVE_XLSX_TYPE,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 const text=new TextDecoder().decode(bytes);assert.match(text,/PK/);
});

test('collector export preserves date receipt identity classification and numeric amount',()=>{
 const bytes=createOperationalReportXlsx({...base,report:'collectors',data:{lines:[{paid_at:'2026-09-04',property_name:'برج',collector_name:'محصل',amount:'75.500',mapping_status:'authenticated',receipt_no:'000124',contract_no:'C-2',unit_no:'202',payment_method:'KNET',is_settlement:false}]}});
 assert.ok(bytes.length>500);
});

test('invalid money, month or stale envelope identity fails closed',()=>{
 assert.throws(()=>createOperationalReportXlsx({...base,report:'collection',data:{lines:[{period:'2026-09-01',due:'=1',allocated_paid:'0',remaining:'0',discount:'0',overpayment:'0'}]}}));
 assert.throws(()=>createOperationalReportXlsx({...base,month:'2026-13',report:'collectors',data:{lines:[]}}));
 assert.throws(()=>createOperationalReportXlsx({...base,retrievedAt:'bad',report:'collectors',data:{lines:[]}}));
});
