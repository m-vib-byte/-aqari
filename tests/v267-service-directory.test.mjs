import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {organizeServices,serviceSearch} from '../src/v267/components/service-directory.js';
import {setLocale} from '../src/v267/components/locale.js';

function fixture(nestedDetails=false,preview=false){
 const previous=globalThis.document,previousLocation=globalThis.location;let permitted=true,host;
 if(preview)globalThis.location={hostname:'aqari-preview.vercel.app'};
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.hidden=false;this.disabled=false;this.value='';this.textContent='';}
  append(...nodes){for(const n of nodes){if(n.parentNode)n.parentNode.children=n.parentNode.children.filter(x=>x!==n);this.children.push(n);n.parentNode=this;}}
  replaceChildren(...nodes){for(const n of this.children)n.parentNode=null;this.children=[];this.append(...nodes);}
  setAttribute(k,v){this.attributes[k]=v;}
  insertBefore(n,before){if(before&&before.parentNode!==this)throw Error('NotFoundError: reference is not a direct child');this.append(n);if(before){this.children.pop();this.children.splice(this.children.indexOf(before),0,n);}}
  querySelector(selector=''){if(selector.startsWith(':scope >'))return this.children.find(x=>x.tagName==='details')||null;const matches=n=>selector.startsWith('.')?n.className?.split(' ').includes(selector.slice(1)):n.tagName===selector;const walk=n=>matches(n)?n:n.children.map(walk).find(Boolean);return this.children.map(walk).find(Boolean)||null;}
  click(){this.onclick?.();}focus(){this.focused=true;}
 }
 globalThis.document={createElement:t=>new Element(t)};setLocale('ar',null);
 const tools=new Element('section');host=new Element('section');if(nestedDetails){const daily=new Element('section');daily.append(new Element('details'));host.append(daily);}const legacy=new Element('details');host.append(legacy);
 const source=new Element('button'),hidden=new Element('button'),denied=new Element('button');let clicks=0;
 source.textContent='الأرشيف المالي التاريخي';source.onclick=()=>clicks++;hidden.textContent='رواتب سرية';hidden.hidden=true;denied.textContent='صلاحيات المدير';denied.blocked=true;
 tools.append(source,hidden,denied);
 const groups=[{key:'finance',items:[{source},{source:hidden},{source:denied}]}];
 const view=organizeServices({tools,groups,home:()=>host,allowed:item=>permitted&&!item.source.blocked});view.refresh('user-workspace');
 const all=(p=host)=>[p,...p.children.flatMap(x=>all(x))];
 const find=id=>all().find(x=>x.id===id),root=()=>find('aq267-service-directory');
 const proxies=()=>all(root()).filter(x=>x.tagName==='button'&&x.dataset.service);
 return {view,tools,source,hidden,denied,all,find,root,proxies,clicks:()=>clicks,deny:()=>permitted=false,
  search(value){const input=find('aq267-service-search');input.value=value;input.oninput();},
  setHost(value){host=value;},newHost:()=>new Element('section'),host:()=>host,
  cleanup(){globalThis.document=previous;if(previousLocation===undefined)delete globalThis.location;else globalThis.location=previousLocation;setLocale('ar',null);}};
}
test('groups preserve original controls and open the real handler once',()=>{
 const f=fixture();try{assert.equal(f.proxies().length,1);assert.equal(f.proxies()[0].attributes['aria-label'],f.source.textContent,'decorative arrows are excluded from the accessible name');assert.equal(f.source.parentNode.tagName,'details');f.proxies()[0].click();assert.equal(f.clicks(),1);assert.equal(f.host().children[0],f.root());}finally{f.cleanup();}
});
test('a nested daily-summary details cannot become a home insertion reference',()=>{
 const previous=globalThis.document;let f;try{f=fixture(true);assert.equal(f.proxies().length,1);assert.equal(f.root().parentNode,f.host());assert.equal(f.host().children[1],f.root());}finally{f?.cleanup();globalThis.document=previous;}
});
test('Arabic search ignores hamza and diacritics without revealing hidden or denied services',()=>{
 const f=fixture();try{f.search('ارشيف مَالِي');assert.equal(f.proxies().length,1);f.search('رواتب');assert.equal(f.proxies().length,0);assert.equal(f.hidden.hidden,true);f.search('صلاحيات');assert.equal(f.proxies().length,0);assert.equal(f.denied.hidden,false,'search must not rewrite source availability');}finally{f.cleanup();}
 assert.equal(serviceSearch('إِيجار  الوحدة'),'ايجار الوحده');
});
test('a saved button cannot open a service after permission revocation',()=>{
 const f=fixture();try{const button=f.proxies()[0];f.deny();button.click();assert.equal(f.clicks(),0);assert.equal(f.proxies().length,0);const status=f.all().find(x=>x.attributes.role==='status');assert.equal(status.hidden,false);assert.match(status.textContent,/غير متاحة/);}finally{f.cleanup();}
});
test('feature withdrawal removes the shortcut and hides the empty menu group',()=>{
 const f=fixture();try{f.source.hidden=true;f.view.refresh('user-workspace');assert.equal(f.proxies().length,0);assert.equal(f.tools.children[0].hidden,true);}finally{f.cleanup();}
});
test('scope changes clear the search and authentication loss clears the service list',()=>{
 const f=fixture();try{f.search('أرشيف');f.view.refresh('another-account');assert.equal(f.find('aq267-service-search').value,'');f.deny();f.view.refresh(null);assert.equal(f.root().hidden,true);assert.equal(f.proxies().length,0);}finally{f.cleanup();}
});
test('refresh reuses one directory and supports a replaced home without polling',()=>{
 const f=fixture();try{f.view.refresh('user-workspace');assert.equal(f.all().filter(x=>x.id==='aq267-service-directory').length,1);f.setHost(null);assert.doesNotThrow(()=>f.view.refresh('user-workspace'));f.setHost(f.newHost());f.view.refresh('user-workspace');assert.equal(f.proxies().length,1);}finally{f.cleanup();}
});
test('five interface languages have searchable controls and the correct reading direction',()=>{
 const f=fixture();try{for(const [locale,title,dir]of [['ar','خدمات عقاري','rtl'],['en','AQARI services','ltr'],['hi','AQARI सेवाएँ','ltr'],['ur','AQARI خدمات','rtl'],['ml','AQARI സേവനങ്ങൾ','ltr']]){setLocale(locale,null);f.view.refresh('user-workspace');assert.equal(f.find('aq267-services-title').textContent,title);assert.equal(f.root().dir,dir);assert.ok(f.find('aq267-service-search').placeholder);}}finally{f.cleanup();}
});
test('Escape resets search without changing source state or opening an action',()=>{
 const f=fixture();try{f.search('لا توجد');const input=f.find('aq267-service-search');input.onkeydown({key:'Escape',preventDefault(){}});assert.equal(input.value,'');assert.equal(f.proxies().length,1);assert.equal(f.clicks(),0);}finally{f.cleanup();}
});
test('preview keeps all service entries discoverable with compact sections and an accessible expand control',()=>{
 const f=fixture(false,true);try{
  const grid=f.find('aq267-service-groups'),toggle=f.find('aq267-service-expand');
  assert.equal(f.proxies().length,3);assert.equal(grid.children[0].open,false);assert.equal(toggle.attributes['aria-controls'],grid.id);assert.equal(toggle.attributes['aria-expanded'],'false');
  assert.equal(f.proxies().filter(x=>x.attributes['aria-disabled']==='true').length,2);
  assert.equal(f.all().find(x=>x.attributes.role==='status').hidden,true,'preview explanation is not repeated as a live announcement');
  toggle.click();assert.equal(grid.children[0].open,true);assert.equal(toggle.attributes['aria-expanded'],'true');assert.equal(toggle.textContent,'طي الأقسام');
  toggle.click();assert.equal(grid.children[0].open,false);assert.equal(f.clicks(),0);
  f.search('رواتب');assert.equal(grid.children[0].open,true);assert.equal(toggle.hidden,true);assert.equal(f.proxies().length,1);assert.equal(f.proxies()[0].dataset.state,'pending');
  f.proxies()[0].click();assert.equal(f.clicks(),0);assert.equal(f.hidden.hidden,true);
 }finally{f.cleanup();}
});
test('manual expansion survives search and refresh, but resets when the workspace changes',()=>{
 const f=fixture(false,true);try{
  const grid=f.find('aq267-service-groups'),first=grid.children[0];first.open=true;first.ontoggle();
  f.search('أرشيف');f.search('');assert.equal(grid.children[0].open,true);f.view.refresh('user-workspace');assert.equal(grid.children[0].open,true);
  const current=grid.children[0];current.open=false;current.ontoggle();f.search('أرشيف');f.search('');assert.equal(grid.children[0].open,false,'search expansion does not overwrite the chosen collapsed state');
  f.find('aq267-service-expand').click();f.view.refresh('another-account');assert.equal(grid.children[0].open,false);
  first.ontoggle();f.view.refresh('another-account');assert.equal(grid.children[0].open,false,'queued toggle from a detached section cannot change the new workspace');
 }finally{f.cleanup();}
});
test('old shortcuts never execute after logout, account change or replacement of the home',()=>{
 for(const change of ['logout','account','home']){const f=fixture(false,true);try{
  const old=f.proxies()[0];if(change==='logout')f.view.refresh(null);if(change==='account')f.view.refresh('another-account');if(change==='home'){f.setHost(f.newHost());f.view.refresh('user-workspace');}
  old.click();assert.equal(f.clicks(),0,change);
  if(change==='logout'){f.search('أرشيف');assert.equal(f.proxies().length,0);assert.equal(f.root().hidden,true);}
 }finally{f.cleanup();}}
});
test('preview permission revocation updates a saved shortcut to unavailable without invoking it',()=>{
 const f=fixture(false,true);try{const button=f.proxies()[0];f.deny();button.click();assert.equal(f.clicks(),0);assert.equal(f.proxies().length,3);assert.ok(f.proxies().every(x=>x.dataset.state==='pending'));assert.match(f.all().find(x=>x.attributes.role==='status').textContent,/غير متاحة/);}finally{f.cleanup();}
});
test('preview explanations, counts and expand controls follow all five interface languages',()=>{
 const f=fixture(false,true);try{for(const [locale,expand]of [['ar','عرض جميع الخدمات'],['en','Show all services'],['hi','सभी सेवाएँ दिखाएँ'],['ur','تمام خدمات دکھائیں'],['ml','എല്ലാ സേവനങ്ങളും കാണിക്കുക']]){
  setLocale(locale,null);f.view.refresh('user-workspace');assert.equal(f.find('aq267-service-expand').textContent,expand);assert.equal(f.root().lang,locale);assert.match(f.all().find(x=>x.className==='aq267-service-overview').textContent,/3.*1/);assert.ok(f.root().querySelector('.aq267-preview-banner').children[0].children[1].textContent);
 }}finally{f.cleanup();}
});

