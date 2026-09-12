import test from 'node:test';
import assert from 'node:assert/strict';
import {organizeServices,serviceSearch} from '../src/v267/components/service-directory.js';
import {setLocale} from '../src/v267/components/locale.js';

function fixture(){
 const previous=globalThis.document;let permitted=true,host;
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.hidden=false;this.disabled=false;this.value='';this.textContent='';}
  append(...nodes){for(const n of nodes){if(n.parentNode)n.parentNode.children=n.parentNode.children.filter(x=>x!==n);this.children.push(n);n.parentNode=this;}}
  replaceChildren(...nodes){for(const n of this.children)n.parentNode=null;this.children=[];this.append(...nodes);}
  setAttribute(k,v){this.attributes[k]=v;}
  insertBefore(n,before){this.append(n);if(before){this.children.pop();this.children.splice(this.children.indexOf(before),0,n);}}
  querySelector(){return this.children.find(x=>x.tagName==='details')||null;}
  click(){this.onclick?.();}focus(){this.focused=true;}
 }
 globalThis.document={createElement:t=>new Element(t)};setLocale('ar',null);
 const tools=new Element('section');host=new Element('section');const legacy=new Element('details');host.append(legacy);
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
  cleanup(){globalThis.document=previous;setLocale('ar',null);}};
}
test('groups preserve original controls and open the real handler once',()=>{
 const f=fixture();try{assert.equal(f.proxies().length,1);assert.equal(f.proxies()[0].attributes['aria-label'],f.source.textContent,'decorative arrows are excluded from the accessible name');assert.equal(f.source.parentNode.tagName,'details');f.proxies()[0].click();assert.equal(f.clicks(),1);assert.equal(f.host().children[0],f.root());}finally{f.cleanup();}
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
