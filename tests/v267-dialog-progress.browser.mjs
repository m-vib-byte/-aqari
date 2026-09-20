// Actual browser + dialog/session/locale modules; synthetic accounts. No hosted writes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {chromium,webkit} from 'playwright';
const out=path.resolve(process.env.AQARI_BROWSER_EVIDENCE||'dialog-browser-evidence');fs.mkdirSync(out,{recursive:true});
const html=`<!doctype html><html lang="ar" dir="rtl" class="aqari-auth-unlocked"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>فحص حالة الاتصال — بيانات اصطناعية</title><link rel="stylesheet" href="/src/v267/styles/workspace.css"><body class="aq-v267 aq-unified-experience"><h1>فحص حالة الاتصال</h1><button id="open">فتح نافذة الاختبار</button><script type="module">
import {createDialog,node} from '/src/v267/components/dialog.js';
window.AQARI_PUBLIC_CONFIG={supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'};
window.AQARI_DATA_GATE={scope:{userId:'fixture',workspaceId:'test-workspace'}};
window.AQARI_SUPABASE={getClient:async()=>({}),context:{user:{id:'fixture'},workspace:{id:'test-workspace'},membership:{user_id:'fixture',workspace_id:'test-workspace',role:'general_manager',is_active:true}}};
// Keep pending test callbacks in a namespace, separate from browser globals.
const state=window.AQARI_DIALOG_TEST={calls:0,phase:'ready',finish:null,pending:null,dialog:null};
document.querySelector('#open').onclick=()=>{const d=state.dialog=createDialog('التحقق من انتهاء الاتصال');const read=node('button','قراءة سجل الاختبار');read.type='button';read.id='read';read.onclick=()=>{state.finish=null;state.pending=d.run(async()=>{state.calls++;state.phase='pending';await new Promise(resolve=>{state.finish=()=>{state.phase='resolved';resolve();};});state.phase='completed';});};d.body.append(node('p','هذا فحص ببيانات اصطناعية، وليس حساباً حقيقياً.'),read);};
</script></body></html>`;
// translations.js imports additional real dictionaries. Omitting these
// modules yields HTTP 404 and prevents the entire fixture module from executing.
const allowed=p=>/^src\/v267\/(components|api|styles)\/[a-z0-9-]+\.(js|css)$/.test(p)&&fs.existsSync(p);
const server=createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname.slice(1);res.setHeader('Cache-Control','no-store');if(!p){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}if(p==='favicon.ico'){res.writeHead(204);return res.end();}if(!allowed(p)){console.error('Unserved fixture dependency: '+p);res.writeHead(404);return res.end();}res.setHeader('Content-Type',p.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');res.end(fs.readFileSync(p));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,results=[];
let browser;
try{
 for(const [engine,type]of [['chromium',chromium],['webkit',webkit]]){
  browser=await type.launch();
  for(const [device,width,height,mobile]of [['desktop',1440,1000,false],['phone',390,844,true],['tablet',820,1180,true]]){
   const ctx=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile});await ctx.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());const page=await ctx.newPage();page.setDefaultTimeout(10000);const errors=[],resourceErrors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')resourceErrors.push(m.text());});page.on('response',r=>{if(r.status()>=400)resourceErrors.push(`${r.status()} ${new URL(r.url()).pathname}`);});
   const pass=name=>{results.push({engine,device,name,passed:true});console.log(`PASS ${engine}/${device}: ${name}`);};
   try{
    await page.goto(origin);await page.waitForFunction(()=>Boolean(window.AQARI_DIALOG_TEST),null,{timeout:10000});await page.locator('#open').click();await page.locator('#read').click();await page.waitForFunction(()=>typeof window.AQARI_DIALOG_TEST.finish==='function',null,{timeout:10000});
    assert.equal(await page.locator('dialog').getAttribute('aria-busy'),'true');assert.equal(await page.getByRole('status').innerText(),'جارٍ الاتصال…');assert.equal(await page.locator('#read').evaluate(el=>el.closest('[inert]')!==null),true);assert.equal(await page.locator('.aq267-close').isEnabled(),true);pass('in-flight interaction lock leaves close available');
    await page.evaluate(()=>window.AQARI_DIALOG_TEST.dialog.run(async()=>{window.AQARI_DIALOG_TEST.calls++;}));assert.equal(await page.evaluate(()=>window.AQARI_DIALOG_TEST.calls),1);pass('duplicate operation rejected');
    await page.evaluate(async()=>{const s=window.AQARI_DIALOG_TEST;s.finish();await Promise.race([s.pending,new Promise((_,reject)=>setTimeout(()=>reject(Error('Pending dialog action did not finish')),10000))]);});
    assert.equal(await page.evaluate(()=>window.AQARI_DIALOG_TEST.phase),'completed');assert.equal(await page.locator('dialog').getAttribute('aria-busy'),'false');assert.equal(await page.getByRole('status').innerText(),'');assert.equal(await page.locator('#read').isDisabled(),false);pass('successful read clears loading and re-enables input');
    await page.evaluate(()=>{const d=window.AQARI_DIALOG_TEST.dialog;return d.run(async()=>{d.status.textContent='تم التحقق من قراءة السجل.';});});assert.equal(await page.getByRole('status').innerText(),'تم التحقق من قراءة السجل.');pass('specific confirmation retained');
    await page.evaluate(()=>window.AQARI_DIALOG_TEST.dialog.run(async()=>{throw Error('تعذر تأكيد العملية.');}));assert.equal(await page.getByRole('status').innerText(),'تعذر تأكيد العملية.');assert.equal(await page.locator('dialog').getAttribute('aria-busy'),'false');pass('failure remains visible without false success');
    await page.evaluate(()=>window.AQARI_DIALOG_TEST.dialog.run(async()=>{}));assert.equal(await page.getByRole('status').innerText(),'');pass('retry clears previous loading');
    const states=await page.evaluate(async()=>{const d=window.AQARI_DIALOG_TEST.dialog,button=document.createElement('button'),input=document.createElement('input'),form=document.createElement('form');button.disabled=true;input.name='contract_no';input.value='QA-ONLY';form.append(input,button);d.body.append(form);let saved;await d.run(async()=>{button.disabled=false;input.disabled=true;});const afterRead=[button.disabled,input.disabled];input.disabled=false;await d.run(async()=>{saved=new FormData(form).get('contract_no');});form.remove();return {afterRead,saved};});
    assert.deepEqual(states,{afterRead:[false,true],saved:'QA-ONLY'});pass('readback and validation states survive; form values remain available');
    await page.evaluate(()=>{const s=window.AQARI_DIALOG_TEST;s.pending=s.dialog.run(async()=>{const button=document.createElement('button');button.id='late-action';button.textContent='إجراء جديد';button.onclick=()=>s.calls++;s.dialog.body.append(button);await new Promise(resolve=>{s.finish=resolve;});});});await page.waitForSelector('#late-action');
    const beforeLate=await page.evaluate(()=>window.AQARI_DIALOG_TEST.calls);await page.locator('#late-action').click({force:true});assert.equal(await page.evaluate(()=>window.AQARI_DIALOG_TEST.calls),beforeLate);await page.evaluate(async()=>{const s=window.AQARI_DIALOG_TEST;s.finish();await s.pending;});await page.locator('#late-action').click();assert.equal(await page.evaluate(()=>window.AQARI_DIALOG_TEST.calls),beforeLate+1);await page.locator('#late-action').evaluate(el=>el.remove());pass('new controls inherit loading lock and work after completion');
    await page.evaluate(()=>{const d=window.AQARI_DIALOG_TEST.dialog;for(let i=0;i<30;i++){const p=document.createElement('p');p.textContent='بيانات اختبار اصطناعية — مراجعة ترتيب النموذج والتمرير';d.body.append(p);}});await page.locator('.aq267-dialog-body').evaluate(el=>el.scrollTop=el.scrollHeight);const box=await page.locator('.aq267-close').boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=height);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);pass('long forms scroll while close stays visible without horizontal page overflow');
    await page.screenshot({path:path.join(out,`${engine}-${device}.png`),fullPage:true});
    await page.locator('#read').click();await page.waitForFunction(()=>typeof window.AQARI_DIALOG_TEST.finish==='function'&&window.AQARI_DIALOG_TEST.phase==='pending',null,{timeout:10000});await page.evaluate(async()=>{window.AQARI_SUPABASE.context.membership.is_active=false;window.dispatchEvent(new Event('aqari:auth-boundary'));const s=window.AQARI_DIALOG_TEST;s.finish();await s.pending;});assert.equal(await page.locator('dialog').count(),0);pass('auth boundary removes dialog before late completion');
    assert.deepEqual(errors,[]);assert.deepEqual(resourceErrors,[]);pass('no uncaught browser or module-loading errors');
   }catch(error){
    const diagnostic=await page.evaluate(()=>{const s=window.AQARI_DIALOG_TEST;return {phase:s?.phase,calls:s?.calls,busy:s?.dialog?.el?.getAttribute('aria-busy'),closed:s?.dialog?.closed,status:s?.dialog?.status?.textContent};}).catch(()=>({}));
    console.error(JSON.stringify({engine,device,diagnostic,errors,resourceErrors}));await page.screenshot({path:path.join(out,`${engine}-${device}-failure.png`),fullPage:true}).catch(()=>{});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({engine,device,diagnostic,errors,resourceErrors,message:error.message},null,2));throw error;
   }finally{await ctx.close();}
  }
  await browser.close();browser=null;
 }
 assert.equal(results.length,66);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({scope:'Synthetic local UI; no live account or physical iOS device',passed:results.length,results},null,2));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
