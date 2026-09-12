const fs=require('node:fs');
const assert=require('node:assert/strict');
const test=require('node:test');
const sql=fs.readFileSync('staging-database/sql/document-handoff-register.sql','utf8');
const ui=fs.readFileSync('src/v267/pages/original-documents.js','utf8');
test('document handoffs are append-only and scoped',()=>{
 assert.match(sql,/create table if not exists public\.aqari_document_handoffs/);
 assert.match(sql,/document_id uuid not null references public\.aqari_documents\(id\)/);
 assert.match(sql,/recorded_by uuid not null references auth\.users\(id\)/);
 assert.match(sql,/private\.aqari_can\(p_workspace_id,'documents','read'\)/);
 assert.match(sql,/private\.aqari_can\(p_workspace_id,'documents','write'\)/);
 assert.match(sql,/private\.aqari_document_entity\(p_workspace_id,d\.entity_type,d\.entity_ref,'read'\)/);
 assert.match(sql,/private\.aqari_document_entity\(p_workspace_id,d\.entity_type,d\.entity_ref,'write'\)/);
 assert.match(sql,/revoke all on table public\.aqari_document_handoffs from public,anon,authenticated/);
 assert.doesNotMatch(sql,/grant\s+(insert|update|delete)/i);
 assert.doesNotMatch(sql,/delete\s+from\s+public\.aqari_document_handoffs/i);
 assert.doesNotMatch(sql,/update\s+public\.aqari_document_handoffs/i);
});
test('handoff RPC snapshots the original document and rejects unsafe entries',()=>{
 assert.match(sql,/d\.status<>'uploaded'/);
 assert.match(sql,/dir not in \('received','delivered','returned'\)/);
 assert.match(sql,/at_time>now\(\)\+interval '5 minutes'/);
 assert.match(sql,/handoff\.document_id/);
});
test('original documents UI exposes verified handoff readback',()=>{
 assert.match(ui,/سجل تسليم واستلام الورق/);
 assert.match(ui,/aqari_document_handoff/);
 assert.match(ui,/p_action:'record'/);
 assert.match(ui,/p_action:'list'/);
 assert.match(ui,/saved\.document_id!==documentRow\.id/);
 assert.match(ui,/من سلّم/);
 assert.match(ui,/من استلم/);
 assert.match(ui,/التاريخ والوقت — الكويت/);
});
