const test=require('node:test');const assert=require('node:assert/strict');const {readFileSync}=require('node:fs');const {resolve}=require('node:path');
const ui=readFileSync(resolve(__dirname,'../src/v267/pages/official-document-center.js'),'utf8');
test('form center renders catalog templates and persists through RPC',()=>{assert.match(ui,/OFFICIAL_FORM_TEMPLATES/);assert.match(ui,/renderOfficialForm/);assert.match(ui,/aqari_official_document_register/);assert.match(ui,/await load\(proof\)/);});
test('issue and supersede send content hash and verify readback',()=>{assert.match(ui,/crypto\.subtle\.digest\('SHA-256'/);assert.match(ui,/write\('issue'/);assert.match(ui,/write\('supersede'/);assert.match(ui,/content_sha256/);});
test('PDF is requested with JWT and same-origin credentials',()=>{assert.match(ui,/fetch\('\/api\/official-document'/);assert.match(ui,/Authorization:'Bearer '\+token/);assert.match(ui,/credentials:'same-origin'/);assert.match(ui,/blob\.type!=='application\/pdf'/);});
test('no provider secrets or production domain appear in browser code',()=>{assert.doesNotMatch(ui,/service_role|SUPABASE_SERVICE|myaqari\.com|KNET_SECRET/i);});
