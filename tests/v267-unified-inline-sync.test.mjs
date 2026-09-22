import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {synchronizeUnifiedStyleHtml,synchronizeUnifiedStyles} from '../scripts/sync-unified-styles.mjs';

const marker='<style data-aqari-unified-source="/v267-unified.css">';
const before='<!doctype html>\n<head><style id="existing">.other { color: red }</style>\n';
const after='</style>\n<script>const existingDraft = "preserve unchanged";</script></head>\n<body dir="rtl">العقد القائم</body>';
const css='/* reviewed canonical styles */\n.aq-contract { margin: 0; }\n';

test('build synchronization repairs stale inline CSS and preserves all surrounding bytes',()=>{
 const original=before+marker+'\n.stale { display: none }\n'+after;
 const expected=before+marker+'\n'+css+'\n'+after;
 assert.equal(synchronizeUnifiedStyleHtml(original,css),expected);
 assert.equal(synchronizeUnifiedStyleHtml(expected,css),expected,'repeated synchronization is identical');
});

test('file synchronization writes once and is idempotent on the existing block',()=>{
 const directory=mkdtempSync(join(tmpdir(),'aqari-inline-styles-'));
 try{
  const htmlPath=join(directory,'index.html'),cssPath=join(directory,'v267-unified.css');
  writeFileSync(htmlPath,before+marker+'\n.stale {}\n'+after);writeFileSync(cssPath,css);
  assert.equal(synchronizeUnifiedStyles({htmlPath,cssPath}),true);
  const first=readFileSync(htmlPath,'utf8');
  assert.equal(synchronizeUnifiedStyles({htmlPath,cssPath}),false);
  assert.equal(readFileSync(htmlPath,'utf8'),first);
  assert.equal(readFileSync(cssPath,'utf8'),css,'the canonical stylesheet itself is never rewritten');
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('missing, duplicate or unclosed targets and unsafe or empty styles fail before writing',()=>{
 assert.throws(()=>synchronizeUnifiedStyleHtml(before+after,css),/UNIFIED_STYLE_BLOCK_NOT_UNIQUE/);
 assert.throws(()=>synchronizeUnifiedStyleHtml(marker+'</style>'+marker+'</style>',css),/UNIFIED_STYLE_BLOCK_NOT_UNIQUE/);
 assert.throws(()=>synchronizeUnifiedStyleHtml(before+marker,css),/UNIFIED_STYLE_BLOCK_UNCLOSED/);
 for(const invalid of ['','   ','body{}\n</style><script>alert(1)</script>']){
  assert.throws(()=>synchronizeUnifiedStyleHtml(before+marker+after,invalid),/INVALID_UNIFIED_STYLE_SOURCE/);
 }
});

test('the Vercel build synchronizes canonical styles before installing interface enhancements',()=>{
 const build=readFileSync(new URL('../scripts/build-vercel.mjs',import.meta.url),'utf8');
 const sync=build.indexOf("['scripts/sync-unified-styles.mjs']");
 const install=build.indexOf("['scripts/install-v267-property-ownership.mjs']");
 assert.ok(sync>=0&&install>sync);
});