test('the document action opens the existing scanner once without expanding the services group',()=>{
 const f=fixture();try{
  f.source.dataset.aq267Label='scan_document';f.source.textContent='مسح مستند';f.view.refresh('user-workspace');
  const shortcut=f.find('aq267-document-shortcut'),button=f.find('aq267-document-upload-action');
  assert.equal(shortcut.hidden,false);assert.equal(shortcut.parentNode,f.root());assert.equal(f.proxies()[0].parentNode.parentNode.open,false);
  button.click();assert.equal(f.clicks(),1);assert.equal(f.source.parentNode.tagName,'details','original handler and menu control remain intact');
  for(const term of ['وثايق','مسح عقد','upload document','PDF','स्कैन','دستاویز','സ്കാൻ']){f.search(term);assert.equal(shortcut.hidden,false,term);assert.equal(f.proxies().length,1,term);}
  f.search('رواتب');assert.equal(shortcut.hidden,true);
 }finally{f.cleanup();}
});
test('a captured document action refuses hidden, disabled, revoked and signed-out sources',()=>{
 const f=fixture();try{
  f.source.dataset.aq267Label='scan_document';f.view.refresh('user-workspace');const button=f.find('aq267-document-upload-action');
  f.source.hidden=true;button.click();assert.equal(f.clicks(),0);assert.equal(f.find('aq267-document-shortcut').hidden,true);
  f.source.hidden=false;f.source.disabled=true;f.view.refresh('user-workspace');button.click();assert.equal(f.clicks(),0);
  f.source.disabled=false;f.view.refresh(null);button.click();assert.equal(f.clicks(),0);assert.equal(f.find('aq267-document-shortcut').hidden,true);
  f.view.refresh('user-workspace');f.deny();button.click();assert.equal(f.clicks(),0);assert.equal(f.find('aq267-document-shortcut').hidden,true);
 }finally{f.cleanup();}
});
test('the document action and file guidance follow all five interface languages',()=>{
 const f=fixture();try{
  f.source.dataset.aq267Label='scan_document';
  for(const [locale,word]of [['ar','رفع'],['en','Upload'],['hi','अपलोड'],['ur','اپ لوڈ'],['ml','അപ്‌ലോഡ്']]){
   setLocale(locale,null);f.view.refresh('user-workspace');assert.ok(f.find('aq267-document-upload-action').textContent.includes(word),locale);assert.match(f.find('aq267-document-upload-hint').textContent,/PDF.*DOCX/);
  }
 }finally{f.cleanup();}
});
test('service directory polish keeps the document shortcut responsive on narrow screens',()=>{
 const css=readFileSync(new URL('../src/v267/styles/service-directory.css',import.meta.url),'utf8');
 assert.match(css,/aq267-service-toolbar/);
 assert.match(css,/aq267-document-shortcut/);
 assert.match(css,/@media screen and \(max-width:600px\)[\s\S]*aq267-document-shortcut button\{width:100%;text-align:center\}/);
});
