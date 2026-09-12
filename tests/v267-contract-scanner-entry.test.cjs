const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');
const workspace=fs.readFileSync('src/v267/workspace.js','utf8');
const scanner=fs.readFileSync('src/v267/pages/document-scanner.js','utf8');

test('dedicated lease-contract entry opens the verified scanner pre-scoped to lease contracts',()=>{
 assert.match(workspace,/مسح عقد الإيجار/);
 assert.match(workspace,/openDocumentScanner\(\{type:'lease',category:'lease_contract'\}\)/);
 assert.match(workspace,/entry\(contractScan,'documents',false,'مسح عقد تصوير عقد رفع عقد'\)/);
});

test('scanner accepts the pre-scope without bypassing record selection or signed-contract review',()=>{
 assert.match(scanner,/type\.value=\['property','tenant','lease'\]\.includes\(initial\.type\)\?initial\.type:'property'/);
 assert.match(scanner,/initial\.category&&\[\.\.\.category\.options\]\.some\(o=>o\.value===initial\.category\)/);
 assert.match(scanner,/reviewField\.hidden=!\(type\.value==='lease'&&category\.value==='lease_contract'\)/);
 assert.match(scanner,/aqari_document_entities/);
 assert.match(scanner,/createVerifiedUpload/);
});
