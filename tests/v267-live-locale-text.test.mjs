import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveTextTranslator} from '../src/v267/components/live-locale-text.js';
import {t} from '../src/v267/components/locale.js';

test('application updates replace stale UI text across all five languages',()=>{
 for(const language of ['ar','en','hi','ur','ml']){
  const render=createLiveTextTranslator(source=>t(source,language)),node={};
  const first=render(node,'الرئيسية');
  assert.equal(first,t('الرئيسية',language));
  assert.equal(render(node,first),first);
  assert.equal(render(node,'العقارات'),t('العقارات',language));
  assert.equal(render(node,''),'');
 }
});
test('switching locale preserves source, whitespace, and independent nodes',()=>{
 let language='en';const render=createLiveTextTranslator(source=>t(source,language));
 const title={},placeholder={};
 const current=render(title,'  الرئيسية\n');
 render(placeholder,'العقارات');language='ur';
 assert.equal(render(title,current),'  '+t('الرئيسية','ur')+'\n');
 language='ar';
 assert.equal(render(title,'  '+t('الرئيسية','ur')+'\n'),'  الرئيسية\n');
 assert.equal(render(placeholder,'New placeholder'),'New placeholder');
});
