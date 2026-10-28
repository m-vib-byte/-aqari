import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('/opt/codex/cua_node/lib/node_modules/playwright');
const root=path.resolve(process.env.SOURCE_ROOT||path.resolve(import.meta.dirname,'..')),out=process.env.EVIDENCE||'/workspace/aqari-property-list-evidence';fs.mkdirSync(out,{recursive:true});
const html=`<html class="aqari-auth-unlocked"><body><div id="home"></div><script type="module">
import {installPropertyExperience} from '/src/v267/components/property-experience.js';
import {openPropertyHub} from '/src/v267/pages/property-hub.js';
const w='11111111-1111-4111-8111-111111111111',u='22222222-2222-4222-8222-222222222222';
const old=['Synthetic','','','',{aqariPropertyPresentation:1,location:'Old address',photos:[]}];
window.T={rows:[{id:'p1',name:'Synthetic',metadata:old}],property:{id:'p1',name:'Synthetic',address:'Old address',revision:1,status:'active',owners:[],assets:{},tenantVisibility:{},tenantInfo:{}},reads:0,writes:0,allowed:true,legacy:[old],hold:false,pending:[]};
const clone=structuredClone;const client={from:()=>({select(){return this},eq(){return this},order:async()=>{T.reads++;const value={data:clone(T.rows)};if(T.hold)return new Promise((resolve,reject)=>T.pending.push({resolve:()=>resolve(value),reject}));return value}}),rpc:(name,args)=>({abortSignal:async()=>{let data;
if(name==='aqari_property_full_file')data={property:clone(T.property),units:[],documents:[],permissions:{finance:false}};
else if(name==='aqari_property_dashboard_header')data={property_id:'p1',units:{},completeness:{},financial:{available:false}};
else if(name==='aqari_workspace_access')data={workspace_id:w,user_id:u,role:'general_manager',permissions:{properties:{read:true,write:true}}};
else if(name==='aqari_property_channel_settings')data={propertyId:'p1',items:[]};
else if(name==='aqari_property_responsible')data={record:{propertyId:'p1'}};
else if(name==='aqari_ui_presentation_settings')data={workspace_id:w,user_id:u,items:[]};
else if(name==='aqari_property_master_save'){T.writes++;Object.assign(T.property,args.p_data,{revision:2});data={property:clone(T.property)}}
else throw Error('Unexpected RPC '+name);return {data};}})};
window.AQARI_PUBLIC_CONFIG={releaseStage:'preview',supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'};
window.AQARI_SUPABASE={context:{user:{id:u},workspace:{id:w},membership:{user_id:u,workspace_id:w,is_active:true,role:'general_manager'}},getClient:async()=>client};window.AQARI_DATA_GATE={scope:{userId:u,workspaceId:w}};
window.AQARI_V202={propertyRecords:()=>clone(T.legacy)};
window.view=installPropertyExperience({readable:()=>T.allowed,writable:()=>T.allowed});window.edit=()=>openPropertyHub('p1',{section:'edit'});
window.created=()=>{T.rows.push({id:'p2',name:'New synthetic',metadata:{source_address:'New address'}});window.dispatchEvent(new CustomEvent('aqari:property-saved',{detail:{propertyId:'p2',name:'New synthetic',workspaceId:w,userId:u,property:{id:'p2',name:'New synthetic',address:'New address'}}}));};
</script></body></html>`;
const server=createServer((req,res)=>{const p=new URL(req.url,'http://local').pathname;if(p==='/'){res.setHeader('Content-Type','text/html');return res.end(html)}const f=path.resolve(root,'.'+p);if(!f.startsWith(root+'/')){res.statusCode=403;return res.end()}try{res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/plain');res.end(fs.readFileSync(f))}catch{res.statusCode=404;res.end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-background-networking','--disable-component-update']}),results=[];let blocked=0;
try{const context=await browser.newContext({serviceWorkers:'block'});await context.routeWebSocket('**/*',ws=>{blocked++;ws.close()});await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){blocked++;return route.abort()}return route.continue()});
for(const name of ['create refreshes count','edit refreshes address','auth boundary clears cached rows','foreign scope event ignored','edit cleared address','rename A B C','rename failure after second change','late success after scope switch','late error after scope switch','reuse name p2 first','reuse name p1 first','display ownership p2 first','display ownership p1 first']){if(process.env.CASE&&!name.startsWith(process.env.CASE))continue;const page=await context.newPage();page.setDefaultTimeout(2500);try{await page.goto(origin);await page.waitForFunction(()=>window.T?.reads===1);await page.waitForTimeout(50);
if(name.startsWith('reuse')||name.startsWith('display')){
await page.evaluate(({p2First,display})=>{const row1=['A','Owner1','','',{aqariPropertyPresentation:1,location:'Legacy1',price:'111',purpose:'rent',photos:['data:image/jpeg;base64,/9j/AAAA']}],row2=['X','Owner2','','',{aqariPropertyPresentation:1,location:'Legacy2',price:'222',purpose:'rent',photos:['data:image/jpeg;base64,/9j/BBBB']}];T.rows=[{id:'p1',name:'A',metadata:{}},{id:'p2',name:'X',metadata:{}}];T.legacy=display?[row1,row2]:[];
const emit=(id,previousName,name)=>window.dispatchEvent(new CustomEvent('aqari:property-saved',{detail:{propertyId:id,previousName,workspaceId:AQARI_SUPABASE.context.workspace.id,userId:AQARI_SUPABASE.context.user.id,property:{id,name,address:id}}}));
if(p2First){emit('p2','X','X');emit('p1','A','B');}else{emit('p1','A','B');emit('p2','X','X');}
T.rows=[{id:'p1',name:'B',metadata:display?row1:{}},{id:'p2',name:'A',metadata:display?row2:{}}];emit('p2','X','A');
},{p2First:name.includes('p2 first'),display:name.startsWith('display')});
await page.waitForTimeout(100);assert.deepEqual((await page.locator('.aq267-property-card strong').allTextContents()).sort(),['A','B']);
assert.equal(await page.locator('.aq267-property-card').count(),2);
if(name.startsWith('display')){const original=page.getByRole('button',{name:'فتح الملف الكامل للعقار B',exact:true});assert.equal(await original.locator('img').getAttribute('src'),'data:image/jpeg;base64,/9j/AAAA');assert.equal(await original.locator('b').innerText(),await page.evaluate(()=>Number(111).toLocaleString('ar-KW',{maximumFractionDigits:3})+' د.ك / شهر'));await page.getByRole('searchbox').fill('Owner1 B');assert.deepEqual(await page.locator('.aq267-property-card strong').allTextContents(),['B']);await page.getByRole('searchbox').fill('');const card=page.getByRole('button',{name:'فتح الملف الكامل للعقار A',exact:true});assert.equal(await card.locator('img').getAttribute('src'),'data:image/jpeg;base64,/9j/BBBB');assert.equal(await card.locator('b').innerText(),await page.evaluate(()=>Number(222).toLocaleString('ar-KW',{maximumFractionDigits:3})+' د.ك / شهر'));await page.getByRole('searchbox').fill('Owner2 A');assert.deepEqual(await page.locator('.aq267-property-card strong').allTextContents(),['A']);await page.getByRole('searchbox').fill('Owner1 A');assert.equal(await page.locator('.aq267-property-card').count(),0);}

}else if(name.startsWith('rename')){
await page.evaluate(async()=>{const emit=(previousName,name)=>window.dispatchEvent(new CustomEvent('aqari:property-saved',{detail:{propertyId:'p1',previousName,workspaceId:AQARI_SUPABASE.context.workspace.id,userId:AQARI_SUPABASE.context.user.id,property:{id:'p1',name,address:'Current'}}}));T.rows[0].name='B';emit('Synthetic','B');window.emitRename=emit;});
await page.waitForFunction(()=>T.reads===2);await page.waitForTimeout(40);
await page.evaluate(()=>{T.hold=true;T.rows[0].name='C';emitRename('B','C')});
if(name.includes('failure')){await page.evaluate(()=>{T.hold=false;T.pending.shift().reject(Error('CURRENT_READ_FAILED'))});await page.waitForTimeout(40);assert.match(await page.locator('#aq267-property-finder [role=status]').innerText(),/CURRENT_READ_FAILED/);assert.deepEqual(await page.locator('.aq267-property-card strong').allTextContents(),['C']);}
else{assert.deepEqual(await page.locator('.aq267-property-card strong').allTextContents(),['C']);await page.evaluate(()=>{T.hold=false;T.pending.shift().resolve()});await page.waitForTimeout(40);assert.deepEqual(await page.locator('.aq267-property-card strong').allTextContents(),['C']);}
}else if(name.startsWith('late')){
await page.evaluate(()=>{window.statusHistory=[];new MutationObserver(()=>statusHistory.push(document.querySelector('#aq267-property-finder [role=status]').textContent)).observe(document.querySelector('#aq267-property-finder'),{subtree:true,childList:true,characterData:true});T.hold=true;window.dispatchEvent(new CustomEvent('aqari:property-saved'));});
await page.waitForFunction(()=>T.pending.length===1);
await page.evaluate(()=>{AQARI_SUPABASE.context.user.id='new-user';AQARI_SUPABASE.context.workspace.id='new-workspace';T.legacy=[];T.rows=[{id:'new',name:'New scope',metadata:{}}];window.dispatchEvent(new Event('aqari:auth-boundary'));});
assert.equal(await page.locator('.aq267-property-card').count(),0);
await page.evaluate(error=>{T.hold=false;const old=T.pending.shift();if(error)old.reject(Error('OLD_SCOPE_ERROR'));else old.resolve();},name.includes('error'));
await page.waitForFunction(()=>T.reads===3);await page.waitForTimeout(60);
assert.deepEqual(await page.locator('.aq267-property-card strong').allTextContents(),['New scope']);assert.equal(await page.evaluate(()=>statusHistory.some(x=>x.includes('OLD_SCOPE_ERROR'))),false);
}else if(name.startsWith('create')){await page.evaluate(()=>created());await page.waitForFunction(()=>T.reads>=2,{},{timeout:1500});assert.equal(await page.locator('.aq267-property-card').count(),2)}
else if(name.startsWith('foreign')){await page.evaluate(()=>window.dispatchEvent(new CustomEvent('aqari:property-saved',{detail:{workspaceId:'foreign',userId:'foreign',propertyId:'p1',property:{id:'p1',name:'Injected',address:'Foreign'}}})));await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>T.reads),1);assert.doesNotMatch(await page.locator('#aq267-property-results').innerText(),/Foreign|Injected/)}
else if(name.startsWith('edit')){await page.evaluate(()=>edit());await page.getByLabel('العنوان',{exact:true}).fill(name.includes('cleared')?'':'Verified new address');await page.locator('.aq267-dialog button[type=submit]').click();await page.waitForFunction(()=>T.writes===1);await page.waitForTimeout(150);assert.match(await page.locator('.aq267-dialog').innerText(),/تم حفظ ملف العقار وإعادة قراءته/);assert.match(await page.locator('#aq267-property-results').innerText(),name.includes('cleared')?/الموقع غير مضاف/:/Verified new address/);assert.equal(await page.evaluate(()=>T.writes),1)}
else{await page.evaluate(()=>{T.allowed=false;window.dispatchEvent(new Event('aqari:auth-boundary'))});assert.equal(await page.locator('.aq267-property-card').count(),0)}results.push({name,status:'pass'});
}catch(e){results.push({name,status:'fail',reason:e.message})}finally{await page.close()}}
}finally{await browser.close();await new Promise(r=>server.close(r))}fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,blocked},null,2));console.log(JSON.stringify({results,blocked}));if(results.some(r=>r.status==='fail'))process.exitCode=1;
