const fs=require('node:fs');
const assert=require('node:assert/strict');
const test=require('node:test');
const sql=fs.readFileSync('staging-database/sql/document-handoff-register.sql','utf8');
const ui=fs.readFileSync('src/v267/pages/original-documents.js','utf8');
test('handoffs are append-only and scoped',()=>{
 assert.match(sql,/aqari_document_handoffs/);
 assert.match(sql,/aqari_can\(p_workspace_id,'documents','read'\)/);
 assert.match(sql,/aqari_can\(p_workspace_id,'documents','write'\)/);
 assert.match(sql,/revoke all on table public\.aqari_document_handoffs from public,anon,authenticated/);
 assert.doesNotMatch(sql,/grant\s+(insert|update|delete)/i);
 assert.doesNotMatch(sql,/delete\s+from\s+public\.aqari_document_handoffs/i);
 assert.doesNotMatch(sql,/update\s+public\.aqari_document_handoffs/i);
});
test('handoff list/readback avoids PLpgSQL record and table-alias collisions',()=>{
 assert.match(sql,/saved_handoff\s+public\.aqari_document_handoffs%rowtype/);
 assert.match(sql,/from public\.aqari_document_handoffs hh/);
 assert.doesNotMatch(sql,/declare[^$;]*\bh\s+public\.aqari_document_handoffs%rowtype/i);
});
test('UI exposes handoff readback',()=>{
 assert.match(ui,/سجل تسليم واستلام الورق/);
 assert.match(ui,/aqari_document_handoff/);
 assert.match(ui,/p_action:'record'/);
 assert.match(ui,/p_action:'list'/);
 assert.match(ui,/من سلّم/);
 assert.match(ui,/من استلم/);
});
