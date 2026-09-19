import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const owner=read('src/v267/owner-feedback-runtime.js');
const live=read('src/v267/live-stability-runtime.js');
function action({active=true,writable=true,fail=false}={}){
 const calls=[],errors=[];
 const box={scope:()=>active?{user:'u',workspace:'w'}:null,t:x=>x,setStatus:x=>errors.push(x),window:{AQARI_PROPERTY_EXPERIENCE:{canWrite:()=>writable,openOnboarding:async()=>{calls.push(['create']);return true;},openCompleteFileByName:async name=>{calls.push(['file',name]);if(fail)throw Error('private backend detail');return true;}}}};
 vm.createContext(box);vm.runInContext(owner.slice(owner.indexOf('async function openPropertyAction('),owner.indexOf('async function openDefinition(')),box);
 return {calls,errors,open:box.openPropertyAction};
}
test('a named property shortcut opens that exact complete file',async()=>{
 const r=action();assert.equal(await r.open(' برج مرزوق '),true);assert.deepEqual(r.calls,[['file','برج مرزوق']]);
});
test('create shortcut opens onboarding only with current write permission',async()=>{
 const yes=action();assert.equal(await yes.open(),true);assert.deepEqual(yes.calls,[['create']]);
 const no=action({writable:false});assert.equal(await no.open(),false);assert.deepEqual(no.calls,[]);
});
test('signed-out property shortcuts do not call the property API',async()=>{
 const r=action({active:false});assert.equal(await r.open('برج مرزوق'),false);assert.equal(await r.open(),false);assert.deepEqual(r.calls,[]);
});
test('missing and failed property actions return an error without exposing backend text',async()=>{
 const r=action({fail:true});assert.equal(await r.open('برج مرزوق'),false);assert.deepEqual(r.errors,['تعذر فتح الخدمة.']);
 const empty=action();assert.equal(await empty.open(' '),false);assert.deepEqual(empty.calls,[]);
});
test('rendered property card consumes the click and uses the named file action',async()=>{
 const match=live.match(/card\.onclick=(async event=>\{[^\n]+\});/);assert.ok(match);
 const calls=[],card={disabled:false},box={scope:()=>true,card,name:{textContent:'برج مرزوق'},window:{AQARI_OWNER_EXACT:{openProperty:async name=>{calls.push(name);return true;}}},document:{getElementById:()=>null},ui:x=>x};
 vm.createContext(box);vm.runInContext('run='+match[1],box);let prevented=0,stopped=0;
 await box.run({preventDefault(){prevented++;},stopPropagation(){stopped++;}});
 assert.deepEqual(calls,['برج مرزوق']);assert.equal(prevented,1);assert.equal(stopped,1);assert.equal(card.disabled,false);
 assert.ok(live.includes("refAction('إضافة عقار','special','property_create','building')"));
 assert.ok(owner.includes("else if(special==='property_create')return openPropertyAction();"));
});
