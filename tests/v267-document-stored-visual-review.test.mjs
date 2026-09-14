import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const scanner=readFileSync(new URL('../src/v267/pages/document-scanner.js',import.meta.url),'utf8');
const review=readFileSync(new URL('../src/v267/components/stored-visual-review.js',import.meta.url),'utf8');

function position(source,text){const value=source.indexOf(text);assert.notEqual(value,-1,`missing source contract: ${text}`);return value;}

test('document finalize is blocked behind stored-byte visual review',()=>{
 const upload=position(scanner,'await pending.upload();');
 const human=position(scanner,'await visualReview.review({doc,target,expectedHash:hash,expectedSize:sentBlob.size})');
 const finalize=position(scanner,"session.client.rpc('aqari_finalize_document'");
 assert.ok(upload<human&&human<finalize,'upload -> human review -> finalize ordering must remain fail-closed');
});

test('review reads the actual private Storage object and verifies exact bytes',()=>{
 assert.match(review,/session\.storage\('GET',doc\.storage_path\)/);
 assert.match(review,/downloaded\.size!==expectedSize/);
 assert.match(review,/storedHash!==expectedHash/);
 assert.match(review,/const first=await fetchVerified\(doc,expectedHash,expectedSize,target\.mime\)/);
});

test('stored bytes are fetched and hashed again immediately before approval resolves',()=>{
 assert.match(review,/const second=await fetchVerified\(doc,expectedHash,expectedSize,target\.mime\)/);
 const second=position(review,'const second=await fetchVerified');
 const resolve=position(review,'resolve({hash:second.storedHash,size:second.downloaded.size})');
 assert.ok(second<resolve);
});

test('human quality confirmation is explicit and never auto-checked',()=>{
 assert.match(review,/confirmed\.type='checkbox'/);
 assert.match(review,/confirmed\.checked=false/);
 assert.match(review,/if\(!confirmed\.checked\)/);
 assert.match(review,/جميع صفحاتها.*عدم فقدان الجودة/);
});

test('DOCX requires opening or downloading the stored copy before close',()=>{
 assert.match(review,/link\.onclick=\(\)=>\{docxOpened=true/);
 assert.match(review,/target\.mime===DOCX_MIME&&!docxOpened/);
 assert.match(review,/افتح أو نزّل نسخة DOCX المسترجعة من Storage/);
});

test('source controls are locked while uploaded bytes are under review',()=>{
 assert.match(review,/priorDisabled\.set\(control,control\.disabled\);control\.disabled=true/);
 assert.match(scanner,/controls:\[type,category,query,search,records,title,file,camera,rotate,\.\.\.cropBox\.querySelectorAll\('input'\),addPage,reviewed,save\]/);
});

test('aborting review rejects before finalize instead of silently accepting quality',()=>{
 assert.match(review,/إغلاق المراجعة دون اعتماد/);
 assert.match(review,/بقي المستند غير مقفل/);
 const reviewCall=position(scanner,'await visualReview.review');
 const finalize=position(scanner,"session.client.rpc('aqari_finalize_document'");
 assert.ok(reviewCall<finalize);
});
