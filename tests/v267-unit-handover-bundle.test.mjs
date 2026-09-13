import test from 'node:test';
import assert from 'node:assert/strict';
import {buildUnitHandoverBundle} from '../src/v267/components/unit-handover-bundle.js';

const hash=n=>String(n).repeat(64).slice(0,64);
function fixture(){
  const inspection={id:'inspection-1',lease_id:'lease-1',unit_id:'unit-1',kind:'move_out',status:'signed',inspected_at:'2026-09-13T08:00:00Z',signed_at:'2026-09-13T08:05:00Z',revision:2,checklist:[{item:'الأبواب',result:'سليم'},{item:'المياه',result:'ملاحظة',note:'تسريب بسيط'}],photo_document_ids:['photo-1','photo-2'],tenant_signature_document_id:'tenant-signature',inspector_signature_document_id:'inspector-signature'};
  const lease={id:'lease-1',unit_id:'unit-1',tenant_name:'مستأجر تجريبي',contract_no:'C-100',property_name:'برج تجريبي',unit_no:'401'};
  const documents=[
    {id:'photo-1',status:'uploaded',checksum_sha256:hash(1),size_bytes:101,mime_type:'image/jpeg'},
    {id:'photo-2',status:'uploaded',checksum_sha256:hash(2),size_bytes:102,mime_type:'image/jpeg'},
    {id:'tenant-signature',status:'uploaded',checksum_sha256:hash(3),size_bytes:103,mime_type:'image/png'},
    {id:'inspector-signature',status:'uploaded',checksum_sha256:hash(4),size_bytes:104,mime_type:'application/pdf'}
  ];
  return {inspection,lease,documents};
}

test('builds one immutable bundle from a signed move-out inspection and verified bytes',()=>{
  const input=fixture();const value=buildUnitHandoverBundle(input);
  assert.equal(value.kind,'unit_handover');assert.equal(value.source.inspection_revision,2);assert.equal(value.checklist.length,2);assert.equal(value.attachments.length,4);assert.match(value.summary,/2 صورة/);assert.ok(Object.isFrozen(value));assert.ok(Object.isFrozen(value.attachments[0]));
});

test('refuses drafts, wrong inspection type, missing photos or missing signatures',()=>{
  for(const mutate of [
    x=>x.inspection.status='draft',x=>x.inspection.kind='periodic',x=>x.inspection.photo_document_ids=[],x=>x.inspection.tenant_signature_document_id=''
  ]){const input=fixture();mutate(input);assert.throws(()=>buildUnitHandoverBundle(input),/UNIT_HANDOVER_/);}
});

test('refuses mismatched lease or unit source',()=>{
  let input=fixture();input.lease.id='other';assert.throws(()=>buildUnitHandoverBundle(input),/LEASE_MISMATCH/);
  input=fixture();input.lease.unit_id='other';assert.throws(()=>buildUnitHandoverBundle(input),/UNIT_MISMATCH/);
});

test('refuses missing or unverifiable attachment bytes',()=>{
  let input=fixture();input.documents[0].checksum_sha256='bad';assert.throws(()=>buildUnitHandoverBundle(input),/PHOTO_1_DOCUMENT_UNVERIFIED/);
  input=fixture();input.documents[2].size_bytes=0;assert.throws(()=>buildUnitHandoverBundle(input),/TENANT_SIGNATURE_DOCUMENT_UNVERIFIED/);
  input=fixture();input.documents=input.documents.filter(x=>x.id!=='inspector-signature');assert.throws(()=>buildUnitHandoverBundle(input),/INSPECTOR_SIGNATURE_DOCUMENT_UNVERIFIED/);
});

test('refuses one stored file being reused for conflicting handover roles',()=>{
  const input=fixture();input.inspection.inspector_signature_document_id='photo-1';assert.throws(()=>buildUnitHandoverBundle(input),/DOCUMENT_ROLE_CONFLICT/);
});

test('normalizes checklist text but requires every saved row to be explicit',()=>{
  const input=fixture();input.inspection.checklist=[{item:'  باب  ',result:'  سليم  ',note:'  موثق  '}];const value=buildUnitHandoverBundle(input);assert.deepEqual(value.checklist,[{item:'باب',result:'سليم',note:'موثق'}]);
  input.inspection.checklist=[{item:'باب',result:''}];assert.throws(()=>buildUnitHandoverBundle(input),/CHECKLIST_RESULT_1_REQUIRED/);
});
