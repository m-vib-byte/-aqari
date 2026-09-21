import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const owner=read('src/v267/owner-feedback-runtime.js');
const live=read('src/v267/live-stability-runtime.js');
const propertyOs=read('v202-property-os.js');
const rentalRecords=read('v267-rental-records.js');
const propertyHub=read('src/v267/pages/property-hub.js');
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

test('source properties open the same complete file as every other property and ambiguous names are rejected',async()=>{
 const experience=read('src/v267/components/property-experience.js');
 const code=experience.slice(experience.indexOf(' async function openCompleteFileByName'),experience.indexOf(' async function openAuthoritativeStatement')).replace("import('../pages/property-hub.js')",'loadHub()');
 const calls=[];let manager=true,records=[{id:'source-property-id'}];
 const query={select(){return this;},eq(k,v){calls.push([k,v]);return this;},or(v){calls.push(['filter',v]);return this;},async limit(){return {data:records};}};
 const context={readable:()=>true,manager:()=>manager,window:{AQARI_SUPABASE:{context:{workspace:{id:'w'}},getClient:async()=>({from:()=>query})}},loadHub:async()=>({openPropertyHub:(id,options)=>calls.push(['open',id,options.section])})};
 vm.runInNewContext(code+';this.open=openSenderSettingsByName;this.full=openCompleteFileByName;',context);
 await context.open('برج ضحاوي');assert.ok(calls.some(x=>x[0]==='open'&&x[1]==='source-property-id'&&x[2]==='sender'));assert.equal(calls.some(x=>x[0]==='filter'),false);
 calls.length=0;await context.full('برج ضحاوي');assert.ok(calls.some(x=>x[0]==='open'&&x[1]==='source-property-id'));assert.equal(calls.some(x=>x[0]==='filter'),false);
 calls.length=0;manager=false;await assert.rejects(context.open('برج ضحاوي'),/مدير العام/);assert.equal(calls.length,0);
 manager=true;records=[{id:'a'},{id:'b'}];await assert.rejects(context.open('برج ضحاوي'),/غير فريد/);assert.equal(calls.some(x=>x[0]==='open'),false);
});

test('legacy property workspace opens the authoritative complete file and keeps property 360 as fallback',()=>{
 assert.match(propertyOs,/async function openAuthoritativePropertyFile\(name\)/);
 assert.match(propertyOs,/from\('aqari_properties'\)\.select\('id,name'\)\.eq\('workspace_id',workspace\)\.eq\('name',propertyName\)\.limit\(2\)/);
 assert.doesNotMatch(propertyOs,/openAuthoritativePropertyFile[\s\S]{0,900}source_only/);
 assert.match(propertyOs,/const openComplete=window\.AQARI_PROPERTY_EXPERIENCE\?\.openCompleteFileByName\|\|openAuthoritativePropertyFile/);
 assert.match(propertyOs,/Promise\.resolve\(openComplete\(propertyName\)\)/);
 assert.match(propertyOs,/if\(result===false\)return legacyProfile\(\)/);
 assert.match(propertyOs,/\.catch\(legacyProfile\)/);
 assert.match(propertyOs,/window\.go\?\.\('property360Page'\)/);
});


test('legacy property edit and add actions delegate to the authoritative property workflows',()=>{
 assert.match(rentalRecords,/if\(typeof experience\?\.openCompleteFileByName==='function'\)return experience\.openCompleteFileByName\(existing\[0\],\{section:'edit'\}\)/);
 assert.match(rentalRecords,/from\('aqari_properties'\)\.select\('id,name'\)\.eq\('workspace_id',workspace\)\.eq\('name',existing\[0\]\)\.limit\(2\)/);
 assert.match(rentalRecords,/openPropertyHub\(response\.data\[0\]\.id,\{section:'edit'\}\)/);
 assert.match(rentalRecords,/import\('\.\/src\/v267\/pages\/property-onboarding\.js'\)/);
 assert.match(propertyHub,/await read\(\);if\(!canWrite\(\)\)throw Error\('تعديل العقار غير متاح لصلاحية حسابك\.'/);
 assert.match(propertyHub,/options\.section==='sender'\?senderSettings:options\.section==='edit'\?editProperty:render/);
});

test('property cards hydrate from canonical server rows and mount on the properties page',()=>{
 const experience=read('src/v267/components/property-experience.js');
 assert.match(experience,/from\('aqari_properties'\)\.select\('id,name,metadata'\)\.eq\('workspace_id',workspace\)\.order\('name'\)/);
 assert.match(experience,/\.\.\.legacy,\.\.\.serverRows/);
 assert.match(experience,/propertyTitle\?\.textContent\?\.trim\(\)==='العقارات'/);
 assert.match(experience,/head\.after\(region\)/);
 assert.match(experience,/\[data-exact-key="properties"\]/);
 assert.match(experience,/const routeRoot=document\.getElementById\('list'\)/);
 assert.match(experience,/new MutationObserver\(syncRoute\)\.observe\(routeRoot,/);
 assert.match(experience,/if\(next===routeState\)return/);
 assert.match(experience,/let limit=12/);
 assert.match(experience,/installed=\{refresh,api:propertyApi\}/);
 assert.match(experience,/window\.AQARI_PROPERTY_EXPERIENCE=installed\.api/);
});
