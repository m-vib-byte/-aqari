import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

for(const [page,open,loader]of [
 ['contract-archive','openContractArchive','contractAdministration'],
 ['contract-templates','openContractTemplates','mountRentalTemplateManager']
]){
 for(const connectionFailure of [false,true])test(`${page} recovers ${connectionFailure?'connection':'read'} failure from its own retry control`,async()=>{
  class Element{constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];}append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}}
  const node=(tag,text)=>new Element(tag,text),pending=[];let calls=0,failConnection=connectionFailure;
  const d={body:node('div'),status:node('p'),session:{bound:{role:'general_manager'}},run(task){const result=Promise.resolve().then(()=>{if(failConnection){failConnection=false;throw Error('connection unavailable');}return task();});pending.push(result);return result;}};
  const context={t:x=>x,node,createDialog:()=>d,createPrivateUrls:()=>({clear(){}}),[loader]:async()=>{calls++;if(!connectionFailure&&calls===1)throw Error('read unavailable');return [];}};
  const source=readFileSync(new URL(`../src/v267/pages/${page}.js`,import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
  vm.runInNewContext(source,context);context[open]();await assert.rejects(pending.at(-1),/unavailable/);
  const all=e=>[e,...e.children.flatMap(all)],retry=all(d.body).find(e=>e.tag==='button'&&e.textContent==='إعادة المحاولة');assert.ok(retry);
  await retry.onclick();assert.equal(calls,connectionFailure?1:2);
 });
}
